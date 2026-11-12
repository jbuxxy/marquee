const POLL_INTERVAL_MS = 15000;
// Plex/Jellyfin are pushed via /api/stream (see connectPushStream below),
// not polled — ABS has no real-time push (see server/lib/push.js's own
// comment on why: its only real client here never emits real-time presence
// events), so it stays on this poll loop alone.
const WATCH_SERVICES = ['abs'];
const PUSH_SERVICES = ['plex', 'jellyfin'];

// Each service's session-list API has its own response shape; this is a
// best-effort extraction based on each service's public API docs — worth
// double-checking against your own instance/version if a card never shows
// an active stream you know is playing.
function extractSessionCount(key, data) {
  try {
    if (key === 'plex') return (data?.MediaContainer?.Metadata || []).length;
    if (key === 'jellyfin') return Array.isArray(data) ? data.filter((s) => s.NowPlayingItem).length : 0;
    if (key === 'abs') return (data?.sessions || []).length;
    return 0;
  } catch {
    return 0;
  }
}

function formatEpisodeTitle(seriesName, seasonNum, episodeNum, episodeName) {
  const season = String(seasonNum ?? 0).padStart(2, '0');
  const episode = String(episodeNum ?? 0).padStart(2, '0');
  return `${seriesName || 'Unknown'} — S${season}E${episode} — ${episodeName || 'Unknown'}`;
}

// Normalizes each service's session list into the common shape nowplaying.js
// (allStreams/entryHTML/openStreamDetail) and waveform.js work with:
// { user, title, mediaType, thumb, ip, client, state, viewOffset, duration }
// plus service-specific extras used for deep-linking (plexKey/plexType for
// Plex, jellyfinKey/serverId for Jellyfin, libraryItemId/author/description/
// genres for ABS).
function parsePlexEntries(data) {
  const items = data?.MediaContainer?.Metadata || [];
  return items.map((m) => {
    const isEpisode = m.type === 'episode';
    const title = isEpisode ? formatEpisodeTitle(m.grandparentTitle, m.parentIndex, m.index, m.title) : (m.title || 'Unknown');
    const thumbPath = m.grandparentThumb || m.thumb || m.parentThumb;
    return {
      user: m.User?.title || m.Account?.title || 'Someone',
      title,
      mediaType: m.type === 'episode' ? 'show' : m.type === 'track' ? 'music' : 'movie',
      thumb: thumbPath ? `/api/plex/thumb?path=${encodeURIComponent(thumbPath)}` : null,
      ip: m.Player?.address || null,
      client: m.Player?.product || m.Player?.title || null,
      state: m.Player?.state === 'paused' ? 'paused' : 'playing',
      viewOffset: m.viewOffset ?? 0,
      duration: m.duration ?? 0,
      plexKey: m.ratingKey || null,
      plexType: m.type,
    };
  });
}

function parseJellyfinEntries(data) {
  const sessions = Array.isArray(data) ? data.filter((s) => s.NowPlayingItem) : [];
  return sessions.map((s) => {
    const item = s.NowPlayingItem;
    const isEpisode = item.Type === 'Episode';
    const title = isEpisode ? formatEpisodeTitle(item.SeriesName, item.ParentIndexNumber, item.IndexNumber, item.Name) : (item.Name || 'Unknown');
    return {
      user: s.UserName || 'Someone',
      title,
      mediaType: isEpisode ? 'show' : item.Type === 'Audio' ? 'music' : 'movie',
      thumb: item.Id ? `/api/jellyfin/image?id=${item.Id}&type=Primary` : null,
      ip: s.RemoteEndPoint || null,
      client: s.Client || s.DeviceName || null,
      state: s.PlayState?.IsPaused ? 'paused' : 'playing',
      viewOffset: s.PlayState?.PositionTicks ? Math.round(s.PlayState.PositionTicks / 10000) : 0,
      duration: item.RunTimeTicks ? Math.round(item.RunTimeTicks / 10000) : 0,
      jellyfinKey: item.Id || null,
      serverId: s.ServerId || null,
    };
  });
}

