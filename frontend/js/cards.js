// Only service kinds with an actual consuming feature in this lean-core
// release get a card. Tautulli/TMDB are configurable (see admin settings)
// but have no dashboard UI yet — stats/heatmap features are deferred, see
// README roadmap — so they're intentionally left out of this table.
const SERVICE_META = {
  plex: { label: 'Plex', kind: 'watch', icon: 'play-circle-outline', color: '#e5a00d', description: 'Watch movies & TV' },
  jellyfin: { label: 'Jellyfin', kind: 'watch', icon: 'jellyfish-outline', color: '#29abe2', description: 'Watch movies & TV' },
  abs: { label: 'AudioBookShelf', kind: 'watch', icon: 'book-music-outline', color: '#cb86ff', description: 'Listen to audiobooks' },
  seerr: { label: 'Requests', kind: 'requests', icon: 'movie-search-outline', color: '#14b8a6', description: 'Request movies, TV & audiobooks' },
};

function buildCard(key, svc) {
  const meta = SERVICE_META[key];
  const card = document.createElement('div');
  card.className = 'service-card' + (meta.kind === 'watch' ? ' watch-card' : '');
  card.dataset.service = key;

  const openLink = svc.publicUrl
    ? `<a href="${svc.publicUrl}" target="_blank" rel="noopener"><button class="secondary">Open &#8599;</button></a>`
    : '';

  // Watch-type cards get a per-service ambient waveform canvas (activity
  // wash, see watch-card-wave.js) and a stream-count badge (see
  // nowplaying.js's setStreams()) alongside the health dot.
  const waveCanvas = meta.kind === 'watch' ? `<canvas class="watch-wave" id="wave-${key}" aria-hidden="true"></canvas>` : '';
  const badge = meta.kind === 'watch' ? `<span class="stream-badge" id="badge-${key}"></span>` : '';
  const rgb = hexToRgb(meta.color);
  const iconWrap = meta.icon
    ? `<div class="custom-link-icon-wrap" style="${rgb ? `background:rgba(${rgb},0.14);color:${meta.color}` : ''}"><i class="mdi mdi-${meta.icon}" aria-hidden="true"></i></div>`
    : '';

  card.innerHTML = `
    ${waveCanvas}
    <span class="status-dot" id="status-${key}"></span>
    <div class="card-head">
      ${iconWrap}
      <h3>${meta.label}</h3>
      ${badge}
    </div>
    <p class="card-desc">${meta.description || ''}</p>
    <p id="detail-${key}" class="card-status">Checking status…</p>
    <div class="card-actions">${openLink}</div>
  `;

  if (meta.kind === 'requests') {
    const tabs = document.createElement('div');
    tabs.className = 'carousel-tabs';
    tabs.id = 'req-tabs';
    tabs.innerHTML = `
      <button class="carousel-tab active req-tab" data-filter="all">All</button>
      <button class="carousel-tab req-tab" data-filter="requested">Requested</button>
      <button class="carousel-tab req-tab" data-filter="queued">Queued</button>
      <button class="carousel-tab req-tab" data-filter="available">Available</button>
    `;
    card.appendChild(tabs);
    const list = document.createElement('div');
    list.id = 'requests-list';
    card.appendChild(list);
  }

  return card;
}

// escapeHtml() comes from js/util.js.

function hexToRgb(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  return m ? `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}` : null;
}

function buildCustomCard(link) {
  const card = document.createElement('div');
  card.className = 'service-card custom-link-card';
  card.dataset.customLink = link.id;
  const rgb = hexToRgb(link.color);
  const iconWrap = link.icon
    ? `<div class="custom-link-icon-wrap" style="${rgb ? `background:rgba(${rgb},0.14);color:${escapeHtml(link.color)}` : ''}"><i class="mdi mdi-${escapeHtml(link.icon)}" aria-hidden="true"></i></div>`
    : '';
  card.innerHTML = `
    <div class="card-head">
      ${iconWrap}
      <h3>${escapeHtml(link.label)}</h3>
    </div>
    <div class="card-actions"><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener"><button class="secondary">Open &#8599;</button></a></div>
  `;
  return card;
}

// Split into two independent sections — Request (Seerr + any admin-added
// custom link cards, since those are structurally the same "go do a thing
// elsewhere" card as Seerr's) and Watch & Listen (Plex/Jellyfin/ABS) —
// rather than one mixed grid. Each section is hidden entirely (not left as sparse/empty)
// if nothing of its kind is configured, and each grid sizes itself off
// however many cards it actually has (see .cards-grid's auto-fit in
// cards.css) rather than reserving space for a fixed layout.
function buildCardsGrid(config) {
  const requestsRoot = document.getElementById('requests-cards-root');
  const requestsWrap = document.getElementById('requests-section-wrap');
  const watchRoot = document.getElementById('watch-cards-root');
  const watchWrap = document.getElementById('watch-section-wrap');
  if (!requestsRoot || !watchRoot) return;
  requestsRoot.innerHTML = '';
  watchRoot.innerHTML = '';

  const entries = Object.entries(config.services || {}).filter(
    ([key, svc]) => svc.enabled && SERVICE_META[key]
  );
  const customCards = (config.customLinks || []).filter((l) => l.placement === 'card');

  const watchEntries = entries.filter(([key]) => SERVICE_META[key].kind === 'watch');
  const requestEntries = entries.filter(([key]) => SERVICE_META[key].kind === 'requests');

  for (const [key, svc] of watchEntries) watchRoot.appendChild(buildCard(key, svc));
  for (const [key, svc] of requestEntries) requestsRoot.appendChild(buildCard(key, svc));
  for (const link of customCards) requestsRoot.appendChild(buildCustomCard(link));

  watchWrap.hidden = watchEntries.length === 0;
  requestsWrap.hidden = requestEntries.length === 0 && customCards.length === 0;

  // Both empty is the true "nothing configured yet" state — surface the
  // admin-settings pointer somewhere rather than just showing nothing.
  if (watchWrap.hidden && requestsWrap.hidden) {
    requestsWrap.hidden = false;
    requestsRoot.innerHTML = '<div class="empty-state">No services configured yet. Visit <a href="/admin">admin settings</a> to add some.</div>';
  }
}

document.addEventListener('marquee:config', (e) => buildCardsGrid(e.detail));
