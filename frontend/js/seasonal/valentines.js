window.MarqueeSeasonal.valentines = function () {
  (function () {
    const HEART_SRC = 'public/seasons/lottie-valentines-hearts.lottie';
    window._sfLoadLottieWC(() => {
      if (document.querySelector('.sf-val-heart')) return;
      const el = document.createElement('dotlottie-wc');
      el.className = 'sf-layer sf-val-heart';
      el.setAttribute('src', HEART_SRC);
      el.setAttribute('autoplay', ''); el.setAttribute('loop', '');
      const _logoEl = document.querySelector('.logo-wrap') || document.querySelector('.logo-img');
      const _logoR = _logoEl?.getBoundingClientRect();
      const _logoCY = _logoR ? (_logoR.top + _logoR.bottom) / 2 + window.scrollY : 70;
      const VW = Math.min(560, window.innerWidth - 20);
      const VH = Math.round((VW * 380) / 560);
      el.style.cssText = `position:absolute;top:${Math.round(_logoCY - VH / 2)}px;left:50%;transform:translateX(-50%);width:${VW}px;height:${VH}px;pointer-events:none;z-index:1;opacity:0.30;`;
      document.body.appendChild(el);
    });
  })();

  const wrap = document.createElement('div');
  wrap.className = 'sf-layer sf-particles';
  const hEmojis = ['❤️', '💕', '💖', '💗', '💓'];
  const hCount = 20;
  for (let i = 0; i < hCount; i++) {
    const s = document.createElement('span');
    s.textContent = hEmojis[i % hEmojis.length];
    const sz = 13 + Math.random() * 10;
    const dur = 10 + Math.random() * 8;
    const lft = (i / hCount) * 92 + Math.random() * (92 / hCount);
    s.style.cssText = `font-size:${sz}px;left:${lft}%;animation:sfPulse ${dur}s linear ${-(Math.random() * dur)}s infinite;`;
    wrap.appendChild(s);
  }
  document.body.appendChild(wrap);
};
