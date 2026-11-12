// WAVEFORM MODE — Ocean swell: layered translucent wave fills (spine
// deepest, one layer per configured service stacked toward the foreground)
// with whitecap foam particles spawning near each layer's crest.
window.MarqueeWaveform.ocean = (function () {
  const foam = [];

  function reset() { foam.length = 0; }

  function blend(colA, colB, t) {
    const a = colA.split(',').map(Number), b = colB.split(',').map(Number);
    return a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',');
  }

  // Spine baseline fixed at 0.34; remaining configured services spread evenly
  // across the 0.50–0.84 band, so this reads correctly whether 1, 2, or 3
  // services are configured (not just the original's fixed 3-layer case).
  function buildLayers() {
    const { THREADS } = window.MarqueeWaveform._shared;
    const strandKeys = THREADS.filter((t) => !t.spine).map((t) => t.key);
    const layers = [{ key: null, baseline: 0.34 }];
    const bandStart = 0.50, bandEnd = 0.84;
    strandKeys.forEach((key, i) => {
      const frac = strandKeys.length > 1 ? i / (strandKeys.length - 1) : 0;
      layers.push({ key, baseline: bandStart + (bandEnd - bandStart) * frac });
    });
    return layers;
  }

  function draw(ctx, w, h, counts) {
    const { threadSample, THREADS } = window.MarqueeWaveform._shared;
    const LAYERS = buildLayers();

    for (let i = foam.length - 1; i >= 0; i--) if (foam[i].life <= 0) foam.splice(i, 1);
    if (foam.length > 200) foam.length = 200;

    for (const layer of LAYERS) {
      const thread = THREADS.find((t) => (layer.key ? t.key === layer.key : t.spine));
      if (!thread) continue;
      const own = layer.key ? counts[layer.key] || 0 : 0;
      const total = counts.total;
      const baseY = h * layer.baseline;
      const amp = layer.key ? h * Math.min(0.05 + own * 0.035, 0.16) : h * (0.03 + total * 0.01);
      const alpha = layer.key ? Math.min(0.16 + own * 0.11, 0.55) : 0.14 + total * 0.02;
      const band = h * Math.min(0.09 + own * 0.025, 0.20);

      const top = [];
      let crestX = 0, crestY = h;
      for (let x = 0; x <= w; x += 2) {
        const t = x / w;
        const y = baseY - threadSample(t, thread, own, total) * amp;
        top.push([x, y]);
        if (y < crestY) { crestY = y; crestX = x; }
      }

      ctx.beginPath();
      ctx.moveTo(top[0][0], top[0][1]);
      for (let i = 1; i < top.length; i++) ctx.lineTo(top[i][0], top[i][1]);
      for (let i = top.length - 1; i >= 0; i--) ctx.lineTo(top[i][0], top[i][1] + band);
      ctx.closePath();
      ctx.fillStyle = `rgba(${thread.col},${alpha})`;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(top[0][0], top[0][1]);
      for (let i = 1; i < top.length; i++) ctx.lineTo(top[i][0], top[i][1]);
      ctx.strokeStyle = `rgba(${blend(thread.col, '255,255,255', 0.6)},${Math.min(alpha + 0.3, 0.85)})`;
      ctx.lineWidth = 1.25;
      ctx.stroke();

      if (layer.key && own > 0 && Math.random() < 0.09 * own) {
        foam.push({ x: crestX + (Math.random() - 0.5) * 14, y: crestY + (Math.random() - 0.5) * 3, vx: (Math.random() - 0.5) * 0.5, vy: -0.18 - Math.random() * 0.18, life: 1.0, r: 1.4 + Math.random() * 1.6, col: blend(thread.col, '255,255,255', 0.88) });
      }
    }

    for (const p of foam) {
      ctx.save();
      ctx.globalAlpha = Math.min(p.life * 1.1, 1);
      ctx.fillStyle = `rgba(${p.col},1)`;
      ctx.shadowColor = `rgba(${p.col},0.9)`;
      ctx.shadowBlur = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      p.x += p.vx; p.y += p.vy; p.life -= 0.014;
    }
  }

  return { draw, reset };
})();
