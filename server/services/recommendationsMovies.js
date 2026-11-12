const { fetchJson, jellyfinAuthHeaders } = require('../lib/httpProxy');
const { sendJson } = require('../lib/http');
const { configStore } = require('../config');
const { isPlexSectionExcluded, isJellyfinPathExcluded } = require('../lib/libraryFilter');
const logger = require('../lib/logger');

// MOVIES/TV RECOMMENDATIONS — Seerr/TMDB "similar to your watch history"
// suggestions. No LLM: for each of the signed-in visitor's last 10 distinct
// watched movies/shows, ask Seerr's own /recommendations endpoint (a proxy
// onto TMDB's collaborative-filtering "people who liked X also liked Y"
// engine) what's similar, then keep only titles with no mediaInfo at all —
// i.e. genuinely new to this library.
//
// resolvePlexAccountId(session) below resolves the Plex Media Server's own
// LOCAL numeric account id (used to filter /status/sessions/history/all) —
// this is NOT the same value as session.plexAccountId, which is plex.tv's
// own central account id captured at OAuth login time and used elsewhere
// (Seerr capability matching) to identify the account across the internet.
// Two different ID spaces that are easy to conflate.
const recommendationCache = new Map(); // accountKey -> {movies, tv, basedOnMovies, basedOnTv, computedAt, nowPlayingKey}
const RECOMMENDATIONS_CACHE_MS = 60 * 60 * 1000;
const recommendationInFlight = new Map(); // accountKey -> Promise<entry>

function plexCfg() { return configStore.resolved().services.plex; }
function jellyfinCfg() { return configStore.resolved().services.jellyfin; }
function seerrAuth() { return { 'X-Api-Key': configStore.resolved().services.seerr.apiKey }; }

async function fetchPlexNowPlayingSeeds(token, username) {
  const plex = plexCfg();
  const data = await fetchJson(`${plex.url}/status/sessions?X-Plex-Token=${token}`).catch(() => null);
  const sessions = (data?.MediaContainer?.Metadata ?? [])
    .filter((s) => s.User?.title === username && !isPlexSectionExcluded(s.librarySectionID));
  const movieSeeds = [], showSeeds = [];
  for (const s of sessions) {
    if (s.type === 'movie' && s.title) movieSeeds.push({ title: s.title, year: s.year || '' });
    else if (s.type === 'episode' && s.grandparentTitle) showSeeds.push({ title: s.grandparentTitle, year: '' });
  }
  return { movieSeeds, showSeeds };
}

// Maps a session's Plex username to the server's own LOCAL accountID —
// needed because /status/sessions/history/all entries carry only a numeric
// accountID, not a username. /accounts is the only place that maps
// name -> id, and requires the admin-configured Plex token to read, so this
// always calls it with the shared configured token, not the visitor's own.
const plexAccountIdCache = new Map(); // username -> { id, ts }
const PLEX_ACCOUNT_ID_CACHE_MS = 60 * 60 * 1000;

async function resolvePlexAccountId(session) {
  const cached = plexAccountIdCache.get(session.username);
  if (cached && Date.now() - cached.ts < PLEX_ACCOUNT_ID_CACHE_MS) return cached.id;
  const plex = plexCfg();
  const data = await fetchJson(`${plex.url}/accounts?X-Plex-Token=${plex.token}`).catch(() => null);
  for (const a of data?.MediaContainer?.Account ?? []) {
    plexAccountIdCache.set(a.name, { id: a.id, ts: Date.now() });
  }
  return plexAccountIdCache.get(session.username)?.id ?? null;
}

