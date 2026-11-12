// NOW PLAYING — floating ticker bar showing active Plex/Jellyfin/ABS
// sessions, with a rotating multi-entry ticker, an expandable panel, and a
// per-stream detail popup. allStreams/svcMeta are built from whichever watch
// services are actually configured (frontend/js/watch-services.js), so this degrades
// cleanly from 0 to 3 services with no code path assuming a fixed count.

let nowPlayingDismissed = false;
let npTickerTimer = null;
let npUpdateDebounce = null;
let npEntries = [];
let npCurrentIdx = 0;
let npHovered = false;
let npEntriesSig = '';
let npExpanded = false;
let activeDetailStream = null;
let npDetailTickInterval = null;
let npBarProgressTick = null;

const allStreams = {};
let svcMeta = {};
let npConfig = {};
let plexMachineId = null;
let _plexMachineIdPromise = null;

document.addEventListener('marquee:config', (e) => {
  npConfig = e.detail;
  for (const svc of enabledWatchServices(npConfig)) {
    allStreams[svc.key] = allStreams[svc.key] || [];
    svcMeta[svc.key] = { name: svc.label, color: svc.color };
  }
  // /api/plex/identity is hard-gated for guests (server/services/plex.js) —
  // deep links just fall back to the base server URL without a machineId
  // (every caller already handles mid being null), so skip the doomed fetch
  // rather than let it 401. Re-fires on sign-in via marquee:auth-changed below.
  if (npConfig.services?.plex?.enabled && window.__marqueeGuest !== true) getPlexMachineId();
});

document.addEventListener('marquee:auth-changed', (e) => {
  if (e.detail?.authenticated && npConfig.services?.plex?.enabled && !plexMachineId) getPlexMachineId();
});

// Promise-cached so nowplaying.js and search.js (both need it for Plex deep
// links) share one fetch instead of racing/duplicating it.
// Signed-in visitors only (the route is gated). A guest gets null without a request, and
// isn't cached, so signing in later still resolves it.
function getPlexMachineId() {
  if (plexMachineId) return Promise.resolve(plexMachineId);
  if (_plexMachineIdPromise) return _plexMachineIdPromise;
  _plexMachineIdPromise = window.marqueeAuthReady
    .then(() => (window.__marqueeGuest === true ? null : fetch('/api/plex/identity')))
    .then((res) => (res?.ok ? res.json() : null))
    .then((data) => { plexMachineId = data?.MediaContainer?.machineIdentifier || null; return plexMachineId; })
    .catch(() => null)
    .finally(() => { _plexMachineIdPromise = null; });
  return _plexMachineIdPromise;
}

function mediaIconHTML(mediaType, color) {
  if (mediaType === 'music') {
    return `<span class="np-eq" style="color:${color}"><span></span><span></span><span></span><span></span></span>`;
  } else if (mediaType === 'audiobook') {
    return `<span class="np-book" style="color:${color}"><i class="np-book-glyph">&#128214;</i></span>`;
  } else if (mediaType === 'show') {
    return `<span class="np-tv" style="color:${color}"><span></span><span></span></span>`;
  }
  return `<span class="np-play" style="color:${color}"><span></span><span></span><span></span></span>`;
}

function scaledMediaIconHTML(mediaType, color, boxW, boxH) {
  const scale = (Math.min(boxW / 20, boxH / 26) * 0.85).toFixed(2);
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:100%;height:100%;overflow:hidden;"><span style="display:inline-flex;transform:scale(${scale});transform-origin:center;">${mediaIconHTML(mediaType, color)}</span></span>`;
}

function addDetailPosterBadge(entry) {
  const outer = document.getElementById('np-detail-poster-outer');
  if (!outer || outer.querySelector('.np-detail-media-badge')) return;
  const badge = document.createElement('span');
  badge.className = 'np-detail-media-badge';
  badge.innerHTML = scaledMediaIconHTML(entry.mediaType, `rgb(${streamAccentRGB(entry.svcId, entry.mediaType)})`, 16, 16);
  outer.appendChild(badge);
}

function npScrollDuration(overflowPx, isLoop) {
  const base = isLoop ? 9 : 6, basePx = isLoop ? 160 : 120;
  const min = isLoop ? 6 : 4, max = isLoop ? 16 : 11;
  return Math.max(min, Math.min(max, base * (overflowPx / basePx))).toFixed(2) + 's';
}

