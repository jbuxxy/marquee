window.MarqueeSeasonal.christmas = function () {
  const loadLottieWC = window._sfLoadLottieWC, _mkWC = window._sfMkWC;
  const W = window.innerWidth;
  const attachY = 3, sagDepth = 26, nailCount = 3;
  const nails = Array.from({ length: nailCount + 1 }, (_, i) => (W * i) / nailCount);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('sf-layer');
  svg.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:' + (attachY + sagDepth * 2 + 6) + 'px;pointer-events:none;z-index:10;overflow:visible;';
  let d = 'M ' + nails[0] + ' ' + attachY;
  for (let i = 1; i < nails.length; i++) {
    const mx = (nails[i - 1] + nails[i]) / 2;
    d += ' Q ' + mx + ' ' + (attachY + sagDepth * 2) + ' ' + nails[i] + ' ' + attachY;
  }
  const wire = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  wire.setAttribute('d', d);
  wire.setAttribute('stroke', 'rgba(40,40,40,0.9)');
  wire.setAttribute('stroke-width', '2');
  wire.setAttribute('fill', 'none');
  svg.appendChild(wire);
  document.body.appendChild(svg);

  function wireYAt(x) {
    for (let i = 1; i < nails.length; i++) {
      if (x >= nails[i - 1] && x <= nails[i]) {
        const t = (x - nails[i - 1]) / (nails[i] - nails[i - 1]);
        return (1 - t) * (1 - t) * attachY + 2 * t * (1 - t) * (attachY + sagDepth * 2) + t * t * attachY;
      }
    }
    return attachY;
  }

  const wrap = document.createElement('div');
  wrap.classList.add('sf-layer');
  wrap.style.cssText = 'position:fixed;top:0;left:0;width:100%;pointer-events:none;z-index:11;';
  const n = Math.ceil(W / 46) + 2;
  for (let i = 0; i < n; i++) {
    const bx = (W * (i + 1)) / (n + 1);
    const b = document.createElement('div');
    b.className = 'xmas-bulb';
    b.style.left = bx - 9 + 'px';
    b.style.top = wireYAt(bx) + 'px';
    wrap.appendChild(b);
  }
  document.body.appendChild(wrap);

  const snowCv = document.createElement('canvas');
  snowCv.className = 'sf-layer';
  snowCv.style.cssText = 'position:fixed;inset:0;z-index:1;pointer-events:none;filter:blur(1.5px);';
  document.body.appendChild(snowCv);
  const snowCtx = snowCv.getContext('2d');
  window._sfAutoResizeCanvas(snowCv);
  const flakes = Array.from({ length: 100 }, () => ({
    x: Math.random() * innerWidth, y: Math.random() * innerHeight,
    r: 1.2 + Math.random() * 5.8, spd: 0.4 + Math.random() * 1.3,
    drift: (Math.random() - 0.5) * 0.55, rot: Math.random() * Math.PI * 2, rotV: (Math.random() - 0.5) * 0.022,
  }));
  function drawFlake(x, y, r, rot) {
    if (r < 2.2) { snowCtx.beginPath(); snowCtx.arc(x, y, r, 0, Math.PI * 2); snowCtx.fill(); return; }
    snowCtx.save(); snowCtx.translate(x, y); snowCtx.rotate(rot);
    for (let i = 0; i < 6; i++) {
      snowCtx.rotate(Math.PI / 3);
      snowCtx.beginPath(); snowCtx.moveTo(0, 0); snowCtx.lineTo(0, r); snowCtx.stroke();
      if (r > 3.5) {
        snowCtx.beginPath();
        snowCtx.moveTo(0, r * 0.38); snowCtx.lineTo(r * 0.22, r * 0.6);
        snowCtx.moveTo(0, r * 0.38); snowCtx.lineTo(-r * 0.22, r * 0.6);
        snowCtx.stroke();
      }
    }
    snowCtx.restore();
  }
  let snowRafId = null;
  function snowFrame() {
    if (!snowCv.isConnected) return;
    if (document.hidden) { snowRafId = null; return; }
    snowCtx.clearRect(0, 0, snowCv.width, snowCv.height);
    const wind = Math.sin(Date.now() / 9000) * 0.35;
    snowCtx.strokeStyle = '#d0dcf8'; snowCtx.fillStyle = '#e8f0ff';
    flakes.forEach((f) => {
      f.y += f.spd; f.x += f.drift + wind; f.rot += f.rotV;
      if (f.y > snowCv.height + f.r) { f.y = -f.r; f.x = Math.random() * snowCv.width; }
      if (f.x > snowCv.width + f.r) f.x -= snowCv.width + f.r * 2;
      if (f.x < -f.r) f.x += snowCv.width + f.r * 2;
      snowCtx.globalAlpha = 0.45 + (f.r / 7) * 0.5;
      snowCtx.lineWidth = f.r * 0.22;
      drawFlake(f.x, f.y, f.r, f.rot);
    });
    snowCtx.globalAlpha = 1;
    snowRafId = requestAnimationFrame(snowFrame);
  }
  snowRafId = requestAnimationFrame(snowFrame);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !snowCv.isConnected) return;
    if (snowRafId === null) snowRafId = requestAnimationFrame(snowFrame);
  });

  (function () {
    const SANTA_SRC = 'public/seasons/lottie-christmas-santa.lottie';
    const SW = 220, SH = 140;
    loadLottieWC(() => {
      if (document.querySelector('.sf-santa-clip')) return;
      const _logoEl = document.querySelector('.logo-wrap') || document.querySelector('.logo-img');
      const _logoR = _logoEl?.getBoundingClientRect();
      const logoMidY = _logoR ? (_logoR.top + _logoR.bottom) / 2 : 80;

      function randomEntry() {
        const Wi = window.innerWidth;
        const fromLeft = Math.random() < 0.5;
        const spd = 90 + Math.random() * 60;
        const scale = 0.85 + Math.random() * 0.3;
        return { x: fromLeft ? -SW : Wi + SW, y: logoMidY - SH / 2 + (Math.random() - 0.5) * 40, vx: (fromLeft ? 1 : -1) * spd, scale };
      }
      function santaTransform(s) {
        const rot = s.vx > 0 ? 22 : -22;
        const sx = s.vx > 0 ? s.scale : -s.scale;
        return `rotate(${rot}deg) scaleX(${sx.toFixed(3)}) scaleY(${s.scale.toFixed(3)})`;
      }
      const state = randomEntry();
      const santaClip = document.createElement('div');
      santaClip.className = 'sf-layer sf-santa-clip';
      santaClip.style.cssText = 'position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:5;';
      document.body.appendChild(santaClip);
      const outer = document.createElement('div');
      outer.style.cssText = 'position:absolute;left:0;top:0;will-change:transform;';
      const inner = document.createElement('div');
      inner.style.cssText = `width:${SW}px;height:${SH}px;transform-origin:center center;`;
      inner.style.transform = santaTransform(state);
      inner.appendChild(_mkWC(SANTA_SRC, SW, SH));
      outer.appendChild(inner);
      santaClip.appendChild(outer);
      outer.style.transform = `translate(${state.x}px,${state.y}px)`;

      let last = null, santaRafId = null;
      function santaFrame(ts) {
        if (!outer.isConnected) return;
        if (document.hidden) { santaRafId = null; return; }
        if (last === null) last = ts;
        const dt = Math.min((ts - last) / 1000, 0.05);
        last = ts;
        const Wi = window.innerWidth;
        state.x += state.vx * dt;
        if (state.x < -SW * 2 || state.x > Wi + SW * 2) { Object.assign(state, randomEntry()); inner.style.transform = santaTransform(state); }
        outer.style.transform = `translate(${state.x}px,${state.y - window.scrollY}px)`;
        santaRafId = requestAnimationFrame(santaFrame);
      }
      santaRafId = requestAnimationFrame(santaFrame);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden || !outer.isConnected) return;
        last = null;
        if (santaRafId === null) santaRafId = requestAnimationFrame(santaFrame);
      });
    });
  })();
};
