const crypto = require('crypto');
const { fetchJson } = require('./httpProxy');
const { sanitizePlexSessionsForGuest, sanitizeJellyfinSessionsForGuest } = require('./guestRedact');
const { isPlexSectionExcluded } = require('./libraryFilter');
const { configStore } = require('../config');
const { peekVisitorSession } = require('../auth/visitorSession');
const logger = require('./logger');
const { redactForSession } = require('./memberRedact');

// PUSH ARCHITECTURE — one upstream feed per media server, fanned out to every connected
// browser over Server-Sent Events, instead of every tab polling Plex/Jellyfin itself.
//   Plex:     webhook-triggered refresh of /status/sessions, plus a 30s safety-net poll
//             (a killed client never sends media.stop).
//   Jellyfin: a single server-side poll of /Sessions — 3s while anyone is watching the
//             page, 30s otherwise. Jellyfin's WebSocket would be cheaper, but it never
//             sends `Sessions` messages to API-key connections, only to user sessions.
const sharedState = { plex: null, jellyfin: null }; // last-known raw (unredacted) state
const sseSubscribers = new Set(); // { res, token, ip }

// null = not configured, true = reachable, false = failing. Sent to browsers as
// `event: status` so the header dots reflect the server's real view of each service.
const serviceHealth = { plex: null, jellyfin: null };

function writeAll(frame) {
  for (const sub of sseSubscribers) {
    try { sub.res.write(frame); } catch { /* gone; its 'close' handler cleans up */ }
  }
}

function statusFrame() {
  return `event: status\ndata: ${JSON.stringify(serviceHealth)}\n\n`;
}

function setHealth(service, value) {
  if (serviceHealth[service] === value) return;
  serviceHealth[service] = value;
  writeAll(statusFrame());
}

// What one subscriber may see. Re-resolved on every broadcast (not captured at connect
// time), so a signed-out or expired session drops to the guest view immediately.

function payloadFor(service, token) {
  const raw = sharedState[service];
  if (raw === null) return null;
  const session = token ? peekVisitorSession(token) : null;
  if (!session) return service === 'plex' ? sanitizePlexSessionsForGuest(raw) : sanitizeJellyfinSessionsForGuest(raw);
  return redactForSession(raw, session);
}

function broadcastSSE(service) {
  if (sharedState[service] === null) return;
  for (const sub of sseSubscribers) {
    const payload = payloadFor(service, sub.token);
    try { sub.res.write(`event: ${service}\ndata: ${JSON.stringify(payload)}\n\n`); } catch { /* gone */ }
  }
}

// Content-free signal ("go re-fetch X"); identical for every subscriber.
function broadcastSignal(eventName) {
  writeAll(`event: ${eventName}\ndata: {}\n\n`);
}

// ── Plex ─────────────────────────────────────────────────────────────────
// One refresh in flight at a time; webhooks that arrive meanwhile queue exactly one
// follow-up run (so a burst of play/pause events can't race and paint stale data).
let plexInFlight = null;
let plexRerun = false;
let plexFailures = 0;

async function refreshPlexSessions() {
  if (plexInFlight) { plexRerun = true; return plexInFlight; }
  plexInFlight = (async () => {
    do {
      plexRerun = false;
      if (!configStore.isServiceConfigured('plex')) {
        setHealth('plex', null);
        sharedState.plex = null;
        return;
      }
      const plex = configStore.resolved().services.plex;
      try {
        const json = await fetchJson(`${plex.url}/status/sessions`, { headers: { 'X-Plex-Token': plex.token } });
        const metadata = (json?.MediaContainer?.Metadata || []).filter((m) => !isPlexSectionExcluded(m.librarySectionID));
        sharedState.plex = { ...json, MediaContainer: { ...json?.MediaContainer, Metadata: metadata } };
        plexFailures = 0;
        setHealth('plex', true);
        broadcastSSE('plex');
      } catch (err) {
        plexFailures += 1;
        setHealth('plex', false);
        logger.warn('refreshPlexSessions failed:', err.message);
        // Two misses in a row: stop showing streams that may have ended long ago.
        if (plexFailures >= 2 && sharedState.plex !== null) {
          sharedState.plex = { MediaContainer: { size: 0, Metadata: [] } };
          broadcastSSE('plex');
        }
      }
    } while (plexRerun);
  })().finally(() => { plexInFlight = null; });
  return plexInFlight;
}

