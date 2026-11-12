const { verifyPassword } = require('../auth/password');
const { resolveAdminPasswordHash } = require('../auth/bootstrap');
const {
  createSession,
  destroySession,
  sessionCookieFromRequest,
  buildSetCookie,
  SESSION_COOKIE,
  CSRF_COOKIE,
} = require('../auth/session');
const { generateToken } = require('../auth/csrf');
const { recordIpFailure, resetIp, ipLockedUntil } = require('../auth/rateLimit');
const { configStore } = require('../config');
const { readJsonBody, sendJson, clientIp, isJsonRequest } = require('../lib/http');

const ACCOUNT_MAX_ATTEMPTS = 10;
const ACCOUNT_LOCKOUT_MS = 15 * 60 * 1000;

async function handleLogin(req, res) {
  const ip = clientIp(req);

  if (ipLockedUntil(ip)) {
    return sendJson(res, 429, { error: 'too many attempts — try again later' });
  }

  const account = configStore.get('admin.loginAttempts', { count: 0, lockedUntil: 0 });
  if (account.lockedUntil && account.lockedUntil > Date.now()) {
    return sendJson(res, 429, { error: 'account temporarily locked — try again later' });
  }

  if (!isJsonRequest(req)) return sendJson(res, 415, { error: 'expected application/json' });
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: 'invalid request body' });
  }
  const password = typeof body.password === 'string' ? body.password : '';

  const { hash } = await resolveAdminPasswordHash();
  const ok = password.length > 0 && (await verifyPassword(password, hash));

  if (!ok) {
    recordIpFailure(ip);
    const nextCount = (account.count || 0) + 1;
    const update = { count: nextCount, lockedUntil: account.lockedUntil || 0 };
    if (nextCount >= ACCOUNT_MAX_ATTEMPTS) update.lockedUntil = Date.now() + ACCOUNT_LOCKOUT_MS;
    await configStore.set('admin.loginAttempts', update);
    return sendJson(res, 401, { error: 'incorrect password' });
  }

  resetIp(ip);
  await configStore.set('admin.loginAttempts', { count: 0, lockedUntil: 0 });

  const sessionToken = createSession();
  const csrfToken = generateToken();
  res.setHeader('Set-Cookie', [
    buildSetCookie(req, SESSION_COOKIE, sessionToken, { maxAgeSeconds: 60 * 60 * 24, httpOnly: true }),
    buildSetCookie(req, CSRF_COOKIE, csrfToken, { maxAgeSeconds: 60 * 60 * 24, httpOnly: false }),
  ]);
  sendJson(res, 200, { ok: true, csrfToken });
}

function handleLogout(req, res) {
  destroySession(sessionCookieFromRequest(req));
  res.setHeader('Set-Cookie', [
    buildSetCookie(req, SESSION_COOKIE, '', { httpOnly: true }),
    buildSetCookie(req, CSRF_COOKIE, '', { httpOnly: false }),
  ]);
  sendJson(res, 200, { ok: true });
}

module.exports = { handleLogin, handleLogout };
