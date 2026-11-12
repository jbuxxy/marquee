// Behind a reverse proxy every request arrives from the proxy's address, which would
// make per-IP lockouts global. With TRUST_PROXY=true the proxy's X-Real-IP is used
// instead (X-Forwarded-For is not: its first entry is client-supplied and spoofable
// through most proxies' default "append" behaviour).
function clientIp(req) {
  if (process.env.TRUST_PROXY === 'true') {
    const real = req.headers['x-real-ip'];
    if (typeof real === 'string' && real.trim()) return real.trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

// Login and other credential POSTs only accept application/json. A cross-site <form> can
// only send urlencoded/multipart/text bodies without a CORS preflight, so this blocks
// login CSRF (signing a victim into the attacker's account).
function isJsonRequest(req) {
  return /^application\/json\b/i.test(req.headers['content-type'] || '');
}

function readJsonBody(req, maxBytes = 10_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Reads a raw (non-JSON) request body up to maxBytes — used for the Plex
// webhook, whose body is multipart/form-data, not JSON like every other
// POST route in this codebase.
function readRawBody(req, maxBytes = 5 * 1024 * 1024) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0, aborted = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) { aborted = true; resolve(Buffer.concat(chunks)); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!aborted) resolve(Buffer.concat(chunks)); });
    req.on('error', () => resolve(Buffer.concat(chunks)));
  });
}

// Just enough multipart/form-data parsing to pull out one field's text body
// — Plex's webhook payload is a JSON string in a form field named "payload",
// optionally alongside a binary "thumb" image part we don't need and never
// touch.
function extractMultipartField(buffer, contentType, fieldName) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  const boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2]).trim() : null;
  if (!boundary) return null;
  const marker = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buffer.indexOf(marker);
  while (start !== -1) {
    const next = buffer.indexOf(marker, start + marker.length);
    if (next === -1) break;
    parts.push(buffer.subarray(start + marker.length, next));
    start = next;
  }
  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const headerText = part.subarray(0, headerEnd).toString('utf8');
    if (new RegExp(`name="${fieldName}"`).test(headerText)) {
      let body = part.subarray(headerEnd + 4);
      if (body.subarray(-2).toString() === '\r\n') body = body.subarray(0, -2);
      return body.toString('utf8');
    }
  }
  return null;
}

module.exports = { clientIp, isJsonRequest, readJsonBody, sendJson, readRawBody, extractMultipartField };
