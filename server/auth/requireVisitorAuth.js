const { getVisitorSessionFromToken, visitorSessionCookieFromRequest } = require('./visitorSession');
const { sendJson } = require('../lib/http');

function getVisitorSession(req) {
  return getVisitorSessionFromToken(visitorSessionCookieFromRequest(req));
}

// Unlike admin's requireAuth (a plain boolean gate), callers of this need the
// session object itself — provider, plexAccountId, etc — not just "are they
// signed in".
function requireVisitorAuth(req, res) {
  const session = getVisitorSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'authentication required' });
    return null;
  }
  return session;
}

module.exports = { getVisitorSession, requireVisitorAuth };
