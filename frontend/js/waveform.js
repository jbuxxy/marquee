// ════════════════════════════════════════════════════════════════════
// WAVEFORM CONTROLLER — header activity waveform + watch-card waves.
//
// Intertwining threads: a neutral "server spine" plus one strand per configured watch
// service (a single-service install shows one strand, not three). Drawing lives in
// js/waveform/engine.js and normally runs in a Web Worker on OffscreenCanvases
// (js/workers/wave-worker.js), so this always-on animation never competes with the
// page's main thread. This file only handles the DOM side: which services exist, stream
// counts, canvas sizes/DPR, visibility, reduced motion and the mode button. Without
// OffscreenCanvas support the same engine runs here on the main thread instead.
// ════════════════════════════════════════════════════════════════════
(function () {
  const ekg = document.getElementById('ekg-canvas');
  if (!ekg) return;
  const W = window.MarqueeWaveform = window.MarqueeWaveform || {};
  W.setTheme = function () {}; // strand colors come from each service's brand color

  const canOffload = typeof Worker === 'function' && typeof OffscreenCanvas === 'function'
    && 'transferControlToOffscreen' in HTMLCanvasElement.prototype;

  // ── Backend: worker (preferred) or main-thread fallback ─────────────
  let send, addCanvas;
  if (canOffload) {
    const worker = new Worker('js/workers/wave-worker.js');
    const off = ekg.transferControlToOffscreen();
    worker.postMessage({ type: 'init', surfaces: { ekg: off } }, [off]);
    send = (msg) => worker.postMessage(msg);
    addCanvas = (id, canvas) => {
      const oc = canvas.transferControlToOffscreen();
      worker.postMessage({ type: 'surface', id, canvas: oc }, [oc]);
    };
  } else {
    let renderer = null;
    const queue = [];
    const apply = (msg) => {
      switch (msg.type) {
        case 'surface': renderer.addSurface(msg.id, msg.canvas); break;
        case 'threads': renderer.setThreads(msg.threads); break;
        case 'size': renderer.setSize(msg.id, msg.w, msg.h, msg.dpr); break;
        case 'counts': renderer.setCounts(msg.counts); break;
        case 'mode': renderer.setMode(msg.mode); break;
        case 'state': renderer.setState(msg.running, msg.staticOnly); break;
      }
    };
    send = (msg) => (renderer ? apply(msg) : queue.push(msg));
    addCanvas = (id, canvas) => send({ type: 'surface', id, canvas });
    const loadMode = (name, cb) => {
      const s = document.createElement('script');
      s.src = `js/waveform/${name}.js`;
      s.onload = cb;
      document.head.appendChild(s);
    };
    const s = document.createElement('script');
    s.src = 'js/waveform/engine.js';
    s.onload = () => {
      renderer = W.createRenderer({ ekg }, loadMode);
      queue.splice(0).forEach(apply);
    };
    document.head.appendChild(s);
  }

  // ── Sizes + DPR ─────────────────────────────────────────────────────
  const idOf = new Map([[ekg, 'ekg']]);
  const lastSize = new Map();
  function sendSize(el, w, h) {
    if (!w || !h) return;
    lastSize.set(el, [w, h]);
    send({ type: 'size', id: idOf.get(el), w, h, dpr: window.devicePixelRatio || 1 });
  }
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) sendSize(e.target, e.contentRect.width, e.contentRect.height);
  });
  // Zoom / moving to a different-DPI monitor changes DPR without resizing anything.
  (function watchDpr() {
    const mq = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    mq.addEventListener('change', () => { lastSize.forEach(([w, h], el) => sendSize(el, w, h)); watchDpr(); }, { once: true });
  })();

  // ── Run state: on screen + tab visible; reduced motion = still frames ──
  const onScreen = new Set();
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  function syncState() {
    send({ type: 'state', running: onScreen.size > 0 && !document.hidden, staticOnly: reduceMotion.matches });
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) (e.isIntersecting ? onScreen.add(e.target) : onScreen.delete(e.target));
    syncState();
  });
  document.addEventListener('visibilitychange', syncState);
  reduceMotion.addEventListener('change', syncState);

  function track(el, id) {
    idOf.set(el, id);
    ro.observe(el);
    io.observe(el);
  }
  track(ekg, 'ekg');

  // ── Services / watch-card canvases (cards.js builds them on config) ─
  let serviceKeys = [];
  const cards = {}; // key -> canvas element already handed to the renderer
  document.addEventListener('marquee:config', (e) => {
    const services = enabledWatchServices(e.detail);
    serviceKeys = services.map((s) => s.key);
    send({ type: 'threads', threads: services.map((s) => ({ key: s.key, col: s.rgb })) });
    for (const { key } of services) {
      const canvas = document.getElementById(`wave-${key}`);
      if (!canvas || cards[key] === canvas) continue;
      // A rebuilt card grid gives a fresh canvas; a canvas can only be transferred once.
      if (cards[key]) { ro.unobserve(cards[key]); io.unobserve(cards[key]); onScreen.delete(cards[key]); }
      cards[key] = canvas;
      addCanvas(key, canvas);
      track(canvas, key);
    }
    lastCountsSig = '';
    syncCounts();
  });

  // ── Stream counts ───────────────────────────────────────────────────
  let lastCountsSig = '';
  function syncCounts() {
    const counts = { total: 0 };
    for (const key of serviceKeys) {
      counts[key] = (typeof allStreams !== 'undefined' ? allStreams[key]?.length : 0) || 0;
      counts.total += counts[key];
    }
    const sig = serviceKeys.map((k) => counts[k]).join(',');
    if (sig === lastCountsSig) return;
    lastCountsSig = sig;
    send({ type: 'counts', counts });
    // Card waves are binary: the CSS fades a card's canvas in only while it plays.
    for (const key of serviceKeys) cards[key]?.classList.toggle('active', counts[key] > 0);
  }
  // Cheap signature check; avoids coupling to every place allStreams changes.
  setInterval(syncCounts, 400);

  // ── Mode toggle button ──────────────────────────────────────────────
  const MODE_ORDER = ['sin', 'organic', 'ocean', 'sonar', 'aurora', 'eq'];
  const MODE_ICONS = { sin: 'ti ti-wave-sine', organic: 'ti ti-activity', ocean: 'ti ti-droplets', sonar: 'ti ti-radar-2', aurora: 'ti ti-wind', eq: 'ti ti-chart-bar' };
  const MODE_LABELS = { sin: 'Sin', organic: 'Organic', ocean: 'Ocean Swell', sonar: 'Sonar Ripple', aurora: 'Aurora Flow', eq: 'Spectrum EQ' };
  let mode = 'sin';
  const modeBtn = document.getElementById('ekg-mode-btn');
  const modeIcon = document.getElementById('ekg-mode-icon');
  modeBtn?.addEventListener('click', () => {
    mode = MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length];
    send({ type: 'mode', mode });
    if (modeIcon) modeIcon.className = MODE_ICONS[mode];
    modeBtn.title = `Waveform: ${MODE_LABELS[mode]} (click to cycle)`;
  });

  syncState();
})();