// Current position of a stream: the last reported offset plus the time since that report
// arrived (while playing). Computed on every paint instead of adding 1s per tick, so a
// fresh server update never makes the bar jump backwards.
function liveViewOffset(e) {
  const base = e?.viewOffset || 0;
  if (!e || e.state !== 'playing' || !e._rx) return base;
  const live = base + (Date.now() - e._rx);
  return e.duration ? Math.min(e.duration, live) : live;
}

function updateNpProgressSliver(entry) {
  const fill = document.getElementById('np-progress-fill');
  if (!fill) return;
  const hasProgress = entry && entry.duration > 0 && entry.viewOffset != null;
  fill.style.width = hasProgress ? Math.min(100, (liveViewOffset(entry) / entry.duration) * 100).toFixed(2) + '%' : '0%';
  if (entry) fill.style.setProperty('--np-progress-rgb', streamAccentRGB(entry.svcId, entry.mediaType));
}

function startNpBarProgressTick() {
  if (npBarProgressTick) return;
  npBarProgressTick = setInterval(() => {
    const e = npEntries[npCurrentIdx];
    if (!e || e.state !== 'playing' || !e.duration) return;
    updateNpProgressSliver(e);
  }, 1000);
}

document.addEventListener('DOMContentLoaded', () => {
  const b = document.getElementById('now-playing-bar');
  if (b) {
    b.addEventListener('mouseenter', () => {
      if (npExpanded) return;
      npHovered = true;
      b.querySelectorAll('.np-ticker-inner.np-scroll, .np-ticker-inner.np-scroll-loop').forEach((el) => { el.style.animationPlayState = 'paused'; });
    });
    b.addEventListener('mouseleave', () => {
      if (npExpanded) return;
      npHovered = false;
      b.querySelectorAll('.np-ticker-inner').forEach((el) => { el.style.animationPlayState = ''; });
    });
  }
  try {
    if (localStorage.getItem('marquee-np-dismissed') === '1') {
      nowPlayingDismissed = true;
      document.getElementById('np-revive-btn')?.classList.add('visible');
    }
  } catch {}
  const anonBtn = document.getElementById('np-anon-btn');
  if (anonBtn) {
    anonBtn.hidden = !anonToggleAvailable();
    anonBtn.classList.toggle('active', isAnonMode());
    anonBtn.addEventListener('click', () => {
      const nowOn = toggleAnonMode();
      anonBtn.classList.toggle('active', nowOn);
    });
  }
  initNpDrag();
});

function initNpDrag() {
  const bar = document.getElementById('now-playing-bar');
  const handle = bar && bar.querySelector('.np-drag-handle');
  if (!bar || !handle) return;
  let dragging = false, ox = 0, oy = 0;

  function startDrag(cx, cy) {
    dragging = true;
    const r = bar.getBoundingClientRect();
    ox = cx - r.left;
    oy = cy - r.top;
    bar.style.transition = 'opacity 0.4s';
  }
  function moveDrag(cx, cy) {
    if (!dragging) return;
    const topBuffer = 8;
    const x = Math.max(0, Math.min(window.innerWidth - bar.offsetWidth, cx - ox));
    const y = Math.max(topBuffer, Math.min(window.innerHeight - bar.offsetHeight, cy - oy));
    bar.style.left = x + 'px';
    bar.style.top = y + 'px';
    bar.style.bottom = 'auto';
    bar.classList.add('np-dragged');
  }
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    bar.style.transition = 'opacity 0.4s, transform 0.4s';
    try { localStorage.setItem('marquee-np-pos', JSON.stringify({ x: bar.style.left, y: bar.style.top })); } catch {}
    npHovered = false;
    bar.querySelectorAll('.np-ticker-inner').forEach((el) => { el.style.animationPlayState = ''; });
  }

  handle.addEventListener('mousedown', (e) => { e.preventDefault(); startDrag(e.clientX, e.clientY); });
  document.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
  document.addEventListener('mouseup', () => endDrag());
  handle.addEventListener('touchstart', (e) => startDrag(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  document.addEventListener('touchmove', (e) => { if (dragging) { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY); } }, { passive: false });
  document.addEventListener('touchend', () => endDrag());

  try {
    const s = JSON.parse(localStorage.getItem('marquee-np-pos') || 'null');
    if (s && s.x && s.y) {
      bar.style.left = s.x;
      bar.style.top = s.y;
      bar.style.bottom = 'auto';
      bar.classList.add('np-dragged');
    }
  } catch {}
}

document.addEventListener('marquee:anon-changed', () => {
  const inner = document.querySelector('#np-ticker .np-ticker-inner');
  if (inner && npEntries.length > 0) inner.innerHTML = entryHTML(npEntries[npCurrentIdx]);
  if (npExpanded) renderNpExpanded(npEntries);
});

