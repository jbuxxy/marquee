const { fetchJson: httpFetchJson, fetchText } = require('../lib/httpProxy');
const { configStore } = require('../config');
const { isConfigured, serviceConfig } = require('./registry');
const { sendJson } = require('../lib/http');

function digitalDatesEnabled() {
  const val = configStore.resolved().site?.digitalReleaseDates;
  return val === true || val === 'true';
}

// Non-2xx, timeouts and bad JSON all read as "no data", so a failed lookup is never
// cached as a real (empty) answer.
function fetchJson(url, extraHeaders = {}) {
  return httpFetchJson(url, { headers: extraHeaders, timeoutMs: 8000 }).catch(() => null);
}

function fetchHtml(url) {
  return fetchText(url, { accept: 'text/html,*/*', timeoutMs: 8000 }).catch(() => '');
}

function normTitle(t) {
  return t.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

const MONTH_NAMES = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

// Parses BingeBase's monthly digital-release-calendar HTML into
// {normalizedTitle: 'YYYY-MM-DD'}. BingeBase needs no API key/credentials.
// Handles both of its layouts: the original (h2.date-group-header "Monday, November 2,
// 2026" + <img alt="Title poster">) and the late-2026 redesign (h2.rc-date "Monday,
// 2 November 2026" with &nbsp; separators + data-ds--poster-card-title-value="Title";
// posters there have empty alt text).
function parseBingeBase(html) {
  const results = {};
  if (!html) return results;
  const sections = html.split(/<h2[^>]*class="[^"]*(?:date-group-header|rc-date)[^"]*"[^>]*>\s*/);
  for (let i = 1; i < sections.length; i += 1) {
    const head = sections[i].slice(0, 80);
    let month, day, year;
    // \s rather than a literal space: the redesign uses U+00A0 between the parts.
    let m = head.match(/^[A-Za-z]+,\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
    if (m) [, month, day, year] = m;
    else if ((m = head.match(/^[A-Za-z]+,\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/))) [, day, month, year] = m;
    if (!month || !MONTH_NAMES[month]) continue;
    const iso = `${year}-${String(MONTH_NAMES[month]).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const re = /alt="([^"]+) poster"|data-ds--poster-card-title-value="([^"]+)"/g;
    while ((m = re.exec(sections[i])) !== null) {
      const key = normTitle(decodeHtmlEntities(m[1] || m[2]));
      if (key && !results[key]) results[key] = iso;
    }
  }
  return results;
}

function bingebaseUrl(year, month) {
  const names = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  return `https://bingebase.com/releases/digital/${names[month - 1]}-${year}`;
}

let cache = null;
let cacheExpires = 0;
const CACHE_TTL_MS = 30 * 60 * 1000;
const EMPTY_TTL_MS = 5 * 60 * 1000; // both sources failed — retry soon, don't sit on nothing

async function handleDigitalDates(req, res) {
  if (!digitalDatesEnabled()) return sendJson(res, 503, { error: 'digital release dates are not enabled' });

  const now = Date.now();
  if (cache && now < cacheExpires) return sendJson(res, 200, cache);

  const nowDate = new Date(now);
  const bbMonths = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(nowDate.getFullYear(), nowDate.getMonth() + i, 1);
    bbMonths.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  const traktEnabled = isConfigured('trakt');
  const traktStart = new Date(now - 60 * 86400000).toISOString().slice(0, 10);
  const traktPromise = traktEnabled
    ? fetchJson(`https://api.trakt.tv/calendars/all/dvd/${traktStart}/240`, {
        'trakt-api-key': serviceConfig('trakt').clientId,
        'trakt-api-version': '2',
      })
    : Promise.resolve(null);

  const [trakt, ...bbHtmls] = await Promise.all([traktPromise, ...bbMonths.map(({ year, month }) => fetchHtml(bingebaseUrl(year, month)))]);

  const byTitle = {};
  const byId = {};
  for (const html of bbHtmls) Object.assign(byTitle, parseBingeBase(html));
  if (Array.isArray(trakt)) {
    for (const item of trakt) {
      const tmdbId = item.movie?.ids?.tmdb;
      if (tmdbId && item.released) byId[String(tmdbId)] = item.released;
    }
  }

  cache = { byId, byTitle };
  const empty = !Object.keys(byId).length && !Object.keys(byTitle).length;
  cacheExpires = Date.now() + (empty ? EMPTY_TTL_MS : CACHE_TTL_MS);
  sendJson(res, 200, cache);
}

module.exports = {
  parseBingeBase,
  registerRoutes(router) {
    router.get('/api/digital-dates', handleDigitalDates);
  },
};
