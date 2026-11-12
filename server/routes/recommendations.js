const { requireVisitorAuth } = require('../auth/requireVisitorAuth');
const { handleMoviesTvRecommendations } = require('../services/recommendationsMovies');
const { handleAudiobookRecommendations } = require('../services/recommendationsAudiobooks');

// Not looped through services/registry.js's per-SERVICE_DEFS guard like the
// plain service proxies — these routes need a visitor session (not just a
// single configured service) and, for movies/tv, branch across whichever of
// Seerr+Plex or Seerr+Jellyfin the signed-in visitor's own provider implies.
async function handleMoviesTv(req, res) {
  const session = requireVisitorAuth(req, res);
  if (!session) return;
  await handleMoviesTvRecommendations(res, session);
}

async function handleAudiobooks(req, res) {
  const session = requireVisitorAuth(req, res);
  if (!session) return;
  await handleAudiobookRecommendations(res, session);
}

module.exports = { handleMoviesTv, handleAudiobooks };
