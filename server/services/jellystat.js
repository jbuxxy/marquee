const { parse } = require('url');
const { fetchJson: httpFetchJson } = require('../lib/httpProxy');
const { sendJson } = require('../lib/http');
const { sendForViewer } = require('../lib/memberRedact');
const { requireVisitorAuth } = require('../auth/requireVisitorAuth');

// Jellystat's actual REST surface isn't as uniform/documented as Tautulli's
// single ?cmd= dispatcher — this is a best-effort integration against its
// history endpoint (based on its public API, no live instance to verify
// against; worth checking field names here if a chart looks empty/wrong).
// Rather than guess at several different Tautulli-shaped aggregation
// endpoints existing on the Jellystat side too, this fetches ONE raw
// playback-history list and computes every derived stat (by-date, by-hour,
// by-day-of-week, top movies/users, geo history) here in JS — so
// stats.js/heatmap.js can treat /api/jellystat exactly like /api/tautulli
// and never need their own Jellystat-specific parsing.

function jellystatHeaders(cfg) {
  return { 'x-api-token': cfg.apiKey, Accept: 'application/json' };
}

// Non-2xx, timeouts and bad JSON all read as "no data" here.
function fetchJson(url, headers) {
  return httpFetchJson(url, { headers, timeoutMs: 8000 }).catch(() => null);
}

function test(cfg) {
  return fetchJson(`${cfg.url}/api/getLibraries`, jellystatHeaders(cfg)).then((data) => ({ ok: data !== null }));
}

// Best-effort field mapping — Jellystat history rows are expected to look
// roughly like { UserName, NowPlayingItemName, SeriesName, ActivityDateInserted,
// PlaybackDuration, IPAddress }. Falls back across a few plausible alternate
// field names since the exact shape hasn't been verified live.
function normalizeRow(row) {
  const dateStr = row.ActivityDateInserted || row.ActivityDate || row.date || row.CreatedAt;
  const date = dateStr ? new Date(dateStr) : null;
  return {
    date: date && !Number.isNaN(date.getTime()) ? date : null,
    user: row.UserName || row.user_name || row.User || 'Unknown',
    title: row.SeriesName ? `${row.SeriesName} — ${row.NowPlayingItemName || row.ItemName || ''}` : (row.NowPlayingItemName || row.ItemName || row.Name || 'Unknown'),
    durationSec: Number(row.PlaybackDuration || row.playback_duration || row.duration || 0),
    ip: row.IPAddress || row.RemoteEndPoint || row.ip_address || null,
    platform: row.Client || row.ClientName || row.DeviceName || null,
  };
}

async function fetchHistory(cfg) {
  const data = await fetchJson(`${cfg.url}/api/getHistory`, jellystatHeaders(cfg));
  const rows = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
  return rows.map(normalizeRow).filter((r) => r.date);
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Mimics Tautulli's { response: { data: ... } } envelope so the frontend's
// existing Tautulli parsing (stats.js/heatmap.js) works unmodified against
// either backend.
async function handleCommand(req, res, params, cfg) {
  const session = requireVisitorAuth(req, res);
  if (!session) return;
  // Jellystat tracks Jellyfin activity specifically — a Plex-provider
  // session has no real relationship to that data, mirroring tautulli.js's
  // opposite-direction check.
  if (session.provider !== 'jellyfin') {
    return sendJson(res, 403, { error: 'not available for a Plex session' });
  }
  const { query } = parse(req.url, true);
  const cmd = query.cmd;
  const timeRange = parseInt(query.time_range, 10) || 30;
  const cutoff = Date.now() - timeRange * 86400000;
  const rows = (await fetchHistory(cfg)).filter((r) => r.date.getTime() >= cutoff);

  if (cmd === 'get_home_stats') {
    const byTitle = {}, byUser = {}, byPlatform = {};
    for (const r of rows) {
      byTitle[r.title] = (byTitle[r.title] || 0) + 1;
      byUser[r.user] = (byUser[r.user] || 0) + 1;
      if (r.platform) byPlatform[r.platform] = (byPlatform[r.platform] || 0) + 1;
    }
    const top = (obj, keyName) => Object.entries(obj).sort((a, b) => b[1] - a[1])[0];
    const topTitle = top(byTitle);
    const topUser = top(byUser);
    const topPlatform = top(byPlatform);
    const data = [];
    if (topTitle) data.push({ stat_id: 'top_movies', rows: [{ title: topTitle[0] }] });
    if (topUser) data.push({ stat_id: 'top_users', rows: [{ user: topUser[0], total_plays: topUser[1] }] });
    if (topPlatform) data.push({ stat_id: 'top_platforms', rows: [{ platform: topPlatform[0] }] });
    return sendJson(res, 200, { response: { data } });
  }

  if (cmd === 'get_plays_by_date') {
    const byDate = {};
    for (const r of rows) byDate[dateKey(r.date)] = (byDate[dateKey(r.date)] || 0) + 1;
    const categories = Object.keys(byDate).sort();
    if (query.y_axis === 'duration') {
      const byDateDur = {};
      for (const r of rows) byDateDur[dateKey(r.date)] = (byDateDur[dateKey(r.date)] || 0) + r.durationSec;
      return sendJson(res, 200, { response: { data: { categories, series: [{ data: categories.map((c) => byDateDur[c] || 0) }] } } });
    }
    return sendJson(res, 200, { response: { data: { categories, series: [{ data: categories.map((c) => byDate[c] || 0) }] } } });
  }

  if (cmd === 'get_plays_by_hourofday') {
    const byHour = Array(24).fill(0);
    for (const r of rows) byHour[r.date.getHours()]++;
    return sendJson(res, 200, { response: { data: { categories: [...Array(24).keys()], series: [{ data: byHour }] } } });
  }

  if (cmd === 'get_plays_by_dayofweek') {
    const byDow = Array(7).fill(0);
    for (const r of rows) byDow[r.date.getDay()]++;
    return sendJson(res, 200, { response: { data: { categories: [...Array(7).keys()], series: [{ data: byDow }] } } });
  }

  if (cmd === 'get_history') {
    const start = query.start_date;
    const filtered = start ? rows.filter((r) => dateKey(r.date) === start) : rows;
    const limit = parseInt(query.length, 10) || 1000;
    const data = filtered.slice(0, limit).map((r) => ({
      date: Math.floor(r.date.getTime() / 1000),
      duration: r.durationSec,
      ip_address: r.ip,
      grandparent_title: r.title,
      title: r.title,
    }));
    return sendForViewer(req, res, { response: { data: { data, recordsFiltered: data.length } } });
  }

  sendJson(res, 400, { error: 'unsupported command' });
}

module.exports = {
  test,
  routes: [{ method: 'GET', matcher: '/api/jellystat', handler: handleCommand }],
};
