const http = require('http');
const https = require('https');
const { URL } = require('url');

// Streams an upstream HTTP(S) response directly back to the client. Every
// service module calls this with the real backend URL and, if needed, the
// header carrying that service's credential — attached here, server-side,
// so the browser only ever talks to same-origin /api/<service>/* paths and
// never sees a Plex token, Seerr API key, etc.
// Headers added to every proxied response. Upstream bodies are untrusted (an HTML error
// page, an SVG "image"), so the browser must never run them as a document from our origin.
const PROXY_SAFETY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'X-Content-Type-Options': 'nosniff',
};
const IMAGE_TYPE_RE = /^image\/(jpeg|png|webp|gif|avif)\b/i;
const MAX_JSON_BYTES = 16 * 1024 * 1024;

// Jellyfin 10.11+/12 rejects the legacy `?api_key=` query parameter and the
// X-Emby-Token header with 401; this Authorization form works on every version.
function jellyfinAuthHeaders(token) {
  return { Authorization: `MediaBrowser Client="marquee", Device="marquee", DeviceId="marquee-server", Version="1", Token="${token}"` };
}

function forward(res, upstreamUrl, { method = 'GET', headers = {}, body, imageOnly = false } = {}) {
  return new Promise((resolve) => {
    let target;
    try {
      target = new URL(upstreamUrl);
    } catch {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid upstream url' }));
      return resolve();
    }

    const proto = target.protocol === 'https:' ? https : http;
    const opts = {
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method,
      headers: { Accept: 'application/json', ...headers },
    };

    const upstreamReq = proto.request(opts, (upstream) => {
      const type = upstream.headers['content-type'] || 'application/json';
      if (imageOnly && upstream.statusCode < 300 && !IMAGE_TYPE_RE.test(type)) {
        upstream.resume();
        res.writeHead(502, { 'Content-Type': 'application/json', ...PROXY_SAFETY_HEADERS });
        res.end(JSON.stringify({ error: 'upstream did not return an image' }));
        return resolve();
      }
      res.writeHead(upstream.statusCode, {
        'Content-Type': type,
        'Cache-Control': imageOnly ? 'private, max-age=3600' : 'no-store',
        ...PROXY_SAFETY_HEADERS,
      });
      upstream.pipe(res);
      upstream.on('end', resolve);
      upstream.on('error', resolve);
    });

    upstreamReq.on('error', (err) => {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
      if (!res.writableEnded) res.end(JSON.stringify({ error: 'upstream unavailable', detail: err.code || err.message }));
      resolve();
    });

    if (body !== undefined) {
      const payload = typeof body === 'string' ? body : JSON.stringify(body);
      upstreamReq.setHeader('Content-Type', 'application/json');
      upstreamReq.setHeader('Content-Length', Buffer.byteLength(payload));
      upstreamReq.end(payload);
    } else {
      upstreamReq.end();
    }
  });
}

function forwardImage(res, upstreamUrl, extraHeaders = {}) {
  return forward(res, upstreamUrl, { headers: { Accept: 'image/*,*/*', ...extraHeaders }, imageOnly: true });
}

// Lightweight connectivity check for the admin UI's "Test connection"
// button — unlike forward(), this never streams to a client response, it
// just resolves ok/status/error so the settings page can show a result
// before the admin has even saved the credentials being tested.
function testUpstream(upstreamUrl, { headers = {}, timeoutMs = 5000 } = {}) {
  return new Promise((resolve) => {
    let target;
    try {
      target = new URL(upstreamUrl);
    } catch {
      return resolve({ ok: false, error: 'invalid url' });
    }
    const proto = target.protocol === 'https:' ? https : http;
    const req = proto.request(
      {
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: 'GET',
        headers: { Accept: 'application/json', ...headers },
        timeout: timeoutMs,
      },
      (upstream) => {
        upstream.resume();
        resolve({ ok: upstream.statusCode >= 200 && upstream.statusCode < 400, status: upstream.statusCode });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'timed out' });
    });
    req.on('error', (err) => resolve({ ok: false, error: err.code || err.message }));
    req.end();
  });
}

// Server-side fetch that returns the body instead of streaming it to a client — for code
// that reads/transforms upstream data itself. Rejects on non-2xx (with .status), on
// timeouts, and on bodies over 16MB, so callers never mistake an error page for data.
function fetchText(upstreamUrl, { method = 'GET', headers = {}, body, timeoutMs = 10000, accept = 'application/json', redirects = 3 } = {}) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(upstreamUrl);
    } catch {
      return reject(new Error('invalid upstream url'));
    }

    const proto = target.protocol === 'https:' ? https : http;
    const payload = body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined;
    const req = proto.request(
      {
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method,
        headers: {
          Accept: accept,
          'User-Agent': 'marquee',
          ...(payload !== undefined ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers,
        },
        timeout: timeoutMs,
      },
      (upstream) => {
        const status = upstream.statusCode;
        if (status >= 300 && status < 400 && upstream.headers.location && redirects > 0 && method === 'GET') {
          upstream.resume();
          const next = new URL(upstream.headers.location, target).toString();
          return resolve(fetchText(next, { method, headers, timeoutMs, accept, redirects: redirects - 1 }));
        }
        const chunks = [];
        let size = 0;
        upstream.on('data', (c) => {
          size += c.length;
          if (size > MAX_JSON_BYTES) { req.destroy(); reject(new Error('upstream response too large')); return; }
          chunks.push(c);
        });
        upstream.on('end', () => {
          if (size > MAX_JSON_BYTES) return;
          const raw = Buffer.concat(chunks).toString('utf8');
          if (status < 200 || status >= 300) {
            return reject(Object.assign(new Error(`upstream returned ${status}`), { status, body: raw }));
          }
          resolve(raw);
        });
        upstream.on('error', reject);
      }
    );
    req.on('timeout', () => { req.destroy(); reject(new Error('timed out')); });
    req.on('error', reject);
    if (payload !== undefined) req.end(payload);
    else req.end();
  });
}

async function fetchJson(upstreamUrl, opts = {}) {
  const raw = await fetchText(upstreamUrl, opts);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`invalid JSON from upstream: ${err.message}`);
  }
}

module.exports = { forward, forwardImage, testUpstream, fetchJson, fetchText, jellyfinAuthHeaders, PROXY_SAFETY_HEADERS };
