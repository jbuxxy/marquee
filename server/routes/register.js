const { handleLogin, handleLogout } = require('./auth');
const { handleGetSettings, handleSaveSettings, handleChangePassword, handleTestConnection } = require('./adminApi');
const { handleUploadAsset, handleDeleteAsset } = require('./branding');
const { handleGetCustomLinks, handleSaveCustomLinks } = require('./customLinks');
const { handleGetLibraryExclusions, handleSaveLibraryExclusions } = require('./libraryExclusions');
const { handleGetGuides, handleSaveGuide, handleDeleteGuide, handleServeGuideFile } = require('./guides');
const { handleConfigPublic } = require('./configPublic');
const { handleServerStats } = require('./serverStats');
const { registerServiceRoutes } = require('../services/registry');
const geo = require('../services/geo');
const digitalDates = require('../services/digitalDates');
const {
  handlePinCreate,
  handlePinPoll,
  handleJellyfinLogin,
  handleVisitorSession,
  handleVisitorLogout,
} = require('./visitorAuth');
const { handleMoviesTv, handleAudiobooks } = require('./recommendations');
const { handleStream, handlePlexWebhook, handleSeerrWebhook } = require('./stream');

const BRANDING_ASSET_PATTERN = /^\/admin\/api\/branding\/(?<asset>logo|favicon|logo-light|logo-dark)$/;
const TEST_SERVICE_PATTERN = /^\/admin\/api\/test\/(?<service>[a-z]+)$/;
const GUIDE_ID_PATTERN = /^\/admin\/api\/guides\/(?<id>[a-zA-Z0-9-]+)$/;
const GUIDE_FILE_PATTERN = /^\/guides\/(?<id>[a-zA-Z0-9-]+)$/;
const VISITOR_PIN_ID_PATTERN = /^\/api\/visitor-auth\/pin\/(?<id>\d+)$/;
const PLEX_WEBHOOK_PATTERN = /^\/api\/webhooks\/plex\/(?<secret>[^/]+)$/;
const SEERR_WEBHOOK_PATTERN = /^\/api\/webhooks\/seerr\/(?<secret>[^/]+)$/;

// Wires every route module onto the shared router in one place, so
// server/index.js doesn't need to change as routes are added milestone by
// milestone.
module.exports = function register(router) {
  router.post('/admin/api/login', handleLogin);
  router.post('/admin/api/logout', handleLogout);
  router.get('/admin/api/settings', handleGetSettings);
  router.post('/admin/api/settings', handleSaveSettings);
  router.post('/admin/api/change-password', handleChangePassword);
  router.post(TEST_SERVICE_PATTERN, handleTestConnection);
  router.post(BRANDING_ASSET_PATTERN, handleUploadAsset);
  router.delete(BRANDING_ASSET_PATTERN, handleDeleteAsset);
  router.get('/admin/api/custom-links', handleGetCustomLinks);
  router.post('/admin/api/custom-links', handleSaveCustomLinks);
  router.get('/admin/api/library-exclusions', handleGetLibraryExclusions);
  router.post('/admin/api/library-exclusions', handleSaveLibraryExclusions);
  router.get('/admin/api/guides', handleGetGuides);
  router.post('/admin/api/guides', handleSaveGuide);
  router.delete(GUIDE_ID_PATTERN, handleDeleteGuide);
  router.get(GUIDE_FILE_PATTERN, handleServeGuideFile);

  router.get('/api/config/public', handleConfigPublic);
  router.get('/api/server-stats', handleServerStats);
  geo.registerRoutes(router);
  digitalDates.registerRoutes(router);
  registerServiceRoutes(router);

  router.post('/api/visitor-auth/pin', handlePinCreate);
  router.get(VISITOR_PIN_ID_PATTERN, handlePinPoll);
  router.post('/api/visitor-auth/jellyfin', handleJellyfinLogin);
  router.get('/api/visitor-auth/session', handleVisitorSession);
  router.post('/api/visitor-auth/logout', handleVisitorLogout);

  router.get('/api/recommendations/movies-tv', handleMoviesTv);
  router.get('/api/recommendations/audiobooks', handleAudiobooks);

  router.get('/api/stream', handleStream);
  router.post(PLEX_WEBHOOK_PATTERN, handlePlexWebhook);
  router.post(SEERR_WEBHOOK_PATTERN, handleSeerrWebhook);
};
