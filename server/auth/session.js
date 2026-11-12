const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CONFIG_DIR } = require('../config');
const { cookieFromRequest, HOST_PREFIX } = require('../lib/cookies');

const SECRET_PATH = path.join(CONFIG_DIR, 'session-secret');
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_COOKIE = 'marquee_session';
const CSRF_COOKIE = 'marquee_csrf';

// Auto-generated once and persisted (mirrors the admin-password bootstrap in
// auth/bootstrap.js) so restarting the container doesn't invalidate every
// session, unless the operator supplies SESSION_SECRET explicitly.
function loadOrCreateSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
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

const SESSION_SECRET = loadOrCreateSessionSecret();

// Sessions are opaque random IDs looked up in this in-memory map — there is
// no database, and a restart naturally invalidates all of them (acceptable:
// this is a single-container app, not a multi-replica deployment).
const sessions = new Map();

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex');
}

function createSession() {
  const id = crypto.randomBytes(32).toString('hex');
  sessions.set(id, { expiresAt: Date.now() + SESSION_TTL_MS });
  return `${id}.${sign(id)}`;
}

function parseSessionToken(token) {
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

function validateSession(token) {
  const id = parseSessionToken(token);
  if (!id) return false;
  const session = sessions.get(id);
  if (!session) return false;
  if (session.expiresAt < Date.now()) {
    sessions.delete(id);
    return false;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS; // sliding expiry
  return true;
}

function destroySession(token) {
  const id = parseSessionToken(token);
  if (id) sessions.delete(id);
}

function sessionCookieFromRequest(req) {
  return cookieFromRequest(req, SESSION_COOKIE);
}

// Only trust X-Forwarded-Proto when the operator has explicitly said they're
// behind a reverse proxy — otherwise an attacker-controlled header could
// spoof "https" and disable the Secure flag's protection over plain HTTP.
function isHttps(req) {
  return process.env.TRUST_PROXY === 'true' && req.headers['x-forwarded-proto'] === 'https';
}

function buildSetCookie(req, name, value, { maxAgeSeconds, httpOnly = true } = {}) {
  const secure = isHttps(req);
  const parts = [`${secure ? HOST_PREFIX : ''}${name}=${value}`, 'Path=/', 'SameSite=Lax'];
  if (httpOnly) parts.push('HttpOnly');
  if (maxAgeSeconds) parts.push(`Max-Age=${maxAgeSeconds}`);
  else parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

module.exports = {
  SESSION_COOKIE,
  CSRF_COOKIE,
  createSession,
  validateSession,
  destroySession,
  sessionCookieFromRequest,
  buildSetCookie,
  isHttps,
};
