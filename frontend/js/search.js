// SEARCH — a dropdown search box across whichever of Plex/Jellyfin/ABS/Seerr
// are actually configured.
let searchDebounce = null;
let searchResultsData = [];
let focusedResultIdx = -1;
let searchConfig = {};

const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

const RECENT_KEY = 'marquee-recent-searches';
function getRecents() { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; } }
function saveRecent(q) {
  let r = getRecents().filter((x) => x.toLowerCase() !== q.toLowerCase());
  r.unshift(q); r = r.slice(0, 5);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(r)); } catch {}
}
function renderRecents() {
  const items = getRecents();
  if (!items.length) { searchResults.classList.remove('open'); searchResults.innerHTML = ''; return; }
  searchResults.innerHTML = `
    <div class="search-result-group">
      <div class="search-result-group-label">Recent</div>
      <div class="search-recent-chips">
        ${items.map((r) => `<button class="search-recent-chip" data-q="${escapeHtml(r)}">${escapeHtml(r)}</button>`).join('')}
      </div>
    </div>`;
  searchResults.classList.add('open');
  searchResults.querySelectorAll('.search-recent-chip').forEach((btn) => {
    btn.addEventListener('click', () => { searchInput.value = btn.dataset.q; searchInput.dispatchEvent(new Event('input')); });
  });
}

document.addEventListener('marquee:config', (e) => { searchConfig = e.detail; });

searchInput?.addEventListener('focus', () => { if (!searchInput.value.trim()) renderRecents(); });
searchInput?.addEventListener('input', () => {
  const q = searchInput.value.trim();
  if (!q) { closeSearch(); renderRecents(); return; }
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => runSearch(q), 350);
});

async function runSearch(q) {
  searchResults.classList.add('open');
  searchResults.innerHTML = `<div class="search-spinner">Searching…</div>`;
  searchResultsData = [];
  focusedResultIdx = -1;

  // Plex/Jellyfin/ABS search would let a guest enumerate the whole library
  // on demand — hard-gated server-side (server/services/plex.js's
  // handleSearch, audiobookshelf.js's handleLibrarySearch), so skip calling
  // them at all rather than surface their 401s as broken results. Seerr
  // search is TMDB metadata, not a library listing, and stays open to guests.
  const isGuest = typeof window.__marqueeGuest === 'boolean' ? window.__marqueeGuest : true;
  const watchKeys = isGuest ? [] : enabledWatchServices(searchConfig).map((s) => s.key);
  const jobs = [];
  if (watchKeys.includes('plex')) jobs.push(searchPlex(q));
  if (watchKeys.includes('jellyfin')) jobs.push(searchJellyfin(q));
  if (watchKeys.includes('abs')) jobs.push(searchABS(q));

  const results = await Promise.allSettled(jobs);
  const groups = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    groups.push(...r.value);
  }

  if (searchConfig.services?.seerr?.enabled) {
    const seerrHits = await searchSeerr(q);
    if (seerrHits.length) groups.push({ label: 'Requested', items: seerrHits, type: 'seerr' });
  }

  if (isGuest && enabledWatchServices(searchConfig).length && !groups.length) {
    searchResults.innerHTML = `<div class="search-empty">Sign in to search your Plex/Jellyfin/audiobook library.</div>`;
    return;
  }

  if (!groups.length) {
    searchResults.innerHTML = `<div class="search-empty">No results for "${escapeHtml(q)}"</div>`;
    return;
  }

  groups.forEach((g) => g.items.forEach((item) => searchResultsData.push({ ...item, groupType: g.type })));

  searchResults.innerHTML = '';
  let globalIdx = 0;
  for (const group of groups) {
    const groupEl = document.createElement('div');
    groupEl.className = 'search-result-group';
    groupEl.innerHTML = `<div class="search-result-group-label">${group.label}</div>`;
    for (const item of group.items) {
      const idx = globalIdx++;
      const svcCls = group.type === 'seerr' ? '' : ` ${group.type}`;
      const a = document.createElement('a');
      a.className = 'search-result-item' + svcCls;
      a.href = item.href || '#';
      if (group.type !== 'seerr') a.rel = 'noopener'; else a.target = '_blank';
      a.dataset.idx = idx;
      if (item.appUrl) a.dataset.appUrl = item.appUrl;
      a.addEventListener('click', () => saveRecent(q));
      const thumbHtml = item.thumb
        ? `<img class="sri-thumb" src="${item.thumb}" alt="" loading="lazy" data-img-fallback="hide">`
        : `<div class="sri-thumb sri-thumb-empty"></div>`;
      a.innerHTML = `
        ${thumbHtml}
        <div class="sri-info">
          <div class="sri-title">${highlightMatch(item.title, q)}</div>
          ${item.meta ? `<div class="sri-meta">${escapeHtml(item.meta)}</div>` : ''}
        </div>
        <span class="sri-badge sri-badge-${group.type}">${group.label}</span>`;
      groupEl.appendChild(a);
    }
    searchResults.appendChild(groupEl);
  }
}


