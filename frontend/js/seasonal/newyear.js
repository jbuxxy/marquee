window.MarqueeSeasonal.newyear = function () {
  const canvas = document.createElement('canvas');
  canvas.className = 'sf-layer sf-confetti';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const confetti = [];
  const COLS = ['#ffd700', '#c0c0c0', '#ff3366', '#4488ff', '#ff9900', '#ffffff', '#cc44ff'];
  window._sfAutoResizeCanvas(canvas);

  function spawnOne(x) {
    confetti.push({
      x: x !== undefined ? x : Math.random() * canvas.width, y: Math.random() * canvas.height * 0.15,
      vx: (Math.random() - 0.5) * 4, vy: 1 + Math.random() * 2.5, w: 4 + Math.random() * 6, h: 8 + Math.random() * 10,
      color: COLS[Math.floor(Math.random() * COLS.length)], rot: Math.random() * Math.PI * 2, rotV: (Math.random() - 0.5) * 0.18,
      alpha: 1, decay: 0.007 + Math.random() * 0.006,
    });
  }
  function burst() {
    if (!canvas.isConnected) return;
    const total = 24 + Math.floor(Math.random() * 12);
    for (let w = 0; w < 3; w++) setTimeout(() => { for (let i = 0; i < total / 3; i++) spawnOne(Math.random() * canvas.width); }, w * 380);
    setTimeout(burst, 12000 + Math.random() * 6000);
  }
  let confettiRafId = null;
  function frame() {
    if (!canvas.isConnected) return;
    if (document.hidden) { confettiRafId = null; return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (Math.random() < 0.15) spawnOne();
    for (let i = confetti.length - 1; i >= 0; i--) {
      const c = confetti[i];
      c.x += c.vx; c.y += c.vy; c.vy += 0.12; c.vx *= 0.988; c.rot += c.rotV; c.alpha -= c.decay;
      if (c.alpha <= 0 || c.y > canvas.height) { confetti.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = c.alpha; ctx.fillStyle = c.color; ctx.translate(c.x, c.y); ctx.rotate(c.rot);
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h); ctx.restore();
    }
    confettiRafId = requestAnimationFrame(frame);
  }
  confettiRafId = requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => { if (document.hidden || !canvas.isConnected) return; if (confettiRafId === null) confettiRafId = requestAnimationFrame(frame); });
  setTimeout(burst, 600);

  (function () {
    const NY_SRC = 'public/seasons/lottie-newyears.lottie';
    window._sfLoadLottieWC(() => {
      if (document.querySelector('.sf-ny-lottie')) return;
      const el = document.createElement('dotlottie-wc');
      el.className = 'sf-layer sf-ny-lottie';
      el.setAttribute('src', NY_SRC);
      el.setAttribute('autoplay', ''); el.setAttribute('loop', '');
      const _logoEl = document.querySelector('.logo-wrap') || document.querySelector('.logo-img');
      const _logoR = _logoEl?.getBoundingClientRect();
      const _logoCY = _logoR ? (_logoR.top + _logoR.bottom) / 2 + window.scrollY : 70;
      const NW = Math.min(600, window.innerWidth - 20);
      const NH = Math.round((NW * 400) / 600);
      el.style.cssText = `position:absolute;top:${Math.round(_logoCY - NH / 2)}px;left:50%;transform:translateX(-50%);width:${NW}px;height:${NH}px;pointer-events:none;z-index:1;opacity:0.65;`;
      document.body.appendChild(el);
    });
  })();
};