async function fetchPlexWatchHistorySeeds(token, nowPlaying, accountId) {
  if (accountId == null) return { movieSeeds: [], showSeeds: [] };
  const plex = plexCfg();
  const PAGE_SIZE = 200, MAX_PAGES = 10;
  const movieKeys = [], showKeys = [];
  const seenMovie = new Set(), seenShow = new Set();
  const showTitleSeeds = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    if (movieKeys.length >= 10 && showKeys.length + showTitleSeeds.length >= 10) break;
    const hist = await fetchJson(
      `${plex.url}/status/sessions/history/all?X-Plex-Token=${token}&sort=viewedAt:desc&accountID=${accountId}`,
      { headers: { 'X-Plex-Container-Size': String(PAGE_SIZE), 'X-Plex-Container-Start': String(page * PAGE_SIZE) } }
    ).catch(() => null);
    const rawEntries = hist?.MediaContainer?.Metadata ?? [];
    if (!rawEntries.length) break;
    const entries = rawEntries.filter((e) => !isPlexSectionExcluded(e.librarySectionID));
    for (const e of entries) {
      if (e.type === 'movie' && e.ratingKey && !seenMovie.has(e.ratingKey) && movieKeys.length < 10) {
        seenMovie.add(e.ratingKey); movieKeys.push(e.ratingKey);
      } else if (e.type === 'episode' && e.grandparentTitle && !seenShow.has(e.grandparentTitle) && showKeys.length + showTitleSeeds.length < 10) {
        seenShow.add(e.grandparentTitle);
        if (e.grandparentRatingKey) showKeys.push(e.grandparentRatingKey);
        else showTitleSeeds.push({ title: e.grandparentTitle, year: '' });
      }
    }
    if (rawEntries.length < PAGE_SIZE) break;
  }
  const allKeys = [...movieKeys, ...showKeys];
  let movieSeeds, showSeeds;
  if (!allKeys.length) {
    movieSeeds = []; showSeeds = showTitleSeeds;
  } else {
    const meta = await fetchJson(`${plex.url}/library/metadata/${allKeys.join(',')}?X-Plex-Token=${token}`).catch(() => null);
    const items = meta?.MediaContainer?.Metadata ?? [];
    movieSeeds = []; showSeeds = [...showTitleSeeds];
    for (const it of items) {
      if (!it.title) continue;
      const seed = { title: it.title, year: it.year || '' };
      if (it.type === 'movie' && movieKeys.includes(it.ratingKey)) movieSeeds.push(seed);
      else if (it.type === 'show' && showKeys.includes(it.ratingKey)) showSeeds.push(seed);
    }
  }

  const { movieSeeds: nowMovies, showSeeds: nowShows } = nowPlaying;
  for (const s of [...nowMovies].reverse()) if (!movieSeeds.some((m) => m.title === s.title)) movieSeeds.unshift(s);
  for (const s of [...nowShows].reverse()) if (!showSeeds.some((m) => m.title === s.title)) showSeeds.unshift(s);
  return { movieSeeds: movieSeeds.slice(0, 10), showSeeds: showSeeds.slice(0, 10) };
}

async function fetchJellyfinWatchHistorySeeds(session) {
  const jellyfin = jellyfinCfg();
  const headers = jellyfinAuthHeaders(session.jellyfinToken);
  const base = `${jellyfin.url}/Users/${session.jellyfinUserId}/Items?Filters=IsPlayed&Recursive=true&SortBy=DatePlayed&SortOrder=Descending`;
  const [movieData, episodeData] = await Promise.all([
    fetchJson(`${base}&IncludeItemTypes=Movie&Limit=30&Fields=Path`, { headers }).catch(() => null),
    fetchJson(`${base}&IncludeItemTypes=Episode&Limit=200&Fields=Path,SeriesName,SeriesId`, { headers }).catch(() => null),
  ]);
  const movieSeeds = (movieData?.Items ?? [])
    .filter((it) => !isJellyfinPathExcluded(it.Path))
    .slice(0, 10)
    .map((it) => ({ title: it.Name, year: it.ProductionYear || '' }))
    .filter((s) => s.title);

  const showSeeds = [];
  const seenShow = new Set();
  for (const ep of episodeData?.Items ?? []) {
    if (isJellyfinPathExcluded(ep.Path)) continue;
    if (!ep.SeriesName) continue;
    const key = ep.SeriesId || ep.SeriesName;
    if (seenShow.has(key)) continue;
    seenShow.add(key);
    showSeeds.push({ title: ep.SeriesName, year: '' });
    if (showSeeds.length >= 10) break;
  }
  return { movieSeeds, showSeeds };
}

async function resolveSeedTmdbId(seed, mediaType) {
  const seerr = configStore.resolved().services.seerr;
  const data = await fetchJson(`${seerr.url}/api/v1/search?query=${encodeURIComponent(seed.title)}`, { headers: seerrAuth() })
    .catch(() => null);
  if (data === null) return { failed: true };
  const results = (data.results ?? []).filter((r) => r.mediaType === mediaType);
  if (!results.length) return null;
  let best = results[0];
  if (seed.year) {
    const withYear = results.find((r) => {
      const ry = (r.releaseDate || r.firstAirDate || '').slice(0, 4);
      return ry && Math.abs(Number(ry) - seed.year) <= 1;
    });
    if (withYear) best = withYear;
  }
  return { id: best.id, genreIds: best.genreIds || [] };
}

async function fetchSeerrRecommendations(tmdbId, mediaType) {
  const seerr = configStore.resolved().services.seerr;
  const data = await fetchJson(`${seerr.url}/api/v1/${mediaType}/${tmdbId}/recommendations`, { headers: seerrAuth() })
    .catch(() => null);
  return data === null ? null : (data.results ?? []);
}

