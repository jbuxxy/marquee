const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CONFIG_DIR, configStore } = require('../config');
const { cookieFromRequest } = require('../lib/cookies');
const { buildSetCookie } = require('./session');
const logger = require('../lib/logger');

// Visitor sessions are a separate trust domain from admin sessions
// (server/auth/session.js) — "can change site settings" and "is a known
// Plex/Jellyfin visitor" are different privilege boundaries and shouldn't
// share cookies, secrets, or storage. Structurally this mirrors session.js
// closely (same signed-opaque-id-in-a-Map shape), but each session record
// also carries the visitor's provider/tokens, which admin sessions have no
// equivalent of.
const SECRET_PATH = path.join(CONFIG_DIR, 'visitor-session-secret');
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, sliding — visitor login is opt-in/low-friction, a longer window than admin's 24h is appropriate
const SESSION_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000; // absolute cap, however active the session
const TOUCH_INTERVAL_MS = 60 * 60 * 1000; // slide the expiry (and write Redis) at most hourly
const REVERIFY_INTERVAL_MS = 24 * 60 * 60 * 1000; // re-check the upstream token daily
const SESSION_COOKIE = 'marquee_visitor';
const CSRF_COOKIE = 'marquee_visitor_csrf';

function loadOrCreateSecret() {
  if (process.env.VISITOR_SESSION_SECRET) return process.env.VISITOR_SESSION_SECRET;
  try {
    return fs.readFileSync(SECRET_PATH, 'utf8').trim();
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const secret = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(SECRET_PATH, secret, { mode: 0o600 });
  return secret;
}

const SESSION_SECRET = loadOrCreateSecret();

// id -> { provider: 'plex'|'jellyfin', username, plexToken?, plexAccountId?,
//         jellyfinToken?, jellyfinUserId?, expiresAt }. The in-memory Map
// stays the source of truth for every synchronous read on this process;
// Redis (below) is purely an optional write-through backup so a container
// restart/redeploy doesn't sign every visitor out. Unset, behavior is
// unchanged from before: in-memory only, lost on restart.
const sessions = new Map();

const REDIS_SESSION_PREFIX = 'marquee:visitor-session:';
let redis = null;
let redisMissingWarned = false;

function getRedisClient() {
  if (redis) return redis;
  const cfg = configStore.resolved().services?.redis;
  if (!cfg?.url) return null;
  let Redis;
  try {
    Redis = require('ioredis');
  } catch {
    if (!redisMissingWarned) logger.warn('REDIS_URL is set but the ioredis package is missing; visitor sessions stay in memory only');
    redisMissingWarned = true;
    return null;
  }
  redis = new Redis(cfg.url, {
    password: cfg.password || undefined,
    // Never let a Redis hiccup take marquee down — sessions still work
    // in-memory (just won't survive a restart until Redis is reachable
    // again), and ioredis retries forever on its own.
    retryStrategy: (times) => Math.min(times * 500, 10000),
    lazyConnect: false,
  });
  redis.on('error', (err) => logger.warn('redis error:', err.message));
  return redis;
}

// Fire-and-forget write-through — session reads/writes elsewhere stay
// synchronous against the in-memory Map; Redis is purely a backup, never the
// source of truth for a request already in flight.
function persistSession(id, session) {
  const client = getRedisClient();
  if (!client) return;
  const ttlMs = session.expiresAt - Date.now();
  if (ttlMs <= 0) return;
  client.set(REDIS_SESSION_PREFIX + id, JSON.stringify({ ...session, verifying: undefined }), 'PX', ttlMs)
    .catch((err) => logger.warn('redis session persist failed:', err.message));
}

function deletePersistedSession(id) {
  const client = getRedisClient();
  if (!client) return;
  client.del(REDIS_SESSION_PREFIX + id).catch((err) => logger.warn('redis session delete failed:', err.message));
}

// Rehydrates the in-memory Map from Redis at startup, before the server
// accepts requests — called once from server/index.js. A no-op if Redis
// isn't configured.
async function loadSessionsFromRedis() {
  const client = getRedisClient();
  if (!client) return;
  try {
    const keys = await client.keys(REDIS_SESSION_PREFIX + '*');
    if (!keys.length) return;
    const values = await client.mget(keys);
    let restored = 0;
    keys.forEach((key, i) => {
      if (!values[i]) return;
      try {
        const session = JSON.parse(values[i]);
        if (session.expiresAt > Date.now()) {
          sessions.set(key.slice(REDIS_SESSION_PREFIX.length), session);
          restored++;
        }
      } catch {
        // corrupt entry — skip it
      }
    });
    logger.log(`restored ${restored} visitor session(s) from redis`);
  } catch (err) {
    logger.warn('loading visitor sessions from redis failed (starting with none):', err.message);
  }
}

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex');
}

