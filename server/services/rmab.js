const { testUpstream } = require('../lib/httpProxy');

// RMAB (ReadMeABook) — searched server-to-server only, inside the audiobook
// recommendations pipeline (recommendationsAudiobooks.js); it's never
// proxied straight to the browser the way plex.js/jellyfin.js are, so this
// module has no `routes` of its own. It still registers in
// services/registry.js's routeModules map purely so the admin "Test
// connection" button works for it.
function test(cfg) {
  return testUpstream(`${cfg.url}/api/audiobooks/search?q=test`, { headers: { Authorization: `Bearer ${cfg.apiToken}` } });
}

module.exports = { test };
