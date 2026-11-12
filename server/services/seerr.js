const { parse } = require('url');
const { forward, fetchJson, testUpstream } = require('../lib/httpProxy');
const { readJsonBody, sendJson } = require('../lib/http');
const { getVisitorSession, requireVisitorAuth } = require('../auth/requireVisitorAuth');
const { CSRF_COOKIE: VISITOR_CSRF_COOKIE } = require('../auth/visitorSession');
const { verifyCsrf } = require('../auth/csrf');
const { createWindowLimiter } = require('../auth/rateLimit');
const { sanitizeSeerrRequestsForGuest, lockedMediaDetail } = require('../lib/guestRedact');
const { broadcastSignal } = require('../lib/push');
const logger = require('../lib/logger');
const { sendForViewer, relayForViewer } = require('../lib/memberRedact');

function seerrHeaders(cfg) {
  return { 'X-Api-Key': cfg.apiKey };
}

function test(cfg) {
  return testUpstream(`${cfg.url}/api/v1/status`, { headers: seerrHeaders(cfg) });
}

async function handleRequests(req, res, params, cfg) {
  const { query } = parse(req.url, true);
  const qs = new URLSearchParams();
  if (query.take) qs.set('take', query.take);
  if (query.skip) qs.set('skip', query.skip);
  if (query.filter) qs.set('filter', query.filter);
  const suffix = qs.toString() ? `?${qs}` : '';
  let data;
  try {
    data = await fetchJson(`${cfg.url}/api/v1/request${suffix}`, { headers: seerrHeaders(cfg) });
  } catch (err) {
    return sendJson(res, 502, { error: 'upstream unavailable' });
  }
  const session = getVisitorSession(req);
  if (!session) return sendJson(res, 200, sanitizeSeerrRequestsForGuest(data));
  sendForViewer(req, res, data);
}

async function handleSearch(req, res, params, cfg) {
  const { query } = parse(req.url, true);
  if (typeof query.query !== 'string' || !query.query.trim()) {
    return sendJson(res, 400, { error: 'query parameter required' });
  }
  const upstreamUrl = `${cfg.url}/api/v1/search?query=${encodeURIComponent(query.query)}`;
  await forward(res, upstreamUrl, { headers: seerrHeaders(cfg) });
}

// Overseerr/Jellyseerr permission bitmask — mirrored here (Seerr has no documented "what
// can I do" endpoint) so request overrides (quality profile/root folder/4K) are
// re-validated server-side rather than trusted from the client.
const PERM = {
  ADMIN: 2,
  AUTO_APPROVE: 128,
  AUTO_APPROVE_MOVIE: 256,
  AUTO_APPROVE_TV: 512,
  AUTO_APPROVE_4K: 32768,
  AUTO_APPROVE_4K_MOVIE: 65536,
  AUTO_APPROVE_4K_TV: 131072,
};
const USERS_CACHE_MS = 5 * 60 * 1000;
let usersCache = { key: '', users: null, ts: 0 };

// Every Seerr user (paged — a fixed take=200 silently missed larger servers), cached
// briefly since this is called on card renders and requests.
async function seerrUsers(cfg) {
  const key = `${cfg.url}|${cfg.apiKey}`;
  if (usersCache.key === key && usersCache.users && Date.now() - usersCache.ts < USERS_CACHE_MS) return usersCache.users;
  const users = [];
  for (let skip = 0; skip < 5000; skip += 100) {
    const page = await fetchJson(`${cfg.url}/api/v1/user?take=100&skip=${skip}`, { headers: seerrHeaders(cfg) });
    const results = page?.results || [];
    users.push(...results);
    if (results.length < 100) break;
  }
  usersCache = { key, users, ts: Date.now() };
  return users;
}

// The Seerr user this visitor maps to: by plex.tv account id for Plex logins, by Jellyfin
// user id for Jellyfin logins (Jellyseerr). null when the account was never imported.
async function resolveSeerrUser(session, cfg) {
  const users = await seerrUsers(cfg);
  if (session.provider === 'plex' && session.plexAccountId != null) {
    return users.find((u) => u.plexId === session.plexAccountId) || null;
  }
  if (session.provider === 'jellyfin' && session.jellyfinUserId) {
    const want = String(session.jellyfinUserId).replace(/-/g, '').toLowerCase();
    return users.find((u) => String(u.jellyfinUserId || '').replace(/-/g, '').toLowerCase() === want) || null;
  }
  return null;
}

