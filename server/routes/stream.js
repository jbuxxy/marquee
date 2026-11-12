const crypto = require('crypto');
const { visitorSessionCookieFromRequest } = require('../auth/visitorSession');
const { readRawBody, extractMultipartField, readJsonBody, sendJson, clientIp } = require('../lib/http');
const {
  sseSubscribers,
  payloadFor,
  statusFrame,
  onSubscriberAdded,
  refreshPlexSessions,
  broadcastSignal,
  getOrCreatePlexWebhookSecret,
  getOrCreateSeerrWebhookSecret,
  PLEX_WEBHOOK_RELEVANT_EVENTS,
} = require('../lib/push');
const logger = require('../lib/logger');

const MAX_STREAMS_PER_IP = 8;
const MAX_STREAMS_TOTAL = 500;
const streamsByIp = new Map();

// Unauthenticated on purpose — guests get a stream too, just redacted. The visitor's
// cookie token (not a session snapshot) is kept per subscriber, and lib/push.js re-resolves
// it on every broadcast, so signing out or expiring takes effect on the next update.
async function handleStream(req, res) {
  const ip = clientIp(req);
  const open = streamsByIp.get(ip) || 0;
  if (open >= MAX_STREAMS_PER_IP || sseSubscribers.size >= MAX_STREAMS_TOTAL) {
    return sendJson(res, 429, { error: 'too many open streams' });
  }
  streamsByIp.set(ip, open + 1);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // in case a reverse proxy in front of this tries to buffer SSE
  });
  res.write('retry: 5000\n\n');

  const sub = { res, ip, token: visitorSessionCookieFromRequest(req) || null };
  sseSubscribers.add(sub);
  onSubscriberAdded();

  // Current state immediately, so a newly-opened tab isn't empty until the next event.
  res.write(statusFrame());
  for (const service of ['plex', 'jellyfin']) {
    const payload = payloadFor(service, sub.token);
    if (payload !== null) res.write(`event: ${service}\ndata: ${JSON.stringify(payload)}\n\n`);
  }

  // Named event (not a comment) so the browser can tell a live-but-quiet stream from a
  // silently dead one and reconnect.
  const ping = setInterval(() => {
    try { res.write(`event: ping\ndata: ${Date.now()}\n\n`); } catch { clearInterval(ping); }
  }, 20000);

  req.on('close', () => {
    clearInterval(ping);
    sseSubscribers.delete(sub);
    const n = (streamsByIp.get(ip) || 1) - 1;
    if (n <= 0) streamsByIp.delete(ip); else streamsByIp.set(ip, n);
  });
}

function timingSafeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// 404, not 401/403, on a secret mismatch — an unrecognized path segment
// shouldn't confirm this route exists at all to anyone probing it.
async function handlePlexWebhook(req, res, params) {
  const expected = await getOrCreatePlexWebhookSecret();
  if (!timingSafeStringEqual(params.secret, expected)) {
    return sendJson(res, 404, { error: 'not found' });
  }

  const body = await readRawBody(req);
  // Ack immediately — Plex doesn't need to wait on us, and the refresh
  // fetch against Plex shouldn't hold its webhook request open.
  sendJson(res, 200, { ok: true });

  try {
    const payloadText = extractMultipartField(body, req.headers['content-type'], 'payload');
    const payload = payloadText ? JSON.parse(payloadText) : null;
    // No parseable event, or an event we don't specifically care about —
    // refresh anyway on an unparseable payload (fail open, cheap insurance
    // against a payload shape we don't recognize) but skip refreshing for a
    // recognized-but-irrelevant event.
    if (!payload || PLEX_WEBHOOK_RELEVANT_EVENTS.has(payload.event)) {
      await refreshPlexSessions();
    }
    // Independent of the session-relevant check above — a newly-added item
    // is not a session event, it's a library-changed event (see
    // frontend/js/carousel.js's marquee:library-changed listener).
    if (payload?.event === 'library.new') {
      broadcastSignal('library-changed');
    }
  } catch (err) {
    logger.warn('plex webhook handling error:', err.message);
  }
}

// Same 404-not-403 convention as the Plex webhook above — an unrecognized
// secret shouldn't confirm this route exists to anyone probing it.
async function handleSeerrWebhook(req, res, params) {
  const expected = await getOrCreateSeerrWebhookSecret();
  if (!timingSafeStringEqual(params.secret, expected)) {
    return sendJson(res, 404, { error: 'not found' });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    body = null;
  }
  // Ack immediately, same reasoning as the Plex webhook — Seerr doesn't need
  // to wait on us.
  sendJson(res, 200, { ok: true });

  // Unlike Plex, marquee's /api/seerr/requests is a live pass-through fetch
  // on every call (server/services/seerr.js's handleRequests), not a
  // server-side cache to selectively refresh — so any webhook hit, whatever
  // its payload shape, is worth telling subscribers to go re-fetch.
  logger.log('seerr webhook received:', body?.notification_type || body?.event || 'unknown');
  broadcastSignal('requests-changed');
}

module.exports = { handleStream, handlePlexWebhook, handleSeerrWebhook };
