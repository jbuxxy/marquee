// LIVE MAP — GEO MODE. Home location (site.homeLocation, M6) is entirely
// optional: when set, local/private-IP streams pin to it and arc lines
// animate from it to each remote viewer; when unset, only remote viewers
// with a resolvable public IP are plotted — no home marker, no arcs, no
// placeholder. Rebuilds markers each render (no persistent-marker/anti-
// flicker system) — simpler at the cost of a small flicker on refresh.
(function () {
  const M = window.MarqueeMap;
  if (!M) return;
  const S = M._shared;

  let cachedHomeAt = 0;
  let arcRAF = null;
  let arcCanvas = null;
  let markersLayer = null;
  let linesLayer = null;

  async function fetchHome() {
    const HOME_REFRESH_MS = 60000;
    if (S.cachedHome !== null && Date.now() - cachedHomeAt < HOME_REFRESH_MS) return;
    try {
      const r = await fetch('/api/home-location');
      S.cachedHome = r.ok ? await r.json() : null;
    } catch { S.cachedHome = null; }
    cachedHomeAt = Date.now();
  }

  function stopArc() {
    if (arcRAF) { cancelAnimationFrame(arcRAF); arcRAF = null; }
    if (arcCanvas) arcCanvas.style.display = 'none';
  }

  function startArc(homeLat, homeLon, positions) {
    stopArc();
    if (!positions.length) return;
    const geo = M.getOrCreateGeoDiv();
    if (!arcCanvas) {
      arcCanvas = document.createElement('canvas');
      arcCanvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:500;';
      geo.appendChild(arcCanvas);
    }
    arcCanvas.style.display = '';
    const particles = positions.map((p) => ({ t: Math.random(), speed: 0.0018 + Math.random() * 0.0022, to: p.pos, color: M.streamColorRGB(p, '41,171,226') }));

    function frame() {
      const w = geo.clientWidth || 820, h = geo.clientHeight || 280;
      if (arcCanvas.width !== w || arcCanvas.height !== h) { arcCanvas.width = w; arcCanvas.height = h; }
      const ctx = arcCanvas.getContext('2d');
      ctx.clearRect(0, 0, w, h);
      const fromPt = S.leafletMap.latLngToContainerPoint([homeLat, homeLon]);
      for (const p of particles) {
        p.t = (p.t + p.speed) % 1;
        const toPt = S.leafletMap.latLngToContainerPoint(p.to);
        const alpha = p.t < 0.15 ? p.t / 0.15 : p.t > 0.82 ? (1 - p.t) / 0.18 : 1;
        const px = fromPt.x + (toPt.x - fromPt.x) * p.t;
        const py = fromPt.y + (toPt.y - fromPt.y) * p.t;
        ctx.save();
        ctx.shadowColor = `rgba(${p.color},0.9)`;
        ctx.shadowBlur = 8;
        ctx.fillStyle = `rgba(${p.color},${alpha.toFixed(2)})`;
        ctx.beginPath(); ctx.arc(px, py, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      arcRAF = requestAnimationFrame(frame);
    }
    frame();
  }

  function popupHtml(streams) {
    return `<div class="np-geo-popup">${streams.map((s) => `
      <div class="np-geo-popup-row">
        <strong>${escapeHtml(maskedUser(s.user) || 'Someone')}</strong>
        <span>${escapeHtml(s.title || 'Unknown')}</span>
        <span class="np-geo-popup-svc">${s.svcId}</span>
      </div>`).join('')}</div>`;
  }

  async function renderGeo() {
    M.setStatus('Loading map…');
    await M.ensureLeaflet();
    await fetchHome();

    const geo = M.getOrCreateGeoDiv();
    if (!S.leafletMap) {
      S.leafletMap = L.map(geo, { zoomControl: true, scrollWheelZoom: false, minZoom: 1, maxZoom: 12 }).setView([20, 0], 2);
      S.tileLayer = createBasemapLayer(isLightFamilyTheme()).addTo(S.leafletMap);
    } else {
      setBasemapTheme(S.tileLayer, isLightFamilyTheme());
    }
    setTimeout(() => S.leafletMap.invalidateSize(), 40);

    if (markersLayer) { S.leafletMap.removeLayer(markersLayer); }
    if (linesLayer) { S.leafletMap.removeLayer(linesLayer); }
    markersLayer = L.featureGroup().addTo(S.leafletMap);
    linesLayer = L.featureGroup().addTo(S.leafletMap);

    const streams = M.collectStreams();
    if (!streams.length) { M.setStatus('No active streams'); stopArc(); return; }

    const publicIps = [...new Set(streams.map((s) => s.ip).filter((ip) => ip && !isPrivateIP(ip)))];
    const uncachedIps = publicIps.filter((ip) => !(ip in S.cachedGeoData));
    if (uncachedIps.length) Object.assign(S.cachedGeoData, await geoLookup(uncachedIps));

    const groups = new Map();
    let localOmitted = 0;
    let placed = 0;
    const arcPositions = [];

    for (const stream of streams) {
      const isLocal = !stream.ip || isPrivateIP(stream.ip);
      let lat, lon;
      if (isLocal) {
        if (!S.cachedHome) { localOmitted++; continue; } // no home set — nowhere to plot a local viewer
        lat = S.cachedHome.lat; lon = S.cachedHome.lon;
      } else {
        const loc = S.cachedGeoData[stream.ip];
        if (!loc || loc.status === 'fail' || !Number.isFinite(loc.lat)) { localOmitted++; continue; }
        lat = loc.lat; lon = loc.lon;
        placed++;
      }
      const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
      if (!groups.has(key)) groups.set(key, { lat, lon, streams: [] });
      groups.get(key).streams.push(stream);
      if (!isLocal) arcPositions.push({ pos: [lat, lon], svcId: stream.svcId, mediaType: stream.mediaType });
    }

    const bounds = [];
    for (const group of groups.values()) {
      const count = group.streams.length;
      const isHomeGroup = S.cachedHome && Math.abs(group.lat - S.cachedHome.lat) < 0.01 && Math.abs(group.lon - S.cachedHome.lon) < 0.01;
      const cls = isHomeGroup ? 'np-geo-dot np-geo-dot-home' : count > 1 ? 'np-geo-dot np-geo-dot-group' : 'np-geo-dot';
      const marker = L.marker([group.lat, group.lon], {
        icon: L.divIcon({ className: cls, html: count > 1 ? `<span>${count}</span>` : '', iconSize: [16, 16], iconAnchor: [8, 8] }),
      }).addTo(markersLayer);
      marker.bindPopup(popupHtml(group.streams), { className: 'np-geo-popup-wrap', maxWidth: 240 });
      bounds.push([group.lat, group.lon]);
    }

    if (S.cachedHome && arcPositions.length) {
      for (const { pos } of arcPositions) L.polyline([[S.cachedHome.lat, S.cachedHome.lon], pos], { color: '#a0c8e6', weight: 1, opacity: 0.35, dashArray: '5 8' }).addTo(linesLayer);
      startArc(S.cachedHome.lat, S.cachedHome.lon, arcPositions);
    } else {
      stopArc();
    }

    const locSig = [...groups.keys()].sort().join('|');
    if (bounds.length && locSig !== S.lastLocSig) {
      try {
        const lb = L.latLngBounds(bounds);
        if (lb.isValid()) setTimeout(() => S.leafletMap.flyToBounds(lb, { padding: [50, 50], maxZoom: 10, duration: 1.2 }), 150);
      } catch {}
    }
    S.lastLocSig = locSig;

    const total = placed + (S.cachedHome ? streams.length - placed - localOmitted : 0);
    if (!groups.size) M.setStatus(localOmitted ? `${localOmitted} local viewer${localOmitted !== 1 ? 's' : ''} — set a home location in admin settings to show them` : 'No active streams');
    else M.setStatus(`${streams.length - localOmitted} active stream${streams.length - localOmitted !== 1 ? 's' : ''}${localOmitted ? ` (${localOmitted} local, hidden — no home location set)` : ''}`);
  }

  M.renderGeo = renderGeo;
})();