const NO_CAPS = { linked: false, admin: false, autoApproveMovie: false, autoApproveTv: false, autoApprove4kMovie: false, autoApprove4kTv: false };

async function resolveSeerrCapabilities(session, cfg) {
  let user = null;
  try {
    user = await resolveSeerrUser(session, cfg);
  } catch (err) {
    logger.warn('seerr user lookup failed:', err.message);
  }
  if (!user) return NO_CAPS;
  const perm = user.permissions || 0;
  const admin = !!(perm & PERM.ADMIN);
  return {
    linked: true,
    seerrUserId: user.id,
    admin,
    autoApproveMovie: admin || !!(perm & PERM.AUTO_APPROVE) || !!(perm & PERM.AUTO_APPROVE_MOVIE),
    autoApproveTv: admin || !!(perm & PERM.AUTO_APPROVE) || !!(perm & PERM.AUTO_APPROVE_TV),
    autoApprove4kMovie: admin || !!(perm & PERM.AUTO_APPROVE_4K) || !!(perm & PERM.AUTO_APPROVE_4K_MOVIE),
    autoApprove4kTv: admin || !!(perm & PERM.AUTO_APPROVE_4K) || !!(perm & PERM.AUTO_APPROVE_4K_TV),
  };
}

// Requests per Seerr user per hour — generous for people, a ceiling for a stolen session.
const takeRequestToken = createWindowLimiter({ limit: 20, windowMs: 60 * 60 * 1000 });

async function handleMyPermissions(req, res, params, cfg) {
  const session = requireVisitorAuth(req, res);
  if (!session) return;
  const { seerrUserId, ...caps } = await resolveSeerrCapabilities(session, cfg);
  sendJson(res, 200, caps);
}

async function handleServiceList(req, res, params, cfg) {
  const session = requireVisitorAuth(req, res);
  if (!session) return;
  const { svc } = params;
  const caps = await resolveSeerrCapabilities(session, cfg);
  const allowed = caps.admin || (svc === 'sonarr' ? caps.autoApproveTv : caps.autoApproveMovie);
  if (!allowed) return sendJson(res, 403, { error: 'not permitted' });
  await forward(res, `${cfg.url}/api/v1/service/${svc}`, { headers: seerrHeaders(cfg) });
}

async function handleServiceDetail(req, res, params, cfg) {
  const session = requireVisitorAuth(req, res);
  if (!session) return;
  const { svc, id } = params;
  const caps = await resolveSeerrCapabilities(session, cfg);
  const allowed = caps.admin || (svc === 'sonarr' ? caps.autoApproveTv : caps.autoApproveMovie);
  if (!allowed) return sendJson(res, 403, { error: 'not permitted' });
  await forward(res, `${cfg.url}/api/v1/service/${svc}/${id}`, { headers: seerrHeaders(cfg) });
}