function setStreams(id, count, streams) {
  const badge = document.getElementById('badge-' + id);
  allStreams[id] = streams ?? [];
  if (badge) {
    if (count) { badge.textContent = count; badge.classList.add('visible'); }
    else { badge.textContent = ''; badge.classList.remove('visible'); }
  }
  updateNowPlayingBar();
}

// ── Ticker entry rendering ──────────────────────────────────────────
function entryHTML(e, includeClient = false) {
  const meta = svcMeta[e.svcId] || { name: e.svcId, color: 'var(--text)' };
  const isAudio = e.mediaType === 'music' || e.mediaType === 'audiobook';
  const verb = isAudio ? 'listening to' : 'watching';
  const user = escapeHtml(maskedUser(e.user || 'Someone'));
  const title = escapeHtml(e.title || 'Unknown');
  const client = (includeClient && e.client) ? ` <span class="np-entry-via">via</span> <span class="np-entry-client">${escapeHtml(e.client)}</span>` : '';
  if (includeClient) {
    return `<span class="np-entry"><span class="np-entry-svc" style="color:${meta.color}">${meta.name}</span>&ensp;<strong>${user}</strong> is ${verb} <em>${title}</em>${client}</span>`;
  }
  return `<span class="np-entry"><span class="np-entry-svc" style="color:${meta.color}">${meta.name}</span>&ensp;<strong>${user}</strong> is ${verb} — <em>${title}</em></span>`;
}

function showNpEntry(idx) {
  const ticker = document.getElementById('np-ticker');
  const thumb = document.getElementById('np-thumb');
  const iconEl = document.getElementById('np-icon');
  const e = npEntries[idx];
  if (!ticker || !e) return;

  const prevSlides = [...ticker.querySelectorAll('.np-ticker-slide:not(.np-exit)')];
  const transitioning = prevSlides.length > 0;
  const targetThumbSrc = e.thumb ? new URL(e.thumb, window.location.href).href : '';
  const sameThumb = e.thumb && thumb && thumb.src === targetThumbSrc && thumb.style.display !== 'none';

  prevSlides.forEach((prev) => {
    prev.classList.add('np-exit');
    setTimeout(() => prev.remove(), 300);
  });

  const slide = document.createElement('div');
  slide.className = 'np-ticker-slide';
  const inner = document.createElement('div');
  inner.className = 'np-ticker-inner';
  inner.innerHTML = entryHTML(e);
  slide.appendChild(inner);
  ticker.appendChild(slide);

  requestAnimationFrame(() => {
    const overflow = inner.scrollWidth - slide.clientWidth;
    const scrolling = overflow > 4;
    ticker.classList.toggle('np-ticker-fade', scrolling);
    if (scrolling) {
      const isLoop = npEntries.length === 1;
      inner.style.setProperty('--np-scroll-dist', `-${overflow + 8}px`);
      inner.style.setProperty('--np-scroll-duration', npScrollDuration(overflow, isLoop));
      inner.classList.add(isLoop ? 'np-scroll-loop' : 'np-scroll');
    }
  });

  updateNpProgressSliver(e);
  renderNpDots();

  if (iconEl) iconEl.innerHTML = mediaIconHTML(e.mediaType, `rgb(${streamAccentRGB(e.svcId, e.mediaType)})`);
  if (thumb) {
    if (e.thumb) { if (thumb.src !== targetThumbSrc) thumb.src = e.thumb; thumb.style.display = ''; }
    else thumb.style.display = 'none';
  }
}

function stopTicker() {
  clearInterval(npTickerTimer);
  npTickerTimer = null;
}

function startNpRotationTimer() {
  stopTicker();
  if (npEntries.length > 1) {
    npTickerTimer = setInterval(() => {
      if (npHovered) return;
      npCurrentIdx = (npCurrentIdx + 1) % npEntries.length;
      showNpEntry(npCurrentIdx);
    }, 8000);
  }
}

function renderNpDots() {
  const dotsEl = document.getElementById('np-dots');
  if (!dotsEl) return;
  if (npEntries.length < 2) { dotsEl.innerHTML = ''; return; }
  if (dotsEl.children.length !== npEntries.length) {
    dotsEl.innerHTML = npEntries.map((e, i) => `<div class="np-dot-pip" data-idx="${i}" style="--np-dot-rgb:${streamAccentRGB(e.svcId, e.mediaType)}"></div>`).join('');
    dotsEl.querySelectorAll('.np-dot-pip').forEach((d) => {
      d.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const idx = parseInt(d.dataset.idx, 10);
        if (Number.isNaN(idx) || idx === npCurrentIdx) return;
        npCurrentIdx = idx;
        showNpEntry(idx);
        startNpRotationTimer();
      });
    });
  }
  dotsEl.querySelectorAll('.np-dot-pip').forEach((d, i) => d.classList.toggle('active', i === npCurrentIdx));
}

