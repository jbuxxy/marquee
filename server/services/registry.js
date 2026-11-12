const { configStore } = require('../config');
const { SERVICE_DEFS } = require('./schema');

const routeModules = {
  seerr: require('./seerr'),
  plex: require('./plex'),
  jellyfin: require('./jellyfin'),
  abs: require('./audiobookshelf'),
  tautulli: require('./tautulli'),
  jellystat: require('./jellystat'),
  tmdb: require('./tmdb'),
  rmab: require('./rmab'),
};

function isConfigured(serviceKey) {
  return configStore.isServiceConfigured(serviceKey);
}

function serviceConfig(serviceKey) {
  return configStore.resolved().services?.[serviceKey] || {};
}

// Wraps every service route so a request to a not-yet-configured service
// returns a clean 503 instead of ever reaching a handler that assumes
// credentials exist. This is the direct fix for the original proxy's
// process.exit(1)-if-anything-missing anti-pattern: nothing here can crash
// the process at request time, whether the service is required or optional.
function guarded(serviceKey, handler) {
  return (req, res, params) => {
    if (!isConfigured(serviceKey)) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `${serviceKey} is not configured` }));
      return;
    }
    return handler(req, res, params, serviceConfig(serviceKey));
  };
}

function registerServiceRoutes(router) {
  for (const def of SERVICE_DEFS) {
    const mod = routeModules[def.key];
    if (!mod || !mod.routes) continue;
    for (const route of mod.routes) {
      router.add(route.method, route.matcher, guarded(def.key, route.handler));
    }
  }
}

// What the frontend is allowed to know: which cards to render, plus each
// service's own public-facing URL if one was set (for the card's "Open"
// link) — everything else (internal API url, keys, tokens) stays server-side.
function publicServiceStatus() {
  const resolved = configStore.resolved();
  const out = {};
  for (const def of SERVICE_DEFS) {
    const publicUrl = resolved.services?.[def.key]?.publicUrl || null;
    out[def.key] = { enabled: isConfigured(def.key), ...(publicUrl ? { publicUrl } : {}) };
  }
  return out;
}

// Used by the admin UI's "Test connection" button. Merges the server's
// already-resolved config (so an env-locked or previously-saved service can
// still be tested without the client ever seeing its secret) with whatever
// the client is actively typing (so a not-yet-saved credential can be tested
// too) — client-submitted values win when present and non-empty.
function testService(serviceKey, overrides = {}) {
  const mod = routeModules[serviceKey];
  if (!mod || typeof mod.test !== 'function') {
    return Promise.resolve({ ok: false, error: 'connection testing is not supported for this service' });
  }
  const base = serviceConfig(serviceKey);
  const filteredOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([, v]) => v !== undefined && v !== '')
  );
  return mod.test({ ...base, ...filteredOverrides });
}

module.exports = { registerServiceRoutes, publicServiceStatus, isConfigured, serviceConfig, testService };
