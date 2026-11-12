const fs = require('fs');
const path = require('path');
const { CONFIG_DIR, configStore } = require('./config');

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const BRANDING_DIR = path.join(CONFIG_DIR, 'branding');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Branding lookup order: an uploaded file for this exact asset, then (for the light/dark
// logo variants) the uploaded base logo, then Marquee's own shipped artwork.
const LOGO_FILES = (base) => [`${base}.png`, `${base}.svg`, `${base}.jpg`];
const BRANDING_OVERRIDES = {
  '/branding/logo': { candidates: LOGO_FILES('logo'), fallback: 'brand/marquee-logo-dark.png' },
  '/branding/logo-dark': { candidates: [...LOGO_FILES('logo-dark'), ...LOGO_FILES('logo')], fallback: 'brand/marquee-logo-dark.png' },
  '/branding/logo-light': { candidates: [...LOGO_FILES('logo-light'), ...LOGO_FILES('logo')], fallback: 'brand/marquee-logo-light.png' },
  '/branding/favicon': { candidates: ['favicon.ico', 'favicon.png'], fallback: 'brand/marquee-mark-32.png' },
};

function resolveBrandingAsset(res, override) {
  for (const name of override.candidates) {
    const candidatePath = path.join(BRANDING_DIR, name);
    if (fs.existsSync(candidatePath)) return serveFile(res, candidatePath);
  }
  return serveFile(res, path.join(FRONTEND_DIR, 'public', override.fallback));
}

const PAGE_ALIASES = {
  '/setup': '/setup.html',
  '/admin': '/admin.html',
};

function resolveWithinBase(baseDir, requestedPath) {
  const resolved = path.resolve(baseDir, `.${requestedPath}`);
  if (resolved !== baseDir && !resolved.startsWith(baseDir + path.sep)) return null;
  return resolved;
}

// Enforced Content-Security-Policy for every page. No inline <script> or on* handlers exist
// (tests/csp.test.js keeps it that way); third-party code comes only from jsDelivr, pinned
// with SRI. connect-src lists every origin the browser itself fetches from:
//   openlibrary.org (audiobook covers/metadata), tiles.openfreemap.org (map basemap),
//   cdn.jsdelivr.net (the seasonal Lottie player's WebAssembly renderer).
// 'wasm-unsafe-eval' allows compiling that WebAssembly and nothing else.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "font-src 'self' data: https://cdn.jsdelivr.net",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "connect-src 'self' https://openlibrary.org https://tiles.openfreemap.org https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function serveFile(res, filePath) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      ETag: `"${stat.size}-${stat.mtimeMs}"`,
      ...SECURITY_HEADERS,
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method not allowed');
    return;
  }

  const override = BRANDING_OVERRIDES[pathname];
  if (override) return resolveBrandingAsset(res, override);

  // The dashboard is only reachable once Seerr + at least one of Plex/Jellyfin
  // are actually configured (whether via env vars or the admin UI) — until
  // then every visit to / is sent to the setup wizard instead of a broken page.
  if (pathname === '/' && !configStore.isSetupComplete()) {
    res.writeHead(302, { Location: '/setup' });
    res.end();
    return;
  }

  // Never serve dotfiles or dot-directories, whatever ends up in the frontend folder.
  if (pathname.split('/').some((seg) => seg.startsWith('.'))) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  const requestPath = pathname === '/' ? '/index.html' : (PAGE_ALIASES[pathname] || pathname);
  const resolved = resolveWithinBase(FRONTEND_DIR, requestPath);
  if (!resolved) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad request');
    return;
  }
  serveFile(res, resolved);
}

module.exports = { serveStatic, CONTENT_SECURITY_POLICY };
