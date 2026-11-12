const { isAuthenticated } = require('../auth/requireAuth');
const { verifyCsrf } = require('../auth/csrf');
const { readJsonBody, sendJson } = require('../lib/http');
const { configStore } = require('../config');
const { getExcludedLibraries } = require('../lib/libraryFilter');

const MAX_EXCLUSIONS = 100;
const SERVICES = new Set(['plex', 'jellyfin']);

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

async function handleGetLibraryExclusions(req, res) {
  if (!requireAuthOr401(req, res)) return;
  sendJson(res, 200, { excluded: getExcludedLibraries() });
}

function sanitizeExclusion(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const service = SERVICES.has(raw.service) ? raw.service : null;
  const id = typeof raw.id === 'string' ? raw.id.trim().slice(0, 500) : '';
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 200) : '';
  if (!service || !id) return null;
  return { service, id, name };
}

async function handleSaveLibraryExclusions(req, res) {
  if (!requireAuthOr401(req, res)) return;
  if (!requireCsrfOr403(req, res)) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: 'invalid request body' });
  }

  if (!Array.isArray(body.excluded)) return sendJson(res, 400, { error: 'excluded must be an array' });
  const excluded = body.excluded.map(sanitizeExclusion).filter(Boolean).slice(0, MAX_EXCLUSIONS);

  await configStore.set('site.excludedLibraries', excluded);
  sendJson(res, 200, { ok: true, excluded });
}

module.exports = { handleGetLibraryExclusions, handleSaveLibraryExclusions };
