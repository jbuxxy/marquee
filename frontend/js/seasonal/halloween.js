window.MarqueeSeasonal.halloween = function () {
  const loadLottieWC = window._sfLoadLottieWC, _mkWC = window._sfMkWC;
  const barH = document.querySelector('.bookmarks-bar')?.offsetHeight || 0;

  const scene = document.createElement('canvas');
  scene.className = 'sf-layer';
  scene.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;';
  document.body.appendChild(scene);
  scene.width = innerWidth; scene.height = innerHeight;
  const sc = scene.getContext('2d');
  const W = scene.width, H = scene.height;

  const sky = sc.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, 'rgba(2, 0, 14, 0.88)');
  sky.addColorStop(0.5, 'rgba(5, 0, 22, 0.76)');
  sky.addColorStop(1, 'rgba(10, 3, 32, 0.62)');
  sc.fillStyle = sky; sc.fillRect(0, 0, W, H);

  const hgr = sc.createRadialGradient(W * 0.5, H, 0, W * 0.5, H, H * 0.7);
  hgr.addColorStop(0, 'rgba(90, 35, 0, 0.38)');
  hgr.addColorStop(0.3, 'rgba(55, 18, 0, 0.20)');
  hgr.addColorStop(0.65, 'rgba(20, 6, 0, 0.08)');
  hgr.addColorStop(1, 'rgba(0,0,0,0)');
  sc.fillStyle = hgr; sc.fillRect(0, 0, W, H);

  const mr = Math.min(48, W * 0.034 + 26);
  const _mLogoEl = document.querySelector('.logo-img') || document.querySelector('.logo-wrap');
  const _mLogoR = _mLogoEl?.getBoundingClientRect();
  const mx = _mLogoR ? Math.round(_mLogoR.right - mr * 0.3) : W * 0.8;
  const my = _mLogoR ? Math.round((_mLogoR.top + _mLogoR.bottom) / 2) + 5 : Math.max(H * 0.17, 62);
  const oh = sc.createRadialGradient(mx, my, mr, mx, my, mr * 4.5);
  oh.addColorStop(0, 'rgba(255,255,210,0.18)'); oh.addColorStop(1, 'rgba(255,255,210,0)');
  sc.fillStyle = oh; sc.fillRect(0, 0, W, H);
  const mg2 = sc.createRadialGradient(mx - mr * 0.28, my - mr * 0.28, 0, mx, my, mr);
  mg2.addColorStop(0, '#fffef4'); mg2.addColorStop(0.55, '#fef3a0'); mg2.addColorStop(1, '#b89c28');
  sc.beginPath(); sc.arc(mx, my, mr, 0, Math.PI * 2); sc.fillStyle = mg2; sc.fill();
  [[mr * 0.3, mr * 0.26, mr * 0.13], [-mr * 0.36, mr * 0.11, mr * 0.09], [mr * 0.06, -mr * 0.33, mr * 0.07]].forEach(([dx, dy, cr]) => {
    sc.beginPath(); sc.arc(mx + dx, my + dy, cr, 0, Math.PI * 2); sc.fillStyle = 'rgba(150,130,38,0.28)'; sc.fill();
  });

  const cloudTop = Math.max(0, Math.round(my - mr * 3));
  const cloudH = Math.round(mr * 7 + 10);
  const cloudCv = document.createElement('canvas');
  cloudCv.className = 'sf-layer';
  cloudCv.style.cssText = `position:fixed;top:${cloudTop}px;left:0;width:100%;height:${cloudH}px;z-index:1;pointer-events:none;`;
  document.body.appendChild(cloudCv);
  cloudCv.width = innerWidth; cloudCv.height = cloudH;
  const cc = cloudCv.getContext('2d');
  const cMY = my - cloudTop;
  let cloudsRafId = null;
  function drawClouds() {
    if (!cloudCv.isConnected) return;
    if (document.hidden) { cloudsRafId = null; return; }
    cc.clearRect(0, 0, cloudCv.width, cloudCv.height);
    const t = Date.now() / 1000;
    const cW = cloudCv.width;
    [[17, cMY - mr * 0.2, 1.0, 0.5], [11, cMY + mr * 0.32, 0.76, 0.38], [24, cMY - mr * 0.7, 0.58, 0.3]].forEach(([spd, cy2, scale, a]) => {
      const span = cW + 220;
      const x = cW - ((t * spd) % span);
      cc.fillStyle = `rgba(22,18,46,${a})`;
      [-span, 0, span].forEach((dx) => {
        const cx2 = x + dx;
        if (cx2 + 170 * scale < -20 || cx2 > cW + 20) return;
        cc.beginPath();
        [[0, 0, 34], [30, -13, 27], [60, -5, 32], [90, -15, 23], [120, -3, 28], [150, 2, 20]].forEach(([px, py, r]) => {
          cc.arc(cx2 + px * scale, cy2 + py * scale, r * scale, 0, Math.PI * 2);
        });
        cc.fill();
      });
    });
    cloudsRafId = requestAnimationFrame(drawClouds);
  }
  cloudsRafId = requestAnimationFrame(drawClouds);
  document.addEventListener('visibilitychange', () => { if (document.hidden || !cloudCv.isConnected) return; if (cloudsRafId === null) cloudsRafId = requestAnimationFrame(drawClouds); });

  const fog = document.createElement('canvas');
  fog.className = 'sf-layer';
  fog.style.cssText = 'position:fixed;bottom:0;left:0;width:100%;height:300px;z-index:2;pointer-events:none;-webkit-mask-image:linear-gradient(to top,black 40%,transparent 100%);mask-image:linear-gradient(to top,black 40%,transparent 100%);';
  document.body.appendChild(fog);
  const fc = fog.getContext('2d');
  function resizeFog() { if (!fog.isConnected) { window.removeEventListener('resize', resizeFog); return; } fog.width = innerWidth; fog.height = 300; }
  resizeFog(); window.addEventListener('resize', resizeFog);
  const fogLayers = [[0.06, 0.42, [60, 16, 108], 0.3], [-0.04, 0.3, [80, 22, 138], 0.24], [0.05, 0.52, [48, 12, 86], 0.22], [-0.035, 0.34, [90, 26, 148], 0.2], [0.045, 0.46, [52, 14, 94], 0.18]];
  let fogRafId = null;
  function drawFog() {
    if (!fog.isConnected) return;
    if (document.hidden) { fogRafId = null; return; }
    fc.clearRect(0, 0, fog.width, fog.height);
    const t = Date.now() * 0.000135;
    const base = fc.createLinearGradient(0, fog.height, 0, 0);
    base.addColorStop(0, 'rgba(58,14,102,0.55)'); base.addColorStop(0.18, 'rgba(44,10,80,0.34)'); base.addColorStop(0.42, 'rgba(26,6,55,0.14)'); base.addColorStop(0.65, 'rgba(10,2,24,0.04)'); base.addColorStop(1, 'rgba(0,0,0,0)');
    fc.fillStyle = base; fc.fillRect(0, 0, fog.width, fog.height);
    fogLayers.forEach(([spd, yf, [r, g, b], a], i) => {
      const px = (((i / 5 + t * spd) % 1) + 1) % 1 * fog.width;
      const py = fog.height * yf;
      const rx = fog.width * 0.36, ry = fog.height * 0.46;
      [-fog.width, 0, fog.width].forEach((offset) => {
        const cx = px + offset;
        if (cx + rx < 0 || cx - rx > fog.width) return;
        const gr = fc.createRadialGradient(cx, py, 0, cx, py, fog.width * 0.32);
        gr.addColorStop(0, `rgba(${r},${g},${b},${a})`); gr.addColorStop(0.55, `rgba(${r},${g},${b},${(a * 0.45).toFixed(2)})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        fc.fillStyle = gr;
        fc.beginPath(); fc.ellipse(cx, py, rx, ry, 0, 0, Math.PI * 2); fc.fill();
      });
    });
    fogRafId = requestAnimationFrame(drawFog);
  }
  fogRafId = requestAnimationFrame(drawFog);
  document.addEventListener('visibilitychange', () => { if (document.hidden || !fog.isConnected) return; if (fogRafId === null) fogRafId = requestAnimationFrame(drawFog); });

  const lCv = document.createElement('canvas');
  lCv.className = 'sf-layer';
  lCv.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:4;pointer-events:none;opacity:0;';
  document.body.appendChild(lCv);
  const lCtx = lCv.getContext('2d');
  function resizeL() { if (!lCv.isConnected) { window.removeEventListener('resize', resizeL); return; } lCv.width = innerWidth; lCv.height = innerHeight; }
  resizeL(); window.addEventListener('resize', resizeL);
  const bSegs = [];
  function calcBolt(x1, y1, x2, y2, spread, d) {
    if (d === 0 || Math.abs(y2 - y1) < 6) { bSegs.push([x1, y1, x2, y2]); return; }
    const bmx = (x1 + x2) / 2 + (Math.random() - 0.5) * spread;
    const bmy = (y1 + y2) / 2 + Math.abs(y2 - y1) * 0.04;
    calcBolt(x1, y1, bmx, bmy, spread * 0.52, d - 1);
    calcBolt(bmx, bmy, x2, y2, spread * 0.52, d - 1);
    if (Math.random() < 0.36 && d > 2) calcBolt(bmx, bmy, bmx + (Math.random() - 0.5) * spread * 2.2, bmy + spread * 1.1, spread * 0.42, d - 2);
  }
  function drawBolt(ctx) { bSegs.forEach(([x1, y1, x2, y2]) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }); }
  function flashBolt(op) {
    lCtx.clearRect(0, 0, lCv.width, lCv.height);
    lCtx.fillStyle = `rgba(190,215,255,${op * 0.12})`; lCtx.fillRect(0, 0, lCv.width, lCv.height);
    lCtx.save(); lCtx.lineCap = 'round'; lCtx.strokeStyle = `rgba(148,188,255,${op * 0.6})`; lCtx.lineWidth = 5;
    lCtx.shadowColor = '#6688ee'; lCtx.shadowBlur = 28; drawBolt(lCtx); lCtx.restore();
    lCtx.save(); lCtx.lineCap = 'round'; lCtx.strokeStyle = `rgba(255,255,255,${op})`; lCtx.lineWidth = 1.8;
    lCtx.shadowColor = '#ccddff'; lCtx.shadowBlur = 10; drawBolt(lCtx); lCtx.restore();
  }
  let lightningTimeoutId = null;
  function doLightning() {
    if (!lCv.isConnected) return;
    if (document.hidden) { lightningTimeoutId = null; return; }
    bSegs.length = 0;
    const lx = lCv.width * (0.18 + Math.random() * 0.64);
    const ly = lCv.height * (0.55 + Math.random() * 0.3);
    calcBolt(lx, 0, lx + (Math.random() - 0.5) * 90, ly, 90, 7);
    flashBolt(1);
    lCv.style.transition = 'none'; lCv.style.opacity = '1';
    setTimeout(() => {
      lCv.style.transition = 'opacity 0.32s ease-out'; lCv.style.opacity = '0';
      if (Math.random() < 0.55) {
        setTimeout(() => {
          if (!lCv.isConnected) return;
          flashBolt(0.7);
          lCv.style.transition = 'none'; lCv.style.opacity = '0.7';
          setTimeout(() => { lCv.style.transition = 'opacity 0.22s ease-out'; lCv.style.opacity = '0'; }, 55);
        }, 195);
      }
    }, 88);
    lightningTimeoutId = setTimeout(doLightning, 13000 + Math.random() * 24000);
  }
  lightningTimeoutId = setTimeout(doLightning, 2500 + Math.random() * 4000);
  document.addEventListener('visibilitychange', () => { if (document.hidden || !lCv.isConnected) return; if (lightningTimeoutId === null) lightningTimeoutId = setTimeout(doLightning, 2500 + Math.random() * 4000); });

  loadLottieWC(() => {
    const BAT_SRC = 'public/seasons/lottie-halloween-bat.lottie';
    const BAT_N = 6 + Math.round(Math.random() * 2), BAT_W = 72, BAT_H = 72;
    const BAT_K = [2200, 2800, 1850, 3100, 2500, 1700, 3300, 2050];
    const BAT_RXM = [1.0, 1.22, 0.82, 1.15, 0.95, 1.18, 0.78, 1.06];
    const BAT_RYM = [0.82, 1.08, 0.92, 0.7, 1.0, 0.88, 1.12, 0.76];
    const BAT_PH = Array.from({ length: BAT_N }, (_, i) => (i / BAT_N) * Math.PI * 2);

    const batWraps = Array.from({ length: BAT_N }, () => {
      const outer = document.createElement('div');
      outer.className = 'sf-layer';
      outer.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:5;will-change:transform;';
      const inner = document.createElement('div');
      inner.style.cssText = `width:${BAT_W}px;height:${BAT_H}px;transform-origin:center center;`;
      inner.appendChild(_mkWC(BAT_SRC, BAT_W, BAT_H));
      outer.appendChild(inner);
      document.body.appendChild(outer);
      return { outer, inner };
    });

    const _batLogo = document.querySelector('.logo-wrap');
    const _batLR = _batLogo?.getBoundingClientRect();
    const batCX = _batLR ? _batLR.left + _batLR.width / 2 : window.innerWidth / 2;
    const batCY = _batLR ? _batLR.top + _batLR.height / 2 + 5 : 80;
    const batRX = _batLR ? _batLR.width * 0.42 + 18 : 120;
    const batRY = _batLR ? Math.min(_batLR.height * 0.45 + 18, batCY - 12) : 30;

    let batRafId = null;
    function batFrame(ts) {
      if (!batWraps[0].outer.isConnected) return;
      if (document.hidden) { batRafId = null; return; }
      const scrollY = window.scrollY;
      batWraps.forEach(({ outer, inner }, i) => {
        const angle = ts / BAT_K[i] + BAT_PH[i];
        const bx = batCX + Math.cos(angle) * batRX * BAT_RXM[i];
        const by = batCY + Math.sin(angle) * batRY * BAT_RYM[i];
        inner.style.transform = Math.sin(angle) > 0 ? 'scaleX(-1)' : '';
        outer.style.transform = `translate(${bx - BAT_W / 2}px,${by - BAT_H / 2 - scrollY}px)`;
      });
      batRafId = requestAnimationFrame(batFrame);
    }
    batRafId = requestAnimationFrame(batFrame);
    document.addEventListener('visibilitychange', () => { if (document.hidden || !batWraps[0].outer.isConnected) return; if (batRafId === null) batRafId = requestAnimationFrame(batFrame); });

    const BAT2_PH = Array.from({ length: BAT_N }, (_, i) => (i / BAT_N) * Math.PI * 2 + Math.PI / BAT_N);
    const batWraps2 = Array.from({ length: BAT_N }, () => {
      const outer = document.createElement('div');
      outer.className = 'sf-layer';
      outer.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:5;will-change:transform;';
      const inner = document.createElement('div');
      inner.style.cssText = `width:${BAT_W}px;height:${BAT_H}px;transform-origin:center center;`;
      inner.appendChild(_mkWC(BAT_SRC, BAT_W, BAT_H));
      outer.appendChild(inner);
      document.body.appendChild(outer);
      return { outer, inner };
    });
    let batRafId2 = null;
    function batFrame2(ts) {
      if (!batWraps2[0].outer.isConnected) return;
      if (document.hidden) { batRafId2 = null; return; }
      const scrollY = window.scrollY;
      batWraps2.forEach(({ outer, inner }, i) => {
        const angle = -(ts / BAT_K[i]) + BAT2_PH[i];
        const bx = batCX + Math.cos(angle) * batRX * BAT_RXM[i];
        const by = batCY + Math.sin(angle) * batRY * BAT_RYM[i];
        inner.style.transform = Math.sin(angle) < 0 ? 'scaleX(-1)' : '';
        outer.style.transform = `translate(${bx - BAT_W / 2}px,${by - BAT_H / 2 - scrollY}px)`;
      });
      batRafId2 = requestAnimationFrame(batFrame2);
    }
    batRafId2 = requestAnimationFrame(batFrame2);
    document.addEventListener('visibilitychange', () => { if (document.hidden || !batWraps2[0].outer.isConnected) return; if (batRafId2 === null) batRafId2 = requestAnimationFrame(batFrame2); });

    const SP_W = 70, SP_H = 220;
    const spOuter = document.createElement('div');
    spOuter.className = 'sf-layer';
    spOuter.style.cssText = `position:absolute;pointer-events:none;z-index:6;width:${SP_W}px;height:${SP_H}px;`;
    const spWC = document.createElement('dotlottie-wc');
    spWC.setAttribute('src', 'public/seasons/lottie-halloween-spider.lottie');
    spWC.setAttribute('autoplay', ''); spWC.setAttribute('loop', ''); spWC.setAttribute('mode', 'bounce'); spWC.setAttribute('speed', '0.125');
    spWC.style.cssText = `width:${SP_W}px;height:${SP_H}px;display:block;`;
    spOuter.appendChild(spWC);
    document.body.appendChild(spOuter);
    function posSpider() {
      const logo = document.querySelector('.logo-wrap') || document.querySelector('.logo-img');
      const lr = logo?.getBoundingClientRect();
      if (lr) { spOuter.style.left = Math.round(lr.left + lr.width * 0.86 - SP_W / 2 + 5) + 'px'; spOuter.style.top = Math.round(lr.top + window.scrollY - 60) + 'px'; }
    }
    posSpider();
    window.addEventListener('resize', posSpider);

    const CR_W = 130, CR_H = 90;
    const crOuter = document.createElement('div');
    crOuter.className = 'sf-layer';
    crOuter.style.cssText = 'position:fixed;bottom:35px;left:0;pointer-events:none;z-index:6;opacity:0;will-change:transform;';
    const crInner = document.createElement('div');
    crInner.style.cssText = `width:${CR_W}px;height:${CR_H}px;transform-origin:center center;`;
    const crWC = document.createElement('dotlottie-wc');
    crWC.setAttribute('src', 'public/seasons/lottie-halloween-hand.lottie');
    crWC.setAttribute('autoplay', ''); crWC.setAttribute('loop', ''); crWC.setAttribute('speed', '1');
    crWC.style.cssText = `width:${CR_W}px;height:${CR_H}px;display:block;`;
    crInner.appendChild(crWC); crOuter.appendChild(crInner);
    document.body.appendChild(crOuter);

    let crState = 'idle', crX = 0, crVx = 0;
    let crWaitMs = 15000 + Math.random() * 30000, crTimer = 0, crLast = null;
    let crRafId = null;
    function crFrame(ts) {
      if (!crOuter.isConnected) return;
      if (document.hidden) { crRafId = null; return; }
      if (crLast === null) crLast = ts;
      const dt = Math.min((ts - crLast) / 1000, 0.1);
      crLast = ts;
      const CW = window.innerWidth;
      if (crState === 'idle') {
        crTimer += dt * 1000;
        if (crTimer >= crWaitMs) {
          const fromLeft = Math.random() < 0.5;
          crX = fromLeft ? -CR_W : CW;
          crVx = fromLeft ? 42 : -42;
          crInner.style.transform = fromLeft ? 'scaleX(-1)' : '';
          crOuter.style.transform = `translateX(${crX}px)`;
          crOuter.style.opacity = '1';
          crState = 'walking';
        }
      } else {
        crX += crVx * dt;
        crOuter.style.transform = `translateX(${crX}px)`;
        if ((crVx > 0 && crX > CW + CR_W) || (crVx < 0 && crX < -CR_W)) { crOuter.style.opacity = '0'; crState = 'idle'; crTimer = 0; crWaitMs = 50000 + Math.random() * 70000; }
      }
      crRafId = requestAnimationFrame(crFrame);
    }
    crRafId = requestAnimationFrame(crFrame);
    document.addEventListener('visibilitychange', () => { if (document.hidden || !crOuter.isConnected) return; crLast = null; if (crRafId === null) crRafId = requestAnimationFrame(crFrame); });

    const pumpkinEl = document.createElement('div');
    pumpkinEl.className = 'sf-layer';
    pumpkinEl.style.cssText = 'position:fixed;bottom:-30px;left:-20px;pointer-events:none;z-index:6;';
    pumpkinEl.appendChild(_mkWC('public/seasons/lottie-halloween-pumpkin.lottie', 240, 240));
    document.body.appendChild(pumpkinEl);

    if (!document.getElementById('sf-ghost-kf')) {
      const ks = document.createElement('style');
      ks.id = 'sf-ghost-kf';
      ks.textContent = '@keyframes sfGhostFloat{0%,100%{transform:translate(0,0)}30%{transform:translate(14px,-18px)}65%{transform:translate(-10px,-26px)}}';
      document.head.appendChild(ks);
    }
    const GH_W = 80, GH_H = 110;
    const ghostWrap = document.createElement('div');
    ghostWrap.className = 'sf-layer';
    ghostWrap.style.cssText = `position:fixed;width:${GH_W}px;height:${GH_H}px;pointer-events:none;z-index:5;opacity:0;transition:opacity 0.6s ease-in-out;`;
    const ghWC = document.createElement('dotlottie-wc');
    ghWC.setAttribute('src', 'public/seasons/lottie-halloween-ghost.lottie');
    ghWC.setAttribute('autoplay', ''); ghWC.setAttribute('loop', ''); ghWC.setAttribute('speed', '0.5');
    ghWC.style.cssText = `width:${GH_W}px;height:${GH_H}px;display:block;`;
    ghostWrap.appendChild(ghWC);
    document.body.appendChild(ghostWrap);
    function showGhost() {
      if (!ghostWrap.isConnected) return;
      ghostWrap.style.left = 16 + Math.random() * (innerWidth - GH_W - 30) + 'px';
      ghostWrap.style.top = innerHeight * 0.15 + Math.random() * innerHeight * 0.4 + 'px';
      ghostWrap.style.animation = 'sfGhostFloat 2s ease-in-out infinite';
      ghostWrap.style.opacity = '1';
      const visMs = 1800 + Math.random() * 1500;
      setTimeout(() => { if (!ghostWrap.isConnected) return; ghostWrap.style.opacity = '0'; setTimeout(() => { ghostWrap.style.animation = 'none'; }, 650); }, visMs);
      setTimeout(showGhost, visMs + 14000 + Math.random() * 16000);
    }
    setTimeout(showGhost, 5000 + Math.random() * 7000);
  });
};
