const { isAuthenticated } = require('../auth/requireAuth');
const { verifyCsrf } = require('../auth/csrf');
const { changeAdminPassword } = require('../auth/bootstrap');
const { readJsonBody, sendJson } = require('../lib/http');
const { configStore, getAtPath } = require('../config');
const { FIELDS } = require('../services/schema');
const { testService } = require('../services/registry');

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

// Secret fields never leave the server as their real value, even to an
// authenticated admin — only whether they're currently set — so a leaked
// admin session or an XSS in the settings UI can't exfiltrate credentials
// entered in a previous session. `path` tracks the dotted schema path so we
// can look up whether the field the tree walk is currently on is secret.
function maskSecrets(tree, path = '') {
  const out = {};
  for (const [key, val] of Object.entries(tree)) {
    const currentPath = path ? `${path}.${key}` : key;
    if (val && typeof val === 'object' && 'value' in val && 'source' in val) {
      const field = FIELDS.find((f) => f.path === currentPath);
      out[key] = field && field.secret
        ? { configured: val.value !== null && val.value !== undefined && val.value !== '', source: val.source }
        : { value: val.value, source: val.source };
    } else if (val && typeof val === 'object') {
      out[key] = maskSecrets(val, currentPath);
    } else {
      out[key] = val;
    }
  }
  return out;
}

async function handleGetSettings(req, res) {
  if (!requireAuthOr401(req, res)) return;
  sendJson(res, 200, {
    settings: maskSecrets(configStore.resolvedWithSource()),
    setupComplete: configStore.isSetupComplete(),
  });
}

// Fields absent from the request body are left untouched (lets the UI submit
// only what changed, so masked "•••• configured" secrets aren't clobbered
// with an empty value just because the form re-rendered). An explicit empty
// string clears a field. Fields currently sourced from an env var are
// silently ignored — the UI marks them read-only, but we don't trust that
// client-side alone.
async function handleSaveSettings(req, res) {
  if (!requireAuthOr401(req, res)) return;
  if (!requireCsrfOr403(req, res)) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: 'invalid request body' });
  }

  const updates = {};
  for (const field of FIELDS) {
    const submitted = getAtPath(body, field.path);
    if (submitted === undefined) continue;
    if (configStore.fieldSource(field.path) === 'env') continue;
    updates[field.path] = submitted === '' ? null : submitted;
  }

  if (Object.keys(updates).length > 0) await configStore.setMany(updates);
  sendJson(res, 200, { ok: true, setupComplete: configStore.isSetupComplete() });
}

async function handleChangePassword(req, res) {
  if (!requireAuthOr401(req, res)) return;
  if (!requireCsrfOr403(req, res)) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: 'invalid request body' });
  }

  if (typeof body.newPassword !== 'string' || body.newPassword.length < 8) {
    return sendJson(res, 400, { error: 'newPassword must be at least 8 characters' });
  }

  try {
    await changeAdminPassword(body.newPassword);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }
  sendJson(res, 200, { ok: true });
}

// Lets the admin UI verify a connection before (or after) saving it. Body
// may contain a partial/unsaved credential set for the service being
// edited — registry.testService() fills in anything omitted from the
// server's already-resolved config, so this works both for a brand new
// entry and for re-testing an already-configured (or env-locked) service.
async function handleTestConnection(req, res, params) {
  if (!requireAuthOr401(req, res)) return;
  if (!requireCsrfOr403(req, res)) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: 'invalid request body' });
  }

  const result = await testService(params.service, body);
  sendJson(res, 200, result);
}

module.exports = { handleGetSettings, handleSaveSettings, handleChangePassword, handleTestConnection };
