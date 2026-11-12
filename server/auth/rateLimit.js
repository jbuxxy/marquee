// Per-IP login lockout, in-memory. This is defense-in-depth alongside the
// persisted account-level lockout in auth/bootstrap.js + routes/auth.js —
// the account lock stops a brute force spread across many IPs, this stops
// a single IP grinding through attempts quickly.
const IP_MAX_ATTEMPTS = 5;
const IP_LOCKOUT_MS = 15 * 60 * 1000;
const STALE_MS = 24 * 60 * 60 * 1000;

// Each login surface gets its own limiter, so failed visitor logins can't lock an IP out
// of /admin (or the reverse).
function createIpLimiter({ maxAttempts = IP_MAX_ATTEMPTS, lockoutMs = IP_LOCKOUT_MS } = {}) {
  const attempts = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [ip, e] of attempts) if (e.lockedUntil < now && now - e.lastFailAt > STALE_MS) attempts.delete(ip);
  }, 60 * 60 * 1000).unref();
  return {
    recordIpFailure(ip) {
      const entry = attempts.get(ip) || { count: 0, lockedUntil: 0, lastFailAt: 0 };
      entry.count += 1;
      entry.lastFailAt = Date.now();
      if (entry.count >= maxAttempts) {
        const strikes = entry.count - maxAttempts + 1;
        entry.lockedUntil = Date.now() + lockoutMs * Math.min(strikes, 8);
      }
      attempts.set(ip, entry);
    },
    resetIp(ip) { attempts.delete(ip); },
    ipLockedUntil(ip) {
      const entry = attempts.get(ip);
      return entry && entry.lockedUntil > Date.now() ? entry.lockedUntil : 0;
    },
  };
}

// Simple fixed-window counter for non-credential endpoints (PIN creation, requests).
function createWindowLimiter({ limit, windowMs }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, e] of hits) if (now > e.resetAt) hits.delete(k);
  }, windowMs).unref();
  return function take(key) {
    const now = Date.now();
    let e = hits.get(key);
    if (!e || now > e.resetAt) { e = { n: 0, resetAt: now + windowMs }; hits.set(key, e); }
    e.n += 1;
    return e.n <= limit;
  };
}

// The admin login's limiter (routes/auth.js uses these module-level functions).
const adminLimiter = createIpLimiter();

module.exports = {
  recordIpFailure: adminLimiter.recordIpFailure,
  resetIp: adminLimiter.resetIp,
  ipLockedUntil: adminLimiter.ipLockedUntil,
  createIpLimiter,
  createWindowLimiter,
};
