// Central declarative schema for every setting marquee knows about.
// config.js uses FIELDS to resolve env > persisted > default for each value.
// registry.js (per-service proxy routes) uses SERVICE_DEFS to decide what's
// configured/required. Adding a new integration means adding one entry here
// plus one route module under server/services/ — nothing else needs to change.

const FIELDS = [
  { path: 'site.siteName', env: 'SITE_NAME', secret: false },
  { path: 'site.theme', env: 'THEME', secret: false },
  // No env var — only meaningful once both Plex and Jellyfin are configured,
  // so this is an admin-settings-only tie-break, not a first-boot concern.
  { path: 'site.preferredMediaServer', env: null, secret: false },

  // All optional, admin-settings-only. If lat/lon are unset the live map
  // simply skips the home marker/arcs and only plots client nodes.
  { path: 'site.homeLocation.lat', env: 'HOME_LAT', secret: false },
  { path: 'site.homeLocation.lon', env: 'HOME_LON', secret: false },
  { path: 'site.homeLocation.city', env: 'HOME_CITY', secret: false },

  // Opt-in, not just "configured or not" — this feature sends visitor IPs to
  // a third-party geo-IP lookup, so it defaults off regardless of whether a
  // home location is set.
  { path: 'site.enableGeoMap', env: 'ENABLE_GEO_MAP', secret: false },

  // Opt-in digital-release-dates lookup (BingeBase scrape + optional Trakt
  // enrichment). BingeBase itself needs no credentials; Trakt is a separate
  // optional service below.
  { path: 'site.digitalReleaseDates', env: 'ENABLE_DIGITAL_RELEASE_DATES', secret: false },

  // Display/privacy toggles, all admin-settings-controlled (not just a
  // client-side visitor preference): 'optional' preserves the original
  // behavior (masked by default, each visitor's browser can flip it off for
  // themselves); 'always'/'never' force the behavior and hide the toggle
  // control entirely.
  { path: 'site.anonymizeUsers', env: 'ANONYMIZE_USERS', secret: false },
  { path: 'site.enableSeasonalEffects', env: 'ENABLE_SEASONAL_EFFECTS', secret: false },
  { path: 'site.enableExtraThemes', env: 'ENABLE_EXTRA_THEMES', secret: false },

  // Optional contact text for the "Need access?" guides pill — no env var,
  // admin-settings-only, empty by default (pill is hidden until it's set).
  { path: 'site.needAccessMessage', env: null, secret: false },

  // Header subtitle under the logo/greeting — no env var, admin-settings-only
  // (edited in the Branding tab, alongside the logo). Empty falls back to the
  // frontend's own default string (see config.js).
  { path: 'site.tagline', env: null, secret: false },

  { path: 'services.seerr.url', env: 'SEERR_URL', secret: false },
  { path: 'services.seerr.apiKey', env: 'SEERR_KEY', secret: true },
  { path: 'services.seerr.publicUrl', env: 'SEERR_PUBLIC_URL', secret: false },

  { path: 'services.plex.url', env: 'PLEX_URL', secret: false },
  { path: 'services.plex.token', env: 'PLEX_TOKEN', secret: true },
  { path: 'services.plex.publicUrl', env: 'PLEX_PUBLIC_URL', secret: false },

  { path: 'services.jellyfin.url', env: 'JELLYFIN_URL', secret: false },
  { path: 'services.jellyfin.apiKey', env: 'JELLYFIN_KEY', secret: true },
  { path: 'services.jellyfin.publicUrl', env: 'JELLYFIN_PUBLIC_URL', secret: false },

  { path: 'services.abs.url', env: 'ABS_URL', secret: false },
  { path: 'services.abs.apiKey', env: 'ABS_KEY', secret: true },
  { path: 'services.abs.publicUrl', env: 'ABS_PUBLIC_URL', secret: false },

  { path: 'services.tautulli.url', env: 'TAUTULLI_URL', secret: false },
  { path: 'services.tautulli.apiKey', env: 'TAUTULLI_KEY', secret: true },

  // Jellystat is Tautulli's counterpart for Jellyfin — same stats/heatmap
  // features, sourced from whichever of the two is configured.
  { path: 'services.jellystat.url', env: 'JELLYSTAT_URL', secret: false },
  { path: 'services.jellystat.apiKey', env: 'JELLYSTAT_KEY', secret: true },

  { path: 'services.tmdb.readToken', env: 'TMDB_READ_TOKEN', secret: true },

  { path: 'services.trakt.clientId', env: 'TRAKT_CLIENT_ID', secret: true },

  { path: 'services.rmab.url', env: 'RMAB_URL', secret: false },
  { path: 'services.rmab.apiToken', env: 'RMAB_API_TOKEN', secret: true },

  // No SERVICE_DEFS entry on purpose — Redis has no browser-facing routes or
  // service card, it's a write-through backup for visitor sessions
  // (server/auth/visitorSession.js), entirely optional. Configured-ness is
  // checked directly against these two fields, not via isServiceConfigured.
  { path: 'services.redis.url', env: 'REDIS_URL', secret: false },
  { path: 'services.redis.password', env: 'REDIS_PASSWORD', secret: true },

  // Plex OAuth's PIN flow (visitor login) needs a stable client identifier
  // across a whole login attempt. No default/env requirement — auto-generated
  // and persisted on first use if unset (see routes/visitorAuth.js).
  { path: 'auth.plexClientId', env: 'PLEX_CLIENT_IDENTIFIER', secret: false },

  // Path-segment secret for the Plex webhook URL (/api/webhooks/plex/<secret>)
  // — auto-generated and persisted at startup (see lib/push.js) so the admin
  // UI always has a real URL to display, not a required env var. Not marked
  // secret:true — the admin needs to actually see and copy this value into
  // Plex's own webhook settings, unlike a normal credential.
  { path: 'push.plexWebhookSecret', env: null, secret: false },

  // Same pattern as push.plexWebhookSecret, for Seerr's own webhook settings
  // (Settings -> Notifications -> Webhook) — powers the requests-changed
  // push signal (server/routes/stream.js's handleSeerrWebhook).
  { path: 'push.seerrWebhookSecret', env: null, secret: false },
];

// requiredGroup members: at least one must be configured for setup to be complete.
const SERVICE_DEFS = [
  { key: 'seerr', label: 'Seerr', required: true, fields: ['url', 'apiKey'] },
  { key: 'plex', label: 'Plex', requiredGroup: 'media-server', fields: ['url', 'token'] },
  { key: 'jellyfin', label: 'Jellyfin', requiredGroup: 'media-server', fields: ['url', 'apiKey'] },
  { key: 'abs', label: 'AudioBookShelf', fields: ['url', 'apiKey'] },
  { key: 'tautulli', label: 'Tautulli', fields: ['url', 'apiKey'] },
  { key: 'jellystat', label: 'Jellystat', fields: ['url', 'apiKey'] },
  { key: 'tmdb', label: 'TMDB', fields: ['readToken'] },
  { key: 'trakt', label: 'Trakt', fields: ['clientId'] },
  { key: 'rmab', label: 'ReadMeABook', fields: ['url', 'apiToken'] },
];

const REQUIRED_GROUPS = {
  'media-server': ['plex', 'jellyfin'],
};

module.exports = { FIELDS, SERVICE_DEFS, REQUIRED_GROUPS };
