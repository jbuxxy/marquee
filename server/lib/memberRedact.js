const crypto = require('crypto');
const net = require('net');
const { fetchJson } = require('./httpProxy');
const { sendJson } = require('./http');

// THREE VIEWER TIERS
//   guest  — not signed in: whitelist sanitizers in guestRedact.js (titles hidden).
//   member — a signed-in Plex/Jellyfin visitor who doesn't own the server: full titles,
//            but every viewer's IP becomes an opaque per-process token (the live map still
//            works, /api/geo resolves tokens server-side), and on-disk paths and email
//            addresses are dropped.
//   owner  — the admin, or a visitor who owns the Plex server / is a Jellyfin
//            administrator: raw data.

const IP_KEYS = new Set(['address', 'remotePublicAddress', 'RemoteEndPoint', 'ip_address', 'ipAddress', 'IPAddress', 'ip']);
const DROP_KEYS = new Set(['email', 'file', 'Path', 'path', 'relPath', 'Location', 'folders']);

const TOKEN_KEY = crypto.randomBytes(32);
const PRIVATE_PLACEHOLDER = '10.0.0.0';
const MAX_TOKENS = 20000;
const ipTokens = new Map(); // token -> real IP (insertion-ordered, oldest evicted first)

function hostOf(raw) {
  const s = String(raw).trim();
  if (s.startsWith('[')) { const i = s.indexOf(']'); return i === -1 ? s : s.slice(1, i); }
  const parts = s.split(':');
  // "a.b.c.d:port" → host; a bare IPv6 address has many colons and no port
  if (parts.length === 2 && /^\d+$/.test(parts[1])) return parts[0];
  return s;
}

function isPrivateIp(ip) {
  const v4 = ip.replace(/^::ffff:/i, '');
  return /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(v4)
    || /^(::1$|fc|fd|fe80:)/i.test(ip) || ip === 'localhost';
}

function tokenizeIp(raw) {
  if (typeof raw !== 'string' || !raw) return raw;
  const host = hostOf(raw);
  if (!net.isIP(host)) return raw; // not an address (e.g. a hostname-less placeholder)
  if (isPrivateIp(host)) return PRIVATE_PLACEHOLDER;
  const token = 'ip-' + crypto.createHmac('sha256', TOKEN_KEY).update(host).digest('hex').slice(0, 16);
  if (!ipTokens.has(token)) {
    if (ipTokens.size >= MAX_TOKENS) ipTokens.delete(ipTokens.keys().next().value);
    ipTokens.set(token, host);
  }
  return token;
}

// Real IP for a token minted by tokenizeIp, or null.
function resolveIpToken(token) {
  return ipTokens.get(token) || null;
}

function redactForMember(value) {
  if (Array.isArray(value)) return value.map(redactForMember);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (DROP_KEYS.has(k)) continue;
    out[k] = IP_KEYS.has(k) ? tokenizeIp(v) : redactForMember(v);
  }
  return out;
}

// Lazy requires: the auth modules load config/secrets at require time.
function viewerTier(req) {
  if (require('../auth/requireAuth').isAuthenticated(req)) return 'owner';
  const session = require('../auth/requireVisitorAuth').getVisitorSession(req);
  if (!session) return 'guest';
  return session.owner ? 'owner' : 'member';
}

// For a signed-in session object (no request at hand, e.g. the SSE broadcaster).
function redactForSession(data, session) {
  return session?.owner ? data : redactForMember(data);
}

// Sends `data` as JSON at the right level for a signed-in viewer. Guests must be
// handled (gated or sanitized) by the caller before this.
function sendForViewer(req, res, data) {
  sendJson(res, 200, viewerTier(req) === 'owner' ? data : redactForMember(data));
}

// fetch + sendForViewer, for routes that used to stream the upstream body straight through.
async function relayForViewer(req, res, url, opts) {
  let data;
  try {
    data = await fetchJson(url, opts);
  } catch (err) {
    return sendJson(res, err.status && err.status < 500 ? err.status : 502, { error: 'upstream unavailable' });
  }
  sendForViewer(req, res, data);
}

module.exports = {
  redactForMember, redactForSession, tokenizeIp, resolveIpToken, isPrivateIp,
  viewerTier, sendForViewer, relayForViewer,
};
