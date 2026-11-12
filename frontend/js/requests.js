// SEERR REQUESTS — request status cards with tab filters, "available" items
// deep-linked to the resolved preferred media server, and an optional
// "Coming Soon" strip of upcoming digital releases (gated on
// site.digitalReleaseDates).
let requestsConfig = {};
let requestCache = [];
let activeReqFilter = 'all';

// escapeHtml() comes from js/util.js.

// Overseerr/Jellyseerr split availability (media.status) from request
// workflow (status) across two separate fields — worth checking against your
// instance's version if a request never shows as "Available" once it lands.
function reqDisplayStatus(item) {
  if (item.media?.status === 5) return 'available';
  if (item.media?.status === 4) return 'partial';
  if (item.status === 3) return 'declined';
  if (item.status === 2) return 'queued';
  return 'requested';
}

// Guests get requests with redacted ids (strings, not TMDB numbers): nothing to look up.
const isRealTmdbId = (id) => Number.isInteger(id) && id > 0;

async function fetchRequestDetail(item) {
  const mediaType = item.media?.mediaType;
  const tmdbId = item.media?.tmdbId;
  if (!mediaType || !isRealTmdbId(tmdbId)) return null;
  try {
    const r = await fetchT(`/api/seerr/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// "Available" items get matched by title against the resolved preferred
// media server (frontend/js/watch-services.js) so the card can deep-link
// straight to the real item instead of just a TMDB page.
async function resolveAvailableLink(title, year) {
  const server = resolvePreferredServer(requestsConfig);
  if (!server) return null;
  try {
    if (server === 'plex') {
      const mid = await getPlexMachineId();
      const base = requestsConfig.services?.plex?.publicUrl;
      const r = await fetchT(`/api/plex/search?query=${encodeURIComponent(title)}&limit=10`);
      if (!r.ok) return null;
      const items = (await r.json())?.MediaContainer?.Metadata ?? [];
      const hit = items.find((m) => {
        const fuzzy = fuzzyTitleMatch(m.title, title);
        return fuzzy.match && (!year || !m.year || Math.abs(m.year - year) <= 1);
      });
      if (!hit) return null;
      const detailsKey = `/library/metadata/${hit.ratingKey}`;
      return {
        href: base && mid ? `${base}/web/index.html#!/server/${mid}/details?key=${encodeURIComponent(detailsKey)}` : base || null,
        appUrl: mid ? plexAppUrl(hit.ratingKey, mid, plexMetadataType(hit.type)) : null,
        svcCls: 'plex',
      };
    }
    if (server === 'jellyfin') {
      const base = requestsConfig.services?.jellyfin?.publicUrl;
      const r = await fetchT(`/api/jellyfin/search?query=${encodeURIComponent(title)}&limit=10`);
      if (!r.ok) return null;
      const items = (await r.json())?.Items ?? [];
      const hit = items.find((m) => fuzzyTitleMatch(m.Name, title).match);
      if (!hit) return null;
      return { href: base ? `${base}/web/index.html#!/details?id=${hit.Id}` : null, appUrl: null, svcCls: 'jellyfin' };
    }
  } catch {}
  return null;
}

function renderRequestItem(item) {
  const title = escapeHtml(item.title || `Request #${item.id}`);
  const status = item.displayStatus;
  const poster = item.posterPath ? `<img class="req-poster" src="https://image.tmdb.org/t/p/w154${item.posterPath}" alt="" loading="lazy">` : '';
  const link = item.availableHref
    ? `<a class="request-item${item.svcCls ? ` ${item.svcCls}` : ''}" href="${item.availableHref}" rel="noopener"${item.availableAppUrl ? ` data-app-url="${item.availableAppUrl}"` : ''}>`
    : `<div class="request-item">`;
  const closeTag = item.availableHref ? '</a>' : '</div>';
  return `${link}${poster}<span>${title}</span><span class="status-badge ${status}">${status}</span>${closeTag}`;
}

