const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marquee-test-config-'));
process.env.MARQUEE_CONFIG_DIR = tmpDir;

const { ConfigStore } = require('../server/config');

test('resolves default > persisted > env precedence correctly', async () => {
  delete process.env.SITE_NAME;
  const store = new ConfigStore();
  assert.equal(store.resolved().site.siteName, 'Marquee');

  await store.set('site.siteName', 'My Hub');
  assert.equal(store.resolved().site.siteName, 'My Hub');

  process.env.SITE_NAME = 'Env Hub';
  assert.equal(store.resolved().site.siteName, 'Env Hub');
  assert.equal(store.fieldSource('site.siteName'), 'env');
  delete process.env.SITE_NAME;
});

test('isServiceConfigured requires every field for that service to be set', async () => {
  const store = new ConfigStore();
  assert.equal(store.isServiceConfigured('seerr'), false);

  await store.set('services.seerr.url', 'http://seerr.local');
  assert.equal(store.isServiceConfigured('seerr'), false);

  await store.set('services.seerr.apiKey', 'key');
  assert.equal(store.isServiceConfigured('seerr'), true);
});

test('isSetupComplete requires seerr plus at least one of plex/jellyfin', async () => {
  const store = new ConfigStore();
  assert.equal(store.isSetupComplete(), false, 'seerr alone (from previous test) is not enough');

  await store.set('services.plex.url', 'http://plex.local');
  await store.set('services.plex.token', 'token');
  assert.equal(store.isSetupComplete(), true);
});