function updateNowPlayingBar() {
  clearTimeout(npUpdateDebounce);
  npUpdateDebounce = setTimeout(_doUpdateNowPlayingBar, 150);
}

function _doUpdateNowPlayingBar() {
  if (nowPlayingDismissed) return;
  const bar = document.getElementById('now-playing-bar');
  const ticker = document.getElementById('np-ticker');
  if (!bar) return;

  const entries = [];
  for (const [svcId, streams] of Object.entries(allStreams)) for (const s of streams) entries.push({ ...s, svcId });

  if (activeDetailStream) {
    const updated = entries.find((s) => s.svcId === activeDetailStream.svcId && s.user === activeDetailStream.user && s.title === activeDetailStream.title);
    if (updated) {
      activeDetailStream.state = updated.state;
      activeDetailStream.viewOffset = updated.viewOffset;
      activeDetailStream._rx = updated._rx;
      activeDetailStream.duration = updated.duration;
      const streamRow = document.querySelector('.np-detail-stream-row');
      if (streamRow) {
        const badge = streamRow.querySelector('.np-detail-state-badge');
        if (updated.state === 'paused' && !badge) {
          const newBadge = document.createElement('span');
          newBadge.className = 'np-detail-state-badge';
          newBadge.textContent = 'Paused';
          streamRow.appendChild(newBadge);
        } else if (updated.state !== 'paused' && badge) badge.remove();
      }
      updateProgressRing(activeDetailStream);
    } else closeStreamDetail();
  }

  window.MarqueeMap?.update?.();
  window._castingRefresh?.();

  if (!entries.length) {
    bar.classList.remove('visible');
    stopTicker();
    clearInterval(npBarProgressTick); npBarProgressTick = null;
    if (ticker) ticker.innerHTML = '';
    npEntriesSig = '';
    npEntries = [];
    renderNpDots();
    if (npExpanded) renderNpExpanded(npEntries);
    return;
  }

  const sig = entries.map((e) => `${e.svcId}:${e.title}:${e.user}:${e.state}`).join('|');
  if (sig === npEntriesSig && (npTickerTimer !== null || entries.length === 1)) {
    npEntries = entries;
    bar.classList.add('visible');
    updateNpProgressSliver(entries[npCurrentIdx]);
    return;
  }

  npEntriesSig = sig;
  npEntries = entries;
  if (npExpanded) renderNpExpanded(npEntries);
  npCurrentIdx = 0;
  if (ticker) ticker.innerHTML = '';
  showNpEntry(0);
  startNpRotationTimer();
  startNpBarProgressTick();
  bar.classList.add('visible');
}