async function computeRecommendations(mediaType, seeds) {
  if (!seeds.length) return [];
  let anyFailed = false;
  const perSeed = await Promise.all(seeds.map(async (seed) => {
    const resolved = await resolveSeedTmdbId(seed, mediaType);
    if (!resolved) return [];
    if (resolved.failed) { anyFailed = true; return []; }
    const results = await fetchSeerrRecommendations(resolved.id, mediaType);
    if (results === null) { anyFailed = true; return []; }
    return resolved.genreIds.length
      ? results.filter((r) => (r.genreIds || []).some((g) => resolved.genreIds.includes(g)))
      : results;
  }));
  const seen = new Set(), out = [];
  outer:
  for (const results of perSeed) {
    for (const r of results) {
      if (r.mediaInfo || r.adult || seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({ tmdbId: r.id, title: r.title || r.name || '', posterPath: r.posterPath || null });
      if (out.length >= 20) break outer;
    }
  }
  if (!out.length && anyFailed) throw new Error(`${mediaType} recommendations: Seerr fetch failed mid-computation`);
  return out;
}

async function handleMoviesTvRecommendations(res, session) {
  if (!configStore.isServiceConfigured('seerr')) return sendJson(res, 200, { movies: [], tv: [] });
  if (session.provider === 'plex' && !configStore.isServiceConfigured('plex')) return sendJson(res, 200, { movies: [], tv: [] });
  if (session.provider === 'jellyfin' && !configStore.isServiceConfigured('jellyfin')) return sendJson(res, 200, { movies: [], tv: [] });

  const accountKey = `${session.provider}:${session.username}`;
  let entry = recommendationCache.get(accountKey);

  const nowPlaying = session.provider === 'jellyfin'
    ? { movieSeeds: [], showSeeds: [] }
    : await fetchPlexNowPlayingSeeds(session.plexToken, session.username);
  const nowPlayingKey = JSON.stringify([
    ...nowPlaying.movieSeeds.map((s) => s.title).sort(),
    ...nowPlaying.showSeeds.map((s) => s.title).sort(),
  ]);

  const stale = !entry || (Date.now() - entry.computedAt) > RECOMMENDATIONS_CACHE_MS || entry.nowPlayingKey !== nowPlayingKey;

  if (stale) {
    let inFlight = recommendationInFlight.get(accountKey);
    if (!inFlight) {
      inFlight = (async () => {
        try {
          const { movieSeeds, showSeeds } = session.provider === 'jellyfin'
            ? await fetchJellyfinWatchHistorySeeds(session)
            : await fetchPlexWatchHistorySeeds(session.plexToken, nowPlaying, await resolvePlexAccountId(session));
          const prev = recommendationCache.get(accountKey);
          const [movieResult, tvResult] = await Promise.allSettled([
            computeRecommendations('movie', movieSeeds),
            computeRecommendations('tv', showSeeds),
          ]);
          if (movieResult.status === 'rejected') logger.warn('movie recommendations failed, keeping previous:', movieResult.reason.message);
          if (tvResult.status === 'rejected') logger.warn('tv recommendations failed, keeping previous:', tvResult.reason.message);
          const bothOk = movieResult.status === 'fulfilled' && tvResult.status === 'fulfilled';
          return {
            movies: movieResult.status === 'fulfilled' ? movieResult.value : (prev?.movies ?? []),
            tv: tvResult.status === 'fulfilled' ? tvResult.value : (prev?.tv ?? []),
            basedOnMovies: movieResult.status === 'fulfilled'
              ? movieSeeds.slice(0, 3).map((s) => s.title).filter(Boolean)
              : (prev?.basedOnMovies ?? []),
            basedOnTv: tvResult.status === 'fulfilled'
              ? showSeeds.slice(0, 3).map((s) => s.title).filter(Boolean)
              : (prev?.basedOnTv ?? []),
            computedAt: bothOk ? Date.now() : 0,
            nowPlayingKey: bothOk ? nowPlayingKey : null,
          };
        } catch (err) {
          logger.warn('recommendations pipeline error:', err.message);
          return recommendationCache.get(accountKey) || { movies: [], tv: [], basedOnMovies: [], basedOnTv: [], computedAt: 0, nowPlayingKey: null };
        }
      })();
      recommendationInFlight.set(accountKey, inFlight);
      inFlight.finally(() => recommendationInFlight.delete(accountKey));
    }
    entry = await inFlight;
    recommendationCache.set(accountKey, entry);
  }

  sendJson(res, 200, { movies: entry.movies, tv: entry.tv, basedOnMovies: entry.basedOnMovies, basedOnTv: entry.basedOnTv });
}

setInterval(() => {
  const now = Date.now();
  for (const [key, rec] of recommendationCache) if (now - rec.computedAt > 24 * 60 * 60 * 1000) recommendationCache.delete(key);
}, 60 * 60 * 1000).unref();

module.exports = { handleMoviesTvRecommendations, resolvePlexAccountId };
