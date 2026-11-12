// WAVEFORM MODE — Aurora flow: soft colored ribbons drifting/undulating per
// configured service. Spine is an ambient full-canvas wash rather than a
// ribbon, so it stays visually distinct from the platform strands.
window.MarqueeWaveform.aurora = (function () {
  function reset() {}

  // Configured services spread evenly across the vertical middle band.
  function ribbonPositions(keys) {
    const start = 0.28, end = 0.80;
    const pos = {};
    keys.forEach((key, i) => { pos[key] = keys.length > 1 ? start + (end - start) * (i / (keys.length - 1)) : (start + end) / 2; });
    return pos;
  }

  function draw(ctx, w, h, counts, colors) {
    const { osc, env, THREADS } = window.MarqueeWaveform._shared;
    const total = counts.total;
    const strandKeys = THREADS.filter((t) => !t.spine).map((t) => t.key);
    const midYFrac = ribbonPositions(strandKeys);

    const breathe = 0.6 + 0.4 * Math.sin(osc[0].phase * 0.6);
    const washAlpha = (0.025 + total * 0.010) * breathe;
    ctx.fillStyle = `rgba(${colors.spine},${washAlpha})`;
    ctx.fillRect(0, 0, w, h);

    for (const key of strandKeys) {
      const thread = THREADS.find((t) => t.key === key);
      const own = counts[key] || 0;
      const centerY = h * midYFrac[key];
      const ampC = h * Math.min(0.06 + own * 0.03, 0.16);

      const pts = [];
      for (let x = 0; x <= w; x += 3) {
        const t = x / w;
        const y = centerY + ampC * env(thread.oi[0]) * (
          0.6 * Math.sin(t * Math.PI * 2 * thread.freq + osc[thread.oi[0]].phase) +
          0.3 * Math.sin(t * Math.PI * 2 * thread.freq * 1.7 + osc[thread.oi[1]].phase) +
          0.1 * Math.sin(t * Math.PI * 2 * thread.freq * 2.9 + osc[thread.oi[2]].phase)
        );
        pts.push([x, y]);
      }

      const layers = Math.round(2 + own * 1.5);
      const spacing = 1.4 + own * 0.35;
      const baseAlpha = 0.10 + own * 0.10;
      for (let L = 0; L < layers; L++) {
        const dy = (L - (layers - 1) / 2) * spacing;
        const falloff = 1 - Math.abs(L - (layers - 1) / 2) / ((layers - 1) / 2 + 1);
        ctx.save();
        ctx.strokeStyle = `rgba(${thread.col},${baseAlpha * falloff})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) { const [x, y] = pts[i]; i === 0 ? ctx.moveTo(x, y + dy) : ctx.lineTo(x, y + dy); }
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  return { draw, reset };
})();
