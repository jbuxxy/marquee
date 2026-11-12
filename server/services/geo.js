const net = require('net');
const { parse } = require('url');
const { configStore } = require('../config');
const { sendJson } = require('../lib/http');
const { fetchJson } = require('../lib/httpProxy');
const { requireVisitorAuth } = require('../auth/requireVisitorAuth');
const { resolveIpToken, isPrivateIp } = require('../lib/memberRedact');

// Not a normal registry.js service (no url/key to configure) — gated on an explicit
// opt-in boolean, because it looks viewer locations up with a third-party geo-IP service.
function geoMapEnabled() {
  return configStore.resolved().site?.enableGeoMap === true || configStore.resolved().site?.enableGeoMap === 'true';
}

// Privacy without a local database:
//   - only the network part of an address leaves this server: IPv4 is cut to /24
//     (203.0.113.57 → 203.0.113.0), IPv6 to /48 — city-level results are the same, but no
//     provider ever sees an individual viewer's address;
//   - every lookup is HTTPS, against keyless providers (ipwho.is, then GeoJS);
//   - results are cached for a day, so each network is looked up at most once a day.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FAIL_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 5000;
const cache = new Map(); // network -> { value, expiresAt }

// Network part of an IP, or null if it isn't a valid public address.
function truncateIp(ip) {
  const v = net.isIP(ip);
  if (!v || isPrivateIp(ip)) return null;
  if (v === 4) return ip.split('.').slice(0, 3).concat('0').join('.');
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return `${groups.slice(0, 3).map((g) => parseInt(g || '0', 16).toString(16)).join(':')}::`;
}

const num = (x) => { const n = parseFloat(x); return Number.isFinite(n) ? n : null; };

async function lookupUpstream(network) {
  const a = await fetchJson(`https://ipwho.is/${encodeURIComponent(network)}?fields=success,latitude,longitude,city,country`, { timeoutMs: 8000 }).catch(() => null);
  if (a?.success && num(a.latitude) !== null) {
    return { lat: num(a.latitude), lon: num(a.longitude), city: a.city || '', country: a.country || '' };
  }
  const b = await fetchJson(`https://get.geojs.io/v1/ip/geo/${encodeURIComponent(network)}.json`, { timeoutMs: 8000 }).catch(() => null);
  if (b && num(b.latitude) !== null) {
    return { lat: num(b.latitude), lon: num(b.longitude), city: b.city || '', country: b.country || '' };
  }
  return null;
}

async function geolocate(ip) {
  const network = truncateIp(ip);
  if (!network) return null;
  const hit = cache.get(network);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const found = await lookupUpstream(network);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(network, { value: found, expiresAt: Date.now() + (found ? CACHE_TTL_MS : FAIL_TTL_MS) });
  return found;
}

// Accepts raw IPs (owner view) and member-tier `ip-…` tokens; replies in the shape the
// frontend expects: [{ query, status, lat, lon, city, country }].
const SAFE_KEY = /^(?:[0-9a-fA-F.:]+|ip-[0-9a-f]{16})$/;

async function handleGeo(req, res) {
  if (!geoMapEnabled()) return sendJson(res, 503, { error: 'geo map is not enabled' });
  if (!requireVisitorAuth(req, res)) return;

  const { query } = parse(req.url, true);
  const keys = (typeof query.ip === 'string' ? query.ip.split(',') : [])
    .map((k) => k.trim())
    .filter((k) => k && SAFE_KEY.test(k))
    .slice(0, 10);
  if (!keys.length) return sendJson(res, 400, { error: 'no ip provided' });

  const results = await Promise.all(keys.map(async (key) => {
    const ip = key.startsWith('ip-') ? resolveIpToken(key) : key;
    const loc = ip ? await geolocate(ip) : null;
    return loc ? { query: key, status: 'success', ...loc } : { query: key, status: 'fail' };
  }));
  sendJson(res, 200, results);
}

// Returns the configured home location, or a 404 the frontend treats as "no
// home marker" — the live map always works with just client nodes,
// home location is an entirely optional enrichment.
async function handleHomeLocation(req, res) {
  if (!geoMapEnabled()) return sendJson(res, 404, { error: 'geo map is not enabled' });
  if (!requireVisitorAuth(req, res)) return;

  const site = configStore.resolved().site || {};
  const lat = parseFloat(site.homeLocation?.lat);
  const lon = parseFloat(site.homeLocation?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return sendJson(res, 404, { error: 'home location not set' });
  }
  // Coarsened to ~1km precision — enough for map arcs, not a street address.
  sendJson(res, 200, {
    lat: Math.round(lat * 100) / 100,
    lon: Math.round(lon * 100) / 100,
    city: site.homeLocation?.city || null,
  });
}

module.exports = {
  truncateIp,
  registerRoutes(router) {
    router.get('/api/geo', handleGeo);
    router.get('/api/home-location', handleHomeLocation);
  },
};
