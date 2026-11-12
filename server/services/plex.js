const { parse } = require('url');
const { forward, forwardImage, fetchJson, testUpstream } = require('../lib/httpProxy');
const { sendJson } = require('../lib/http');
const { getVisitorSession, requireVisitorAuth } = require('../auth/requireVisitorAuth');
const {
  sanitizePlexSessionsForGuest,
  sanitizePlexSectionsForGuest,
  sanitizePlexRecentlyAddedForGuest,
} = require('../lib/guestRedact');
const { sendForViewer, relayForViewer } = require('../lib/memberRedact');

function withToken(cfg, upstreamPath) {
  const sep = upstreamPath.includes('?') ? '&' : '?';
  return `${cfg.url}${upstreamPath}${sep}X-Plex-Token=${encodeURIComponent(cfg.token)}`;
}

function test(cfg) {
  return testUpstream(withToken(cfg, '/identity'));
}

async function handleIdentity(req, res, params, cfg) {
  if (!requireVisitorAuth(req, res)) return;
  await forward(res, withToken(cfg, '/identity'));
}

async function handleSessions(req, res, params, cfg) {
  // Real usernames/IPs/device names — redact for guests, same pattern as
  // Seerr's guest-facing routes (server/services/seerr.js).
  let data;
  try {
    data = await fetchJson(withToken(cfg, '/status/sessions'));
  } catch (err) {
    return sendJson(res, 502, { error: 'upstream unavailable' });
  }
  if (!getVisitorSession(req)) return sendJson(res, 200, sanitizePlexSessionsForGuest(data));
  sendForViewer(req, res, data);
}

// Only forwards paths that already look like a Plex library resource —
// library-prefixed, no "..", restricted charset — so this endpoint can't be
// turned into an open relay for the rest of the Plex host.
const SAFE_THUMB_PATH = /^\/library\/[A-Za-z0-9/_.-]+$/;

async function handleThumb(req, res, params, cfg) {
  if (!requireVisitorAuth(req, res)) return;
  const { query } = parse(req.url, true);
  const thumbPath = query.path;
  if (typeof thumbPath !== 'string' || thumbPath.includes('..') || !SAFE_THUMB_PATH.test(thumbPath)) {
    return sendJson(res, 400, { error: 'invalid thumb path' });
  }
  await forwardImage(res, withToken(cfg, thumbPath));
}

// Hard-gated, not soft-redacted — an open search would let a guest enumerate
// the whole library on demand, which is a materially different (and worse)
// exposure than browsing an already-redacted recentlyAdded feed.
async function handleSearch(req, res, params, cfg) {
  if (!requireVisitorAuth(req, res)) return;
  const { query } = parse(req.url, true);
  const q = typeof query.query === 'string' ? query.query : '';
  const limit = /^\d{1,3}$/.test(query.limit || '') ? query.limit : '40';
  let upstreamPath = `/search?query=${encodeURIComponent(q)}&limit=${limit}`;
  if (typeof query.type === 'string' && /^\d{1,2}$/.test(query.type)) upstreamPath += `&type=${query.type}`;
  await relayForViewer(req, res, withToken(cfg, upstreamPath));
}

async function handleSections(req, res, params, cfg) {
  let data;
  try {
    data = await fetchJson(withToken(cfg, '/library/sections'));
  } catch (err) {
    return sendJson(res, 502, { error: 'upstream unavailable' });
  }
  if (!getVisitorSession(req)) return sendJson(res, 200, sanitizePlexSectionsForGuest(data));
  sendForViewer(req, res, data);
}

const SAFE_SECTION_KEY = /^\d+$/;

async function handleRecentlyAdded(req, res, params, cfg) {
  const { query } = parse(req.url, true);
  const { sectionKey } = query;
  if (typeof sectionKey !== 'string' || !SAFE_SECTION_KEY.test(sectionKey)) {
    return sendJson(res, 400, { error: 'invalid sectionKey' });
  }
  const start = /^\d{1,6}$/.test(query.start || '') ? query.start : '0';
  const size = /^\d{1,4}$/.test(query.size || '') ? query.size : '50';
  let data;
  try {
    data = await fetchJson(
      withToken(cfg, `/library/sections/${sectionKey}/recentlyAdded?X-Plex-Container-Start=${start}&X-Plex-Container-Size=${size}`)
    );
  } catch (err) {
    return sendJson(res, 502, { error: 'upstream unavailable' });
  }
  if (!getVisitorSession(req)) return sendJson(res, 200, sanitizePlexRecentlyAddedForGuest(data));
  sendForViewer(req, res, data);
}

module.exports = {
  test,
  routes: [
    { method: 'GET', matcher: '/api/plex/identity', handler: handleIdentity },
    { method: 'GET', matcher: '/api/plex/sessions', handler: handleSessions },
    { method: 'GET', matcher: '/api/plex/thumb', handler: handleThumb },
    { method: 'GET', matcher: '/api/plex/search', handler: handleSearch },
    { method: 'GET', matcher: '/api/plex/sections', handler: handleSections },
    { method: 'GET', matcher: '/api/plex/recentlyAdded', handler: handleRecentlyAdded },
  ],
};