// Splits the RAW text on the query and escapes each piece, so a <mark> can never land
// inside an HTML entity (matching "amp" against an escaped "&amp;" used to break it).
function highlightMatch(text, q) {
  const raw = String(text ?? '');
  if (!q) return escapeHtml(raw);
  const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return raw.split(new RegExp(`(${safeQ})`, 'gi'))
    .map((part, i) => (i % 2 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part)))
    .join('');
}

async function searchPlex(q) {
  try {
    const mid = await getPlexMachineId();
    const base = searchConfig.services?.plex?.publicUrl;
    const [rMovieTv, rMusic] = await Promise.all([
      fetchT(`/api/plex/search?query=${encodeURIComponent(q)}&limit=30`),
      fetchT(`/api/plex/search?query=${encodeURIComponent(q)}&limit=30&type=10`),
    ]);
    const items = [];
    for (const r of [rMovieTv, rMusic]) {
      if (!r.ok) continue;
      items.push(...((await r.json()).MediaContainer?.Metadata ?? []));
    }
    const movies = [], tv = [], music = [];
    const seen = new Set();
    for (const item of items) {
      const isEpisode = item.type === 'episode';
      const isSeason = item.type === 'season';
      const displayTitle = isEpisode ? (item.grandparentTitle || item.title) : isSeason ? (item.parentTitle || item.grandparentTitle || item.title) : item.title;
      const resolvedType = isEpisode || isSeason ? 'show' : item.type;
      const fuzzy = fuzzyTitleMatch(displayTitle, q);
      if (!fuzzy.match) continue;
      const key = `${resolvedType}:${normStr(displayTitle)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const thumbPath = item.grandparentThumb || item.parentThumb || item.thumb;
      const thumb = thumbPath ? `/api/plex/thumb?path=${encodeURIComponent(thumbPath)}&width=64&height=96` : null;
      const ratingKey = item.type === 'track' ? item.parentRatingKey || item.ratingKey : item.ratingKey;
      const detailsKey = ratingKey ? `/library/metadata/${ratingKey}` : null;
      const href = base && mid && detailsKey ? `${base}/web/index.html#!/server/${mid}/details?key=${encodeURIComponent(detailsKey)}` : base ? `${base}/web` : '#';
      const appUrl = ratingKey && mid ? plexAppUrl(ratingKey, mid, plexMetadataType(item.type)) : null;
      const meta = item.year ? String(item.year) : undefined;
      const entry = { title: displayTitle, meta, thumb, href, appUrl };

      if (resolvedType === 'movie') movies.push(entry);
      else if (resolvedType === 'show') tv.push(entry);
      else if (['artist', 'album', 'track'].includes(resolvedType)) music.push(entry);
    }
    const groups = [];
    if (movies.length) groups.push({ label: 'Movies', items: movies.slice(0, 5), type: 'plex' });
    if (tv.length) groups.push({ label: 'TV Shows', items: tv.slice(0, 5), type: 'plex' });
    if (music.length) groups.push({ label: 'Music', items: music.slice(0, 5), type: 'music' });
    return groups;
  } catch { return []; }
}

