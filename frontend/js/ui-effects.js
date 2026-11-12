// PAGE LOAD PROGRESS BAR
(function () {
  const bar = document.getElementById('progress-bar');
  if (!bar) return;
  let p = 0;
  // Animated with transform (compositor-only) rather than width.
  bar.style.width = '100%';
  bar.style.transformOrigin = '0 50%';
  bar.style.transform = 'scaleX(0)';
  const iv = setInterval(() => { p += Math.random() * 18; if (p > 85) p = 85; bar.style.transform = `scaleX(${p / 100})`; }, 120);
  window.addEventListener('load', () => {
    clearInterval(iv);
    bar.style.transform = 'scaleX(1)';
    setTimeout(() => { bar.style.opacity = '0'; }, 400);
  });
})();

// AMBIENT PARTICLE FIELD — one palette per theme.
const THEME_PARTICLES = {
  dark: ['#29abe2', '#29abe2', '#4db8e8', '#f5a623', '#ffffff'],
  light: ['#29abe2', '#29abe2', '#4db8e8', '#f5a623', '#ffffff'],
  cyberpunk: ['#ff00aa', '#00fff2', '#ff6ec7', '#8b5cf6', '#ffffff'],
  synthwave: ['#ff6ec7', '#ffa64d', '#a78bfa', '#4deeea', '#ffffff'],
  nord: ['#88c0d0', '#81a1c1', '#a3be8c', '#eceff4', '#5e81ac'],
  dracula: ['#50fa7b', '#ff79c6', '#bd93f9', '#8be9fd', '#f1fa8c'],
  solarized: ['#2aa198', '#268bd2', '#b58900', '#cb4b16', '#586e75'],
  matrix: ['#00ff41', '#00ff41', '#5dffa0', '#0dff00', '#ffffff'],
  abyss: ['#2effd0', '#2effd0', '#5be0ff', '#0af0c0', '#e8fffb'],
  galaxy: ['#b45cff', '#5ec8ff', '#ff6ec7', '#ffffff', '#7a5cff'],
  frost: ['#4ab8f0', '#4ab8f0', '#8fd8ff', '#eaf7ff', '#ffffff'],
  volcanic: ['#ff5622', '#ff5622', '#ffb347', '#ff2d00', '#ffe9dd'],
  royal: ['#e0b446', '#e0b446', '#f5d98a', '#c9a24a', '#fff6dc'],
  retrocrt: ['#00c2a8', '#00c2a8', '#ff6ec7', '#ffd166', '#ffffff'],
  autumn: ['#d66e28', '#d66e28', '#f0a94e', '#8a3b1e', '#fbe8d0'],
};

(function () {
  const canvas = document.getElementById('particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H;
  const mouse = { x: -999, y: -999 };
  function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  let COLORS = THEME_PARTICLES[document.documentElement.getAttribute('data-theme')] || THEME_PARTICLES.dark;
  const particles = Array.from({ length: 45 }, () => ({
    x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight,
    r: Math.random() * 1.4 + 0.4, dx: (Math.random() - 0.5) * 0.22, dy: (Math.random() - 0.5) * 0.22,
    a: Math.random(), ta: Math.random() * 0.35 + 0.04, da: (Math.random() * 0.004 + 0.001) * (Math.random() < 0.5 ? 1 : -1),
    col: '',
  }));
  for (const p of particles) p.col = COLORS[Math.floor(Math.random() * COLORS.length)];

  window.MarqueeParticles = {
    setTheme(themeName) {
      COLORS = THEME_PARTICLES[themeName] || THEME_PARTICLES.dark;
      for (const p of particles) p.col = COLORS[Math.floor(Math.random() * COLORS.length)];
    },
  };

  // Glow without shadowBlur (a blur pass per particle per frame): one pre-rendered soft
  // sprite per color, stamped with drawImage.
  const sprites = new Map();
  function sprite(col) {
    let c = sprites.get(col);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 24;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(12, 12, 0, 12, 12, 12);
    grad.addColorStop(0, col);
    grad.addColorStop(0.18, col);
    grad.addColorStop(1, 'transparent');
    g.fillStyle = grad;
    g.fillRect(0, 0, 24, 24);
    sprites.set(col, c);
    return c;
  }

  function step() {
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) {
      p.x += p.dx; p.y += p.dy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      const dx = p.x - mouse.x, dy = p.y - mouse.y, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 90 && dist > 0) { const f = ((90 - dist) / 90) * 0.35; p.x += (dx / dist) * f; p.y += (dy / dist) * f; }
      p.a += p.da;
      if (p.a <= 0.02 || p.a >= p.ta) p.da *= -1;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.a));
      const size = p.r * 8;
      ctx.drawImage(sprite(p.col), p.x - size / 2, p.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  // Runs only while the canvas is actually shown (several themes hide it), the tab is
  // visible and motion is allowed; ~60fps cap so 120/144Hz screens don't double the cost.
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let rafId = null, last = 0;
  function frame(now) {
    rafId = null;
    if (!shouldRun()) return;
    if (now - last >= 15) { last = now; step(); }
    rafId = requestAnimationFrame(frame);
  }
  function shouldRun() {
    return !document.hidden && !reduceMotion.matches && canvas.offsetParent !== null && getComputedStyle(canvas).visibility !== 'hidden';
  }
  function sync() {
    if (shouldRun()) { if (rafId === null) rafId = requestAnimationFrame(frame); }
    else if (reduceMotion.matches && canvas.offsetParent !== null) step(); // one still frame
  }
  document.addEventListener('visibilitychange', sync);
  reduceMotion.addEventListener('change', sync);
  new MutationObserver(() => requestAnimationFrame(sync))
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  sync();
})();

