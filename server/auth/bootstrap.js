const crypto = require('crypto');
const { hashPassword } = require('./password');
const { configStore } = require('../config');
const logger = require('../lib/logger');

let cached = null; // { hash, source: 'env' | 'persisted' | 'generated' }

// Resolves the admin password hash exactly once per boot, in this order:
//   1. ADMIN_PASSWORD_HASH env var (advanced — bring your own hash)
//   2. ADMIN_PASSWORD env var (hashed fresh at startup, not persisted)
//   3. a hash already persisted from a previous boot (e.g. changed via the
//      admin UI, or generated on an earlier first run)
//   4. first run with nothing configured: generate a random password, hash
//      and persist the hash, and print the plaintext once to the logs.
// A hardcoded default password would be a CVE waiting to happen; refusing to
// boot without one (as the original proxy.js did for its required services)
// fails the "docker run and it just works" expectation. Printing to
// `docker logs` on first boot is the same trade-off Vaultwarden/Gitea make.
async function resolveAdminPasswordHash() {
  if (cached) return cached;

  if (process.env.ADMIN_PASSWORD_HASH) {
    cached = { hash: process.env.ADMIN_PASSWORD_HASH, source: 'env' };
    return cached;
  }

  if (process.env.ADMIN_PASSWORD) {
    cached = { hash: await hashPassword(process.env.ADMIN_PASSWORD), source: 'env' };
    return cached;
  }

  const existing = configStore.get('admin.passwordHash');
  if (existing) {
    cached = { hash: existing, source: 'persisted' };
    return cached;
  }

  const generated = crypto.randomBytes(18).toString('base64url');
  const hash = await hashPassword(generated);
  await configStore.set('admin.passwordHash', hash);
  cached = { hash, source: 'generated' };

  const banner = '='.repeat(60);
  logger.log(
    [
      '',
      banner,
      'marquee first-run admin password (shown once):',
      '',
      `  ${generated}`,
      '',
      'Save it now — it will not be shown again.',
      'Log in at /admin to finish setup.',
      banner,
      '',
    ].join('\n')
  );

  return cached;
}

async function changeAdminPassword(newPlaintext) {
  const current = await resolveAdminPasswordHash();
  if (current.source === 'env') {
    throw new Error('admin password is managed by environment variables and cannot be changed here');
  }
  const hash = await hashPassword(newPlaintext);
  await configStore.set('admin.passwordHash', hash);
  cached = { hash, source: 'persisted' };
}

module.exports = { resolveAdminPasswordHash, changeAdminPassword };