function parseAbsEntries(data) {
  const sessions = data?.sessions || [];
  return sessions.map((s) => ({
    user: s.user?.username || s.userId || 'Someone',
    title: s.displayTitle || s.mediaMetadata?.title || 'Unknown',
    mediaType: 'audiobook',
    thumb: s.libraryItemId ? `/api/abs/cover/${s.libraryItemId}` : null,
    ip: s.deviceInfo?.ipAddress || null,
    client: s.deviceInfo?.clientName || s.deviceInfo?.deviceName || null,
    state: s.playState === 'paused' ? 'paused' : 'playing',
    viewOffset: Math.round((s.currentTime || 0) * 1000),
    duration: Math.round((s.duration || 0) * 1000),
    libraryItemId: s.libraryItemId || null,
    author: s.mediaMetadata?.authorName || null,
    description: s.mediaMetadata?.description || null,
    genres: s.mediaMetadata?.genres || [],
  }));
}

// Each parsed entry is stamped with its arrival time (_rx), so progress can be extrapolated
// from it (nowplaying.js liveViewOffset) instead of counted up by a timer.
const ENTRY_PARSERS = Object.fromEntries(Object.entries({ plex: parsePlexEntries, jellyfin: parseJellyfinEntries, abs: parseAbsEntries })
  .map(([k, parse]) => [k, (data) => { const rx = Date.now(); return parse(data).map((e) => ({ ...e, _rx: rx })); }]));

