window.MarqueeSeasonal.cincodemayo = function () {
  const W = window.innerWidth;
  const panelW = W / 8;
  const panelColors = ['#e63333', '#ff9900', '#ffee00', '#22bb44', '#3399ff', '#aa33ff', '#ff55aa', '#ffffff'];
  let paths = '';
  for (let i = 0; i < 8; i++) {
    const x = i * panelW, c = panelColors[i], mid = x + panelW / 2;
    paths += `<path d="M${x},0 L${x + panelW},0 L${x + panelW},20 L${mid},30 L${x},20 Z" fill="${c}" opacity="0.9"/>`;
    for (let j = 1; j < 4; j++) {
      const hx = x + (panelW * j) / 4;
      paths += `<circle cx="${hx}" cy="11" r="3.5" fill="rgba(0,0,0,0.18)"/>`;
    }
  }
  const banner = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  banner.classList.add('sf-layer');
  banner.setAttribute('viewBox', `0 0 ${W} 30`);
  banner.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:30px;pointer-events:none;z-index:9;overflow:visible;';
  banner.innerHTML = paths;
  document.body.appendChild(banner);

  (function () {
    if (document.querySelector('.sf-pinata')) return;
    const isMob = window.innerWidth <= 600;
    const COUNT = isMob ? 4 : 7;
    const vw = window.innerWidth;
    const ns = 'http://www.w3.org/2000/svg';
    const sectorW = vw / COUNT;
    const DONKEY_PNG = 'public/seasons/pinata_donkey.png';
    const DNK_W = isMob ? 68 : 84;
    const DNK_H = Math.round((DNK_W * 424) / 365);

    const SVG_DESIGNS = [
      { vbW: 100, vbH: 100, cx: 50, ty: 10, svg: `
        <polygon points="42,34 58,34 50,10"  fill="#e74c3c"/>
        <polygon points="58,34 68,46 81,25"  fill="#e67e22"/>
        <polygon points="68,46 64,61 89,59"  fill="#f1c40f"/>
        <polygon points="64,61 50,68 67,86"  fill="#2ecc71"/>
        <polygon points="50,68 36,61 33,86"  fill="#3498db"/>
        <polygon points="36,61 32,46 11,59"  fill="#9b59b6"/>
        <polygon points="32,46 42,34 19,25"  fill="#e91e8c"/>
        <circle cx="50" cy="50" r="18" fill="#d4820a"/>
        <circle cx="50" cy="50" r="18" fill="none" stroke="rgba(0,0,0,0.12)" stroke-width="1.5"/>
        <ellipse cx="43" cy="41" rx="7" ry="5" fill="rgba(255,255,255,0.2)" transform="rotate(-15 43 41)"/>
        <circle cx="44" cy="49" r="2.2" fill="rgba(0,0,0,0.28)"/>
        <circle cx="56" cy="49" r="2.2" fill="rgba(0,0,0,0.28)"/>
        <path d="M44,56 Q50,62 56,56" stroke="rgba(0,0,0,0.28)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      ` },
      { vbW: 80, vbH: 92, cx: 40, ty: 18, svg: `
        <rect x="15" y="52" width="5" height="30" rx="2" fill="#e74c3c"/>
        <rect x="21" y="50" width="5" height="32" rx="2" fill="#e67e22"/>
        <rect x="27" y="49" width="5" height="34" rx="2" fill="#f1c40f"/>
        <rect x="33" y="49" width="5" height="33" rx="2" fill="#2ecc71"/>
        <rect x="39" y="49" width="5" height="35" rx="2" fill="#3498db"/>
        <rect x="45" y="49" width="5" height="33" rx="2" fill="#9b59b6"/>
        <rect x="51" y="50" width="5" height="32" rx="2" fill="#e91e8c"/>
        <rect x="57" y="52" width="5" height="30" rx="2" fill="#e74c3c"/>
        <ellipse cx="40" cy="40" rx="26" ry="22" fill="#c0392b"/>
        <path d="M14,38 Q40,22 66,38 L66,44 Q40,60 14,44 Z" fill="#e74c3c" opacity="0.5"/>
        <ellipse cx="33" cy="29" rx="9" ry="6" fill="rgba(255,255,255,0.2)" transform="rotate(-20 33 29)"/>
        <ellipse cx="40" cy="40" rx="26" ry="22" fill="none" stroke="rgba(0,0,0,0.1)" stroke-width="1"/>
      ` },
    ];
    const szMin = isMob ? 54 : 76;
    const szRng = isMob ? 20 : 34;

    for (let i = 0; i < COUNT; i++) {
      const sectorCx = Math.round(sectorW * (i + 0.5));
      const strH = Math.round(18 + Math.random() * 28);

      if (i % 3 === 0) {
        const STR_H = 55;
        const wrapTop = 40 - STR_H;
        const flip = i % 6 !== 0;
        const dur = (3.5 + Math.random() * 2.5).toFixed(1);
        const dly = (-(Math.random() * 5)).toFixed(1);
        const wrapH = STR_H + DNK_H;
        const wrap = document.createElement('div');
        wrap.className = 'sf-layer sf-pinata';
        wrap.style.cssText = `position:fixed;top:${wrapTop}px;left:${sectorCx - Math.round(DNK_W / 2)}px;width:${DNK_W}px;height:${wrapH}px;pointer-events:none;z-index:3;transform-origin:top center;animation:sfSwing ${dur}s ease-in-out ${dly}s infinite alternate;`;

        const strSvg = document.createElementNS(ns, 'svg');
        strSvg.setAttribute('width', DNK_W); strSvg.setAttribute('height', STR_H);
        strSvg.style.cssText = 'position:absolute;top:0;left:0;overflow:visible;';
        const strX = flip ? DNK_W / 2 + 18 : DNK_W / 2 - 18;
        const sl = document.createElementNS(ns, 'line');
        sl.setAttribute('x1', strX); sl.setAttribute('y1', 0);
        sl.setAttribute('x2', strX); sl.setAttribute('y2', STR_H + 8);
        sl.setAttribute('stroke', 'rgba(245,228,180,0.85)'); sl.setAttribute('stroke-width', '2');
        strSvg.appendChild(sl);
        wrap.appendChild(strSvg);

        const img = document.createElement('img');
        img.src = DONKEY_PNG;
        img.width = DNK_W; img.height = DNK_H;
        img.style.cssText = `position:absolute;top:${STR_H}px;left:0;${flip ? 'transform:scaleX(-1);' : ''}`;
        wrap.appendChild(img);
        document.body.appendChild(wrap);
      } else {
        const design = SVG_DESIGNS[i % 3 === 1 ? 0 : 1];
        const sz = szMin + Math.floor(Math.random() * szRng);
        const dur = (3.5 + Math.random() * 2.5).toFixed(1);
        const dly = (-(Math.random() * 5)).toFixed(1);
        const flip = Math.random() < 0.5;
        const scale = sz / design.vbW;
        const scaledH = Math.ceil(design.vbH * scale);
        const scaledTY = Math.round(design.ty * scale);
        const totalH = strH + scaledH - scaledTY;

        const wrap = document.createElement('div');
        wrap.className = 'sf-layer sf-pinata';
        wrap.style.cssText = `position:fixed;top:0;left:${sectorCx - Math.round(sz / 2)}px;width:${sz}px;height:${totalH}px;pointer-events:none;z-index:3;transform-origin:top center;animation:sfSwing ${dur}s ease-in-out ${dly}s infinite alternate;`;

        const svgEl = document.createElementNS(ns, 'svg');
        svgEl.setAttribute('width', sz); svgEl.setAttribute('height', totalH);
        svgEl.style.cssText = 'display:block;overflow:visible;';

        const strLine = document.createElementNS(ns, 'line');
        strLine.setAttribute('x1', sz / 2); strLine.setAttribute('y1', 0);
        strLine.setAttribute('x2', sz / 2); strLine.setAttribute('y2', strH);
        strLine.setAttribute('stroke', 'rgba(245,228,180,0.85)');
        strLine.setAttribute('stroke-width', '2');
        svgEl.appendChild(strLine);

        const g = document.createElementNS(ns, 'g');
        const tx = sz / 2 - design.cx * scale;
        const ty_offset = strH - scaledTY;
        if (flip) g.setAttribute('transform', `translate(${sz - tx},${ty_offset}) scale(${-scale},${scale})`);
        else g.setAttribute('transform', `translate(${tx},${ty_offset}) scale(${scale})`);
        g.innerHTML = design.svg;
        svgEl.appendChild(g);
        wrap.appendChild(svgEl);
        document.body.appendChild(wrap);
      }
    }
  })();
};
