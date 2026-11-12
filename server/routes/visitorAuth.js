const crypto = require('crypto');
const { fetchJson, jellyfinAuthHeaders } = require('../lib/httpProxy');
const { readJsonBody, sendJson, clientIp, isJsonRequest } = require('../lib/http');
const { generateToken, verifyCsrf, tokensMatch } = require('../auth/csrf');
const { createIpLimiter, createWindowLimiter } = require('../auth/rateLimit');
const { cookieFromRequest } = require('../lib/cookies');
const {
  SESSION_COOKIE,
  CSRF_COOKIE,
  SESSION_TTL_MS,
  createVisitorSession,
  destroyVisitorSession,
  peekVisitorSession,
  setUpstreamVerifier,
  visitorSessionCookieFromRequest,
  buildSetCookie,
} = require('../auth/visitorSession');
const { getVisitorSession } = require('../auth/requireVisitorAuth');
const { configStore } = require('../config');
const logger = require('../lib/logger');

const MAX_AGE_SECONDS = Math.floor(SESSION_TTL_MS / 1000);
const PIN_COOKIE = 'marquee_visitor_pin';

// Visitor logins have their own limiters, separate from the admin login's.
const jellyfinLoginLimiter = createIpLimiter();
const takePinCreate = createWindowLimiter({ limit: 10, windowMs: 10 * 60 * 1000 });

function setVisitorSessionCookies(req, res, token) {
  const csrfToken = generateToken();
  res.appendHeader('Set-Cookie', buildSetCookie(req, SESSION_COOKIE, token, { maxAgeSeconds: MAX_AGE_SECONDS, httpOnly: true }));
  res.appendHeader('Set-Cookie', buildSetCookie(req, CSRF_COOKIE, csrfToken, { maxAgeSeconds: MAX_AGE_SECONDS, httpOnly: false }));
}

// Plex OAuth's PIN flow needs a stable client identifier across the whole
// login (pin creation -> poll -> user lookup all present the same one).
// Auto-generated and persisted on first use, same pattern as session.js's
// SESSION_SECRET — an operator can still pin it via PLEX_CLIENT_IDENTIFIER
// (see schema.js's auth.plexClientId field), but nothing requires it upfront
// the way a fail-fast startup check would.
async function getOrCreatePlexClientId() {
  const existing = configStore.resolved().auth?.plexClientId;
  if (existing) return existing;
  const generated = crypto.randomUUID();
  await configStore.set('auth.plexClientId', generated);
  return generated;
}

// The configured server's machineIdentifier, read once with the admin token.
let machineIdCache = null;
async function configuredPlexMachineId() {
  const plexCfg = configStore.resolved().services.plex;
  const key = `${plexCfg.url}|${plexCfg.token}`;
  if (machineIdCache?.key === key) return machineIdCache.id;
  const identity = await fetchJson(`${plexCfg.url}/identity`, { headers: { 'X-Plex-Token': plexCfg.token } });
  const id = identity?.MediaContainer?.machineIdentifier;
  if (!id) throw new Error('could not read the Plex server identity');
  machineIdCache = { key, id };
  return id;
}

// { hasAccess, owned } for this account against the configured server, via plex.tv's
// resource list (servers the account owns or has been shared).
async function plexServerAccess(userToken, clientId) {
  const machineId = await configuredPlexMachineId();
  const resources = await fetchJson('https://plex.tv/api/v2/resources?includeHttps=1', {
    headers: { 'X-Plex-Token': userToken, 'X-Plex-Client-Identifier': clientId },
  });
  const server = (Array.isArray(resources) ? resources : [])
    .find((r) => r.clientIdentifier === machineId && String(r.provides || '').includes('server'));
  return { hasAccess: !!server, owned: !!server?.owned };
}

