const { parse } = require('url');
const { forward } = require('../lib/httpProxy');
const { sendJson } = require('../lib/http');

async function handleReleases(req, res, params, cfg) {
  const { query } = parse(req.url, true);
  const { tmdbId, type } = query;
  if (typeof tmdbId !== 'string' || !/^\d+$/.test(tmdbId) || (type !== 'movie' && type !== 'tv')) {
    return sendJson(res, 400, { error: 'tmdbId and type=movie|tv are required' });
  }
  const upstreamUrl = `https://api.themoviedb.org/3/${type}/${tmdbId}/release_dates`;
  await forward(res, upstreamUrl, { headers: { Authorization: `Bearer ${cfg.readToken}` } });
}

module.exports = {
  routes: [{ method: 'GET', matcher: '/api/tmdb/releases', handler: handleReleases }],
};
