// Shared IP-geolocation helpers used by the heatmap and live map.
function isPrivateIP(ip) {
  if (!ip) return true;
  const v = ip.replace(/^::ffff:/, '');
  if (v === 'localhost' || v === '::1') return true;
  const parts = v.split('.').map(Number);
  if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
    const [a, b] = parts;
    if (a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}

// Batches IPs through /api/geo (server-side geo-IP lookup, gated on
// site.enableGeoMap) in groups of 10 to match the endpoint's per-request cap.
async function geoLookup(ips) {
  const out = {};
  for (let i = 0; i < ips.length; i += 10) {
    const batch = ips.slice(i, i + 10);
    try {
      const r = await fetch(`/api/geo?ip=${batch.join(',')}`);
      if (!r.ok) continue;
      const results = await r.json();
      for (const res of results) if (res.query) out[res.query] = res;
    } catch {}
  }
  return out;
}
