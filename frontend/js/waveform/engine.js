// ════════════════════════════════════════════════════════════════════
// WAVEFORM ENGINE — draws the header activity waveform and the watch-card waves.
//
// DOM-free on purpose: it normally runs inside js/workers/wave-worker.js on
// OffscreenCanvases, so this always-on animation costs the page's main thread nothing.
// Where OffscreenCanvas isn't available it runs on the main thread instead.
// js/waveform.js is the DOM-side controller that feeds it threads, counts, sizes and
// the run state.
//
// Defines self.MarqueeWaveform (self === window on the main thread). The lazily loaded
// modes in js/waveform/*.js attach to window.MarqueeWaveform and read ._shared; the
// worker aliases self.window = self, so they run unchanged in either place.
// ════════════════════════════════════════════════════════════════════
(function (root) {
  const W = root.MarqueeWaveform = root.MarqueeWaveform || {};

  // Seven inharmonic oscillators — ratios are irrational so the combined waveform never
  // visibly repeats.
  const osc = [
    { phase: 0.00, rate: 0.0137 }, { phase: 1.27, rate: 0.0211 }, { phase: 2.61, rate: 0.0089 },
    { phase: 0.84, rate: 0.0263 }, { phase: 3.14, rate: 0.0071 }, { phase: 1.93, rate: 0.0174 },
    { phase: 0.53, rate: 0.0052 },
  ];

  const THREAD_OI = { plex: [0, 1, 4, 3], jellyfin: [2, 3, 5, 1], abs: [1, 4, 0, 6] };
  const THREAD_FREQ = { plex: 1.000, jellyfin: 1.414, abs: 1.732 };

  // Server spine first (drawn behind), then one strand per configured watch service.
  // THREADS and COLORS are mutated in place, never reassigned, so lazy modes holding a
  // reference stay in sync.
  const SPINE = { key: null, col: '160,200,230', freq: 0.618, oi: [6, 4, 2, 5], spine: true };
  const THREADS = [SPINE];
  const COLORS = { spine: SPINE.col };

  function setThreads(list) {
    THREADS.length = 1;
    for (const k of Object.keys(COLORS)) if (k !== 'spine') delete COLORS[k];
    for (const { key, col } of list) {
      THREADS.push({ key, col, freq: THREAD_FREQ[key] || 1, oi: THREAD_OI[key] || [0, 1, 2, 3], spine: false });
      COLORS[key] = col;
    }
  }

  // Slow organic envelope per oscillator — avoids mechanical amplitude repetition.
  function env(oi) {
    return 0.80 + 0.13 * Math.sin(osc[oi].phase * 0.17 + oi * 0.9) + 0.07 * Math.sin(osc[oi].phase * 0.06 + oi * 1.7);
  }

  // y (normalized -1..1) for one thread at position t ∈ [0,1].
  function threadSample(t, thread, own, total) {
    const tau = t * Math.PI * 2;
    const f = thread.freq;
    const oi = thread.oi;
    if (thread.spine) {
      const a = env(oi[0]) * (0.14 + total * 0.032);
      return a * (
        0.55 * Math.sin(tau * f + osc[oi[0]].phase) +
        0.27 * Math.sin(tau * f * 1.62 + osc[oi[1]].phase) +
        0.12 * Math.sin(tau * f * 2.73 + osc[oi[2]].phase) +
        0.06 * Math.sin(tau * f * 4.24 + osc[oi[3]].phase)
      );
    }
    const others = total - own;
    const ownAmp = 0.30 + own * 0.12;
    const crossAmp = others * 0.014;
    const a = (ownAmp + crossAmp) * env(oi[0]);
    const h3 = 0.04 + own * 0.025 + others * 0.004;
    const h4 = 0.01 + own * 0.014;
    const hw = 0.52 + 0.28 + h3 + h4; // normalized so |result| ≤ a: no clipping
    return a * (
      (0.52 / hw) * Math.sin(tau * f + osc[oi[0]].phase) +
      (0.28 / hw) * Math.sin(tau * f * 2.14 + osc[oi[1]].phase) +
      (h3 / hw) * Math.sin(tau * f * 3.89 + osc[oi[2]].phase) +
      (h4 / hw) * Math.sin(tau * f * 6.18 + osc[oi[3]].phase)
    );
  }

  W._shared = { osc, env, threadSample, THREADS, COLORS };

  // ── Sin mode (built in; the other modes load lazily) ─────────────────
  const sinParticles = [];

  // Glow without shadowBlur: shadowBlur on a long path is a full Gaussian blur pass per
  // stroke per frame. A wide, faint under-stroke reads the same at this size.
  function glowStroke(ctx, col, alpha, lineW, blur) {
    ctx.strokeStyle = `rgba(${col},${Math.min(alpha * 0.22, 0.2)})`;
    ctx.lineWidth = lineW + blur * 1.1;
    ctx.stroke();
    ctx.strokeStyle = `rgba(${col},${alpha})`;
    ctx.lineWidth = lineW;
    ctx.stroke();
  }

  function drawSinMode(ctx, w, h, counts) {
    const tau = Math.PI * 2;
    const midY = h / 2;
    const baseAmp = h * 0.10;
    const maxAmp = h * 0.42;

    for (let i = sinParticles.length - 1; i >= 0; i--) if (sinParticles[i].life <= 0) sinParticles.splice(i, 1);
    if (sinParticles.length > 300) sinParticles.length = 300;

    THREADS.filter((t) => !t.spine).forEach((thread, li) => {
      const own = counts[thread.key] || 0;
      const others = counts.total - own;
      if (thread.sinPhase === undefined) thread.sinPhase = li * (Math.PI / 2);
      const amp = baseAmp + (maxAmp - baseAmp) * Math.min(own * 0.26 + others * 0.03, 1.0);
      const freq = 0.65 + li * 0.09 + own * 0.42 + others * 0.04;
      const phase = thread.sinPhase;
      const alpha = Math.min(0.22 + own * 0.17 + others * 0.014, 1.0);
      const lineW = 0.65 + own * 0.45 + others * 0.04;
      const blur = 1.2 + own * 2.8 + others * 0.22;

      ctx.beginPath();
      for (let x = 0; x <= w; x += 2) {
        const y = midY - amp * Math.sin(tau * freq * (x / w) + phase);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      glowStroke(ctx, thread.col, alpha, lineW, blur);

      if (own >= 2 && Math.random() < 0.07 * own) {
        const t = Math.random();
        sinParticles.push({
          x: t * w, y: midY - amp * Math.sin(tau * freq * t + phase),
          vx: (0.35 + Math.random() * 0.55) * (Math.random() < 0.5 ? 1 : -1), vy: (Math.random() - 0.5) * 0.22,
          life: 1.0, r: 0.7 + Math.random(), col: thread.col,
        });
      }
      thread.sinPhase = (thread.sinPhase + 0.021 * (1 + counts.total * 0.18)) % tau;
    });

    for (const p of sinParticles) {
      ctx.fillStyle = `rgba(${p.col},${p.life * 0.2})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${p.col},${p.life * 0.72})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      p.x += p.vx; p.y += p.vy; p.life -= 0.019;
    }
  }

  // ── Watch-card wave: binary "this platform is in use" wash ───────────
  function drawCard(ctx, w, h, thread, total) {
    const baseY = h * 0.6, amp = h * 0.34;
    ctx.beginPath();
    ctx.moveTo(0, baseY - threadSample(0, thread, 1, total) * amp);
    for (let x = 3; x <= w + 2; x += 3) ctx.lineTo(x, baseY - threadSample(x / w, thread, 1, total) * amp);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = `rgba(${thread.col},0.55)`;
    ctx.fill();
  }

  // ── Renderer ─────────────────────────────────────────────────────────
  // surfaces: { ekg: canvas, <serviceKey>: canvas, ... } — OffscreenCanvas in the worker.
  // loadMode(name, cb): loads js/waveform/<name>.js, then calls cb.
  W.createRenderer = function (surfaces, loadMode) {
    const views = {}; // id -> { canvas, ctx, w, h, dpr }
    function addSurface(id, canvas) {
      views[id] = { canvas, ctx: canvas.getContext('2d'), w: 0, h: 0, dpr: 1 };
    }
    for (const id in surfaces) addSurface(id, surfaces[id]);

    let counts = { total: 0 };
    let mode = 'sin';
    let running = false, staticOnly = false;
    let rafId = null, lastFrame = 0;
    const raf = root.requestAnimationFrame ? root.requestAnimationFrame.bind(root) : (cb) => setTimeout(() => cb(performance.now()), 16);
    const caf = root.cancelAnimationFrame ? root.cancelAnimationFrame.bind(root) : clearTimeout;

    function frame(advance) {
      const ekg = views.ekg;
      if (ekg?.w) {
        const { ctx, w, h, dpr } = ekg;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        if (mode === 'sin') drawSinMode(ctx, w, h, counts);
        else W[mode]?.draw?.(ctx, w, h, counts, COLORS);
      }
      for (const thread of THREADS) {
        if (thread.spine) continue;
        const v = views[thread.key];
        if (!v?.w) continue;
        v.ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
        v.ctx.clearRect(0, 0, v.w, v.h);
        if ((counts[thread.key] || 0) > 0) drawCard(v.ctx, v.w, v.h, thread, counts.total);
      }
      if (advance) {
        const speed = 1.0 + counts.total * 0.30;
        for (const o of osc) o.phase += o.rate * speed;
      }
    }

    function tick(now) {
      rafId = null;
      if (!running || staticOnly) return;
      // ~60fps cap: on 120/144Hz displays every other callback is skipped, so the
      // animation runs at the same speed everywhere and costs half as much.
      if (now - lastFrame >= 15) {
        lastFrame = now;
        frame(true);
      }
      rafId = raf(tick);
    }

    function sync() {
      if (running && !staticOnly) {
        if (rafId === null) rafId = raf(tick);
      } else {
        if (rafId !== null) { caf(rafId); rafId = null; }
        frame(false); // still frame: paused or reduced motion
      }
    }

    return {
      addSurface(id, canvas) { addSurface(id, canvas); },
      setSize(id, w, h, dpr) {
        const v = views[id];
        if (!v) return;
        v.w = w; v.h = h; v.dpr = dpr;
        v.canvas.width = Math.round(w * dpr);
        v.canvas.height = Math.round(h * dpr);
        if (!running || staticOnly) frame(false);
      },
      setThreads(list) { setThreads(list); if (!running || staticOnly) frame(false); },
      setCounts(c) { counts = c; if (!running || staticOnly) frame(false); },
      setMode(next) {
        const apply = () => {
          if (mode === 'sin') sinParticles.length = 0;
          else W[mode]?.reset?.();
          mode = next;
          if (!running || staticOnly) frame(false);
        };
        if (next === 'sin' || W[next]) apply();
        else loadMode(next, () => { if (W[next]) apply(); });
      },
      setState(r, s) { running = r; staticOnly = s; sync(); },
    };
  };
})(typeof self !== 'undefined' ? self : this);