function createVisitorSession(data) {
  const id = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const session = { ...data, createdAt: now, touchedAt: now, verifiedAt: now, expiresAt: now + SESSION_TTL_MS };
  sessions.set(id, session);
  persistSession(id, session);
  return `${id}.${sign(id)}`;
}

function parseVisitorToken(token) {
  if (!token) return null;
  const idx = token.lastIndexOf('.');
  if (idx === -1) return null;
  const id = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(id);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return id;
}

function liveSession(token) {
  const id = parseVisitorToken(token);
  if (!id) return null;
  const session = sessions.get(id);
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt < now || (session.createdAt && now - session.createdAt > SESSION_MAX_AGE_MS)) {
    sessions.delete(id);
    deletePersistedSession(id);
    return null;
  }
  return { id, session };
}

// Read-only lookup: no expiry slide, no Redis write. Used by the SSE broadcaster, which
// re-checks every subscriber on every update.
function peekVisitorSession(token) {
  const hit = liveSession(token);
  return hit ? { id: hit.id, ...hit.session } : null;
}

// Upstream re-verification hook (set by routes/visitorAuth.js, which knows how to ask
// plex.tv / Jellyfin). Returns false only when the upstream definitively rejected the
// token (401/403); network errors keep the session.
let verifyUpstream = null;
function setUpstreamVerifier(fn) { verifyUpstream = fn; }

function maybeReverify(id, session) {
  if (!verifyUpstream || session.verifying) return;
  if (Date.now() - (session.verifiedAt || 0) < REVERIFY_INTERVAL_MS) return;
  session.verifying = true;
  Promise.resolve(verifyUpstream(session))
    .then((ok) => {
      if (ok === false) {
        logger.log(`visitor session for ${session.username || 'unknown'} revoked upstream; signing out`);
        sessions.delete(id);
        deletePersistedSession(id);
      } else {
        session.verifiedAt = Date.now();
        persistSession(id, session);
      }
    })
    .catch(() => {})
    .finally(() => { delete session.verifying; });
}

function getVisitorSessionFromToken(token) {
  const hit = liveSession(token);
  if (!hit) return null;
  const { id, session } = hit;
  const now = Date.now();
  if (now - (session.touchedAt || 0) > TOUCH_INTERVAL_MS) {
    session.touchedAt = now;
    session.expiresAt = now + SESSION_TTL_MS; // sliding expiry
    persistSession(id, session);
  }
  maybeReverify(id, session);
  return { id, ...session };
}

function destroyVisitorSession(token) {
  const id = parseVisitorToken(token);
  if (id) {
    sessions.delete(id);
    deletePersistedSession(id);
  }
}

function visitorSessionCookieFromRequest(req) {
  return cookieFromRequest(req, SESSION_COOKIE);
}

// unref()'d so this background cleanup timer never blocks the process from
// exiting on its own (relevant for `node --test`/one-off scripts) — the real
// server stays alive because of its HTTP listener, not this timer.
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) if (s.expiresAt < now) sessions.delete(id);
}, 60 * 60 * 1000).unref();

module.exports = {
  SESSION_COOKIE,
  CSRF_COOKIE,
  SESSION_TTL_MS,
  createVisitorSession,
  loadSessionsFromRedis,
  getVisitorSessionFromToken,
  peekVisitorSession,
  setUpstreamVerifier,
  destroyVisitorSession,
  visitorSessionCookieFromRequest,
  buildSetCookie,
};