function updateReqTabs() {
  document.querySelectorAll('#req-tabs .req-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.filter === activeReqFilter));
}

function renderRequestList() {
  const list = document.getElementById('requests-list');
  if (!list) return;
  const filtered = activeReqFilter === 'all' ? requestCache : requestCache.filter((i) => i.displayStatus === activeReqFilter);
  list.innerHTML = filtered.length ? filtered.map(renderRequestItem).join('') : '<p class="empty-state">No requests.</p>';
}

function filterReqTab(filter) {
  activeReqFilter = filter;
  updateReqTabs();
  renderRequestList();
}

// The Seerr card's dot reflects whether the server could actually reach Seerr just now.
function setSeerrDot(up) {
  const dot = document.getElementById('status-seerr');
  dot?.classList.toggle('online', up);
  dot?.classList.toggle('offline', !up);
  const detail = document.getElementById('detail-seerr');
  if (detail) detail.textContent = up ? 'Online' : 'Unavailable';
}

async function loadRequests() {
  const list = document.getElementById('requests-list');
  if (!list) return;
  await window.marqueeAuthReady; // so the list matches this visitor's access level

  try {
    const res = await fetchT('/api/seerr/requests?take=150&sort=added&filter=all');
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    const raw = (data?.results || []).filter((r) => !r.is4k);
    const seenTmdb = new Set();
    const deduped = raw.filter((r) => (seenTmdb.has(r.media?.tmdbId) ? false : (seenTmdb.add(r.media?.tmdbId), true)));

    const items = await Promise.all(
      deduped.slice(0, 60).map(async (r) => {
        const detail = await fetchRequestDetail(r);
        const locked = !isRealTmdbId(r.media?.tmdbId);
        const title = detail?.title || detail?.name || (locked ? 'Hidden Title' : `Request #${r.id}`);
        const year = (detail?.releaseDate || detail?.firstAirDate || '').slice(0, 4);
        const displayStatus = reqDisplayStatus(r);
        let availableHref = null, availableAppUrl = null, svcCls = null;
        if (displayStatus === 'available' && !locked) {
          const match = await resolveAvailableLink(title, year ? parseInt(year, 10) : null);
          if (match) { availableHref = match.href; availableAppUrl = match.appUrl; svcCls = match.svcCls; }
        }
        return { id: r.id, locked, title, posterPath: detail?.posterPath, displayStatus, availableHref, availableAppUrl, svcCls, tmdbId: r.media?.tmdbId, mediaType: r.media?.mediaType, releaseDate: detail?.releaseDate, firstAirDate: detail?.firstAirDate };
      })
    );

    requestCache = items;
    setSeerrDot(true);
    renderRequestList();
    if (requestsConfig.digitalReleaseDates) buildUpcomingStrip();
  } catch {
    setSeerrDot(false);
    list.innerHTML = '<p class="empty-state">Unable to load requests.</p>';
  }
}

// ── Coming Soon strip ───────────────────────────────────────────────────
async function buildUpcomingStrip() {
  const wrap = document.getElementById('upcoming-wrap');
  const strip = document.getElementById('upcoming-strip');
  if (!wrap || !strip) return;

  // Hidden (guest) requests are left out: a row of identical "Hidden Title" chips says nothing.
  const upcoming = requestCache.filter((i) => i.displayStatus !== 'available' && i.displayStatus !== 'partial' && i.mediaType === 'movie' && !i.locked);
  if (!upcoming.length) { wrap.hidden = true; return; }

  let digitalDates = { byId: {}, byTitle: {} };
  try {
    const r = await fetchT('/api/digital-dates');
    if (r.ok) digitalDates = await r.json();
  } catch {}

  // Three kinds of entry:
  //   confirmed — a known digital/physical date: shown from 60 days out until 2 days after;
  //   estimate  — only a theatrical date: digital is estimated at theatrical + 90 days,
  //               shown once the film is actually in theatres, dropped after 6 months;
  //   requested — no date at all yet (freshly requested, or hidden from guests): shown
  //               as "Requested", sorted after everything dated.
  const DAY = 86400000;
  const now = Date.now();
  const entries = upcoming
    .map((item) => {
      const confirmed = digitalDates.byId[item.tmdbId] || digitalDates.byTitle[normStr(item.title || '')];
      if (confirmed) {
        const ts = new Date(confirmed).getTime();
        if (!Number.isFinite(ts) || ts > now + 60 * DAY || ts < now - 2 * DAY) return null;
        return { title: item.title, ts, kind: 'confirmed' };
      }
      const theatrical = item.releaseDate ? new Date(item.releaseDate).getTime() : NaN;
      if (Number.isFinite(theatrical)) {
        if (theatrical > now || now - theatrical > 180 * DAY) return null;
        return { title: item.title, ts: theatrical + 90 * DAY, kind: 'estimate' };
      }
      return { title: item.title, ts: Infinity, kind: 'requested' };
    })
    .filter(Boolean)
    .sort((a, b) => a.ts - b.ts)
    .slice(0, 15);

  if (!entries.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  const fmt = (ts) => new Date(ts).toLocaleDateString(navigator.language, { month: 'short', day: 'numeric' });
  const label = (e) => {
    if (e.kind === 'requested') return 'Requested';
    if (e.ts < now) return 'Soon'; // date has passed but it isn't in the library yet
    return e.kind === 'estimate' ? `${fmt(e.ts)} (est.)` : fmt(e.ts);
  };
  strip.innerHTML = entries.map((e) => `
    <div class="upcoming-item${e.kind === 'requested' ? ' upcoming-requested' : ''}">
      <div class="upcoming-title">${escapeHtml(e.title || 'Untitled')}</div>
      <div class="upcoming-date">${label(e)}</div>
    </div>`).join('');
}

document.addEventListener('marquee:config', (e) => {
  requestsConfig = e.detail;
  if (e.detail.services?.seerr?.enabled) loadRequests();
  document.querySelectorAll('#req-tabs .req-tab').forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => filterReqTab(btn.dataset.filter));
  });
});

// Pushed by the Seerr webhook (a new request, or a status change like
// Requested -> Available) and by our own POST /api/seerr/request succeeding
// — see frontend/js/service-status.js's connectPushStream.
// Signing in or out changes what the list may show.
document.addEventListener('marquee:auth-changed', (e) => {
  if (!e.detail?.initial && requestsConfig.services?.seerr?.enabled) loadRequests();
});

document.addEventListener('marquee:requests-changed', () => {
  if (requestsConfig.services?.seerr?.enabled) loadRequests();
});

// Lightweight refresh so a request moving from Requested -> Queued ->
// Available shows up without a full page reload. Only while the tab is
// actually visible, to avoid polling Seerr from backgrounded/inactive tabs.
setInterval(() => {
  if (document.visibilityState === 'visible' && requestsConfig.services?.seerr?.enabled) loadRequests();
}, 60000);
