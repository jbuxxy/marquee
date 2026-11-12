// WAVEFORM MODE — Sonar ripple: concentric rings expanding outward from
// canvas center. Spine emits a steady heartbeat train; each configured
// service emits its own ring train scaled by its own stream count.
window.MarqueeWaveform.sonar = (function () {
  const rings = { spine: [] };

  function reset() {
    for (const k in rings) rings[k].length = 0;
  }

  function draw(ctx, w, h, counts, colors) {
    const { THREADS } = window.MarqueeWaveform._shared;
    const cx = w / 2, cy = h / 2;
    const maxR = Math.max(w, h) * 0.75;

    const sources = [{ key: 'spine', own: null, col: colors.spine }];
    for (const t of THREADS) {
      if (t.spine) continue;
      if (!rings[t.key]) rings[t.key] = [];
      sources.push({ key: t.key, own: counts[t.key] || 0, col: colors[t.key] });
    }

    for (const src of sources) {
      const arr = rings[src.key];
      const own = src.own;
      const spawnRate = src.key === 'spine' ? 0.018 + counts.total * 0.002 : 0.008 + own * 0.05;
      if (Math.random() < spawnRate) {
        arr.push({ r: 2, startAlpha: src.key === 'spine' ? Math.min(0.30 + counts.total * 0.03, 0.9) : Math.min(0.35 + own * 0.18, 1.0) });
      }

      const growSpeed = src.key === 'spine' ? 0.55 + counts.total * 0.05 : 0.55 + own * 0.35;
      const lineW = src.key === 'spine' ? 1.2 + counts.total * 0.15 : 0.8 + own * 0.8;
      const glow = src.key === 'spine' ? 2 + counts.total * 0.4 : 2 + own * 0.4;

      for (let i = arr.length - 1; i >= 0; i--) {
        const ring = arr[i];
        ring.r += growSpeed;
        const alpha = ring.startAlpha * Math.max(0, 1 - ring.r / maxR);
        if (alpha <= 0.02 || ring.r > maxR) { arr.splice(i, 1); continue; }
        ctx.save();
        ctx.strokeStyle = `rgba(${src.col},${alpha})`;
        ctx.lineWidth = lineW;
        ctx.shadowColor = `rgba(${src.col},${Math.min(alpha * 0.7, 0.6)})`;
        ctx.shadowBlur = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  return { draw, reset };
})();