// No auth check previously existed here at all — any visitor to the public
// dashboard could create a real Seerr request. Gating this behind a visitor
// session is both the correct fix on its own and a prerequisite for the
// auto-approve picker, which needs a real session to check capabilities
// against.
async function handleCreateRequest(req, res, params, cfg) {
  const session = requireVisitorAuth(req, res);
  if (!session) return;
  if (!verifyCsrf(req, VISITOR_CSRF_COOKIE)) return sendJson(res, 403, { error: 'invalid csrf token' });

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: 'invalid request body' });
  }
  const mediaId = Number(body.mediaId);
  if (!Number.isInteger(mediaId) || mediaId <= 0 || !['movie', 'tv'].includes(body.mediaType)) {
    return sendJson(res, 400, { error: 'mediaId and mediaType (movie|tv) are required' });
  }

  // Requests are made AS the visitor's own Seerr user (X-Api-User), so Seerr applies that
  // user's permissions, quotas and auto-approve rules and shows them as the requester.
  // Without it every request was the admin's, and auto-approved.
  const caps = await resolveSeerrCapabilities(session, cfg);
  if (!caps.linked) {
    return sendJson(res, 403, { error: 'not_linked', message: "Your account isn't set up in Seerr yet. Ask the server owner to import it." });
  }
  if (!takeRequestToken(String(caps.seerrUserId))) {
    return sendJson(res, 429, { error: 'too many requests — try again later' });
  }
  const asUser = { ...seerrHeaders(cfg), 'X-Api-User': String(caps.seerrUserId) };
  const canOverride = caps.admin || (body.mediaType === 'tv' ? caps.autoApproveTv : caps.autoApproveMovie);

  // Overrides (quality profile/root folder/server) are only ever honored
  // after the capability re-check above — a client sending them without the
  // permission to back it up just gets them silently dropped, falling
  // through to Seerr's own configured defaults.
  const payload = { mediaId, mediaType: body.mediaType };
  if (body.mediaType === 'tv') {
    payload.seasons = Array.isArray(body.seasons) && body.seasons.every((n) => Number.isInteger(n) && n >= 0)
      ? body.seasons.slice(0, 200)
      : 'all';
  }
  if (canOverride) {
    if (body.serverId != null) payload.serverId = body.serverId;
    if (body.profileId != null) payload.profileId = body.profileId;
    if (body.rootFolder) payload.rootFolder = body.rootFolder;
    if (body.languageProfileId != null) payload.languageProfileId = body.languageProfileId;
  }

  let primary;
  try {
    primary = await fetchJson(`${cfg.url}/api/v1/request`, { method: 'POST', headers: asUser, body: payload });
  } catch (err) {
    return sendJson(res, err.status || 502, { error: 'request failed' });
  }

  // 4K is a fully independent request/media-status track in Seerr, not a
  // flag on the primary one — fired as its own separate call, only when the
  // session specifically has 4K auto-approve for this media type.
  let also4k = null;
  if (canOverride && body.also4k) {
    const can4k = caps.admin || (body.mediaType === 'tv' ? caps.autoApprove4kTv : caps.autoApprove4kMovie);
    if (can4k) {
      const payload4k = { ...payload, is4k: true };
      delete payload4k.serverId; delete payload4k.profileId; delete payload4k.rootFolder;
      if (body.serverId4k != null) payload4k.serverId = body.serverId4k;
      if (body.profileId4k != null) payload4k.profileId = body.profileId4k;
      if (body.rootFolder4k) payload4k.rootFolder = body.rootFolder4k;
      try {
        also4k = await fetchJson(`${cfg.url}/api/v1/request`, { method: 'POST', headers: asUser, body: payload4k });
      } catch (err) {
        logger.warn('4k request failed:', err.message);
      }
    }
  }

  // Tell any connected tabs (including this requester's own) to re-fetch the
  // requests list now, rather than waiting on Seerr's webhook round-trip.
  broadcastSignal('requests-changed');

  sendJson(res, 200, { ...primary, also4k });
}

async function handleMovie(req, res, params, cfg) {
  if (!getVisitorSession(req)) return sendJson(res, 200, lockedMediaDetail());
  await forward(res, `${cfg.url}/api/v1/movie/${params.id}`, { headers: seerrHeaders(cfg) });
}

async function handleTv(req, res, params, cfg) {
  if (!getVisitorSession(req)) return sendJson(res, 200, lockedMediaDetail());
  await forward(res, `${cfg.url}/api/v1/tv/${params.id}`, { headers: seerrHeaders(cfg) });
}

module.exports = {
  test,
  routes: [
    { method: 'GET', matcher: '/api/seerr/requests', handler: handleRequests },
    { method: 'GET', matcher: '/api/seerr/search', handler: handleSearch },
    { method: 'GET', matcher: '/api/seerr/my-permissions', handler: handleMyPermissions },
    { method: 'GET', matcher: /^\/api\/seerr\/service\/(?<svc>radarr|sonarr)$/, handler: handleServiceList },
    { method: 'GET', matcher: /^\/api\/seerr\/service\/(?<svc>radarr|sonarr)\/(?<id>\d+)$/, handler: handleServiceDetail },
    { method: 'POST', matcher: '/api/seerr/request', handler: handleCreateRequest },
    { method: 'GET', matcher: /^\/api\/seerr\/movie\/(?<id>\d+)$/, handler: handleMovie },
    { method: 'GET', matcher: /^\/api\/seerr\/tv\/(?<id>\d+)$/, handler: handleTv },
  ],
};
