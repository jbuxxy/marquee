const { fetchJson } = require('../lib/httpProxy');
const { sendJson } = require('../lib/http');
const { configStore } = require('../config');
const logger = require('../lib/logger');

// AUDIOBOOK RECOMMENDATIONS — same-author matches off ABS (AudioBookShelf)
// listening history, searched via RMAB's (ReadMeABook) own free-text
// /api/audiobooks/search. Two INDEPENDENTLY optional services
// feed this: ABS supplies the listening-history seeds, RMAB supplies the
// search/matching — if either is unconfigured, the whole feature returns an
// empty result (200, not an error) rather than partially degrading, matching
// every other optional-service graceful-degradation contract in marquee.
const RECOMMENDATIONS_CACHE_MS = 60 * 60 * 1000;
const RECOMMENDATIONS_HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const ADULT_GENRE_KEYWORDS = ['erotica', 'erotic'];

// Not per-account — ABS listening history here is read as a shared household
// signal, same "any authenticated visitor unlocks it" precedent as ABS's own
// existing Recently Added "books" tab (frontend/js/carousel.js), which has
// no per-account gating either.
const audiobookRecommendationCache = new Map(); // 'shared' -> {items, basedOnBooks, computedAt}
let audiobookRecInFlight = null;

function normTitle(t) {
  return String(t ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

async function fetchAbsListeningHistorySeeds() {
  const abs = configStore.resolved().services.abs;
  const data = await fetchJson(`${abs.url}/api/sessions?itemsPerPage=500`, { headers: { Authorization: `Bearer ${abs.apiKey}` } })
    .catch(() => null);
  const sessions = [...(data?.sessions ?? [])].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const cutoff = Date.now() - RECOMMENDATIONS_HISTORY_WINDOW_MS;
  const seen = new Set(), seeds = [];
  for (const s of sessions) {
    if (s.updatedAt && s.updatedAt < cutoff) continue;
    const author = s.mediaMetadata?.authors?.[0]?.name;
    if (!author || seen.has(author)) continue;
    seen.add(author);
    seeds.push({ author, title: s.displayTitle || s.mediaMetadata?.title || '' });
    if (seeds.length >= 8) break;
  }
  return seeds;
}

async function fetchRmabSearchResults(query) {
  const rmab = configStore.resolved().services.rmab;
  const data = await fetchJson(`${rmab.url}/api/audiobooks/search?q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${rmab.apiToken}` },
  }).catch(() => null);
  return data?.results ?? [];
}

async function computeAudiobookRecommendations() {
  const seeds = await fetchAbsListeningHistorySeeds();
  if (!seeds.length) return { items: [], basedOnBooks: [] };
  const perSeed = await Promise.all(seeds.map((seed) => fetchRmabSearchResults(seed.author)));

  // Deduped by normalized TITLE, not asin — the same book in a different
  // language/format is a separate asin/catalog entry, which would otherwise
  // show up as an apparent duplicate.
  const seen = new Set(), out = [];
  outer:
  for (let i = 0; i < perSeed.length; i += 1) {
    const seedAuthorNorm = normTitle(seeds[i].author);
    for (const r of perSeed[i]) {
      if (!r.author || !normTitle(r.author).includes(seedAuthorNorm)) continue;
      if (r.isAvailable || r.requestStatus || !r.asin) continue;
      if (r.language && normTitle(r.language) !== 'english') continue;
      if ((r.genres || []).some((g) => ADULT_GENRE_KEYWORDS.some((k) => g.toLowerCase().includes(k)))) continue;
      const titleKey = normTitle(r.title || '');
      if (!titleKey || seen.has(titleKey)) continue;
      seen.add(titleKey);
      out.push({
        asin: r.asin, title: r.title || '', author: r.author, coverUrl: r.coverArtUrl || null,
        description: r.description || null, genres: (r.genres || []).slice(0, 5),
      });
      if (out.length >= 20) break outer;
    }
  }
  return { items: out, basedOnBooks: seeds.slice(0, 3).map((s) => s.title).filter(Boolean) };
}

async function handleAudiobookRecommendations(res) {
  if (!configStore.isServiceConfigured('abs') || !configStore.isServiceConfigured('rmab')) {
    return sendJson(res, 200, { items: [], basedOnBooks: [] });
  }

  const cacheKey = 'audiobooks:shared';
  let entry = audiobookRecommendationCache.get(cacheKey);
  const stale = !entry || (Date.now() - entry.computedAt) > RECOMMENDATIONS_CACHE_MS;
  if (stale) {
    if (!audiobookRecInFlight) {
      audiobookRecInFlight = (async () => {
        try {
          const computed = await computeAudiobookRecommendations();
          return { ...computed, computedAt: Date.now() };
        } catch (err) {
          logger.warn('audiobook recommendations pipeline error:', err.message);
          return audiobookRecommendationCache.get(cacheKey) || { items: [], basedOnBooks: [], computedAt: 0 };
        }
      })();
      audiobookRecInFlight.finally(() => { audiobookRecInFlight = null; });
    }
    entry = await audiobookRecInFlight;
    audiobookRecommendationCache.set(cacheKey, entry);
  }
  sendJson(res, 200, { items: entry.items, basedOnBooks: entry.basedOnBooks });
}

setInterval(() => {
  const now = Date.now();
  for (const [key, rec] of audiobookRecommendationCache) if (now - rec.computedAt > 24 * 60 * 60 * 1000) audiobookRecommendationCache.delete(key);
}, 60 * 60 * 1000).unref();

module.exports = { handleAudiobookRecommendations };
