// LIVE MAP — orchestrator (panel open/close, mode switching, shared state).
// Geo mode lives in js/map/geo.js, a simplified single "orbit" network
// visualization lives in js/map/network.js. Entirely absent (no button)
// unless site.enableGeoMap is on.
(function () {
  const btn = document.getElementById('np-map-btn');
  const panel = document.getElementById('np-map-panel');
  const closeBtn = document.getElementById('np-map-close');
  const statusEl = document.getElementById('np-map-status');
  const container = document.getElementById('np-map-container');
  if (!btn || !panel) return;

  const _shared = {
    mapOpen: false,
    activeMode: 'geo',
    leafletMap: null,
    tileLayer: null,
    cachedHome: null, // null if no home location configured — geo/network modes must handle that
    cachedGeoData: {},
    lastLocSig: null,
  };

  let geoDiv = null;


  function streamColorRGB(stream, fallback) {
    if (!stream) return fallback || '41,171,226';
    return streamAccentRGB(stream.svcId, stream.mediaType) || fallback;
  }

  function getOrCreateGeoDiv() {
    if (!geoDiv) {
      geoDiv = document.createElement('div');
      geoDiv.id = 'np-geo-div';
      geoDiv.style.cssText = 'position:absolute;inset:0;';
      container.appendChild(geoDiv);
    }
    return geoDiv;
  }

  function showGeo() { if (geoDiv) geoDiv.style.display = ''; }
  function hideGeo() { if (geoDiv) geoDiv.style.display = 'none'; }
  function showCanvas() { const c = document.getElementById('np-network-canvas'); if (c) c.style.display = ''; }
  function hideCanvas() { const c = document.getElementById('np-network-canvas'); if (c) c.style.display = 'none'; }

  document.querySelectorAll('.np-map-mode-btn').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.np-map-mode-btn').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      _shared.activeMode = b.dataset.mode;
      if (_shared.mapOpen) renderMode();
    });
  });

  // /api/geo and /api/home-location are hard-gated for guests
  // (server/services/geo.js) — same reasoning as heatmap.js's map tab: a
  // guest opening the panel would just see a failed geo lookup, so prompt
  // sign-in instead.
  btn.addEventListener('click', () => {
    if (_shared.mapOpen) return close();
    if (window.__marqueeGuest === true) {
      if (typeof showVisitorLoginModal === 'function') showVisitorLoginModal({ status: 'prompt' });
      return;
    }
    open();
  });
  closeBtn?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && _shared.mapOpen) close(); });

  function open() {
    _shared.mapOpen = true;
    panel.classList.add('open');
    panel.removeAttribute('aria-hidden');
    btn.classList.add('active');
    setTimeout(() => { if (_shared.mapOpen) renderMode(); }, 300);
  }
  function close() {
    _shared.mapOpen = false;
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    btn.classList.remove('active');
    window.MarqueeMap.stopNetwork?.();
  }

  // ── Drag to resize the panel (grab the header, drag up/down) ──────
  (function initResize() {
    const header = document.getElementById('np-map-header');
    if (!header) return;

    const storedHeight = localStorage.getItem('marquee-map-height');
    if (storedHeight) {
      const h = parseInt(storedHeight, 10);
      if (h >= 240 && h <= window.innerHeight * 0.9) panel.style.setProperty('--map-height', h + 'px');
    }

    let startY = 0, startHeight = 0, isResizing = false;

    function onPointerDown(e) {
      if (e.target.closest('button')) return;
      isResizing = true;
      startY = e.clientY ?? e.touches?.[0]?.clientY;
      startHeight = parseInt(window.getComputedStyle(panel).height, 10) || 380;
      if (container) container.style.pointerEvents = 'none';
      panel.style.transition = 'none';
      document.addEventListener('mousemove', onPointerMove);
      document.addEventListener('mouseup', onPointerUp);
      document.addEventListener('touchmove', onPointerMove, { passive: false });
      document.addEventListener('touchend', onPointerUp);
    }

    function onPointerMove(e) {
      if (!isResizing) return;
      if (e.cancelable) e.preventDefault();
      const currentY = e.clientY ?? e.touches?.[0]?.clientY;
      const newHeight = Math.max(240, Math.min(window.innerHeight * 0.85, startHeight - (currentY - startY)));
      panel.style.setProperty('--map-height', newHeight + 'px');
      if (_shared.leafletMap) _shared.leafletMap.invalidateSize();
    }

    function onPointerUp() {
      if (!isResizing) return;
      isResizing = false;
      if (container) container.style.pointerEvents = '';
      panel.style.transition = '';
      const finalHeight = parseInt(window.getComputedStyle(panel).height, 10);
      if (finalHeight) localStorage.setItem('marquee-map-height', finalHeight);
      document.removeEventListener('mousemove', onPointerMove);
      document.removeEventListener('mouseup', onPointerUp);
      document.removeEventListener('touchmove', onPointerMove);
      document.removeEventListener('touchend', onPointerUp);
      if (_shared.leafletMap) setTimeout(() => _shared.leafletMap.invalidateSize(), 50);
    }

    header.addEventListener('mousedown', onPointerDown);
    header.addEventListener('touchstart', onPointerDown, { passive: true });
  })();

  new MutationObserver(() => {
    if (!_shared.mapOpen) return;
    if (_shared.activeMode === 'geo' && _shared.leafletMap && _shared.tileLayer) {
      setBasemapTheme(_shared.tileLayer, isLightFamilyTheme());
    }
    renderMode();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  function renderMode() {
    if (_shared.activeMode === 'geo') {
      hideCanvas();
      showGeo();
      window.MarqueeMap.renderGeo();
    } else {
      hideGeo();
      showCanvas();
      window.MarqueeMap.renderNetwork();
    }
  }

  function collectStreams() {
    if (typeof allStreams === 'undefined') return [];
    const out = [];
    for (const [svcId, streams] of Object.entries(allStreams)) for (const s of streams) out.push({ ...s, svcId });
    return out;
  }

  function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }

  document.addEventListener('marquee:anon-changed', () => { if (_shared.mapOpen) renderMode(); });

  window.MarqueeMap = {
    _shared,
    container,
    streamColorRGB,
    collectStreams,
    setStatus,
    ensureLeaflet: ensureMapLibs,
    getOrCreateGeoDiv,
    update() { if (_shared.mapOpen) renderMode(); },
  };

  document.addEventListener('marquee:config', (e) => { btn.hidden = !e.detail.enableGeoMap; });
})();
