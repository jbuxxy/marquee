const crypto = require('crypto');
const { isAuthenticated } = require('../auth/requireAuth');
const { verifyCsrf } = require('../auth/csrf');
const { readJsonBody, sendJson } = require('../lib/http');
const { configStore } = require('../config');

const MAX_LINKS = 50;
const PLACEMENTS = new Set(['card', 'bookmark']);

function requireAuthOr401(req, res) {
  if (!isAuthenticated(req)) {
    sendJson(res, 401, { error: 'authentication required' });
    return false;
  }
  return true;
}

function requireCsrfOr403(req, res) {
  if (!verifyCsrf(req)) {
    sendJson(res, 403, { error: 'csrf token missing or invalid' });
    return false;
  }
  return true;
}

// Not a FIELDS/env-precedence setting (it's a list, not a scalar) — persisted
// only, same mechanism as the admin password hash, via configStore's generic
// dotted-path accessors.
function getCustomLinks() {
  return configStore.get('site.customLinks', []);
}

async function handleGetCustomLinks(req, res) {
  if (!requireAuthOr401(req, res)) return;
  sendJson(res, 200, { links: getCustomLinks() });
}

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
const MDI_ICON_RE = /^[a-z0-9-]{1,60}$/;

// Icon is an MDI (Material Design Icons) glyph name, e.g. "silverware-fork-knife"
// (stored without the "mdi-" prefix; the frontend renders `mdi mdi-<icon>`) —
// strip a pasted-in prefix so both "movie" and "mdi-movie" work as input.
function normalizeIcon(raw) {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase().replace(/^mdi[-\s]?/, '') : '';
  return MDI_ICON_RE.test(value) ? value : '';
}

function normalizeColor(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  return HEX_COLOR_RE.test(value) ? value : '';
}

function sanitizeLink(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const label = typeof raw.label === 'string' ? raw.label.trim().slice(0, 60) : '';
  const url = typeof raw.url === 'string' ? raw.url.trim().slice(0, 500) : '';
  const icon = normalizeIcon(raw.icon);
  const color = normalizeColor(raw.color);
  const placement = PLACEMENTS.has(raw.placement) ? raw.placement : 'card';
  if (!label || !/^https?:\/\//i.test(url)) return null;
  // Card placement renders as a full request-grid card, so it needs a real
  // MDI icon + accent color (chosen via the admin picker) rather than
  // falling back to something generic-looking; bookmark links stay optional.
  if (placement === 'card' && (!icon || !color)) return null;
  return { id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(), label, url, icon, color, placement };
}

async function handleSaveCustomLinks(req, res) {
  if (!requireAuthOr401(req, res)) return;
  if (!requireCsrfOr403(req, res)) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: 'invalid request body' });
  }

  if (!Array.isArray(body.links)) return sendJson(res, 400, { error: 'links must be an array' });
  const links = body.links.map(sanitizeLink).filter(Boolean).slice(0, MAX_LINKS);

  await configStore.set('site.customLinks', links);
  sendJson(res, 200, { ok: true, links });
}

module.exports = { handleGetCustomLinks, handleSaveCustomLinks, getCustomLinks };