// ── Plex OAuth (PIN flow) ───────────────────────────────────────────────
async function handlePinCreate(req, res) {
  if (!configStore.isServiceConfigured('plex')) return sendJson(res, 404, { error: 'plex is not configured' });
  if (!takePinCreate(clientIp(req))) return sendJson(res, 429, { error: 'too many sign-in attempts — try again later' });
  const clientId = await getOrCreatePlexClientId();
  const body = new URLSearchParams({ strong: 'true', 'X-Plex-Product': 'Marquee' }).toString();
  let pin;
  try {
    pin = await fetchJson('https://plex.tv/api/v2/pins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Plex-Client-Identifier': clientId },
      body,
    });
  } catch (err) {
    logger.warn('plex pin creation failed:', err.message);
    return sendJson(res, 502, { error: 'pin creation failed' });
  }
  if (!pin?.id) return sendJson(res, 502, { error: 'pin creation failed' });
  // Bind the PIN to this browser: only the tab that created it may redeem it, so a PIN id
  // seen elsewhere (logs, a shoulder-surfed URL) can't be polled into a session.
  const binding = `${pin.id}.${generateToken()}`;
  res.setHeader('Set-Cookie', buildSetCookie(req, PIN_COOKIE, binding, { maxAgeSeconds: 15 * 60, httpOnly: true }));
  sendJson(res, 200, { id: pin.id, code: pin.code, clientId });
}

const PIN_ID_PATTERN = /^\d+$/;

async function handlePinPoll(req, res, params) {
  if (!configStore.isServiceConfigured('plex')) return sendJson(res, 404, { error: 'plex is not configured' });
  const { id } = params;
  if (typeof id !== 'string' || !PIN_ID_PATTERN.test(id)) return sendJson(res, 400, { error: 'invalid pin id' });
  const binding = cookieFromRequest(req, PIN_COOKIE) || '';
  if (!tokensMatch(binding.split('.')[0], id)) return sendJson(res, 403, { error: 'sign-in was started in a different browser' });
  const clientId = await getOrCreatePlexClientId();

  let pin;
  try {
    pin = await fetchJson(`https://plex.tv/api/v2/pins/${id}`, { headers: { 'X-Plex-Client-Identifier': clientId } });
  } catch (err) {
    return sendJson(res, 502, { error: 'pin lookup failed' });
  }
  if (!pin?.authToken) {
    // no-store — this is polled every couple seconds; a browser heuristically
    // caching one "pending" response would make login look stuck forever.
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ pending: true }));
  }
  const userToken = pin.authToken;

  let user;
  try {
    user = await fetchJson('https://plex.tv/api/v2/user', {
      headers: { 'X-Plex-Token': userToken, 'X-Plex-Client-Identifier': clientId },
    });
  } catch (err) {
    return sendJson(res, 502, { error: 'plex user lookup failed' });
  }
  const username = user?.username || user?.title || 'Plex User';

  // The access check: plex.tv lists every server this account can reach. A token check
  // against the server itself proves nothing (/identity answers without one).
  let access;
  try {
    access = await plexServerAccess(userToken, clientId);
  } catch (err) {
    return sendJson(res, 502, { error: 'plex access check failed' });
  }
  if (!access.hasAccess) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ error: 'no_server_access', message: "This Plex account doesn't have access to this server." }));
  }

  // plex.tv's own numeric account id — what Overseerr's User.plexId is
  // populated from, so a later Seerr-capability lookup can match this
  // session to its real permissions.
  const plexAccountId = typeof user?.id === 'number' ? user.id : null;
  const token = createVisitorSession({ provider: 'plex', username, plexToken: userToken, plexAccountId, owner: access.owned });
  setVisitorSessionCookies(req, res, token);
  res.appendHeader('Set-Cookie', buildSetCookie(req, PIN_COOKIE, '', { httpOnly: true }));
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ ok: true, username }));
}

