// SEASONAL FLAIR — core: detection, shared helpers, panel UI, dynamic
// per-holiday loader. Each holiday's effect lives in its own file under
// js/seasonal/ and is only fetched the first time it's actually needed.
// Entirely absent (no button, no effect) unless site.enableSeasonalEffects
// is on.
window.MarqueeSeasonal = window.MarqueeSeasonal || {};

(function () {
  const THEMES = [
    { id: 'newyear', label: "New Year's", emoji: '🎆' },
    { id: 'valentines', label: "Valentine's Day", emoji: '💝' },
    { id: 'stpatricks', label: "St. Patrick's Day", emoji: '☘️' },
    { id: 'easter', label: 'Easter', emoji: '🐰' },
    { id: 'cincodemayo', label: 'Cinco de Mayo', emoji: '🌮' },
    { id: 'memorialday', label: 'Memorial Day', emoji: '🇺🇸' },
    { id: 'july4', label: '4th of July', emoji: '🎇' },
    { id: 'halloween', label: 'Halloween', emoji: '🎃' },
    { id: 'thanksgiving', label: 'Thanksgiving', emoji: '🦃' },
    { id: 'christmas', label: 'Christmas', emoji: '🎄' },
  ];

  function detectSeason() {
    const m = new Date().getMonth() + 1, d = new Date().getDate();
    if (m === 12 && d >= 11 && d <= 25) return 'christmas';
    if ((m === 12 && d >= 26) || (m === 1 && d <= 1)) return 'newyear';
    if (m === 2 && d >= 8 && d <= 14) return 'valentines';
    if (m === 3 && d >= 11 && d <= 17) return 'stpatricks';
    if (m === 4 && d >= 1 && d <= 7) return 'easter';
    if ((m === 4 && d >= 29) || (m === 5 && d <= 5)) return 'cincodemayo';
    if (m === 5 && d >= 25) return 'memorialday';
    if ((m === 6 && d >= 28) || (m === 7 && d <= 4)) return 'july4';
    if (m === 10 && d >= 18) return 'halloween';
    if (m === 11 && d >= 20 && d <= 26) return 'thanksgiving';
    return null;
  }

  let sfChoice = 'auto';
  try { sfChoice = localStorage.getItem('marquee-sf-choice') ?? 'auto'; } catch {}

  function getEffective() {
    if (sfChoice === 'off') return null;
    if (sfChoice === 'auto') return detectSeason();
    return sfChoice;
  }
  window._sfGetEffective = getEffective;

  // ── Christmas countdown chip — shown near the logo regardless of the
  // active theme selection, as long as Christmas is the effective season.
  (function () {
    const el = document.getElementById('xmas-countdown');
    if (!el) return;

    function updateCountdown() {
      const season = getEffective();
      if (season !== 'christmas') { el.style.display = 'none'; return; }
      const now = new Date();
      const xmas = new Date(now.getFullYear(), 11, 25);
      if (now > xmas) { el.style.display = 'none'; return; }
      const ms = xmas - now;
      const days = Math.floor(ms / 86400000);
      const hrs = Math.floor((ms % 86400000) / 3600000);
      const mins = Math.floor((ms % 3600000) / 60000);
      let label;
      if (days === 0 && hrs === 0) label = 'Merry Christmas!';
      else if (days === 0) label = `${hrs}h ${mins}m until Christmas`;
      else label = `${days}d ${hrs}h until Christmas`;
      el.textContent = `🎄 ${label}`;
      el.style.display = '';
    }
    updateCountdown();
    setInterval(updateCountdown, 60000);
    document.addEventListener('sf-changed', updateCountdown);
  })();

  function clearFlair() {
    document.querySelectorAll('.sf-layer').forEach((el) => el.remove());
  }

  function loadLottieWC(cb) {
    if (window.customElements?.get('dotlottie-wc')) { cb(); return; }
    const sid = '_sf_dotlottie_wc';
    if (!document.getElementById(sid)) {
      const s = document.createElement('script');
      s.id = sid; s.type = 'module';
      s.src = 'https://cdn.jsdelivr.net/npm/@lottiefiles/dotlottie-wc@0.9.14/dist/dotlottie-wc.js';
      document.head.appendChild(s);
    }
    const t0 = Date.now();
    const poll = setInterval(() => {
      if (window.customElements?.get('dotlottie-wc')) { clearInterval(poll); cb(); }
      else if (Date.now() - t0 > 10000) clearInterval(poll);
    }, 100);
  }
  window._sfLoadLottieWC = loadLottieWC;

  function autoResizeCanvas(canvas) {
    function resize() {
      if (!canvas.isConnected) { window.removeEventListener('resize', resize); return; }
      canvas.width = innerWidth; canvas.height = innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);
  }
  window._sfAutoResizeCanvas = autoResizeCanvas;

  function _mkWC(src, w, h) {
    const el = document.createElement('dotlottie-wc');
    el.setAttribute('src', src); el.setAttribute('autoplay', ''); el.setAttribute('loop', '');
    el.style.cssText = `width:${w}px;height:${h}px;display:block;`;
    return el;
  }
  window._sfMkWC = _mkWC;

  // Generic floating emoji particles — opts: count, minSz, szRange, minDur,
  // durRange, and one of rise/drift/pulse/rock (falls otherwise).
  function particles(emojis, opts) {
    opts = opts || {};
    const wrap = document.createElement('div');
    wrap.className = 'sf-layer sf-particles';
    const n = opts.count || 22;
    let anim = 'sfFall';
    if (opts.rise) anim = 'sfRise';
    else if (opts.drift) anim = 'sfDrift';
    else if (opts.pulse) anim = 'sfPulse';
    else if (opts.rock) anim = 'sfRock';
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span');
      s.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      const sz = (opts.minSz || 14) + Math.random() * (opts.szRange || 12);
      const dur = (opts.minDur || 9) + Math.random() * (opts.durRange || 8);
      s.style.cssText = `font-size:${sz}px;left:${Math.random() * 98}%;animation:${anim} ${dur}s linear ${-(Math.random() * dur)}s infinite;`;
      wrap.appendChild(s);
    }
    document.body.appendChild(wrap);
  }
  window._sfParticles = particles;

  const _loadedHolidays = new Set();
  function applyFlair() {
    clearFlair();
    const key = getEffective();
    if (!key) return;
    if (_loadedHolidays.has(key)) { window.MarqueeSeasonal[key]?.(); return; }
    const s = document.createElement('script');
    s.src = `js/seasonal/${key}.js`;
    s.onload = () => { _loadedHolidays.add(key); window.MarqueeSeasonal[key]?.(); };
    s.onerror = () => console.warn(`[seasonal] failed to load js/seasonal/${key}.js`);
    document.head.appendChild(s);
  }

  let panel = null, seasonalEnabled = false;

  function buildPanel() {
    if (panel) return;
    panel = document.createElement('div');
    panel.className = 'seasonal-panel';

    function addOpt(id, emoji, label) {
      const opt = document.createElement('div');
      opt.className = 'seasonal-opt';
      opt.dataset.sid = id;
      opt.innerHTML = `<span class="so-em">${emoji}</span><span>${label}</span>`;
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        sfChoice = id;
        try { localStorage.setItem('marquee-sf-choice', sfChoice); } catch {}
        applyFlair(); updateBtn(); syncPanel();
        document.dispatchEvent(new Event('sf-changed'));
        panel.classList.remove('open');
      });
      panel.appendChild(opt);
    }
    addOpt('auto', '🗓', 'Auto (follow calendar)');
    THEMES.forEach((t) => addOpt(t.id, t.emoji, t.label));
    addOpt('off', '✕', 'Off');
    document.body.appendChild(panel);
    syncPanel();
  }

  function syncPanel() {
    panel?.querySelectorAll('.seasonal-opt').forEach((o) => o.classList.toggle('sel', o.dataset.sid === sfChoice));
  }
  function updateBtn() {
    const btn = document.getElementById('seasonal-btn');
    if (!btn) return;
    btn.classList.toggle('active', sfChoice !== 'off');
  }

  window._seasonalToggle = () => {
    if (!seasonalEnabled) return;
    if (sfChoice !== 'off') {
      try { localStorage.setItem('marquee-sf-last-active', sfChoice); } catch {}
      panel?.querySelector('[data-sid="off"]')?.click();
    } else {
      let last = 'auto';
      try { last = localStorage.getItem('marquee-sf-last-active') || 'auto'; } catch {}
      panel?.querySelector(`[data-sid="${last}"]`)?.click();
    }
  };

  document.addEventListener('marquee:config', (e) => {
    seasonalEnabled = !!e.detail.enableSeasonalEffects;
    const btn = document.getElementById('seasonal-btn');
    if (btn) btn.hidden = !seasonalEnabled;
    if (!seasonalEnabled) { clearFlair(); return; }
    buildPanel();
    updateBtn();
    applyFlair();

    if (btn && !btn._wired) {
      btn._wired = true;
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const opening = !panel.classList.contains('open');
        if (opening) {
          syncPanel();
          const r = btn.getBoundingClientRect();
          panel.style.top = r.bottom + 6 + 'px';
          panel.style.right = window.innerWidth - r.right + 'px';
        }
        panel.classList.toggle('open');
      });
      document.addEventListener('click', () => panel.classList.remove('open'));
    }
  });
})();
