function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const raw = part.slice(idx + 1).trim();
    // A malformed %-sequence (e.g. a cookie planted from a sibling subdomain) must not
    // throw and 500 every request from that browser.
    let value;
    try { value = decodeURIComponent(raw); } catch { value = raw; }
    out[part.slice(0, idx).trim()] = value;
  }
  return out;
}

// Over HTTPS every cookie is set with the __Host- prefix (Secure, Path=/, no Domain), which
// browsers refuse to let a sibling subdomain or plain-HTTP page overwrite. Plain-HTTP LAN
// installs can't use the prefix, so readers accept both spellings, prefixed first.
const HOST_PREFIX = '__Host-';

function cookieFromRequest(req, baseName) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[HOST_PREFIX + baseName] ?? cookies[baseName];
}

module.exports = { parseCookies, cookieFromRequest, HOST_PREFIX };
