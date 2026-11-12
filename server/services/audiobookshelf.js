const { parse } = require('url');
const { forward, forwardImage, fetchJson, testUpstream } = require('../lib/httpProxy');
const { sendJson } = require('../lib/http');
const { getVisitorSession, requireVisitorAuth } = require('../auth/requireVisitorAuth');
const {
  sanitizeAbsSessionsForGuest,
  sanitizeAbsLibrariesForGuest,
  sanitizeAbsItemsForGuest,
} = require('../lib/guestRedact');
const { sendForViewer, relayForViewer } = require('../lib/memberRedact');

function absHeaders(cfg) {
  return { Authorization: `Bearer ${cfg.apiKey}` };
}

function sessionsUrl(cfg) {
  return `${cfg.url}/api/me/listening-sessions`;
}

async function handleSessions(req, res, params, cfg) {
  let data;
  try {
    data = await fetchJson(sessionsUrl(cfg), { headers: absHeaders(cfg) });
  } catch (err) {
    return sendJson(res, 502, { error: 'upstream unavailable' });
  }
  if (!getVisitorSession(req)) return sendJson(res, 200, sanitizeAbsSessionsForGuest(data));
  sendForViewer(req, res, data);
}

function test(cfg) {
  return testUpstream(sessionsUrl(cfg), { headers: absHeaders(cfg) });
}

async function handleLibraries(req, res, params, cfg) {
  let data;
  try {
    data = await fetchJson(`${cfg.url}/api/libraries`, { headers: absHeaders(cfg) });
  } catch (err) {
    return sendJson(res, 502, { error: 'upstream unavailable' });
  }
  if (!getVisitorSession(req)) return sendJson(res, 200, sanitizeAbsLibrariesForGuest(data));
  sendForViewer(req, res, data);
}

const SAFE_ID = /^[A-Za-z0-9-]+$/;

async function handleLibraryItems(req, res, params, cfg) {
  const { id } = params;
  if (typeof id !== 'string' || !SAFE_ID.test(id)) return sendJson(res, 400, { error: 'invalid library id' });
  const { query } = parse(req.url, true);
  const qs = new URLSearchParams({ sort: 'addedAt', desc: '1', limit: /^\d{1,4}$/.test(query.limit || '') ? query.limit : '100' });
  let data;
  try {
    data = await fetchJson(`${cfg.url}/api/libraries/${id}/items?${qs.toString()}`, { headers: absHeaders(cfg) });
  } catch (err) {
    return sendJson(res, 502, { error: 'upstream unavailable' });
  }
  if (!getVisitorSession(req)) return sendJson(res, 200, sanitizeAbsItemsForGuest(data));
  sendForViewer(req, res, data);
}

// Hard-gated, not soft-redacted — same reasoning as Plex search: an open
// search would let a guest enumerate the whole library on demand.
async function handleLibrarySearch(req, res, params, cfg) {
  if (!requireVisitorAuth(req, res)) return;
  const { id } = params;
  if (typeof id !== 'string' || !SAFE_ID.test(id)) return sendJson(res, 400, { error: 'invalid library id' });
  const { query } = parse(req.url, true);
  const q = typeof query.q === 'string' ? query.q : '';
  await relayForViewer(req, res, `${cfg.url}/api/libraries/${id}/search?q=${encodeURIComponent(q.slice(0, 200))}`, { headers: absHeaders(cfg) });
}

async function handleItem(req, res, params, cfg) {
  if (!requireVisitorAuth(req, res)) return;
  const { id } = params;
  if (typeof id !== 'string' || !SAFE_ID.test(id)) return sendJson(res, 400, { error: 'invalid item id' });
  await relayForViewer(req, res, `${cfg.url}/api/items/${id}?expanded=1`, { headers: absHeaders(cfg) });
}

async function handleCover(req, res, params, cfg) {
  if (!requireVisitorAuth(req, res)) return;
  const { id } = params;
  if (typeof id !== 'string' || !SAFE_ID.test(id)) return sendJson(res, 400, { error: 'invalid item id' });
  const { query } = parse(req.url, true);
  const width = /^\d{1,4}$/.test(query.width || '') ? `?width=${Math.min(parseInt(query.width, 10), 2000)}` : '';
  await forwardImage(res, `${cfg.url}/api/items/${id}/cover${width}`, absHeaders(cfg));
}

module.exports = {
  test,
  routes: [
    { method: 'GET', matcher: '/api/abs/sessions', handler: handleSessions },
    { method: 'GET', matcher: '/api/abs/libraries', handler: handleLibraries },
    { method: 'GET', matcher: /^\/api\/abs\/library\/(?<id>[^/]+)\/items$/, handler: handleLibraryItems },
    { method: 'GET', matcher: /^\/api\/abs\/library\/(?<id>[^/]+)\/search$/, handler: handleLibrarySearch },
    { method: 'GET', matcher: /^\/api\/abs\/item\/(?<id>[^/]+)$/, handler: handleItem },
    { method: 'GET', matcher: /^\/api\/abs\/cover\/(?<id>[^/]+)$/, handler: handleCover },
  ],
};