// ── Sign in with Jellyfin — a Jellyfin account has no relationship to Plex
// identity at all; a successful auth against this exact Jellyfin server IS
// the access check (Jellyfin has no decoupled central-account system like
// plex.tv, so there's no separate "does this account have server access"
// step the way Plex needs).
async function handleJellyfinLogin(req, res) {
  if (!configStore.isServiceConfigured('jellyfin')) return sendJson(res, 404, { error: 'jellyfin is not configured' });
  const ip = clientIp(req);
  if (jellyfinLoginLimiter.ipLockedUntil(ip)) return sendJson(res, 429, { error: 'too many attempts — try again later' });
  if (!isJsonRequest(req)) return sendJson(res, 415, { error: 'expected application/json' });

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: 'invalid request body' });
  }
  const username = typeof body.username === 'string' ? body.username : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password) return sendJson(res, 400, { error: 'username and password required' });

  const jellyfinCfg = configStore.resolved().services.jellyfin;
  let auth;
  try {
    auth = await fetchJson(`${jellyfinCfg.url}/Users/AuthenticateByName`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // A per-login DeviceId: Jellyfin keeps one access token per device, so a shared
        // id would sign every other visitor out on each new login.
        Authorization: `MediaBrowser Client="Marquee", Device="Marquee Web", DeviceId="marquee-${crypto.randomUUID()}", Version="1.0.0"`,
      },
      body: { Username: username, Pw: password },
    });
  } catch (err) {
    jellyfinLoginLimiter.recordIpFailure(ip);
    return sendJson(res, 401, { error: 'invalid credentials' });
  }
  if (!auth?.AccessToken || !auth?.User?.Id) {
    jellyfinLoginLimiter.recordIpFailure(ip);
    return sendJson(res, 401, { error: 'invalid credentials' });
  }
  jellyfinLoginLimiter.resetIp(ip);

  const token = createVisitorSession({
    provider: 'jellyfin',
    username: auth.User.Name || username,
    jellyfinToken: auth.AccessToken,
    jellyfinUserId: auth.User.Id,
    owner: auth.User.Policy?.IsAdministrator === true,
  });
  setVisitorSessionCookies(req, res, token);
  sendJson(res, 200, { ok: true, username: auth.User.Name || username });
}

function handleVisitorSession(req, res) {
  const session = getVisitorSession(req);
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(
    session ? { authenticated: true, username: session.username, provider: session.provider } : { authenticated: false }
  ));
}

async function handleVisitorLogout(req, res) {
  if (!verifyCsrf(req, CSRF_COOKIE)) return sendJson(res, 403, { error: 'invalid csrf token' });
  const token = visitorSessionCookieFromRequest(req);
  const session = peekVisitorSession(token);
  destroyVisitorSession(token);
  res.appendHeader('Set-Cookie', buildSetCookie(req, SESSION_COOKIE, '', { httpOnly: true }));
  res.appendHeader('Set-Cookie', buildSetCookie(req, CSRF_COOKIE, '', { httpOnly: false }));
  sendJson(res, 200, { ok: true });
  // Revoke the Jellyfin access token too, so it doesn't outlive the Marquee session.
  if (session?.provider === 'jellyfin' && session.jellyfinToken && configStore.isServiceConfigured('jellyfin')) {
    const jf = configStore.resolved().services.jellyfin;
    fetchJson(`${jf.url}/Sessions/Logout`, { method: 'POST', headers: jellyfinAuthHeaders(session.jellyfinToken), body: '' })
      .catch(() => {});
  }
}

// Daily re-check that the visitor's upstream login still works (password changed, share
// revoked, token signed out). false only on a definite 401/403.
setUpstreamVerifier(async (session) => {
  const rejected = (err) => err.status === 401 || err.status === 403;
  try {
    if (session.provider === 'plex' && session.plexToken) {
      const clientId = await getOrCreatePlexClientId();
      const access = await plexServerAccess(session.plexToken, clientId);
      return access.hasAccess;
    }
    if (session.provider === 'jellyfin' && session.jellyfinToken && configStore.isServiceConfigured('jellyfin')) {
      const jf = configStore.resolved().services.jellyfin;
      await fetchJson(`${jf.url}/Users/Me`, { headers: jellyfinAuthHeaders(session.jellyfinToken) });
      return true;
    }
    return true;
  } catch (err) {
    return rejected(err) ? false : true;
  }
});

module.exports = {
  handlePinCreate,
  handlePinPoll,
  handleJellyfinLogin,
  handleVisitorSession,
  handleVisitorLogout,
};
