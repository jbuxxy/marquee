const crypto = require('crypto');
const { cookieFromRequest } = require('../lib/cookies');
const { CSRF_COOKIE } = require('./session');

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

function tokensMatch(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Double-submit cookie pattern: the CSRF cookie is readable by same-origin JS
// (not httpOnly) and must be echoed back in a header on every state-changing
// request. A cross-site page can trigger the request but can't read the
// victim's cookie value to put in the header, so the values won't match.
// cookieName defaults to the admin CSRF cookie (both existing call sites rely
// on that default); visitor-auth routes pass VISITOR_CSRF_COOKIE instead,
// since admin and visitor sessions are separate trust domains with their own
// cookies.
function verifyCsrf(req, cookieName = CSRF_COOKIE) {
  return tokensMatch(cookieFromRequest(req, cookieName), req.headers['x-csrf-token']);
}

module.exports = { generateToken, tokensMatch, verifyCsrf };
