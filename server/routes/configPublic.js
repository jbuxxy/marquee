const { configStore } = require('../config');
const { publicServiceStatus } = require('../services/registry');
const { getCustomLinks } = require('./customLinks');
const { getGuides } = require('./guides');
const { getExcludedLibraries } = require('../lib/libraryFilter');
const { sendJson } = require('../lib/http');

function truthy(val) {
  return val === true || val === 'true';
}

// The single source of truth the frontend reads to decide what to render.
// Deliberately contains zero secrets and zero backend URLs — just booleans
// and cosmetic branding fields, so it's safe to fetch from anywhere,
// unauthenticated, before or after setup completes.
function handleConfigPublic(req, res) {
  const resolved = configStore.resolved();
  sendJson(res, 200, {
    siteName: resolved.site.siteName,
    tagline: resolved.site.tagline || '',
    theme: resolved.site.theme,
    services: publicServiceStatus(),
    setupComplete: configStore.isSetupComplete(),
    preferredMediaServer: resolved.site.preferredMediaServer || null,
    enableGeoMap: truthy(resolved.site.enableGeoMap),
    digitalReleaseDates: truthy(resolved.site.digitalReleaseDates),
    anonymizeUsers: resolved.site.anonymizeUsers || 'optional',
    enableSeasonalEffects: truthy(resolved.site.enableSeasonalEffects ?? 'true'),
    enableExtraThemes: truthy(resolved.site.enableExtraThemes ?? 'true'),
    customLinks: getCustomLinks(),
    // Plex sectionKeys only — Jellyfin exclusions are stored as on-disk
    // folder paths, not worth exposing client-side (server-side filtering in
    // server/services/jellyfin.js's handleLatest already covers it, no
    // frontend involvement needed there).
    excludedPlexSections: getExcludedLibraries().filter((e) => e.service === 'plex').map((e) => e.id),
    guides: getGuides().map((g) => ({ id: g.id, label: g.label, sublabel: g.sublabel, fileUrl: `/guides/${g.id}` })),
    needAccessMessage: resolved.site.needAccessMessage || '',
  });
}

module.exports = { handleConfigPublic };
