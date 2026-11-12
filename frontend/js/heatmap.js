// ACTIVITY HEATMAP — calendar/24h/geo views sourced from Tautulli (Plex) or
// Jellystat (Jellyfin), whichever resolveStatsBackend() picks (frontend/js/
// watch-services.js). Entirely absent (no button, no modal) unless one of
// the two is configured; the Geo Map tab is additionally gated on
// site.enableGeoMap — off by default since it plots viewer IPs.
(function () {
  let hmConfig = {};
  let hmBackend = 'tautulli';
  let activeTab = 'calendar';
  let activeDays = 30;
  let dataCache = {};

  const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const PALETTES = {
    cyber: { l1: 'rgba(41,171,226,0.20)', l2: 'rgba(41,171,226,0.42)', l3: 'rgba(41,171,226,0.66)', l4: 'rgba(203,134,255,0.68)', l5: 'rgba(203,134,255,0.94)' },
    ember: { l1: 'rgba(229,160,13,0.22)', l2: 'rgba(229,160,13,0.50)', l3: 'rgba(255,112,30,0.68)', l4: 'rgba(239,68,68,0.76)', l5: 'rgba(239,68,68,0.96)' },
    matrix: { l1: 'rgba(34,197,94,0.18)', l2: 'rgba(34,197,94,0.38)', l3: 'rgba(34,197,94,0.62)', l4: 'rgba(131,192,42,0.78)', l5: 'rgba(131,192,42,0.96)' },
    sakura: { l1: 'rgba(255,182,193,0.25)', l2: 'rgba(255,105,180,0.42)', l3: 'rgba(236,72,153,0.62)', l4: 'rgba(219,39,119,0.78)', l5: 'rgba(190,24,93,0.95)' },
    gold: { l1: 'rgba(246,190,78,0.22)', l2: 'rgba(246,190,78,0.46)', l3: 'rgba(229,160,13,0.68)', l4: 'rgba(180,110,0,0.80)', l5: 'rgba(180,110,0,0.96)' },
    ocean: { l1: 'rgba(6,182,212,0.18)', l2: 'rgba(6,182,212,0.38)', l3: 'rgba(20,184,166,0.62)', l4: 'rgba(5,150,105,0.76)', l5: 'rgba(4,120,87,0.95)' },
    mono: { l1: 'rgba(255,255,255,0.11)', l2: 'rgba(255,255,255,0.26)', l3: 'rgba(255,255,255,0.48)', l4: 'rgba(255,255,255,0.72)', l5: 'rgba(255,255,255,0.92)' },
  };

  let modal = null;
  let activePalette = 'cyber';
  try { activePalette = localStorage.getItem('hm-palette') || 'cyber'; } catch {}

  function applyPalette(id) {
    const p = PALETTES[id] || PALETTES.cyber;
    for (let i = 1; i <= 5; i++) modal?.style.setProperty(`--hm-l${i}`, p[`l${i}`]);
    document.querySelectorAll('.hm-pal-swatch').forEach((s) => s.classList.toggle('active', s.dataset.palette === id));
    activePalette = id;
    try { localStorage.setItem('hm-palette', id); } catch {}
    if (activeTab === 'map' && hmMap && hmGeoIpCounts) drawHmGeoLayers();
  }

  let _hmTip = null;
  function getHmTip() {
    if (_hmTip) return _hmTip;
    _hmTip = document.createElement('div');
    _hmTip.id = 'hm-float-tip';
    document.body.appendChild(_hmTip);
    return _hmTip;
  }
  function _renderHmTip(text) {
    const tip = getHmTip();
    const parts = text.split('\n');
    tip.innerHTML = `<span class="hm-tip-main">${escapeHtml(parts[0])}</span>` + (parts[1] ? `<span class="hm-tip-titles">${escapeHtml(parts[1])}</span>` : '');
    tip.classList.add('visible');
    return tip;
  }
  function _placeHmTip(tip, rect) {
    const tw = tip.offsetWidth || 150, th = tip.offsetHeight || 38, gap = 4, pad = 6;
    const cx = rect.left + (rect.width ?? 0) / 2;
    let left = Math.max(pad, Math.min(cx - tw / 2, window.innerWidth - tw - pad));
    let top = rect.top - th - gap;
    if (top < pad) top = (rect.bottom ?? rect.top) + gap;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function showHmTip(cell) { if (cell.dataset.tip) _placeHmTip(_renderHmTip(cell.dataset.tip), cell.getBoundingClientRect()); }
  function showHmTipXY(text, x, y) { _placeHmTip(_renderHmTip(text), { left: x, width: 0, top: y, bottom: y }); }
  function hideHmTip() { _hmTip?.classList.remove('visible'); }
  function attachHmTipListeners(root) {
    root.querySelectorAll('.hm-cell, .hm-24-cell').forEach((cell) => {
      cell.addEventListener('mouseenter', () => showHmTip(cell));
      cell.addEventListener('mouseleave', hideHmTip);
    });
  }

  function syncPresetVisibility() {
    const presets = document.getElementById('hm-presets');
    if (presets) presets.style.display = activeTab === 'calendar' || activeTab === '24h' ? 'flex' : 'none';
  }

  // Tab/preset switches can overlap: each render captures a generation number and drops
  // its result if a newer render started while it was waiting on the network.
  let hmGen = 0;
  async function renderActive() {
    hmGen += 1;
    syncPresetVisibility();
    if (activeTab === 'calendar') await renderCalendar();
    else if (activeTab === '24h') await render24h();
    else if (activeTab === 'map') await renderGeoMap();
  }

  async function fetchTautulli(cmd, extra = '') {
    const key = `${cmd}:${activeDays}${extra}`;
    if (dataCache[key]) return dataCache[key];
    try {
      const r = await fetch(`/api/${hmBackend}?cmd=${cmd}&time_range=${activeDays}${extra}`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return null;
      const d = (await r.json())?.response?.data ?? null;
      dataCache[key] = d;
      return d;
    } catch { return null; }
  }

  async function renderCalendar() {
    const gen = hmGen;
    const body = document.getElementById('hm-body');
    body.innerHTML = `<div class="hm-loading">Loading…</div>`;
    const data = await fetchTautulli('get_plays_by_date');
    if (gen !== hmGen) return;
    if (!data) { body.innerHTML = `<div class="hm-loading">Stats source unavailable</div>`; return; }

    const dates = data.categories ?? [];
    const series = data.series ?? [];
    const countByDate = {};
    for (const s of series) (s.data ?? []).forEach((val, i) => { const d = dates[i]; if (d) countByDate[d] = (countByDate[d] ?? 0) + val; });
    const maxCount = Math.max(1, ...Object.values(countByDate));

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = [];
    for (let i = activeDays - 1; i >= 0; i--) { const d = new Date(today); d.setDate(d.getDate() - i); days.push(d); }
    const firstDow = days[0].getDay();
    const paddedDays = Array(firstDow).fill(null).concat(days);

    const monthPositions = [];
    let lastMonth = -1;
    paddedDays.forEach((d, idx) => {
      if (!d) return;
      const col = Math.floor(idx / 7);
      if (d.getMonth() !== lastMonth) { monthPositions.push({ col, label: MONTHS[d.getMonth()] }); lastMonth = d.getMonth(); }
    });

    const gapPx = 2, REF_COLS = 14;
    const bodyW = (body.clientWidth || 680) - 36;
    const cellPx = Math.max(10, Math.floor((bodyW - gapPx * (REF_COLS - 1)) / REF_COLS));
    const colStep = cellPx + gapPx;

    let monthRow = `<div class="hm-month-row">`;
    let curCol = 0;
    for (const { col, label } of monthPositions) { monthRow += `<span style="display:inline-block;width:${(col - curCol) * colStep}px"></span><span class="hm-month-label">${label}</span>`; curCol = col; }
    monthRow += `</div>`;

    const dayLabelHtml = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => `<div class="hm-day-label" style="line-height:${cellPx}px">${d}</div>`).join('');
    const peakKey = Object.entries(countByDate).reduce((best, [k, v]) => (v > (countByDate[best] ?? 0) ? k : best), '');
    const totalPlays = Object.values(countByDate).reduce((a, b) => a + b, 0);
    const avgPerDay = totalPlays / activeDays;
    let bestStreak = 0, curStreak = 0;
    for (const d of days) {
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if ((countByDate[k] ?? 0) > 0) { curStreak++; bestStreak = Math.max(bestStreak, curStreak); } else curStreak = 0;
    }

    let cells = '';
    for (let ci = 0; ci < paddedDays.length; ci++) {
      const colIdx = Math.floor(ci / 7);
      const d = paddedDays[ci];
      if (!d) { cells += `<div class="hm-cell" style="--hm-col:${colIdx};width:${cellPx}px;height:${cellPx}px"></div>`; continue; }
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const count = countByDate[key] ?? 0;
      const level = count === 0 ? 0 : Math.min(5, Math.ceil((count / maxCount) * 5));
      const isPeak = key === peakKey && count > 0;
      const dateStr = d.toLocaleDateString(navigator.language, { month: 'short', day: 'numeric' });
      const tip = isPeak ? `Best day: ${count} play${count !== 1 ? 's' : ''} on ${dateStr}` : `${count} play${count !== 1 ? 's' : ''} · ${dateStr}`;
      cells += `<div class="hm-cell${isPeak ? ' hm-peak' : ''}"${level ? ` data-level="${level}"` : ''} data-tip="${tip}" data-date="${key}" style="--hm-col:${colIdx};width:${cellPx}px;height:${cellPx}px"></div>`;
    }

    body.innerHTML = `
      <div class="hm-stats-bar"><span><strong>${totalPlays}</strong> plays</span><span class="hm-stats-sep">·</span><span><strong>${avgPerDay.toFixed(1)}</strong>/day avg</span><span class="hm-stats-sep">·</span><span><strong>${bestStreak}</strong>-day streak</span></div>
      <div class="hm-calendar-outer">
        <div class="hm-day-labels" style="grid-template-rows:repeat(7,${cellPx}px);gap:${gapPx}px">${dayLabelHtml}</div>
        <div class="hm-calendar-scroll">
          ${monthRow}
          <div class="hm-calendar" style="grid-auto-columns:${cellPx}px;grid-template-rows:repeat(7,${cellPx}px);gap:${gapPx}px">${cells}</div>
        </div>
      </div>`;
    attachHmTipListeners(body);

    body.querySelectorAll('.hm-cell[data-date]').forEach((cell) => {
      cell.addEventListener('mouseenter', async () => {
        if (cell.dataset.enriched || !cell.dataset.date) return;
        cell.dataset.enriched = '1';
        try {
          const r = await fetch(`/api/${hmBackend}?cmd=get_history&start_date=${cell.dataset.date}&length=5`, { signal: AbortSignal.timeout(4000) });
          if (!r.ok) return;
          const rows = (await r.json())?.response?.data?.data ?? [];
          const titles = [...new Set(rows.map((row) => row.grandparent_title || row.title || '').filter(Boolean))].slice(0, 3);
          if (titles.length) cell.dataset.tip += `\n${titles.join(', ')}`;
        } catch {}
      });
    });
  }

  async function render24h() {
    const gen = hmGen;
    const body = document.getElementById('hm-body');
    body.innerHTML = `<div class="hm-loading">Loading…</div>`;
    const [hourData, dowData] = await Promise.all([fetchTautulli('get_plays_by_hourofday'), fetchTautulli('get_plays_by_dayofweek')]);
    if (gen !== hmGen) return;
    if (!hourData || !dowData) { body.innerHTML = `<div class="hm-loading">Stats source unavailable</div>`; return; }

    const hourTotals = Array(24).fill(0);
    for (const s of hourData.series ?? []) (s.data ?? []).forEach((v, i) => { hourTotals[i] = (hourTotals[i] ?? 0) + v; });
    const dowTotals = Array(7).fill(0);
    for (const s of dowData.series ?? []) (s.data ?? []).forEach((v, i) => { dowTotals[i] = (dowTotals[i] ?? 0) + v; });

    const totalPlays = hourTotals.reduce((a, b) => a + b, 0) || 1;
    const matrix = [];
    for (let d = 0; d < 7; d++) { const row = []; for (let h = 0; h < 24; h++) row.push((dowTotals[d] / totalPlays) * hourTotals[h]); matrix.push(row); }
    const maxVal = Math.max(1, ...matrix.flat());

    const hourLabels = Array.from({ length: 24 }, (_, h) => `<div class="hm-24-hour-label">${h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}</div>`).join('');
    let gridRows = '';
    for (let d = 0; d < 7; d++) {
      gridRows += `<div class="hm-24-row-label">${DAYS_OF_WEEK[d]}</div>`;
      for (let h = 0; h < 24; h++) {
        const val = matrix[d][h];
        const level = val === 0 ? 0 : Math.min(5, Math.ceil((val / maxVal) * 5));
        gridRows += `<div class="hm-24-cell"${level ? ` data-level="${level}"` : ''} data-tip="${DAYS_OF_WEEK[d]} ${h}:00 — est. ${Math.round(val)} plays"></div>`;
      }
    }
    body.innerHTML = `<div class="hm-24-wrap"><div class="hm-24-header"><div></div>${hourLabels}</div><div class="hm-24-grid">${gridRows}</div></div>`;
    attachHmTipListeners(body);
  }

  let hmMap = null, hmGeoIpCounts = null, hmGeoLocs = null, hmGeoLayers = [];

  // Shared, SRI-checked loaders (js/util.js) — the live map may have loaded these already.
  const ensureHMLeaflet = ensureMapLibs;
  const ensureLeafletHeat = () => loadAssetOnce(...MAP_LIBS.heatJs).catch(() => {});

  function drawHmGeoLayers() {
    if (!hmMap || !hmGeoIpCounts || !hmGeoLocs) return;
    hmGeoLayers.forEach((l) => { try { hmMap.removeLayer(l); } catch {} });
    hmGeoLayers = [];
    const cs = modal ? getComputedStyle(modal) : null;
    const palL4 = cs?.getPropertyValue('--hm-l4').trim() || 'rgba(203,134,255,0.68)';
    const palL5 = cs?.getPropertyValue('--hm-l5').trim() || 'rgba(203,134,255,0.94)';
    const maxCount = Math.max(1, ...Object.values(hmGeoIpCounts));

    for (const [ip, count] of Object.entries(hmGeoIpCounts)) {
      const loc = hmGeoLocs[ip];
      if (!loc || loc.status === 'fail' || !loc.lat || !loc.lon) continue;
      const intensity = count / maxCount;
      const city = loc.city ? `${loc.city}, ${loc.country || ''}` : loc.country || ip;
      const cm = L.circleMarker([loc.lat, loc.lon], { radius: 3 + intensity * 7, color: palL5, fillColor: palL4, fillOpacity: 0.5 + intensity * 0.4, weight: 1.5 })
        .on('mouseover', (e) => showHmTipXY(`${count} play${count !== 1 ? 's' : ''} · ${city}`, e.originalEvent.clientX, e.originalEvent.clientY))
        .on('mouseout', hideHmTip)
        .addTo(hmMap);
      hmGeoLayers.push(cm);
    }
  }

  async function renderGeoMap() {
    const gen = hmGen;
    const body = document.getElementById('hm-body');
    body.innerHTML = `<div class="hm-loading">Loading play history…</div>`;
    const r = await fetch(`/api/${hmBackend}?cmd=get_history&length=1000`, { signal: AbortSignal.timeout(10000) });
    if (gen !== hmGen) return;
    if (!r.ok) { body.innerHTML = `<div class="hm-loading">Stats source unavailable</div>`; return; }
    const rows = (await r.json())?.response?.data?.data ?? [];
    if (gen !== hmGen) return;
    if (!rows.length) { body.innerHTML = `<div class="hm-loading">No play history found</div>`; return; }

    const ipCounts = {};
    for (const row of rows) if (row.ip_address && !isPrivateIP(row.ip_address)) ipCounts[row.ip_address] = (ipCounts[row.ip_address] || 0) + 1;
    const uniqueIPs = Object.keys(ipCounts);
    if (!uniqueIPs.length) { body.innerHTML = `<div class="hm-loading">All recent plays are from your local network</div>`; return; }

    body.innerHTML = `<div class="hm-loading">Geolocating ${uniqueIPs.length} location${uniqueIPs.length !== 1 ? 's' : ''}…</div>`;
    const locs = await geoLookup(uniqueIPs);
    if (gen !== hmGen) return;
    await ensureHMLeaflet();
    if (gen !== hmGen) return;
    await ensureLeafletHeat();
    if (gen !== hmGen) return;

    body.innerHTML = `<div id="hm-geo-map-el" style="width:100%;height:360px;border-radius:10px;overflow:hidden;"></div><p class="hm-geo-note">Last 1,000 plays · dot size = relative play count</p>`;
    await new Promise((res) => requestAnimationFrame(res));
    if (gen !== hmGen) return;

    if (hmMap) { hmMap.remove(); hmMap = null; }
    hmGeoIpCounts = null; hmGeoLocs = null; hmGeoLayers = [];

    const isLight = isLightFamilyTheme();
    hmMap = L.map('hm-geo-map-el', { zoomControl: true, scrollWheelZoom: false, minZoom: 1, maxZoom: 10 }).setView([20, 0], 2);
    createBasemapLayer(isLight).addTo(hmMap);

    const bounds = [];
    const maxCount = Math.max(1, ...Object.values(ipCounts));
    let any = false;
    for (const [ip, count] of Object.entries(ipCounts)) {
      const loc = locs[ip];
      if (!loc || loc.status === 'fail' || !loc.lat || !loc.lon) continue;
      any = true;
      bounds.push([loc.lat, loc.lon]);
    }
    if (!any) { body.innerHTML = `<div class="hm-loading">Geo lookup failed</div>`; hmMap.remove(); hmMap = null; return; }

    hmGeoIpCounts = ipCounts;
    hmGeoLocs = locs;
    drawHmGeoLayers();
    if (bounds.length) { const lb = L.latLngBounds(bounds); if (lb.isValid()) hmMap.fitBounds(lb, { padding: [40, 40], maxZoom: 6, animate: false }); }
    setTimeout(() => hmMap?.invalidateSize(), 100);
  }

  function openHeatmap() {
    if (window.__marqueeGuest === true) {
      if (typeof showVisitorLoginModal === 'function') showVisitorLoginModal({ status: 'prompt' });
      return;
    }
    const overlay = document.getElementById('heatmap-overlay');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    document.getElementById('heatmap-btn')?.classList.add('active');
    syncPresetVisibility();
    renderActive();
  }
  function closeHeatmap() {
    document.getElementById('heatmap-overlay').classList.remove('open');
    document.body.style.overflow = '';
    document.getElementById('heatmap-btn')?.classList.remove('active');
  }

  function initHeatmapUI() {
    modal = document.getElementById('heatmap-modal');
    applyPalette(activePalette);
    document.querySelectorAll('.hm-pal-swatch').forEach((btn) => btn.addEventListener('click', () => applyPalette(btn.dataset.palette)));
    document.querySelectorAll('.hm-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.hm-tab').forEach((t) => t.classList.remove('active'));
        btn.classList.add('active');
        if (activeTab === 'map' && btn.dataset.hmTab !== 'map' && hmMap) { hmMap.remove(); hmMap = null; }
        activeTab = btn.dataset.hmTab;
        renderActive();
      });
    });
    document.querySelectorAll('.hm-preset').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.hm-preset').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        activeDays = parseInt(btn.dataset.days, 10);
        dataCache = {};
        renderActive();
      });
    });
    const heatmapBtn = document.getElementById('heatmap-btn');
    const overlay = document.getElementById('heatmap-overlay');
    heatmapBtn?.addEventListener('click', openHeatmap);
    document.getElementById('hm-close-btn')?.addEventListener('click', closeHeatmap);
    overlay?.addEventListener('click', (e) => { if (e.target === overlay) closeHeatmap(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay?.classList.contains('open')) closeHeatmap(); });
  }

  // /api/tautulli and /api/jellystat are hard-gated for guests — show the
  // button once a backend is configured (so signing in is discoverable),
  // but keep it disabled/guest-labeled until a visitor session exists,
  // rather than opening to a modal that can't load anything.
  function applyHeatmapGuestState() {
    const btn = document.getElementById('heatmap-btn');
    if (!btn || btn.hidden) return;
    const isGuest = window.__marqueeGuest === true;
    btn.classList.toggle('locked', isGuest);
    btn.title = isGuest ? 'Sign in to view activity insights' : '';
  }

  document.addEventListener('marquee:config', (e) => {
    hmConfig = e.detail;
    const btn = document.getElementById('heatmap-btn');
    const mapTab = document.querySelector('.hm-tab[data-hm-tab="map"]');
    const backend = resolveStatsBackend(hmConfig);
    if (!backend) { if (btn) btn.hidden = true; return; }
    hmBackend = backend;
    if (btn) { btn.hidden = false; initHeatmapUI(); }
    if (mapTab) mapTab.hidden = !hmConfig.enableGeoMap;
    applyHeatmapGuestState();
  });
  document.addEventListener('marquee:auth-changed', applyHeatmapGuestState);
})();
