window.MarqueeSeasonal.memorialday = function () {
  const FLAG_SRC = 'public/seasons/lottie-memorialday-flag.lottie';
  const EAGLE_SRC = 'public/seasons/lottie-memorialday-eagle.lottie';
  const EW = 275, EH = 175;

  window._sfLoadLottieWC(() => {
    if (document.querySelector('.sf-eagle-clip')) return;

    const flagEl = document.createElement('dotlottie-wc');
    flagEl.className = 'sf-layer';
    flagEl.setAttribute('src', FLAG_SRC);
    flagEl.setAttribute('autoplay', ''); flagEl.setAttribute('loop', '');
    const _logoEl = document.querySelector('.logo-wrap') || document.querySelector('.logo-img');
    const _logoR = _logoEl?.getBoundingClientRect();
    const _logoCY = _logoR ? (_logoR.top + _logoR.bottom) / 2 + window.scrollY : 70;
    const FW = Math.min(900, window.innerWidth - 8);
    const FH = Math.round((FW * 360) / 600);
    flagEl.style.cssText = `position:absolute;top:${Math.round(_logoCY - FH / 2)}px;left:50%;transform:translateX(-50%);width:${FW}px;height:${FH}px;pointer-events:none;z-index:1;opacity:0.26;`;
    document.body.appendChild(flagEl);

    function randomEntry() {
      const Wi = window.innerWidth, Hi = window.innerHeight;
      const fromLeft = Math.random() < 0.5;
      const spd = 100 + Math.random() * 70;
      const ang = (Math.random() - 0.5) * Math.PI * 0.3;
      const scale = 0.8 + Math.random() * 0.4;
      return { x: fromLeft ? -EW : Wi + EW, y: 80 + Math.random() * Math.max(0, Hi - EH - 150), vx: (fromLeft ? 1 : -1) * spd * Math.cos(ang), vy: spd * Math.sin(ang), scale };
    }
    function eagleTransform(e) {
      const sx = e.vx < 0 ? -e.scale : e.scale;
      return `scaleX(${sx.toFixed(3)}) scaleY(${e.scale.toFixed(3)})`;
    }

    const eStates = [randomEntry(), randomEntry()];
    eStates[1].x += eStates[1].vx > 0 ? -(window.innerWidth * 0.45 + EW) : window.innerWidth * 0.45 + EW;

    const eagleClip = document.createElement('div');
    eagleClip.className = 'sf-layer sf-eagle-clip';
    eagleClip.style.cssText = 'position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:4;';
    document.body.appendChild(eagleClip);

    const eEls = eStates.map((e) => {
      const outer = document.createElement('div');
      outer.style.cssText = 'position:absolute;left:0;top:0;will-change:transform;';
      const inner = document.createElement('div');
      inner.style.cssText = `width:${EW}px;height:${EH}px;transform-origin:center center;`;
      inner.style.transform = eagleTransform(e);
      const wc = document.createElement('dotlottie-wc');
      wc.setAttribute('src', EAGLE_SRC);
      wc.setAttribute('autoplay', ''); wc.setAttribute('loop', ''); wc.setAttribute('speed', '0.75');
      wc.style.cssText = `width:${EW}px;height:${EH}px;display:block;`;
      inner.appendChild(wc); outer.appendChild(inner);
      eagleClip.appendChild(outer);
      outer.style.transform = `translate(${e.x}px,${e.y}px)`;
      return { outer, inner };
    });

    let eLast = null, eRafId = null;
    function eagleFrame(ts) {
      if (!eEls[0].outer.isConnected) return;
      if (document.hidden) { eRafId = null; return; }
      if (eLast === null) eLast = ts;
      const dt = Math.min((ts - eLast) / 1000, 0.05);
      eLast = ts;
      const Wi = window.innerWidth, Hi = window.innerHeight;
      eStates.forEach((e, i) => {
        e.x += e.vx * dt; e.y += e.vy * dt;
        if (e.x < -EW * 2 || e.x > Wi + EW * 2 || e.y < -EH * 2 || e.y > Hi + EH * 2) { Object.assign(e, randomEntry()); eEls[i].inner.style.transform = eagleTransform(e); }
        eEls[i].outer.style.transform = `translate(${e.x}px,${e.y - window.scrollY}px)`;
      });
      eRafId = requestAnimationFrame(eagleFrame);
    }
    eRafId = requestAnimationFrame(eagleFrame);
    document.addEventListener('visibilitychange', () => { if (document.hidden || !eEls[0].outer.isConnected) return; eLast = null; if (eRafId === null) eRafId = requestAnimationFrame(eagleFrame); });
  });

  window._sfParticles(['⭐', '🌟'], { count: 12, minSz: 14, szRange: 10, minDur: 11, durRange: 7, drift: true });
};
