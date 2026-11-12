// WAVEFORM MODE — Organic: intertwining threads (server spine + one strand
// per configured service) with drifting particles along each strand.
window.MarqueeWaveform.organic = (function () {
  const orgParticles = [];

  function reset() { orgParticles.length = 0; }

  function drawThread(ctx, w, h, thread, own, total) {
    const { threadSample } = window.MarqueeWaveform._shared;
    const midY = h / 2;
    const others = total - own;
    const amp = thread.spine ? h * 0.46 : h * Math.min(0.30 + own * 0.065 + others * 0.005, 0.52);
    const col = thread.col;
    const steps = Math.ceil(w);
    const lineW = thread.spine ? 1.8 + total * 0.08 : 0.70 + own * 0.62 + others * 0.05;
    const alpha = thread.spine ? 0.38 + total * 0.04 : Math.min(0.18 + own * 0.18 + others * 0.015, 1.0);
    const blur = thread.spine ? 3 + total * 0.5 : 1.5 + own * 4.2 + others * 0.35;

    ctx.save();
    ctx.strokeStyle = `rgba(${col},${alpha})`;
    ctx.lineWidth = lineW;
    ctx.shadowColor = `rgba(${col},${Math.min(alpha * 0.75, 0.65)})`;
    ctx.shadowBlur = blur;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const y = midY - threadSample(i / steps, thread, own, total) * amp;
      i === 0 ? ctx.moveTo(i, y) : ctx.lineTo(i, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function tickParticles(ctx, w, h, counts) {
    const { threadSample, THREADS } = window.MarqueeWaveform._shared;
    for (let i = orgParticles.length - 1; i >= 0; i--) if (orgParticles[i].life <= 0) orgParticles.splice(i, 1);
    if (orgParticles.length > 280) orgParticles.length = 280;

    if (counts.total >= 1) {
      const midY = h / 2;
      for (const thread of THREADS) {
        if (thread.spine) continue;
        const own = counts[thread.key] || 0;
        const total = counts.total;
        const amp = h * Math.min(0.30 + own * 0.065 + (total - own) * 0.005, 0.52);
        const rate = 0.035 * total * (1 + own * 0.4);
        if (Math.random() >= rate) continue;
        const t = Math.random();
        const y = midY - threadSample(t, thread, own, total) * amp;
        orgParticles.push({ x: t * w, y, vx: (0.28 + Math.random() * 0.48) * (Math.random() < 0.5 ? 1 : -1), vy: (Math.random() - 0.5) * 0.20, life: 1.0, r: 0.55 + Math.random() * (0.7 + total * 0.18), col: thread.col });
      }
    }

    for (const p of orgParticles) {
      ctx.save();
      ctx.globalAlpha = p.life * 0.70;
      ctx.fillStyle = `rgba(${p.col},1)`;
      ctx.shadowColor = `rgba(${p.col},0.85)`;
      ctx.shadowBlur = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      p.x += p.vx; p.y += p.vy; p.life -= 0.016;
    }
  }

  function draw(ctx, w, h, counts) {
    const { THREADS } = window.MarqueeWaveform._shared;
    for (const thread of THREADS) drawThread(ctx, w, h, thread, thread.key ? counts[thread.key] || 0 : 0, counts.total);
    tickParticles(ctx, w, h, counts);
  }

  return { draw, reset };
})();