async function searchJellyfin(q) {
  try {
    const base = searchConfig.services?.jellyfin?.publicUrl;
    const r = await fetchT(`/api/jellyfin/search?query=${encodeURIComponent(q)}&limit=20`);
    if (!r.ok) return [];
    const items = (await r.json())?.Items ?? [];
    const movies = [], tv = [];
    for (const item of items) {
      const fuzzy = fuzzyTitleMatch(item.Name, q);
      if (!fuzzy.match) continue;
      const thumb = item.Id ? `/api/jellyfin/image?id=${item.Id}&type=Primary` : null;
      const href = base && item.Id ? `${base}/web/index.html#!/details?id=${item.Id}` : base || '#';
      const entry = { title: item.Name, meta: item.ProductionYear ? String(item.ProductionYear) : undefined, thumb, href };
      if (item.Type === 'Series') tv.push(entry);
      else if (item.Type === 'Movie') movies.push(entry);
    }
    const groups = [];
    if (movies.length) groups.push({ label: 'Movies', items: movies.slice(0, 5), type: 'jellyfin' });
    if (tv.length) groups.push({ label: 'TV Shows', items: tv.slice(0, 5), type: 'jellyfin' });
    return groups;
  } catch { return []; }
}

async function searchABS(q) {
  try {
    const base = searchConfig.services?.abs?.publicUrl;
    const lr = await fetchT('/api/abs/libraries');
    if (!lr.ok) return [];
    const libs = (await lr.json()).libraries?.filter((l) => l.mediaType === 'book') ?? [];
    const results = [];
    for (const lib of libs.slice(0, 3)) {
      const r = await fetchT(`/api/abs/library/${lib.id}/search?q=${encodeURIComponent(q)}&limit=5`);
      if (!r.ok) continue;
      const data = await r.json();
      for (const match of data.book ?? []) {
        const item = match.libraryItem;
        if (!item) continue;
        results.push({
          title: item.media?.metadata?.title ?? item.id,
          meta: item.media?.metadata?.authorName ?? undefined,
          thumb: `/api/abs/cover/${item.id}?width=64`,
          href: base ? `${base}/item/${item.id}` : '#',
        });
      }
    }
    return results.length ? [{ label: 'Audiobooks', items: results.slice(0, 5), type: 'abs' }] : [];
  } catch { return []; }
}

async function searchSeerr(q) {
  try {
    const r = await fetchT(`/api/seerr/search?query=${encodeURIComponent(q)}`);
    if (!r.ok) return [];
    const results = (await r.json())?.results ?? [];
    return results
      .filter((item) => item.mediaType === 'movie' || item.mediaType === 'tv')
      .map((item) => ({ item, ...fuzzyTitleMatch(item.title || item.name, q) }))
      .filter((r) => r.match)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((r) => ({
        title: r.item.title || r.item.name,
        meta: (r.item.releaseDate || r.item.firstAirDate || '').slice(0, 4) || undefined,
        thumb: r.item.posterPath ? `https://image.tmdb.org/t/p/w92${r.item.posterPath}` : null,
        href: `https://www.themoviedb.org/${r.item.mediaType}/${r.item.id}?language=${navigator.language}`,
      }));
  } catch { return []; }
}

function closeSearch() {
  searchResults.classList.remove('open');
  searchResults.innerHTML = '';
  searchResultsData = [];
  focusedResultIdx = -1;
}

document.addEventListener('click', (e) => {
  if (!document.getElementById('search-wrap')?.contains(e.target)) closeSearch();
});

function isSearchOpen() { return searchResults?.classList.contains('open'); }

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
    e.preventDefault();
    searchInput?.focus();
    return;
  }
  if (e.key === 'Escape' && isSearchOpen()) { closeSearch(); searchInput?.blur(); return; }
  if (isSearchOpen() && searchResultsData.length) {
    if (e.key === 'ArrowDown') { e.preventDefault(); focusedResultIdx = Math.min(focusedResultIdx + 1, searchResultsData.length - 1); updateFocusedResult(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); focusedResultIdx = Math.max(focusedResultIdx - 1, -1); updateFocusedResult(); return; }
    if (e.key === 'Enter' && focusedResultIdx >= 0) {
      const item = searchResultsData[focusedResultIdx];
      if (item?.href) {
        saveRecent(searchInput.value.trim());
        const svcId = item.groupType === 'music' ? 'music' : item.groupType === 'seerr' ? null : item.groupType;
        if (svcId) openLink(svcId, item.href, null, item.appUrl || null);
        else window.open(item.href, '_blank', 'noopener');
      }
    }
  }
});

function updateFocusedResult() {
  document.querySelectorAll('.search-result-item').forEach((el, i) => el.classList.toggle('focused', i === focusedResultIdx));
}