// ── Jellyfin ─────────────────────────────────────────────────────────────
const JELLYFIN_FAST_MS = 3000;
const JELLYFIN_IDLE_MS = 30000;
let jellyfinFailures = 0;
let jellyfinSig = '';
let jellyfinTimer = null;

async function refreshJellyfinSessions() {
  if (!configStore.isServiceConfigured('jellyfin')) {
    setHealth('jellyfin', null);
    sharedState.jellyfin = null;
    jellyfinSig = '';
    return;
  }
  // Lazy require: services/jellyfin.js pulls in the visitor-auth modules.
  const { fetchActiveSessions } = require('../services/jellyfin');
  try {
    const sessions = await fetchActiveSessions(configStore.resolved().services.jellyfin);
    jellyfinFailures = 0;
    setHealth('jellyfin', true);
    // Only now-playing sessions matter to the page; skip the broadcast when nothing
    // changed except idle sessions' LastActivityDate.
    const playing = sessions.filter((s) => s.NowPlayingItem);
    const sig = JSON.stringify(playing.map((s) => [s.Id, s.NowPlayingItem.Id, s.PlayState?.IsPaused, Math.floor((s.PlayState?.PositionTicks || 0) / 1e8)]));
    sharedState.jellyfin = playing;
    if (sig !== jellyfinSig) {
      jellyfinSig = sig;
      broadcastSSE('jellyfin');
    }
  } catch (err) {
    jellyfinFailures += 1;
    setHealth('jellyfin', false);
    if (jellyfinFailures === 1 || jellyfinFailures % 20 === 0) logger.warn('Jellyfin sessions poll failed:', err.message);
    if (jellyfinFailures >= 10 && sharedState.jellyfin?.length) {
      sharedState.jellyfin = [];
      jellyfinSig = '';
      broadcastSSE('jellyfin');
    }
  }
}

function scheduleJellyfinPoll() {
  clearTimeout(jellyfinTimer);
  const delay = sseSubscribers.size > 0 ? JELLYFIN_FAST_MS : JELLYFIN_IDLE_MS;
  jellyfinTimer = setTimeout(async () => {
    await refreshJellyfinSessions();
    scheduleJellyfinPoll();
  }, delay);
  jellyfinTimer.unref();
}

// A new browser tab after an idle stretch shouldn't wait up to 30s for the fast cadence.
function onSubscriberAdded() {
  if (sseSubscribers.size === 1) {
    refreshJellyfinSessions().finally(scheduleJellyfinPoll);
  }
}

const PLEX_WEBHOOK_RELEVANT_EVENTS = new Set([
  'media.play', 'media.pause', 'media.resume', 'media.stop', 'media.scrobble',
]);

// Webhook secrets are generated eagerly at startup so the admin page has a real URL to
// paste into Plex/Seerr before either has ever called us.
async function getOrCreateSecret(key) {
  const existing = configStore.resolved().push?.[key];
  if (existing) return existing;
  const generated = crypto.randomUUID();
  await configStore.set(`push.${key}`, generated);
  return generated;
}
const getOrCreatePlexWebhookSecret = () => getOrCreateSecret('plexWebhookSecret');
const getOrCreateSeerrWebhookSecret = () => getOrCreateSecret('seerrWebhookSecret');

// Called once from server/index.js after the server starts listening. Both feeds re-read
// the config on every tick, so configuring Plex/Jellyfin in /admin needs no restart.
async function startPush() {
  await getOrCreatePlexWebhookSecret();
  await getOrCreateSeerrWebhookSecret();
  refreshPlexSessions();
  refreshJellyfinSessions().finally(scheduleJellyfinPoll);
  setInterval(refreshPlexSessions, 30000).unref();
}

module.exports = {
  sharedState,
  sseSubscribers,
  serviceHealth,
  statusFrame,
  payloadFor,
  broadcastSSE,
  broadcastSignal,
  refreshPlexSessions,
  refreshJellyfinSessions,
  onSubscriberAdded,
  getOrCreatePlexWebhookSecret,
  getOrCreateSeerrWebhookSecret,
  startPush,
  PLEX_WEBHOOK_RELEVANT_EVENTS,
};