// ── Expanded panel ────────────────────────────────────────────────────
function renderNpExpanded(entries) {
  const inner = document.getElementById('np-expand-inner');
  if (!inner) return;
  if (!entries || !entries.length) {
    inner.innerHTML = `<div class="np-expand-empty">No active streams</div>`;
    return;
  }
  inner.innerHTML = entries.map((e, idx) => {
    const rgb = streamAccentRGB(e.svcId, e.mediaType);
    const thumb = e.thumb ? `<img class="np-expand-thumb" src="${e.thumb}" alt="" loading="lazy" data-img-fallback="hide">` : `<div class="np-expand-thumb"></div>`;
    const icon = `<div class="np-expand-icon">${mediaIconHTML(e.mediaType, `rgb(${rgb})`)}</div>`;
    const isPaused = e.state === 'paused';
    return `
      <div class="np-expand-row${isPaused ? ' is-paused' : ''}" data-idx="${idx}" role="button" tabindex="0" title="View details" style="--np-row-rgb:${rgb}">
        ${thumb}${icon}
        <div class="np-expand-row-ticker"><div class="np-ticker-inner">${entryHTML(e, true)}</div></div>
        ${isPaused ? `<span class="np-expand-paused">Paused</span>` : ''}
      </div>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  const inner = document.getElementById('np-expand-inner');
  if (!inner) return;
  function handleCardActivate(e) {
    const card = e.target.closest('.np-expand-row[data-idx]');
    if (!card) return;
    const idx = parseInt(card.dataset.idx, 10);
    if (!Number.isNaN(idx) && npEntries[idx]) openStreamDetail(npEntries[idx]);
  }
  inner.addEventListener('click', handleCardActivate);
  inner.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') handleCardActivate(e); });
});

document.addEventListener('click', (e) => {
  if (!npExpanded) return;
  const bar = document.getElementById('now-playing-bar');
  if (bar && bar.contains(e.target)) return;
  toggleNpExpand();
});

function toggleNpExpand() {
  const panel = document.getElementById('np-expand-panel');
  const body = document.getElementById('np-body');
  const btn = document.getElementById('np-expand-btn');
  if (!panel || !body) return;
  npExpanded = !npExpanded;
  body.classList.toggle('expanded', npExpanded);
  panel.setAttribute('aria-hidden', npExpanded ? 'false' : 'true');
  btn?.classList.toggle('active', npExpanded);
  if (npExpanded) {
    npHovered = false;
    document.getElementById('now-playing-bar')?.querySelectorAll('.np-ticker-inner').forEach((el) => { el.style.animationPlayState = ''; });
    renderNpExpanded(npEntries);
  }
}

function dismissNowPlaying() {
  nowPlayingDismissed = true;
  stopTicker();
  document.getElementById('now-playing-bar')?.classList.remove('visible');
  document.getElementById('np-revive-btn')?.classList.add('visible');
  if (npExpanded) toggleNpExpand();
  try { localStorage.setItem('marquee-np-dismissed', '1'); } catch {}
}

function reviveNowPlaying() {
  nowPlayingDismissed = false;
  document.getElementById('np-revive-btn')?.classList.remove('visible');
  try { localStorage.removeItem('marquee-np-dismissed'); } catch {}
  updateNowPlayingBar();
}

// ── Stream detail popup ────────────────────────────────────────────────
let npDetailEscHandler = null;

function closeStreamDetail() {
  const overlay = document.getElementById('np-detail-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  setTimeout(() => overlay.remove(), 300);
  if (npDetailEscHandler) { document.removeEventListener('keydown', npDetailEscHandler); npDetailEscHandler = null; }
  activeDetailStream = null;
  if (npDetailTickInterval) { clearInterval(npDetailTickInterval); npDetailTickInterval = null; }
}

function formatDuration(ms) {
  if (!ms) return '';
  const totalSecs = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function ringDashOffset(progressPercent) {
  return 100.5 - progressPercent * 100.5;
}

function updateProgressRing(entry) {
  const ring = document.querySelector('.np-detail-progress-ring circle[stroke-linecap]');
  const textEl = document.querySelector('.np-detail-playback-time');
  if (!ring || !textEl) return;
  const offset = liveViewOffset(entry);
  const progressPercent = entry.duration ? offset / entry.duration : 0;
  ring.setAttribute('stroke-dashoffset', ringDashOffset(progressPercent));
  textEl.textContent = `${formatDuration(offset)} / ${formatDuration(entry.duration)} (${Math.round(progressPercent * 100)}%)`;
}

function startDetailTick() {
  if (npDetailTickInterval) clearInterval(npDetailTickInterval);
  npDetailTickInterval = setInterval(() => {
    if (!activeDetailStream || activeDetailStream.state !== 'playing') return;
    updateProgressRing(activeDetailStream);
  }, 1000);
}

// Builds the "open in Plex/Jellyfin/ABS" local link for a stream entry from
// that service's configured publicUrl — absent entirely (no link shown) if
// the service has no publicUrl set, rather than a dead link.
function buildLocalLink(entry) {
  const svc = npConfig.services?.[entry.svcId];
  const base = svc?.publicUrl;
  if (!base) return null;

  if (entry.svcId === 'plex') {
    let appUrl = null;
    if (entry.plexKey && plexMachineId) appUrl = plexAppUrl(entry.plexKey, plexMachineId, plexMetadataType(entry.plexType));
    const link = entry.plexKey ? `${base}/web/index.html#!/server/${plexMachineId || ''}/details?key=${encodeURIComponent('/library/metadata/' + entry.plexKey)}` : `${base}/web`;
    return { link, label: 'Plex', icon: 'ti-player-play', cls: 'np-link-plex', appUrl };
  }
  if (entry.svcId === 'jellyfin') {
    const link = entry.jellyfinKey
      ? `${base}/web/index.html#!/details?id=${entry.jellyfinKey}${entry.serverId ? `&serverId=${entry.serverId}` : ''}`
      : base;
    return { link, label: 'Jellyfin', icon: 'ti-device-tv', cls: 'np-link-jellyfin', appUrl: null };
  }
  if (entry.svcId === 'abs') {
    const link = entry.libraryItemId ? `${base}/item/${entry.libraryItemId}` : base;
    return { link, label: 'ABS', icon: 'ti-book', cls: 'np-link-abs', appUrl: null };
  }
  return null;
}

function _buildDetailShell(entry, meta, user, clientStr) {
  const esc = escapeHtml;
  const isAb = entry.mediaType === 'audiobook';
  const displayTitle = entry.mediaType === 'show' ? (entry.title || 'Unknown').split(' — ')[0] : (entry.title || 'Unknown');
  const audibleHref = isAb ? `https://www.audible.com/search?keywords=${encodeURIComponent(displayTitle)}` : null;

  const progressPercent = entry.viewOffset && entry.duration ? liveViewOffset(entry) / entry.duration : 0;
  const hasProgress = entry.duration && entry.duration > 0;
  const progressHtml = hasProgress ? `
    <div class="np-detail-playback-row">
      <svg class="np-detail-progress-ring" width="22" height="22" viewBox="0 0 36 36">
        <circle class="np-detail-ring-bg" cx="18" cy="18" r="16" fill="none" stroke-width="3" />
        <circle cx="18" cy="18" r="16" fill="none" style="stroke:rgb(${streamAccentRGB(entry.svcId, entry.mediaType)})" stroke-width="3"
                stroke-dasharray="100.5" stroke-dashoffset="${ringDashOffset(progressPercent)}" stroke-linecap="round" transform="rotate(-90 18 18)" />
      </svg>
      <span class="np-detail-playback-time">${formatDuration(liveViewOffset(entry))} / ${formatDuration(entry.duration)} (${Math.round(progressPercent * 100)}%)</span>
    </div>` : '';

  const localLink = buildLocalLink(entry);
  const hasLinks = localLink || audibleHref;
  const isSquare = entry.mediaType === 'music' || isAb;
  const posterBoxH = isSquare ? 72 : 108;
  const mediaBadgeRGB = streamAccentRGB(entry.svcId, entry.mediaType);

  return `
    <div class="np-detail-card" id="np-detail-card" role="dialog" aria-modal="true">
      <div class="np-detail-header" id="np-detail-header">
        <div class="np-detail-backdrop-empty" id="np-detail-backdrop-wrap"></div>
        <button class="np-detail-close" data-action="closeStreamDetail" aria-label="Close">&#10005;</button>
        <div class="np-detail-header-content">
          <div class="np-detail-poster-outer" id="np-detail-poster-outer">
            <div class="np-detail-poster np-detail-poster-empty${isSquare ? ' np-detail-poster-square' : ''}" id="np-detail-poster-wrap">${scaledMediaIconHTML(entry.mediaType, `rgb(${mediaBadgeRGB})`, 72, posterBoxH)}</div>
          </div>
          <div class="np-detail-title-block">
            <div class="np-detail-title" id="np-detail-title-el">${esc(displayTitle)}</div>
            ${entry.author ? `<div class="np-detail-author">by ${esc(entry.author)}</div>` : ''}
            <div class="np-detail-attrs" id="np-detail-attrs"></div>
            <div class="np-detail-genres" id="np-detail-genres" style="display:none"></div>
          </div>
        </div>
      </div>
      <div class="np-detail-overview" id="np-detail-overview" style="display:none"></div>
      <div class="np-detail-section">
        <div class="np-detail-section-label">Now Streaming</div>
        <div class="np-detail-stream-row">
          <span class="np-detail-live-dot"></span>
          <span class="np-detail-svc" style="color:${meta.color}">${esc(meta.name)}</span>
          <span class="np-detail-stream-user"><strong>${esc(user)}</strong>${clientStr ? ` &middot; <em class="np-detail-client">${esc(clientStr)}</em>` : ''}</span>
          ${entry.state === 'paused' ? `<span class="np-detail-state-badge">Paused</span>` : ''}
        </div>
        ${progressHtml}
      </div>
      <div class="np-detail-tautulli" id="np-detail-tautulli" style="display:none">
        <div class="np-detail-section-label">Play Stats <span class="np-detail-stats-loading">Loading…</span></div>
        <div class="np-detail-stats-row" id="np-detail-stats-row"></div>
      </div>
      <div class="np-detail-links" id="np-detail-links"${hasLinks ? '' : ' style="display:none"'}>
        ${localLink ? `<a class="np-detail-link np-local-link ${localLink.cls}" href="${localLink.link}" rel="noopener"${localLink.appUrl ? ` data-app-url="${localLink.appUrl}"` : ''}><i class="ti ${localLink.icon}"></i> ${localLink.label}</a>` : ''}
        ${audibleHref ? `<a class="np-detail-link" href="${audibleHref}" target="_blank" rel="noopener"><i class="ti ti-headphones"></i> Audible</a>` : ''}
      </div>
    </div>`;
}

function _fillDetailMeta(result, entry) {
  const backdropPath = result.backdropPath || result.backdrop_path;
  const posterPath = result.posterPath || result.poster_path;
  const overview = result.overview;
  const rating = result.voteAverage ?? result.vote_average;
  const runtimeMin = result.runtime;
  const genreNames = (result.genres ?? []).map((g) => g.name).slice(0, 3);
  const tmdbId = result.id;
  const mediaType = result.mediaType || (entry.mediaType === 'show' ? 'tv' : 'movie');

  if (backdropPath) {
    const wrap = document.getElementById('np-detail-backdrop-wrap');
    if (wrap) {
      const img = document.createElement('img');
      img.className = 'np-detail-backdrop';
      img.src = `https://image.tmdb.org/t/p/w780${backdropPath}`;
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = () => img.remove();
      wrap.replaceWith(img);
    }
  }
  if (posterPath) {
    const wrap = document.getElementById('np-detail-poster-wrap');
    if (wrap) {
      const isSquare = entry.mediaType === 'music' || entry.mediaType === 'audiobook';
      const img = document.createElement('img');
      img.className = 'np-detail-poster' + (isSquare ? ' np-detail-poster-square' : '');
      img.src = `https://image.tmdb.org/t/p/w185${posterPath}`;
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = () => img.remove();
      wrap.replaceWith(img);
      addDetailPosterBadge(entry);
    }
  }
  const attrsEl = document.getElementById('np-detail-attrs');
  if (attrsEl) {
    const parts = [];
    if (runtimeMin && entry.mediaType !== 'audiobook') parts.push(`<span>${runtimeMin} min</span>`);
    if (rating) {
      const r = parseFloat(rating).toFixed(1);
      const n = Math.round(parseFloat(r) / 2);
      parts.push(`<span class="np-detail-rating" title="${r}/10">${'★'.repeat(n)}${'☆'.repeat(5 - n)} ${r}</span>`);
    }
    attrsEl.innerHTML = parts.join('');
  }
  if (genreNames.length) {
    const genresEl = document.getElementById('np-detail-genres');
    if (genresEl) { genresEl.textContent = genreNames.join(' · '); genresEl.style.display = ''; }
  }
  if (overview) {
    const overviewEl = document.getElementById('np-detail-overview');
    if (overviewEl) { overviewEl.textContent = overview; overviewEl.style.display = ''; }
  }
  if (tmdbId) {
    const linksEl = document.getElementById('np-detail-links');
    if (linksEl) {
      const tmdbHref = `https://www.themoviedb.org/${mediaType}/${tmdbId}?language=${navigator.language}`;
      const icon = mediaType === 'tv' ? 'ti-device-tv' : 'ti-movie';
      linksEl.insertAdjacentHTML('beforeend', `<a class="np-detail-link" href="${tmdbHref}" target="_blank" rel="noopener"><i class="ti ${icon}"></i> TMDB</a>`);
      linksEl.style.display = '';
    }
  }
}

function openStreamDetail(entry) {
  document.getElementById('np-detail-overlay')?.remove();

  activeDetailStream = entry;
  startDetailTick();

  const meta = svcMeta[entry.svcId] || { name: entry.svcId, color: 'var(--text)' };
  const user = maskedUser(entry.user || 'Someone');

  const overlay = document.createElement('div');
  overlay.id = 'np-detail-overlay';
  overlay.innerHTML = _buildDetailShell(entry, meta, user, entry.client || null);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeStreamDetail(); });
  npDetailEscHandler = (e) => { if (e.key === 'Escape') closeStreamDetail(); };
  document.addEventListener('keydown', npDetailEscHandler);

  const isMusic = entry.mediaType === 'music';
  const isAb = entry.mediaType === 'audiobook';

  if (entry.thumb) {
    const wrap = document.getElementById('np-detail-poster-wrap');
    if (wrap) {
      const isSquare = isMusic || isAb;
      const img = document.createElement('img');
      img.className = 'np-detail-poster' + (isSquare ? ' np-detail-poster-square' : '');
      img.src = entry.thumb;
      img.alt = '';
      img.onerror = () => img.remove();
      wrap.replaceWith(img);
      addDetailPosterBadge(entry);
    }
  }

  // Enrich from Seerr search (movies/TV only — works because Seerr is always
  // configured, it's a required service).
  if (!isAb && !isMusic) {
    const searchTitle = entry.mediaType === 'show' ? (entry.title || '').split(' — ')[0] : (entry.title || '');
    const preferType = entry.mediaType === 'show' ? 'tv' : 'movie';
    fetch(`/api/seerr/search?query=${encodeURIComponent(searchTitle)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const results = data?.results ?? [];
        const norm = (t) => (t || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
        const normSearch = norm(searchTitle);
        const hit = results.find((r) => r.mediaType === preferType && norm(r.title || r.name) === normSearch) || results.find((r) => r.mediaType === preferType) || results[0];
        if (hit) _fillDetailMeta(hit, entry);
      })
      .catch(() => {});
  } else if (isAb) {
    if (entry.description) {
      const overviewEl = document.getElementById('np-detail-overview');
      if (overviewEl) { overviewEl.textContent = entry.description.replace(/<[^>]*>/g, ''); overviewEl.style.display = ''; }
    }
    if (entry.genres?.length) {
      const genresEl = document.getElementById('np-detail-genres');
      if (genresEl) { genresEl.textContent = entry.genres.slice(0, 3).join(' · '); genresEl.style.display = ''; }
    }
    if (!entry.description) {
      const cleanTitle = (entry.title || '').split(' — ')[0];
      const openLibraryFallback = () => {
        fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(cleanTitle)}&limit=1`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            const doc = data?.docs?.[0];
            if (doc?.key) return fetch(`https://openlibrary.org${doc.key}.json`).then((r) => (r.ok ? r.json() : null));
            return null;
          })
          .then((work) => {
            if (work?.description) {
              const desc = typeof work.description === 'object' ? work.description.value : work.description;
              const overviewEl = document.getElementById('np-detail-overview');
              if (overviewEl) { overviewEl.textContent = desc.replace(/\[\*\*PDF\*\*\]\(.*\)/g, '').trim(); overviewEl.style.display = ''; }
            }
          })
          .catch(() => {});
      };
      if (entry.libraryItemId) {
        fetch(`/api/abs/item/${entry.libraryItemId}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((item) => {
            const desc = item?.media?.metadata?.description;
            if (desc) {
              const overviewEl = document.getElementById('np-detail-overview');
              if (overviewEl) { overviewEl.textContent = desc.replace(/<[^>]*>/g, ''); overviewEl.style.display = ''; }
            } else openLibraryFallback();
          })
          .catch(openLibraryFallback);
      } else openLibraryFallback();
    }
  }

  // Tautulli play history (Plex only), gated on Tautulli actually being configured.
  if (entry.svcId === 'plex' && npConfig.services?.tautulli?.enabled) {
    const searchTitle = (entry.title || '').split(' — ')[0];
    fetch(`/api/tautulli?cmd=get_history&search_type=title&search=${encodeURIComponent(searchTitle)}&length=500`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const records = data?.response?.data?.data ?? [];
        const total = data?.response?.data?.recordsFiltered ?? records.length;
        const lastPlay = records[0];
        const lastDate = lastPlay?.date ? new Date(lastPlay.date * 1000).toLocaleDateString(navigator.language, { month: 'short', day: 'numeric', year: 'numeric' }) : null;
        const totalDur = records.reduce((s, r) => s + (r.duration || 0), 0);
        const hours = Math.floor(totalDur / 3600);
        const section = document.getElementById('np-detail-tautulli');
        const row = document.getElementById('np-detail-stats-row');
        if (!section || !row) return;
        document.querySelector('.np-detail-stats-loading')?.remove();
        if (!total) { section.style.display = ''; row.innerHTML = `<span class="np-detail-stat">No history found</span>`; return; }
        row.innerHTML = [
          `<span class="np-detail-stat"><i class="ti ti-repeat"></i> ${total} play${total !== 1 ? 's' : ''}</span>`,
          hours > 0 ? `<span class="np-detail-stat"><i class="ti ti-clock"></i> ${hours}h watched</span>` : '',
          lastDate ? `<span class="np-detail-stat"><i class="ti ti-calendar"></i> Last: ${lastDate}</span>` : '',
        ].filter(Boolean).join('');
        section.style.display = '';
      })
      .catch(() => {});
  }
}
