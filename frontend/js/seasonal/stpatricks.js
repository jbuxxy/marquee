window.MarqueeSeasonal.stpatricks = function () {
  const rc = document.createElement('canvas');
  rc.className = 'sf-layer';
  rc.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:180px;z-index:0;pointer-events:none;animation:sfRainbowFade 8s ease-in-out infinite;mask-image:linear-gradient(to bottom,black 45%,transparent 100%),linear-gradient(to right,transparent 0%,black 28%,black 72%,transparent 100%);-webkit-mask-image:linear-gradient(to bottom,black 45%,transparent 100%),linear-gradient(to right,transparent 0%,black 28%,black 72%,transparent 100%);mask-composite:intersect;-webkit-mask-composite:source-in;';
  rc.width = window.innerWidth; rc.height = 180;
  document.body.appendChild(rc);
  const rctx = rc.getContext('2d');
  const rainbowCols = ['#e40303', '#ff8c00', '#ffed00', '#008026', '#004dff', '#750787'];
  const cx = rc.width / 2, cy = rc.height * 2.5;
  for (let i = 0; i < rainbowCols.length; i++) {
    const r = rc.height * (2.0 + i * 0.12);
    rctx.beginPath();
    rctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
    rctx.strokeStyle = rainbowCols[i];
    rctx.lineWidth = 22;
    rctx.stroke();
  }

  window._sfParticles(['☘️', '🍀', '🌿'], { count: 20, minSz: 13, szRange: 11, minDur: 9, durRange: 7, drift: true });

  (function () {
    window._sfLoadLottieWC(() => {
      if (document.querySelector('.sf-leprechaun')) return;
      const el = document.createElement('div');
      el.className = 'sf-layer sf-leprechaun';
      const _lBarH = document.querySelector('.bookmarks-bar')?.offsetHeight || 0;
      el.style.cssText = `position:fixed;bottom:${_lBarH + 4}px;right:-10px;pointer-events:none;z-index:6;`;
      const wc = document.createElement('dotlottie-wc');
      wc.setAttribute('src', 'public/seasons/lottie-stpatricksday-leprechaun.lottie');
      wc.setAttribute('autoplay', ''); wc.setAttribute('loop', '');
      wc.style.cssText = 'width:180px;height:180px;display:block;';
      el.appendChild(wc);
      document.body.appendChild(el);
    });
  })();
};
