const crypto = require('crypto');

// Node core crypto.scrypt only — no bcrypt native module, no compile step in
// the Docker build. Stored format is self-describing so parameters can be
// tuned later without invalidating existing hashes: scrypt$N$r$p$salt$hash
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

function hashPassword(plaintext) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(plaintext, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derivedKey.toString('hex')}`);
    });
  });
}

function verifyPassword(plaintext, stored) {
  return new Promise((resolve, reject) => {
    if (typeof stored !== 'string') return resolve(false);
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return resolve(false);
    const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
    const N = parseInt(nStr, 10);
    const r = parseInt(rStr, 10);
    const p = parseInt(pStr, 10);
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    crypto.scrypt(plaintext, salt, expected.length, { N, r, p }, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey.length === expected.length && crypto.timingSafeEqual(derivedKey, expected));
    });
  });
}

module.exports = { hashPassword, verifyPassword };