async function pollService(key) {
  const dot = document.getElementById(`status-${key}`);
  const detail = document.getElementById(`detail-${key}`);
  if (!dot) return;

  try {
    const res = await fetch(`/api/${key}/sessions`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    dot.classList.remove('offline');
    dot.classList.add('online');
    const count = extractSessionCount(key, data);
    if (detail) detail.textContent = count > 0 ? `${count} stream${count === 1 ? '' : 's'} active` : 'Idle';
    const entries = ENTRY_PARSERS[key] ? ENTRY_PARSERS[key](data) : [];
    if (typeof setStreams === 'function') setStreams(key, count, entries);
  } catch {
    dot.classList.remove('online');
    dot.classList.add('offline');
    if (detail) detail.textContent = 'Unavailable';
    if (typeof setStreams === 'function') setStreams(key, null, null);
  }
}

function startPolling(config) {
  const services = WATCH_SERVICES.filter((key) => config.services?.[key]?.enabled);
  if (services.length === 0) return;
  const tick = () => services.forEach(pollService);
  tick();
  setInterval(tick, POLL_INTERVAL_MS);
}

// ── Real-time push (Plex/Jellyfin) ──────────────────────────────────────
// Mirrors pollService()'s own status-dot/setStreams() writes, just fed by
// an SSE event instead of a fetch response — nowplaying.js/waveform.js/
// map.js don't care which one called setStreams(), only that it was called.
function applyPushData(key, data) {
  const dot = document.getElementById(`status-${key}`);
  const detail = document.getElementById(`detail-${key}`);
  if (!dot) return;
  dot.classList.remove('offline');
  dot.classList.add('online');
  const count = extractSessionCount(key, data);
  if (detail) detail.textContent = count > 0 ? `${count} stream${count === 1 ? '' : 's'} active` : 'Idle';
  const entries = ENTRY_PARSERS[key] ? ENTRY_PARSERS[key](data) : [];
  if (typeof setStreams === 'function') setStreams(key, count, entries);
}

function setPushServiceOffline(key) {
  const dot = document.getElementById(`status-${key}`);
  const detail = document.getElementById(`detail-${key}`);
  if (!dot) return;
  dot.classList.remove('online');
  dot.classList.add('offline');
  if (detail) detail.textContent = 'Unavailable';
  if (typeof setStreams === 'function') setStreams(key, null, null);
}

let _pushStream = null;
let _pushConfig = {};
let _pushWatchdog = null;
let _pushRetry = null;
let _pushBackoff = 2000;
const PUSH_SILENCE_MS = 50000; // server pings every 20s

function setPushDot(key, up) {
  const dot = document.getElementById(`status-${key}`);
  const detail = document.getElementById(`detail-${key}`);
  if (!dot) return;
  dot.classList.toggle('online', up);
  dot.classList.toggle('offline', !up);
  if (!up && detail) detail.textContent = 'Unavailable';
}

// Re-called on login/logout ("marquee:auth-changed") so the next snapshot arrives right
// away at the new redaction level (the server also re-checks the session per update).
function connectPushStream() {
  // The stream also carries requests-changed/library-changed signals, which matter
  // whenever Seerr is configured, not just the media servers.
  const anyPushService = PUSH_SERVICES.some((key) => _pushConfig.services?.[key]?.enabled)
    || _pushConfig.services?.seerr?.enabled;
  _pushStream?.close();
  _pushStream = null;
  clearTimeout(_pushWatchdog);
  clearTimeout(_pushRetry);
  if (!anyPushService) return;

  const es = new EventSource('/api/stream');
  _pushStream = es;
  // Any frame proves the stream is alive; silence past the ping interval means a proxy
  // or network dropped it without closing, so start over.
  const alive = () => {
    clearTimeout(_pushWatchdog);
    _pushWatchdog = setTimeout(reconnectPushStream, PUSH_SILENCE_MS);
  };
  alive();
  es.addEventListener('open', () => { _pushBackoff = 2000; alive(); });
  es.addEventListener('ping', alive);
  // The server's own view of each media server (null = not configured).
  es.addEventListener('status', (ev) => {
    alive();
    let health;
    try { health = JSON.parse(ev.data); } catch { return; }
    PUSH_SERVICES.forEach((key) => {
      if (!_pushConfig.services?.[key]?.enabled || health[key] == null) return;
      setPushDot(key, health[key] === true);
      if (health[key] === false && typeof setStreams === 'function') setStreams(key, null, null);
    });
  });
  es.addEventListener('plex', (ev) => {
    alive();
    try { applyPushData('plex', JSON.parse(ev.data)); } catch {}
  });
  es.addEventListener('jellyfin', (ev) => {
    alive();
    try { applyPushData('jellyfin', JSON.parse(ev.data)); } catch {}
  });
  // Content-free signals: the receiving module re-fetches its own view now instead of
  // waiting on its poll interval.
  es.addEventListener('requests-changed', () => {
    document.dispatchEvent(new CustomEvent('marquee:requests-changed'));
  });
  es.addEventListener('library-changed', () => {
    document.dispatchEvent(new CustomEvent('marquee:library-changed'));
  });
  es.addEventListener('error', () => {
    // The browser retries a dropped stream by itself (readyState CONNECTING); only a
    // CLOSED stream (e.g. a 429 or 5xx) needs us to back off and try again.
    if (es.readyState === EventSource.CLOSED) {
      PUSH_SERVICES.forEach(setPushServiceOffline);
      clearTimeout(_pushWatchdog);
      _pushRetry = setTimeout(connectPushStream, _pushBackoff);
      _pushBackoff = Math.min(_pushBackoff * 2, 60000);
    }
  });
}

function reconnectPushStream() {
  PUSH_SERVICES.forEach((key) => {
    if (_pushConfig.services?.[key]?.enabled) setPushDot(key, false);
  });
  connectPushStream();
}

document.addEventListener('marquee:config', (e) => {
  _pushConfig = e.detail;
  startPolling(e.detail);
  connectPushStream();
});
// The initial session check doesn't need a reconnect: the stream opened with the same
// cookie, so it is already at the right redaction level.
document.addEventListener('marquee:auth-changed', (e) => { if (!e.detail?.initial) connectPushStream(); });

// Used by the command palette's "Refresh Data" action — ABS re-polls
// immediately; Plex/Jellyfin reconnect the stream, which sends a fresh
// snapshot of the current state right away.
window.refreshAll = () => {
  WATCH_SERVICES.forEach(pollService);
  connectPushStream();
};
