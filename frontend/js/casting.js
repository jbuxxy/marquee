// NOW CASTING FULLSCREEN MODE — Shift+F, desktop-oriented, cycles through
// active streams across whichever services are configured.
(function () {
  const overlay = document.getElementById('casting-overlay');
  const bg = document.getElementById('casting-bg');
  const poster = document.getElementById('casting-poster');
  const titleEl = document.getElementById('casting-title');
  const metaEl = document.getElementById('casting-meta');
  const dotsEl = document.getElementById('casting-dots');
  const closeBtn = document.getElementById('casting-close');
  if (!overlay) return;

  let castingOpen = false, castingIdx = 0, castingTimer = null, castingItems = [];

  function collectItems() {
    if (typeof allStreams === 'undefined') return [];
    const out = [];
    for (const [svcId, streams] of Object.entries(allStreams)) for (const s of streams) out.push({ ...s, svc: WATCH_SERVICE_META[svcId]?.label || svcId });
    return out;
  }

  function open() {
    castingItems = collectItems();
    if (!castingItems.length) return;
    castingIdx = 0;
    overlay.classList.add('open');
    overlay.removeAttribute('aria-hidden');
    castingOpen = true;
    show(0);
    castingTimer = setInterval(() => { castingIdx = (castingIdx + 1) % castingItems.length; show(castingIdx); }, 10000);
  }
  function close() {
    castingOpen = false;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    clearInterval(castingTimer);
  }

  window._castingRefresh = function () {
    if (!castingOpen) return;
    const fresh = collectItems();
    if (!fresh.length) { close(); return; }
    const current = castingItems[castingIdx];
    let newIdx = current ? fresh.findIndex((it) => it.svc === current.svc && it.user === current.user && it.title === current.title) : -1;
    if (newIdx === -1) newIdx = 0;
    castingItems = fresh;
    castingIdx = newIdx;
    // Progress-only updates arrive every few seconds; repaint (and reload the poster) only
    // when what's on screen would actually change.
    const sig = JSON.stringify([castingIdx, fresh.map((it) => [it.svc, it.user, it.title, it.thumb])]);
    if (sig === lastSig) return;
    lastSig = sig;
    show(castingIdx);
  };
  let lastSig = '';

  function show(idx) {
    const item = castingItems[idx];
    if (!item) return;
    if (item.thumb) { poster.src = item.thumb; poster.style.display = ''; bg.style.backgroundImage = `url('${item.thumb}')`; }
    else { poster.style.display = 'none'; bg.style.backgroundImage = 'none'; }
    titleEl.textContent = item.title || '—';
    const displayUser = item.user ? maskedUser(item.user) : null;
    metaEl.textContent = [item.svc, displayUser ? `Watched by ${displayUser}` : ''].filter(Boolean).join(' · ');
    dotsEl.innerHTML = castingItems.map((_, i) => `<div class="casting-dot${i === idx ? ' active' : ''}"></div>`).join('');
    dotsEl.querySelectorAll('.casting-dot').forEach((d, i) => d.addEventListener('click', () => { clearInterval(castingTimer); castingIdx = i; show(i); }));
  }

  function next() { clearInterval(castingTimer); castingIdx = (castingIdx + 1) % castingItems.length; show(castingIdx); }
  function prev() { clearInterval(castingTimer); castingIdx = (castingIdx - 1 + castingItems.length) % castingItems.length; show(castingIdx); }

  closeBtn?.addEventListener('click', close);
  window._castingToggle = () => (castingOpen ? close() : open());
  document.addEventListener('marquee:anon-changed', () => { if (castingOpen) show(castingIdx); });

  document.addEventListener('keydown', (e) => {
    if (e.shiftKey && e.key === 'F' && !e.target.matches('input,textarea')) castingOpen ? close() : open();
    if (e.key === 'Escape' && castingOpen) close();
    if ((e.key === 'ArrowRight' || e.key === 'ArrowDown') && castingOpen) next();
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && castingOpen) prev();
  });

  let touchStartX = null, touchStartY = null;
  overlay.addEventListener('touchstart', (e) => {
    if (!castingOpen || e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY;
  }, { passive: true });
  overlay.addEventListener('touchend', (e) => {
    if (!castingOpen || touchStartX === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX, dy = t.clientY - touchStartY;
    touchStartX = null; touchStartY = null;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) next(); else prev();
  }, { passive: true });
})();
