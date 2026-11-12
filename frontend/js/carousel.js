// RECENTLY ADDED — movies/tv/music come from whichever of Plex/Jellyfin is
// the resolved preferred server (frontend/js/watch-services.js); books come
// from ABS. A category tab is simply absent if nothing backs it.
let carouselConfig = {};
let activeCategory = 'movies';
const carouselData = { movies: null, tv: null, music: null, books: null };
let plexSectionsCache = null;

const CATEGORY_LABELS = { movies: 'Movies', tv: 'TV Shows', music: 'Music', books: 'Audiobooks' };
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

document.addEventListener('marquee:config', (e) => {
  carouselConfig = e.detail;
  buildCarouselTabs();
});

// Pushed on a Plex library.new webhook or a Jellyfin LibraryChanged WS
// message (see server/lib/push.js) — invalidate every category's cache so
// the next tab switch re-fetches, and refresh whichever tab is visible
// right now (cheap: only one category actually re-fetches immediately).
document.addEventListener('marquee:library-changed', () => {
  Object.keys(carouselData).forEach((k) => { carouselData[k] = null; });
  plexSectionsCache = null;
  if (activeCategory) loadCarouselCategory(activeCategory);
});

function categoryBackedByService(cat) {
  if (cat === 'books') return carouselConfig.services?.abs?.enabled ? 'abs' : null;
  return resolvePreferredServer(carouselConfig);
}

function buildCarouselTabs() {
  const tabsEl = document.getElementById('carousel-tabs');
  const sectionEl = document.getElementById('carousel-section');
  if (!tabsEl || !sectionEl) return;
  const cats = ['movies', 'tv', 'music', 'books'].filter((c) => categoryBackedByService(c));
  if (!cats.length) { sectionEl.hidden = true; return; }
  sectionEl.hidden = false;
  tabsEl.innerHTML = cats.map((c, i) => `<button class="carousel-tab${i === 0 ? ' active' : ''}" data-cat="${c}">${CATEGORY_LABELS[c]}</button>`).join('');
  tabsEl.querySelectorAll('.carousel-tab').forEach((btn) => btn.addEventListener('click', () => switchCarousel(btn.dataset.cat)));
  switchCarousel(cats[0]);
}

