const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marquee-test-services-'));
process.env.MARQUEE_CONFIG_DIR = tmpDir;

const { Router } = require('../server/router');
const { registerServiceRoutes } = require('../server/services/registry');

function mockRes() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    writeHead(code, headers) { this.statusCode = code; this.headers = headers; },
    end(chunk) { this.body += chunk || ''; },
  };
}

test('an unconfigured optional service returns a clean 503, not a crash', () => {
  const router = new Router();
  registerServiceRoutes(router);

  const match = router.match('GET', '/api/jellyfin/sessions');
  assert.ok(match, 'route should be registered even before the service is configured');

  const res = mockRes();
  match.handler({ url: '/api/jellyfin/sessions', headers: {} }, res, {});
  assert.equal(res.statusCode, 503);
  assert.match(res.body, /not configured/);
});

test('a path with no matching service route is simply unmatched', () => {
  const router = new Router();
  registerServiceRoutes(router);
  assert.equal(router.match('GET', '/api/does-not-exist'), null);
});
