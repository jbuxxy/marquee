window.MarqueeSeasonal.thanksgiving = function () {
  (function () {
    window._sfLoadLottieWC(() => {
      if (document.querySelector('.sf-turkey-wrap')) return;
      const _lBarH = document.querySelector('.bookmarks-bar')?.offsetHeight || 0;
      const TW = 200, TH = 200;
      const outer = document.createElement('div');
      outer.className = 'sf-layer sf-turkey-wrap';
      outer.style.cssText = `position:fixed;left:0;bottom:${_lBarH + 4}px;pointer-events:none;z-index:3;will-change:transform;`;
      const inner = document.createElement('div');
      inner.style.cssText = `width:${TW}px;height:${TH}px;transform-origin:center center;`;
      const wc = document.createElement('dotlottie-wc');
      wc.setAttribute('src', 'public/seasons/lottie-thanksgivin-turkey.lottie');
      wc.setAttribute('autoplay', ''); wc.setAttribute('loop', '');
      wc.style.cssText = `width:${TW}px;height:${TH}px;display:block;`;
      inner.appendChild(wc); outer.appendChild(inner);
      document.body.appendChild(outer);

      let tx = Math.random() * (innerWidth * 0.45) + innerWidth * 0.08;
      let dir = 1;
      const spd = 52;
      let last = null, walkRafId = null;
      function walk(ts) {
        if (!outer.isConnected) return;
        if (document.hidden) { walkRafId = null; return; }
        if (last !== null) { const dt = Math.min((ts - last) / 1000, 0.05); tx += dir * spd * dt; }
        if (tx > innerWidth + 20) dir = -1;
        if (tx < -TW - 20) dir = 1;
        outer.style.transform = `translateX(${tx}px)`;
        inner.style.transform = dir < 0 ? 'scaleX(-1)' : '';
        last = ts;
        walkRafId = requestAnimationFrame(walk);
      }
      walkRafId = requestAnimationFrame(walk);
      document.addEventListener('visibilitychange', () => { if (document.hidden || !outer.isConnected) return; last = null; if (walkRafId === null) walkRafId = requestAnimationFrame(walk); });
    });
  })();

  window._sfParticles(['🍂', '🍁', '🌾'], { count: 18, minSz: 13, szRange: 12, minDur: 11, durRange: 8, drift: true });
};
