// LIVE MAP — NETWORK MODE. Three visual styles cycling via the style button:
// orbit (a ring of nodes around a hub, drag to rotate), radar (a rotating
// sweep that "lights up" nodes as it passes, phosphor trail), and matrix (a
// node grid with digital-rain styling). All three share the same
// hub-plus-nodes data (resolveNodes()) and the same click-to-open /
// click-to-expand-a-group interactions.
(function () {
  const M = window.MarqueeMap;
  if (!M) return;
  const S = M._shared;

  let canvas = null, ctx = null, raf = null, dpr = window.devicePixelRatio || 1;
  let renderedNodes = [];
  let tick = 0;
  let cachedGeoAt = 0;
  let latestFrame = null;
  let style = 'orbit';

  // Orbit drag-rotation (persistent view angle, mouse-draggable)
  let orbitAngle = 0;
  let dragging = false, dragStartX = 0, dragStartAngle = 0, didDrag = false;

  // Radar sweep state
  let radarAngle = 0;
  const radarNodeLit = new Map(); // key -> 0..1 brightness
  const phosphorBlips = [];

  const expandedGroups = new Set(); // key of groups currently "fanned out"

  function ensureCanvas() {
    if (canvas) return canvas;
    canvas = document.createElement('canvas');
    canvas.id = 'np-network-canvas';
    canvas.style.cssText = 'position:absolute;inset:0;cursor:grab;';
    M.container.appendChild(canvas);
    ctx = canvas.getContext('2d');

    function nodeAt(x, y) {
      let closest = null, bestDist = 22;
      for (const n of renderedNodes) {
        const d = Math.hypot(n.x - x, n.y - y);
        if (d < bestDist) { bestDist = d; closest = n; }
      }
      return closest;
    }

    canvas.addEventListener('mousedown', (e) => {
      if (style !== 'orbit') return;
      dragging = true; didDrag = false;
      dragStartX = e.clientX; dragStartAngle = orbitAngle;
      canvas.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - dragStartX;
      if (Math.abs(dx) > 3) didDrag = true;
      orbitAngle = dragStartAngle + dx * 0.008;
    });
    window.addEventListener('mouseup', () => { dragging = false; if (canvas) canvas.style.cursor = 'grab'; });

    canvas.addEventListener('click', (e) => {
      if (didDrag) { didDrag = false; return; }
      const rect = canvas.getBoundingClientRect();
      const clicked = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
      if (!clicked) return;
      if (clicked.streams.length === 1) { openStreamDetail(clicked.streams[0]); return; }
      if (expandedGroups.has(clicked.key)) expandedGroups.delete(clicked.key);
      else expandedGroups.add(clicked.key);
    });
    return canvas;
  }

  function haversineMiles(lat1, lon1, lat2, lon2) {
    const R = 3958.8, toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function bearing(lat1, lon1, lat2, lon2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
    return Math.atan2(y, x);
  }

  async function resolveNodes() {
    const streams = M.collectStreams();
    const publicIps = [...new Set(streams.map((s) => s.ip).filter((ip) => ip && !isPrivateIP(ip)))];
    const uncachedIps = publicIps.filter((ip) => !(ip in S.cachedGeoData));
    if (uncachedIps.length && Date.now() - cachedGeoAt > 15000) {
      Object.assign(S.cachedGeoData, await geoLookup(uncachedIps));
      cachedGeoAt = Date.now();
    }

    const groups = new Map();
    let hubCount = 0;
    for (const s of streams) {
      const isLocal = !s.ip || isPrivateIP(s.ip);
      if (isLocal) { hubCount++; continue; }
      const loc = S.cachedGeoData[s.ip];
      if (!loc || loc.status === 'fail' || !Number.isFinite(loc.lat)) { hubCount++; continue; }
      const key = `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;
      if (!groups.has(key)) groups.set(key, { key, lat: loc.lat, lon: loc.lon, city: loc.city, streams: [] });
      groups.get(key).streams.push(s);
    }
    return { groups: [...groups.values()], hubCount, total: streams.length };
  }

  // ── Shared node-position math (used by orbit + radar) ──────────────────
  function computeRingPositions(cx, cy, outerR, groups, angleOffset) {
    const hasHome = !!S.cachedHome;
    const maxDist = groups.length ? Math.max(1, ...groups.map((g) => (hasHome ? haversineMiles(S.cachedHome.lat, S.cachedHome.lon, g.lat, g.lon) : 1))) : 1;
    const positions = [];
    groups.forEach((g, i) => {
      const baseAngle = hasHome
        ? bearing(S.cachedHome.lat, S.cachedHome.lon, g.lat, g.lon) - Math.PI / 2
        : (i / Math.max(1, groups.length)) * Math.PI * 2 - Math.PI / 2;
      const angle = baseAngle + angleOffset;
      const distFrac = hasHome ? haversineMiles(S.cachedHome.lat, S.cachedHome.lon, g.lat, g.lon) / maxDist : 0.75;
      const r = Math.min(outerR - 12, outerR * (0.3 + 0.65 * distFrac));
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      const dist = hasHome ? haversineMiles(S.cachedHome.lat, S.cachedHome.lon, g.lat, g.lon) : null;
      positions.push({ key: g.key, x, y, bx: cx, by: cy, angle, streams: g.streams, dist });
    });
    return positions;
  }

  // Expands a multi-stream group into a small fan of sub-nodes around its
  // collapsed position, when the user has clicked to expand it.
  function expandGroupNodes(nodes, maxR) {
    const out = [];
    for (const n of nodes) {
      if (n.streams.length > 1 && expandedGroups.has(n.key)) {
        const fanR = 22;
        n.streams.forEach((s, i) => {
          const a = (i / n.streams.length) * Math.PI * 2;
          let fx = n.x + Math.cos(a) * fanR;
          let fy = n.y + Math.sin(a) * fanR;
          if (maxR != null) {
            const dx = fx - n.bx, dy = fy - n.by;
            const d = Math.hypot(dx, dy);
            if (d > maxR) { const scale = maxR / d; fx = n.bx + dx * scale; fy = n.by + dy * scale; }
          }
          out.push({ key: `${n.key}:${i}`, parentKey: n.key, x: fx, y: fy, bx: n.x, by: n.y, streams: [s], dist: n.dist, isFanned: true });
        });
        out.push({ ...n, isGroupExpanded: true });
      } else {
        out.push(n);
      }
    }
    return out;
  }

  function drawNode(n, rgb, tickVal) {
    const count = n.streams.length;
    if (n.isFanned) {
      ctx.beginPath(); ctx.moveTo(n.bx, n.by); ctx.lineTo(n.x, n.y);
      ctx.strokeStyle = `rgba(${rgb},0.4)`; ctx.lineWidth = 0.8; ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]);
    } else {
      ctx.beginPath(); ctx.moveTo(n.bx, n.by); ctx.lineTo(n.x, n.y);
      ctx.strokeStyle = 'rgba(160,200,230,0.18)'; ctx.lineWidth = 1; ctx.stroke();
    }
    const nodeR = count > 1 && !n.isFanned ? 9 : 6;
    ctx.beginPath();
    if (count > 1 && !n.isFanned) ctx.arc(n.x, n.y, nodeR, 0, Math.PI * 2);
    else { ctx.moveTo(n.x, n.y - nodeR); ctx.lineTo(n.x + nodeR, n.y); ctx.lineTo(n.x, n.y + nodeR); ctx.lineTo(n.x - nodeR, n.y); ctx.closePath(); }
    ctx.fillStyle = `rgba(${rgb},0.85)`;
    ctx.shadowColor = `rgba(${rgb},0.7)`; ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
    if (count > 1 && !n.isFanned) { ctx.fillStyle = '#fff'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(count), n.x, n.y); }
    if (n.dist != null && !n.isFanned) { ctx.fillStyle = `rgba(${rgb},0.7)`; ctx.font = '8px monospace'; ctx.textAlign = 'center'; ctx.fillText(`${Math.round(n.dist)}mi`, n.x, n.y - nodeR - 5); }
    renderedNodes.push({ x: n.x, y: n.y, key: n.key, streams: n.streams });
  }

  function drawHub(cx, cy, hubCount) {
    const pulse = 10 + Math.sin(tick * 0.06) * 2;
    ctx.beginPath(); ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(160,200,230,0.85)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(160,200,230,0.9)'; ctx.fill();
    if (hubCount > 0) { ctx.fillStyle = '#fff'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(hubCount), cx, cy - pulse - 8); }
  }

  // ── Orbit ────────────────────────────────────────────────────────────
  function drawOrbit(w, h, groups, hubCount, total) {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const outerR = Math.min(w, h) * 0.38;

    ctx.save();
    ctx.strokeStyle = 'rgba(160,200,230,0.12)'; ctx.lineWidth = 1;
    for (const frac of [0.4, 0.7, 1.0]) { ctx.beginPath(); ctx.arc(cx, cy, outerR * frac, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();

    const autoSpin = S.cachedHome ? 0 : tick * 0.0015;
    renderedNodes = [];
    let nodes = computeRingPositions(cx, cy, outerR, groups, orbitAngle + autoSpin);
    nodes = expandGroupNodes(nodes, outerR);
    for (const n of nodes) drawNode(n, M.streamColorRGB(n.streams[0], '41,171,226'));
    drawHub(cx, cy, hubCount);
    tick++;
  }

  // ── Radar ────────────────────────────────────────────────────────────
  function drawRadar(w, h, groups, hubCount, total) {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const maxR = Math.min(w, h) * 0.42;
    const ac = '160,200,230';

    for (let i = 1; i <= 3; i++) {
      ctx.beginPath(); ctx.arc(cx, cy, (maxR * i) / 3, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${ac},0.25)`; ctx.lineWidth = 1; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.strokeStyle = `rgba(${ac},0.12)`; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy); ctx.stroke();

    renderedNodes = [];
    let nodes = computeRingPositions(cx, cy, maxR, groups, 0);
    nodes = expandGroupNodes(nodes, maxR);

    // Phosphor trail from previous blips
    for (let i = phosphorBlips.length - 1; i >= 0; i--) {
      const b = phosphorBlips[i];
      b.age += 1 / 60;
      if (b.age >= b.maxAge) { phosphorBlips.splice(i, 1); continue; }
      const alpha = (1 - b.age / b.maxAge) * 0.55;
      ctx.beginPath(); ctx.arc(b.x, b.y, 2.5 + (b.age / b.maxAge) * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${ac},${alpha.toFixed(3)})`; ctx.fill();
    }

    // Sweep
    const sweepSpeed = 0.02 + nodes.length * 0.003;
    radarAngle += sweepSpeed;
    const sweepLen = Math.PI * 0.22;
    for (let i = 0; i < 20; i++) {
      const a1 = radarAngle - sweepLen * (1 - i / 20);
      const a2 = radarAngle - sweepLen * (1 - (i + 1) / 20);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, maxR, a1, a2); ctx.closePath();
      ctx.fillStyle = `rgba(${ac},${((i / 20) * 0.2).toFixed(3)})`; ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(radarAngle) * maxR, cy + Math.sin(radarAngle) * maxR);
    ctx.strokeStyle = `rgba(${ac},0.85)`; ctx.lineWidth = 1.5; ctx.shadowColor = `rgba(${ac},0.7)`; ctx.shadowBlur = 12; ctx.stroke(); ctx.shadowBlur = 0;

    // Light up nodes the sweep passes
    const sw = ((radarAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    for (const n of nodes) {
      if (n.isFanned) continue;
      const na = (Math.atan2(n.y - cy, n.x - cx) + Math.PI * 2) % (Math.PI * 2);
      const diff = Math.abs(sw - na);
      const hit = diff < 0.12 || diff > Math.PI * 2 - 0.12;
      const cur = radarNodeLit.get(n.key) || 0;
      if (hit && cur < 0.5) { radarNodeLit.set(n.key, 1); phosphorBlips.push({ x: n.x, y: n.y, age: 0, maxAge: 1.2 }); }
      else radarNodeLit.set(n.key, Math.max(0, cur - 0.01));
    }

    for (const n of nodes) {
      const lit = n.isFanned ? radarNodeLit.get(n.parentKey) || 0 : radarNodeLit.get(n.key) || 0;
      const rgb = M.streamColorRGB(n.streams[0], '41,171,226');
      drawNode(n, lit > 0.1 ? '255,255,255' : rgb);
    }
    drawHub(cx, cy, hubCount);
  }

  // ── Matrix ───────────────────────────────────────────────────────────
  function drawMatrix(w, h, groups, hubCount, total) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,20,0,0.15)'; ctx.fillRect(0, 0, w, h);

    // Faint digital grid
    ctx.strokeStyle = 'rgba(0,255,120,0.06)'; ctx.lineWidth = 1;
    const gridStep = 28;
    for (let x = (tick % gridStep); x < w; x += gridStep) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += gridStep) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    renderedNodes = [];
    const cols = Math.max(1, Math.ceil(Math.sqrt(groups.length)));
    const cellW = w / (cols + 1), cellH = h / (Math.ceil(groups.length / cols) + 1);
    const cx = w / 2, cy = h / 2;

    let nodes = groups.map((g, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = cellW * (col + 1), y = cellH * (row + 1);
      return { key: g.key, x, y, bx: cx, by: cy, streams: g.streams, dist: S.cachedHome ? haversineMiles(S.cachedHome.lat, S.cachedHome.lon, g.lat, g.lon) : null };
    });
    nodes = expandGroupNodes(nodes);

    for (const n of nodes) {
      ctx.beginPath(); ctx.moveTo(n.bx, n.by); ctx.lineTo(n.x, n.y);
      ctx.strokeStyle = 'rgba(0,255,120,0.18)'; ctx.lineWidth = 1; ctx.stroke();
      const rgb = M.streamColorRGB(n.streams[0], '0,255,120');
      const count = n.streams.length;
      const boxSize = count > 1 && !n.isFanned ? 16 : 11;
      ctx.save();
      ctx.strokeStyle = `rgba(${rgb},0.9)`; ctx.lineWidth = 1.4;
      ctx.shadowColor = `rgba(${rgb},0.6)`; ctx.shadowBlur = 6;
      ctx.strokeRect(n.x - boxSize / 2, n.y - boxSize / 2, boxSize, boxSize);
      ctx.restore();
      if (count > 1 && !n.isFanned) { ctx.fillStyle = `rgba(${rgb},0.9)`; ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(count), n.x, n.y); }
      renderedNodes.push({ x: n.x, y: n.y, key: n.key, streams: n.streams });
    }
    ctx.save(); ctx.strokeStyle = 'rgba(160,255,200,0.85)'; ctx.lineWidth = 1.5; ctx.strokeRect(cx - 5, cy - 5, 10, 10);
    if (hubCount > 0) { ctx.fillStyle = '#dfffe8'; ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.fillText(String(hubCount), cx, cy - 12); }
    ctx.restore();
    tick++;
  }

  async function renderNetwork() {
    ensureCanvas();
    const w = M.container.clientWidth || 800, h = M.container.clientHeight || 320;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    latestFrame = await resolveNodes();
    M.setStatus(latestFrame.total ? `${latestFrame.total} active stream${latestFrame.total !== 1 ? 's' : ''} — ${style}` : 'No active streams');

    stopNetwork();
    function loop() {
      if (!S.mapOpen || S.activeMode !== 'network') return;
      const w2 = canvas.width / dpr, h2 = canvas.height / dpr;
      if (style === 'orbit') drawOrbit(w2, h2, latestFrame.groups, latestFrame.hubCount, latestFrame.total);
      else if (style === 'radar') drawRadar(w2, h2, latestFrame.groups, latestFrame.hubCount, latestFrame.total);
      else drawMatrix(w2, h2, latestFrame.groups, latestFrame.hubCount, latestFrame.total);
      raf = requestAnimationFrame(loop);
    }
    loop();
  }

  function stopNetwork() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
  }

  function cycleStyle() {
    style = style === 'orbit' ? 'radar' : style === 'radar' ? 'matrix' : 'orbit';
    const btn = document.getElementById('np-network-style-btn');
    if (btn) btn.textContent = style[0].toUpperCase() + style.slice(1);
    if (latestFrame) M.setStatus(latestFrame.total ? `${latestFrame.total} active stream${latestFrame.total !== 1 ? 's' : ''} — ${style}` : 'No active streams');
  }

  document.getElementById('np-network-style-btn')?.addEventListener('click', cycleStyle);

  M.renderNetwork = renderNetwork;
  M.stopNetwork = stopNetwork;
})();
