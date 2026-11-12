const { parse } = require('url');
const { forward, forwardImage, fetchJson, testUpstream, jellyfinAuthHeaders } = require('../lib/httpProxy');
const { sendJson } = require('../lib/http');
const { getVisitorSession, requireVisitorAuth } = require('../auth/requireVisitorAuth');
const { isAuthenticated } = require('../auth/requireAuth');
const {
  sanitizeJellyfinSessionsForGuest,
  sanitizeJellyfinLatestForGuest,
} = require('../lib/guestRedact');
const { isJellyfinPathExcluded } = require('../lib/libraryFilter');
const { sendForViewer, relayForViewer } = require('../lib/memberRedact');

// Every call authenticates with the Authorization header — Jellyfin 10.11+/12 returns
// 401 for the legacy `?api_key=` parameter.
const auth = (cfg) => ({ headers: jellyfinAuthHeaders(cfg.apiKey) });

// Shared by the REST route and the push poll (lib/push.js).
async function fetchActiveSessions(cfg) {
  const data = await fetchJson(`${cfg.url}/Sessions?ActiveWithinSeconds=960`, auth(cfg));
  return (Array.isArray(data) ? data : []).filter((s) => !isJellyfinPathExcluded(s.NowPlayingItem?.Path));
}

async function handleSessions(req, res, params, cfg) {
  let data;
  try {
    data = await fetchActiveSessions(cfg);
  } catch (err) {
    return sendJson(res, 502, { error: 'upstream unavailable' });
  }
  if (!getVisitorSession(req)) return sendJson(res, 200, sanitizeJellyfinSessionsForGuest(data));
  sendForViewer(req, res, data);
}

function test(cfg) {
  return testUpstream(`${cfg.url}/System/Info`, auth(cfg));
}

const SAFE_ID = /^[A-Fa-f0-9-]{32,36}$/;
const IMAGE_TYPES = new Set(['Primary', 'Backdrop', 'Thumb', 'Logo', 'Banner', 'Art']);

async function handleImage(req, res, params, cfg) {
  if (!requireVisitorAuth(req, res)) return;
  const { query } = parse(req.url, true);
  const { id, type } = query;
  if (typeof id !== 'string' || !SAFE_ID.test(id) || typeof type !== 'string' || !IMAGE_TYPES.has(type)) {
    return sendJson(res, 400, { error: 'invalid image request' });
  }
  await forwardImage(res, `${cfg.url}/Items/${id}/Images/${type}?maxHeight=600`, auth(cfg).headers);
}

// Hard-gated like Plex search: an open search would let a guest enumerate the library.
async function handleSearch(req, res, params, cfg) {
  if (!requireVisitorAuth(req, res)) return;
  const { query } = parse(req.url, true);
  const term = typeof query.query === 'string' ? query.query.slice(0, 200) : '';
  const limit = /^\d{1,3}$/.test(query.limit || '') ? query.limit : '40';
  const qs = new URLSearchParams({
    searchTerm: term,
    Limit: limit,
    Recursive: 'true',
    IncludeItemTypes: 'Movie,Series,Episode,MusicAlbum,Audio',
  });
  await relayForViewer(req, res, `${cfg.url}/Items?${qs.toString()}`, auth(cfg));
}

const SAFE_ITEM_TYPES = /^[A-Za-z,]+$/;

async function handleLatest(req, res, params, cfg) {
  const { query } = parse(req.url, true);
  const includeItemTypes = typeof query.includeItemTypes === 'string' && SAFE_ITEM_TYPES.test(query.includeItemTypes)
    ? query.includeItemTypes
    : 'Movie';
  const limit = Math.min(parseInt(/^\d{1,3}$/.test(query.limit || '') ? query.limit : '50', 10), 100);
  // /Items/Latest needs a user id on current Jellyfin (API keys get a 400), so ask /Items
  // for the newest instead. Series sort by when content was last added to them.
  // Over-fetch a bit before filtering — an excluded library's items would otherwise
  // shrink the page below what the caller asked for.
  const qs = new URLSearchParams({
    IncludeItemTypes: includeItemTypes,
    Recursive: 'true',
    CollapseBoxSetItems: 'false', // otherwise movies come back grouped as collections
    SortBy: /Series|MusicAlbum/.test(includeItemTypes) ? 'DateLastContentAdded,DateCreated' : 'DateCreated',
    SortOrder: 'Descending',
    Limit: String(Math.min(limit * 2, 200)),
    Fields: 'Path,DateCreated',
  });
  let data;
  try {
    data = await fetchJson(`${cfg.url}/Items?${qs.toString()}`, auth(cfg));
  } catch (err) {
    return sendJson(res, 502, { error: 'upstream unavailable' });
  }
  const items = (Array.isArray(data?.Items) ? data.Items : [])
    .filter((item) => !isJellyfinPathExcluded(item.Path))
    .slice(0, limit);
  if (!getVisitorSession(req)) return sendJson(res, 200, sanitizeJellyfinLatestForGuest(items));
  sendForViewer(req, res, items);
}

// On-disk folder paths — only the admin's library-exclusion picker needs these.
async function handleLibraryFolders(req, res, params, cfg) {
  if (!isAuthenticated(req)) return sendJson(res, 401, { error: 'authentication required' });
  await forward(res, `${cfg.url}/Library/VirtualFolders`, auth(cfg));
}

module.exports = {
  test,
  fetchActiveSessions,
  routes: [
    { method: 'GET', matcher: '/api/jellyfin/sessions', handler: handleSessions },
    { method: 'GET', matcher: '/api/jellyfin/image', handler: handleImage },
    { method: 'GET', matcher: '/api/jellyfin/search', handler: handleSearch },
    { method: 'GET', matcher: '/api/jellyfin/latest', handler: handleLatest },
    { method: 'GET', matcher: '/api/jellyfin/library-folders', handler: handleLibraryFolders },
  ],
};
