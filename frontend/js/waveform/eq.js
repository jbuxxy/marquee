// WAVEFORM MODE — Spectrum/EQ: one cluster per thread (spine + one per
// configured service) of VU-meter style bars, bar heights eased toward
// pseudo-spectrum targets sampled from the shared oscillators, with a
// decaying peak-hold cap.
window.MarqueeWaveform.eq = (function () {
  const BAR_COUNT = 7;
  const clusters = {};

  function ensureCluster(key) {
    if (!clusters[key]) clusters[key] = Array.from({ length: BAR_COUNT }, () => ({ cur: 0, target: 0, peak: 0 }));
    return clusters[key];
  }

  function reset() {
    for (const key in clusters) for (const bar of clusters[key]) { bar.cur = 0; bar.target = 0; bar.peak = 0; }
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw(ctx, w, h, counts, colors) {
    const { osc, THREADS } = window.MarqueeWaveform._shared;
    const total = counts.total;
    const order = ['spine', ...THREADS.filter((t) => !t.spine).map((t) => t.key)];
    const clusterW = w / order.length;
    const barGap = 2;
    const barW = Math.max(2, (clusterW - barGap * (BAR_COUNT + 1)) / BAR_COUNT);

    order.forEach((key, ci) => {
      const own = key === 'spine' ? null : counts[key] || 0;
      const col = colors[key];
      const ampScale = key === 'spine' ? h * Math.min(0.15 + total * 0.05, 0.60) : h * Math.min(0.10 + own * 0.13, 0.60);
      const alpha = key === 'spine' ? Math.min(0.35 + total * 0.05, 1.0) : Math.min(0.30 + own * 0.14, 1.0);
      const glow = key === 'spine' ? 2 + total * 0.5 : 2 + (own || 0) * 1.2;

      const bars = ensureCluster(key);
      const clusterX = ci * clusterW;
      for (let i = 0; i < BAR_COUNT; i++) {
        const bar = bars[i];
        const o = osc[(ci + i) % osc.length];
        const raw = Math.sin(o.phase * (3 + i * 0.7) + i * 1.3) * 0.5 + 0.5;
        bar.target = raw * ampScale;
        bar.cur += (bar.target - bar.cur) * 0.18;
        bar.peak = bar.cur > bar.peak ? bar.cur : Math.max(bar.cur, bar.peak - h * 0.01);

        const x = clusterX + barGap + i * (barW + barGap);
        const barH = Math.max(2, bar.cur);
        ctx.save();
        ctx.fillStyle = `rgba(${col},${alpha})`;
        ctx.shadowColor = `rgba(${col},${Math.min(alpha * 0.7, 0.6)})`;
        ctx.shadowBlur = glow;
        roundRectPath(ctx, x, h - barH, barW, barH, Math.min(barW / 2, 2));
        ctx.fill();
        ctx.fillStyle = `rgba(${col},${Math.min(alpha + 0.25, 1)})`;
        ctx.fillRect(x, h - bar.peak - 1.5, barW, 1.5);
        ctx.restore();
      }
    });
  }

  return { draw, reset };
})();
