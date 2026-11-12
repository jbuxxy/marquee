const { validateSession, sessionCookieFromRequest } = require('./session');

function isAuthenticated(req) {
  return validateSession(sessionCookieFromRequest(req));
}

module.exports = { isAuthenticated };
