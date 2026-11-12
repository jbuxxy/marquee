const { parse } = require('url');
const { sendJson } = require('../lib/http');
const { requireVisitorAuth } = require('../auth/requireVisitorAuth');
const { sendForViewer, relayForViewer } = require('../lib/memberRedact');

// Tautulli's API is one giant command dispatcher (?cmd=...) mixing harmless
// read-only stats commands with destructive/admin ones. Only forward a
// fixed allowlist of read-only commands, regardless of what's requested.
const ALLOWED_COMMANDS = new Set([
  'get_home_stats',
  'get_plays_by_date',
  'get_history',
  'get_plays_by_hourofday',
  'get_plays_by_dayofweek',
]);

async function handleCommand(req, res, params, cfg) {
  const session = requireVisitorAuth(req, res);
  if (!session) return;
  // Tautulli tracks Plex activity specifically — a Jellyfin-provider session
  // has no real relationship to that data, same distinction jellystat.js
  // draws in the opposite direction.
  if (session.provider === 'jellyfin') {
    return sendJson(res, 403, { error: 'not available for a Jellyfin session' });
  }
  const { query } = parse(req.url, true);
  if (typeof query.cmd !== 'string' || !ALLOWED_COMMANDS.has(query.cmd)) {
    return sendJson(res, 400, { error: 'unsupported tautulli command' });
  }
  const qs = new URLSearchParams(query);
  qs.set('apikey', cfg.apiKey);
  await relayForViewer(req, res, `${cfg.url}/api/v2?${qs.toString()}`);
}

module.exports = {
  routes: [{ method: 'GET', matcher: '/api/tautulli', handler: handleCommand }],
};
