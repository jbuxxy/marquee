const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');
const { isAuthenticated } = require('../auth/requireAuth');
const { verifyCsrf } = require('../auth/csrf');
const { readJsonBody, sendJson } = require('../lib/http');
const { CONFIG_DIR, configStore } = require('../config');

const GUIDES_DIR = path.join(CONFIG_DIR, 'guides');
const MAX_BYTES = 10 * 1024 * 1024; // PDFs run larger than logo/favicon uploads
const MAX_GUIDES = 20;

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
// only, same mechanism as site.customLinks.
function getGuides() {
  return configStore.get('site.guides', []);
}

async function handleGetGuides(req, res) {
  if (!requireAuthOr401(req, res)) return;
  sendJson(res, 200, { guides: getGuides() });
}

function parseDataUri(dataUri) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUri || '');
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
}

async function handleSaveGuide(req, res) {
  if (!requireAuthOr401(req, res)) return;
  if (!requireCsrfOr403(req, res)) return;

  let body;
  try {
    body = await readJsonBody(req, MAX_BYTES + 10_000);
  } catch {
    return sendJson(res, 400, { error: 'invalid request body' });
  }

  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 60) : '';
  const sublabel = typeof body.sublabel === 'string' ? body.sublabel.trim().slice(0, 80) : '';
  if (!label) return sendJson(res, 400, { error: 'label is required' });

  const guides = getGuides();
  const existing = typeof body.id === 'string' ? guides.find((g) => g.id === body.id) : undefined;
  const id = existing ? existing.id : crypto.randomUUID();

  let fileName = existing?.fileName;
  if (body.data) {
    const parsed = parseDataUri(body.data);
    if (!parsed) return sendJson(res, 400, { error: 'expected a base64 data URI' });
    if (parsed.mime !== 'application/pdf') return sendJson(res, 400, { error: 'guides must be PDF files' });
    if (parsed.buffer.length > MAX_BYTES) return sendJson(res, 400, { error: 'file too large (max 10MB)' });

    await fsp.mkdir(GUIDES_DIR, { recursive: true, mode: 0o700 });
    fileName = `${id}.pdf`;
    await fsp.writeFile(path.join(GUIDES_DIR, fileName), parsed.buffer, { mode: 0o600 });
  }
  if (!fileName) return sendJson(res, 400, { error: 'a PDF file is required' });

  const entry = { id, label, sublabel, fileName };
  const next = guides.filter((g) => g.id !== id);
  next.push(entry);
  if (next.length > MAX_GUIDES) return sendJson(res, 400, { error: `maximum ${MAX_GUIDES} guides` });

  await configStore.set('site.guides', next);
  sendJson(res, 200, { ok: true, guides: next });
}

async function handleDeleteGuide(req, res, params) {
  if (!requireAuthOr401(req, res)) return;
  if (!requireCsrfOr403(req, res)) return;

  const guides = getGuides();
  const target = guides.find((g) => g.id === params.id);
  if (!target) return sendJson(res, 404, { error: 'guide not found' });

  await fsp.rm(path.join(GUIDES_DIR, target.fileName), { force: true });
  const next = guides.filter((g) => g.id !== params.id);
  await configStore.set('site.guides', next);
  sendJson(res, 200, { ok: true, guides: next });
}

// Public (no auth) — same trust level as /branding/* assets, just a file to view.
function handleServeGuideFile(req, res, params) {
  const target = getGuides().find((g) => g.id === params.id);
  if (!target) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  const filePath = path.join(GUIDES_DIR, target.fileName);
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

module.exports = { handleGetGuides, handleSaveGuide, handleDeleteGuide, handleServeGuideFile, getGuides, GUIDES_DIR };
