window.MarqueeSeasonal.easter = function () {
  function addEgg(side, fill, defs, patterns) {
    const el = document.createElement('div');
    el.className = 'sf-layer';
    el.innerHTML = `<svg viewBox="0 0 70 90" width="100" height="128" aria-hidden="true">
      <defs>${defs}</defs>
      <ellipse cx="35" cy="52" rx="31" ry="38" fill="${fill}"/>
      ${patterns}
      <ellipse cx="35" cy="52" rx="31" ry="38" fill="none" stroke="rgba(0,0,0,0.12)" stroke-width="1.5"/>
      <ellipse cx="23" cy="34" rx="9" ry="5" fill="rgba(255,255,255,0.28)" transform="rotate(-20,23,34)"/>
    </svg>`;
    el.style.cssText = `position:fixed;bottom:0;${side}:0;pointer-events:none;z-index:2;`;
    document.body.appendChild(el);
  }

  addEgg('left', '#ff85c2',
    `<clipPath id="ecL"><ellipse cx="35" cy="52" rx="31" ry="38"/></clipPath>`,
    `<rect x="0" y="34" width="70" height="8" fill="#cc1166" clip-path="url(#ecL)"/>
     <rect x="0" y="51" width="70" height="8" fill="#cc1166" clip-path="url(#ecL)"/>
     <rect x="0" y="68" width="70" height="8" fill="#cc1166" clip-path="url(#ecL)"/>
     <circle cx="35" cy="23" r="5.5" fill="#ffee55" clip-path="url(#ecL)"/>
     <circle cx="20" cy="43" r="4" fill="#ffee55" clip-path="url(#ecL)"/>
     <circle cx="50" cy="43" r="4" fill="#ffee55" clip-path="url(#ecL)"/>`
  );
  addEgg('right', '#7ec8e3',
    `<clipPath id="ecR"><ellipse cx="35" cy="52" rx="31" ry="38"/></clipPath>`,
    `<polyline points="0,37 12,29 24,37 36,29 48,37 60,29 70,37" stroke="#1a7aaa" stroke-width="5.5" fill="none" clip-path="url(#ecR)"/>
     <polyline points="0,55 12,47 24,55 36,47 48,55 60,47 70,55" stroke="#1a7aaa" stroke-width="5.5" fill="none" clip-path="url(#ecR)"/>
     <polyline points="0,73 12,65 24,73 36,65 48,73 60,65 70,73" stroke="#1a7aaa" stroke-width="5.5" fill="none" clip-path="url(#ecR)"/>
     <circle cx="35" cy="21" r="5.5" fill="#ffee55" clip-path="url(#ecR)"/>
     <circle cx="20" cy="42" r="4"   fill="#ff6eb4" clip-path="url(#ecR)"/>
     <circle cx="50" cy="42" r="4"   fill="#ff6eb4" clip-path="url(#ecR)"/>`
  );

  const eggColors = ['#ff85c2', '#7ec8e3', '#ffe066', '#b2f77a', '#c4a0ff', '#ff9f7a'];
  const eggPositions = [[8, 35], [92, 28], [5, 60], [95, 55], [15, 80], [85, 72], [30, 15], [70, 18], [50, 8], [3, 90], [97, 85], [45, 95]];
  eggPositions.forEach(([left, top], i) => {
    const eg = document.createElement('div');
    eg.className = 'sf-layer';
    const c = eggColors[i % eggColors.length];
    const sz = 16 + Math.floor(Math.random() * 10);
    eg.innerHTML = `<svg viewBox="0 0 70 90" width="${sz}" height="${Math.round(sz * 1.28)}" aria-hidden="true" style="opacity:${0.55 + Math.random() * 0.4}">
      <ellipse cx="35" cy="52" rx="31" ry="38" fill="${c}"/>
      <ellipse cx="35" cy="52" rx="31" ry="38" fill="none" stroke="rgba(0,0,0,0.1)" stroke-width="1.5"/>
      <ellipse cx="23" cy="34" rx="9" ry="5" fill="rgba(255,255,255,0.28)" transform="rotate(-20,23,34)"/>
    </svg>`;
    eg.style.cssText = `position:fixed;left:${left}%;top:${top}%;pointer-events:none;z-index:1;transform:translate(-50%,-50%) rotate(${Math.random() * 40 - 20}deg);`;
    document.body.appendChild(eg);
  });

  window._sfParticles(['🥚', '🐣', '🌸', '🌷', '🌼'], { count: 24, minSz: 12, szRange: 12, minDur: 10, durRange: 7, rock: true });
};
