const path = require('path');
const fs = require('fs/promises');
const { isAuthenticated } = require('../auth/requireAuth');
const { verifyCsrf } = require('../auth/csrf');
const { readJsonBody, sendJson } = require('../lib/http');
const { CONFIG_DIR } = require('../config');

const BRANDING_DIR = path.join(CONFIG_DIR, 'branding');
const MAX_BYTES = 2 * 1024 * 1024;

// Client uploads as a base64 data URI (read via FileReader) rather than
// multipart/form-data — keeps the server dependency-free (no multipart
// parser needed) since marquee's only client is its own admin UI.
const LOGO_MIME_TO_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' };

const ASSET_RULES = {
  logo: { mimeToExt: LOGO_MIME_TO_EXT, baseName: 'logo' },
  // Independently optional overrides layered on top of the base logo — see
  // static.js's BRANDING_OVERRIDES for the fallback chain (unset variant
  // falls back to the base logo, which itself falls back to the shipped
  // default if nothing was ever uploaded).
  'logo-light': { mimeToExt: LOGO_MIME_TO_EXT, baseName: 'logo-light' },
  'logo-dark': { mimeToExt: LOGO_MIME_TO_EXT, baseName: 'logo-dark' },
  favicon: {
    mimeToExt: { 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico', 'image/png': 'png' },
    baseName: 'favicon',
  },
};

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

function parseDataUri(dataUri) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUri || '');
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
}

async function handleUploadAsset(req, res, params) {
  if (!requireAuthOr401(req, res)) return;
  if (!requireCsrfOr403(req, res)) return;

  const rule = ASSET_RULES[params.asset];
  if (!rule) return sendJson(res, 404, { error: 'unknown branding asset' });

  let body;
  try {
    body = await readJsonBody(req, MAX_BYTES + 10_000);
  } catch {
    return sendJson(res, 400, { error: 'invalid request body' });
  }

  const parsed = parseDataUri(body.data);
  if (!parsed) return sendJson(res, 400, { error: 'expected a base64 data URI' });

  const ext = rule.mimeToExt[parsed.mime];
  if (!ext) return sendJson(res, 400, { error: `unsupported file type: ${parsed.mime}` });
  if (parsed.buffer.length > MAX_BYTES) return sendJson(res, 400, { error: 'file too large (max 2MB)' });

  await fs.mkdir(BRANDING_DIR, { recursive: true, mode: 0o700 });

  // Clear any previous variant of this asset first, so static.js's
  // candidate-file lookup can't serve a stale file left over from a
  // previous upload that used a different extension.
  const allExts = new Set(Object.values(rule.mimeToExt));
  await Promise.all([...allExts].map((e) => fs.rm(path.join(BRANDING_DIR, `${rule.baseName}.${e}`), { force: true })));

  await fs.writeFile(path.join(BRANDING_DIR, `${rule.baseName}.${ext}`), parsed.buffer, { mode: 0o600 });
  sendJson(res, 200, { ok: true });
}

async function handleDeleteAsset(req, res, params) {
  if (!requireAuthOr401(req, res)) return;
  if (!requireCsrfOr403(req, res)) return;

  const rule = ASSET_RULES[params.asset];
  if (!rule) return sendJson(res, 404, { error: 'unknown branding asset' });

  const allExts = new Set(Object.values(rule.mimeToExt));
  await Promise.all([...allExts].map((e) => fs.rm(path.join(BRANDING_DIR, `${rule.baseName}.${e}`), { force: true })));
  sendJson(res, 200, { ok: true });
}

module.exports = { handleUploadAsset, handleDeleteAsset };
