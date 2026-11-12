window.MarqueeSeasonal.july4 = function () {
  const canvas = document.createElement('canvas');
  canvas.className = 'sf-layer sf-fireworks';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const rockets = [], sparks = [];
  const COLS = ['#ff3333', '#ffffff', '#4488ff', '#ff9900', '#ffff33', '#ff44bb', '#44ffcc', '#00ffcc', '#ff6644', '#aaff00'];
  window._sfAutoResizeCanvas(canvas);

  function launch(x) {
    rockets.push({ x: x !== undefined ? x : canvas.width * (0.1 + Math.random() * 0.8), y: canvas.height, vy: -(11 + Math.random() * 10), vx: (Math.random() - 0.5) * 3, trail: [], color: COLS[Math.floor(Math.random() * COLS.length)] });
  }
  function explode(x, y, color, type) {
    const t = type || (Math.random() < 0.28 ? 'ring' : Math.random() < 0.35 ? 'willow' : 'standard');
    const n = t === 'ring' ? 52 : 52 + Math.floor(Math.random() * 38);
    for (let i = 0; i < n; i++) {
      const a = t === 'ring' ? (Math.PI * 2 * i) / n : (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const sp = t === 'ring' ? 3.8 + Math.random() * 1.5 : t === 'willow' ? 1.5 + Math.random() * 3.5 : 2.5 + Math.random() * 7;
      sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + (t === 'willow' ? Math.random() * 1.5 : 0), color, alpha: 1, r: t === 'ring' ? 0.6 + Math.random() * 0.8 : 0.8 + Math.random() * 2.2, decay: t === 'ring' ? 0.015 + Math.random() * 0.007 : 0.01 + Math.random() * 0.009, grav: t === 'willow' ? 0.07 + Math.random() * 0.04 : 0.042 + Math.random() * 0.02, drag: t === 'willow' ? 0.986 : 0.973 });
    }
    for (let i = 0; i < 10; i++) sparks.push({ x, y, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5, color: '#fff', alpha: 1, r: 0.5, decay: 0.038, grav: 0.04, drag: 0.97 });
    if (Math.random() < 0.25) {
      const sec = COLS[Math.floor(Math.random() * COLS.length)];
      const dx = (Math.random() - 0.5) * 70, dy = -35 - Math.random() * 40;
      setTimeout(() => { if (canvas.isConnected && !document.hidden) explode(x + dx, y + dy, sec, 'ring'); }, 280 + Math.random() * 200);
    }
  }

  let lastLaunch = 0, rafId = null, burstId = null;
  function frame(ts) {
    if (!canvas.isConnected) return;
    if (document.hidden) { rafId = null; return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (ts - lastLaunch > 800 + Math.random() * 2000) { launch(); lastLaunch = ts; }
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.trail.push([r.x, r.y]); if (r.trail.length > 14) r.trail.shift();
      r.x += r.vx; r.y += r.vy; r.vy += 0.18;
      r.trail.forEach(([tx, ty], j) => {
        ctx.globalAlpha = (j / r.trail.length) * 0.7;
        ctx.strokeStyle = r.color; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + r.vx * 0.6, ty + r.vy * 0.6); ctx.stroke();
      });
      if (r.vy >= 0 || r.y < canvas.height * 0.1) { explode(r.x, r.y, r.color); rockets.splice(i, 1); }
    }
    ctx.save(); ctx.lineCap = 'round';
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx; s.y += s.vy; s.vy += s.grav; s.vx *= s.drag; s.vy *= s.drag; s.alpha -= s.decay;
      if (s.alpha <= 0) { sparks.splice(i, 1); continue; }
      ctx.globalAlpha = s.alpha;
      ctx.strokeStyle = s.color; ctx.lineWidth = s.r * 1.6;
      ctx.beginPath(); ctx.moveTo(s.x - s.vx * 3, s.y - s.vy * 3); ctx.lineTo(s.x, s.y); ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
  function burst() {
    if (!canvas.isConnected) return;
    if (document.hidden) { burstId = null; return; }
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) setTimeout(() => { if (!document.hidden) launch(); }, i * 240);
    burstId = setTimeout(burst, 5500 + Math.random() * 8000);
  }
  burstId = setTimeout(burst, 1800);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !canvas.isConnected) return;
    lastLaunch = performance.now();
    if (rafId === null) rafId = requestAnimationFrame(frame);
    if (burstId === null) burstId = setTimeout(burst, 1800);
  });

  // No mascot here (the original asset for this slot turned out to be
  // a caricature of a specific real politician, not a generic patriotic
  // figure — inappropriate as default content in a public, generic tool, so
  // it's dropped rather than shipped). Fireworks + particles cover the
  // holiday on their own.
  window._sfParticles(['🎇', '🎆', '🇺🇸'], { count: 10, minSz: 14, szRange: 10, minDur: 11, durRange: 7, rise: true });
};