function switchCarousel(cat) {
  activeCategory = cat;
  document.querySelectorAll('#carousel-tabs .carousel-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.cat === cat));
  loadCarouselCategory(cat);
}

async function loadCarouselCategory(cat) {
  const track = document.getElementById('carousel-track');
  if (!track) return;
  if (carouselData[cat] === null) {
    track.innerHTML = `<div class="carousel-loading">Loading…</div>`;
    carouselData[cat] = await fetchCategory(cat);
  }
  if (activeCategory !== cat) return;
  renderCarouselTrack(carouselData[cat] || []);
}

function renderCarouselTrack(items) {
  const track = document.getElementById('carousel-track');
  if (!track) return;
  if (!items.length) { track.innerHTML = `<div class="carousel-empty">Nothing recently added</div>`; return; }
  track.innerHTML = items.map((item) => `
    <a class="carousel-item${item.svcCls ? ` ${item.svcCls}` : ''}" href="${item.href || '#'}" rel="noopener"${item.appUrl ? ` data-app-url="${item.appUrl}"` : ''}>
      ${item.thumb ? `<img src="${item.thumb}" alt="" loading="lazy" data-img-fallback="hide">` : '<div class="carousel-item-empty"></div>'}
      <div class="carousel-item-title">${escapeHtmlCarousel(item.title)}</div>
    </a>`).join('');
}

function escapeHtmlCarousel(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function fetchCategory(cat) {
  const backend = categoryBackedByService(cat);
  if (!backend) return [];
  if (backend === 'abs') return fetchAbsRecent();
  if (backend === 'plex') return fetchPlexRecent(cat);
  if (backend === 'jellyfin') return fetchJellyfinRecent(cat);
  return [];
}

const PLEX_SECTION_TYPE = { movies: 'movie', tv: 'show', music: 'artist' };

async function fetchPlexRecent(cat) {
  try {
    const mid = await getPlexMachineId();
    const base = carouselConfig.services?.plex?.publicUrl;
    if (!plexSectionsCache) {
      const r = await fetchT('/api/plex/sections');
      plexSectionsCache = r.ok ? (await r.json())?.MediaContainer?.Directory ?? [] : [];
    }
    const wantType = PLEX_SECTION_TYPE[cat];
    const cutoff = Date.now() - TWO_WEEKS_MS;
    const excluded = new Set((carouselConfig.excludedPlexSections || []).map(String));
    const items = [];
    for (const section of plexSectionsCache.filter((s) => s.type === wantType && !excluded.has(String(section.key)))) {
      const r = await fetchT(`/api/plex/recentlyAdded?sectionKey=${section.key}&size=30`);
      if (!r.ok) continue;
      const metadata = (await r.json())?.MediaContainer?.Metadata ?? [];
      for (const m of metadata) {
        if (m.addedAt && m.addedAt * 1000 < cutoff) continue;
        const isEpisode = m.type === 'episode';
        const title = isEpisode ? m.grandparentTitle || m.title : m.title;
        const thumbPath = m.grandparentThumb || m.thumb;
        const ratingKey = isEpisode ? m.grandparentRatingKey : m.ratingKey;
        const detailsKey = ratingKey ? `/library/metadata/${ratingKey}` : null;
        items.push({
          title,
          thumb: thumbPath ? `/api/plex/thumb?path=${encodeURIComponent(thumbPath)}&width=120&height=180` : null,
          href: base && mid && detailsKey ? `${base}/web/index.html#!/server/${mid}/details?key=${encodeURIComponent(detailsKey)}` : base || '#',
          appUrl: ratingKey && mid ? plexAppUrl(ratingKey, mid, plexMetadataType(m.type)) : null,
          svcCls: cat === 'music' ? 'music' : 'plex',
          addedAt: m.addedAt || 0,
        });
      }
    }
    const seen = new Set();
    return items
      .filter((i) => (seen.has(i.title) ? false : (seen.add(i.title), true)))
      .sort((a, b) => b.addedAt - a.addedAt)
      .slice(0, 30);
  } catch { return []; }
}

const JELLYFIN_ITEM_TYPE = { movies: 'Movie', tv: 'Series', music: 'MusicAlbum' };

async function fetchJellyfinRecent(cat) {
  try {
    const base = carouselConfig.services?.jellyfin?.publicUrl;
    const r = await fetchT(`/api/jellyfin/latest?includeItemTypes=${JELLYFIN_ITEM_TYPE[cat]}&limit=30`);
    if (!r.ok) return [];
    const items = await r.json();
    return (Array.isArray(items) ? items : []).map((item) => ({
      title: item.Name,
      thumb: item.Id && !item._locked ? `/api/jellyfin/image?id=${item.Id}&type=Primary` : null,
      href: base && item.Id && !item._locked ? `${base}/web/index.html#!/details?id=${item.Id}` : base || '#',
      svcCls: 'jellyfin',
    }));
  } catch { return []; }
}

async function fetchAbsRecent() {
  try {
    const base = carouselConfig.services?.abs?.publicUrl;
    const lr = await fetchT('/api/abs/libraries');
    if (!lr.ok) return [];
    const libs = (await lr.json()).libraries?.filter((l) => l.mediaType === 'book') ?? [];
    const items = [];
    for (const lib of libs.slice(0, 3)) {
      const r = await fetchT(`/api/abs/library/${lib.id}/items?limit=30`);
      if (!r.ok) continue;
      const data = await r.json();
      for (const item of data.results ?? []) {
        items.push({
          title: item.media?.metadata?.title ?? item.id,
          thumb: `/api/abs/cover/${item.id}?width=120`,
          href: base ? `${base}/item/${item.id}` : '#',
          svcCls: 'abs',
        });
      }
    }
    return items.slice(0, 30);
  } catch { return []; }
}

document.getElementById('carousel-arrow-left')?.addEventListener('click', () => scrollCarousel(-1));
document.getElementById('carousel-arrow-right')?.addEventListener('click', () => scrollCarousel(1));
function scrollCarousel(dir) {
  document.getElementById('carousel-track')?.scrollBy({ left: dir * 300, behavior: 'smooth' });
}