// CARD 3D TILT — skipped on touch devices.
(function () {
  if ('ontouchstart' in window) return;

  function applyTilt(el, e) {
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const dy = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    el.style.transition = 'box-shadow 0.18s, border-color 0.18s, background 0.18s';
    el.style.transform = `perspective(800px) rotateX(${(-dy * 8).toFixed(2)}deg) rotateY(${(dx * 8).toFixed(2)}deg) translateZ(4px)`;
  }
  function resetTilt(el) {
    el.style.transition = 'border-color 0.18s, background 0.18s, transform 0.45s cubic-bezier(0.16,1,0.3,1), box-shadow 0.18s';
    el.style.transform = '';
  }

  function wireTilt() {
    document.querySelectorAll('.service-card, .watch-card').forEach((el) => {
      if (el._tiltWired) return;
      el._tiltWired = true;
      el.addEventListener('mousemove', (e) => applyTilt(el, e));
      el.addEventListener('mouseleave', () => resetTilt(el));
    });
  }
  document.addEventListener('marquee:config', () => setTimeout(wireTilt, 50));
})();

// LOGO IDLE ANIMATIONS — glitch, chromatic aberration, click pulse ring.
(function () {
  const logoWrap = document.querySelector('.logo-wrap');
  const logoImg = document.getElementById('site-logo');
  if (!logoWrap || !logoImg) return;

  // Glitch — fires randomly every 45-90s.
  function fireGlitch() {
    if (logoImg.classList.contains('glitching')) return;
    logoImg.classList.add('glitching');
    setTimeout(() => {
      logoImg.classList.remove('glitching');
      // Suppress the CSS transition for one frame so the snap-back is instant.
      logoImg.style.transition = 'none';
      requestAnimationFrame(() => requestAnimationFrame(() => { logoImg.style.transition = ''; }));
    }, 600);
  }
  (function schedule() { setTimeout(() => { fireGlitch(); schedule(); }, 45000 + Math.random() * 45000); })();

  // Chromatic aberration — rare idle effect every 90-210s, ~120ms duration.
  (function scheduleCa() {
    setTimeout(() => {
      if (!logoImg.classList.contains('glitching')) {
        logoImg.classList.add('logo-ca');
        setTimeout(() => logoImg.classList.remove('logo-ca'), 120);
      }
      scheduleCa();
    }, 90000 + Math.random() * 120000);
  })();

  // Click pulse ring (fixed-position to escape overflow:hidden).
  logoWrap.addEventListener('click', () => {
    const rect = logoWrap.getBoundingClientRect();
    const ring = document.createElement('div');
    ring.className = 'logo-pulse-ring';
    const pad = 12;
    ring.style.cssText = `left:${rect.left - pad}px;top:${rect.top - pad}px;width:${rect.width + pad * 2}px;height:${rect.height + pad * 2}px;`;
    document.body.appendChild(ring);
    ring.addEventListener('animationend', () => ring.remove());
  });
})();

// SCROLL-TRIGGERED REVEAL — fades sections in as they enter the viewport.
(function () {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((el) => { if (el.isIntersecting) { el.target.classList.add('revealed'); io.unobserve(el.target); } });
  }, { rootMargin: '0px 0px -50px 0px', threshold: 0.08 });

  function wireReveal() {
    ['#carousel-section', '#insights-wrap', '#upcoming-wrap'].forEach((sel) => {
      const el = document.querySelector(sel);
      if (el && !el.classList.contains('reveal-ready')) { el.classList.add('reveal-ready'); io.observe(el); }
    });
  }
  document.addEventListener('marquee:config', () => setTimeout(wireReveal, 50));
})();
