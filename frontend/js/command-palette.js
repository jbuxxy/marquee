// COMMAND PALETTE — "?" key, VS Code-style fuzzy action launcher. The
// action list is rebuilt from current config so it only ever offers
// commands for features actually present (no "Open Heatmap" entry if
// Tautulli/Jellystat aren't configured, no service open-links for
// unconfigured services, etc).
(function () {
  const overlay = document.getElementById('cmd-overlay');
  const modal = document.getElementById('cmd-modal');
  const input = document.getElementById('cmd-input');
  const results = document.getElementById('cmd-results');
  if (!overlay || !input) return;

  let open = false;
  let focusIdx = -1;
  let COMMANDS = [];
  let cmdConfig = {};

  function buildCommands() {
    const cmds = [
      { group: 'Search', label: 'Search', hint: '/', action: () => document.getElementById('search-input')?.focus() },
      { group: 'System', label: 'Keyboard Shortcuts', hint: 'Shift+?', action: () => window.openShortcuts?.() },
      { group: 'Toggles', label: 'Theme', action: () => document.getElementById('theme-toggle')?.click() },
    ];

    for (const cat of ['movies', 'tv', 'music', 'books']) {
      if (typeof categoryBackedByService === 'function' && categoryBackedByService(cat)) {
        cmds.push({ group: 'Navigate', label: `Recently Added — ${cat}`, action: () => { document.querySelector(`.carousel-tab[data-cat="${cat}"]`)?.click(); document.getElementById('carousel-section')?.scrollIntoView({ behavior: 'smooth' }); } });
      }
    }
    if (cmdConfig.services?.seerr?.enabled) cmds.push({ group: 'Navigate', label: 'Requests', action: () => document.getElementById('requests-list')?.scrollIntoView({ behavior: 'smooth' }) });

    if (!document.getElementById('heatmap-btn')?.hidden) cmds.push({ group: 'Views', label: 'Activity Heatmap', action: () => document.getElementById('heatmap-btn')?.click() });
    if (!document.getElementById('np-map-btn')?.hidden) cmds.push({ group: 'Views', label: 'Live Map', action: () => document.getElementById('np-map-btn')?.click() });
    cmds.push({ group: 'Views', label: 'Now Casting Mode', hint: 'Shift+F', action: () => window._castingToggle?.() });

    if (typeof anonToggleAvailable === 'function' && anonToggleAvailable()) cmds.push({ group: 'Toggles', label: 'Anonymous Mode', action: () => document.getElementById('np-anon-btn')?.click() });
    if (cmdConfig.enableSeasonalEffects) cmds.push({ group: 'Toggles', label: 'Seasonal Flair', action: () => window._seasonalToggle?.() });

    for (const svc of ['plex', 'jellyfin', 'abs', 'seerr']) {
      const s = cmdConfig.services?.[svc];
      if (s?.enabled && s.publicUrl) {
        cmds.push({ group: 'Open', label: WATCH_SERVICE_META?.[svc]?.label || svc, action: () => (svc === 'seerr' ? window.open(s.publicUrl, '_blank') : openLink(svc, s.publicUrl)) });
      }
    }

    cmds.push({ group: 'System', label: 'Refresh Data', action: () => window.refreshAll?.() });
    return cmds;
  }

  document.addEventListener('marquee:config', (e) => { cmdConfig = e.detail; COMMANDS = buildCommands(); });

  function fuzzy(str, query) {
    if (!query) return true;
    const s = str.toLowerCase(), q = query.toLowerCase();
    let si = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const idx = s.indexOf(q[qi], si);
      if (idx === -1) return false;
      si = idx + 1;
    }
    return true;
  }

  function renderResults(query) {
    focusIdx = -1;
    const q = (query || '').trim();
    const filtered = COMMANDS.filter((c) => fuzzy(c.label, q) || fuzzy(c.group, q));
    if (!filtered.length) { results.innerHTML = `<div class="cmd-no-results">No commands found</div>`; return; }
    const grouped = {};
    for (const c of filtered) (grouped[c.group] = grouped[c.group] || []).push(c);
    let html = '';
    for (const [group, items] of Object.entries(grouped)) {
      html += `<div class="cmd-section-label">${group}</div>`;
      for (const c of items) {
        const gi = filtered.indexOf(c);
        html += `<button class="cmd-item" data-idx="${gi}" tabindex="-1"><span class="cmd-item-label">${c.label}</span>${c.hint ? `<span class="cmd-item-hint">${c.hint}</span>` : ''}</button>`;
      }
    }
    results.innerHTML = html;
    results.querySelectorAll('.cmd-item').forEach((btn) => {
      btn.addEventListener('click', () => run(filtered[parseInt(btn.dataset.idx, 10)]));
    });
  }

  function focusItem(delta) {
    const items = results.querySelectorAll('.cmd-item');
    if (!items.length) return;
    items[focusIdx]?.classList.remove('focused');
    focusIdx = Math.max(0, Math.min(items.length - 1, focusIdx + delta));
    items[focusIdx].classList.add('focused');
    items[focusIdx].scrollIntoView({ block: 'nearest' });
  }

  function run(cmd) {
    if (!cmd) return;
    closePalette();
    setTimeout(() => cmd.action(), 80);
  }

  function openPalette() {
    open = true;
    overlay.classList.add('open');
    overlay.removeAttribute('aria-hidden');
    input.value = '';
    focusIdx = -1;
    renderResults('');
    requestAnimationFrame(() => input.focus());
  }
  function closePalette() {
    open = false;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    input.blur();
  }

  document.getElementById('cmd-bar-btn')?.addEventListener('click', openPalette);
  document.addEventListener('keydown', (e) => {
    if (e.key === '?' && !e.target.matches('input,textarea,select')) {
      e.preventDefault();
      open ? closePalette() : openPalette();
      return;
    }
    if (!open) return;
    if (e.key === 'Escape') { closePalette(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); focusItem(-1); return; }
    if (e.key === 'Enter') {
      const items = results.querySelectorAll('.cmd-item');
      const el = items[focusIdx] || items[0];
      if (el) {
        const q = input.value.trim();
        const filtered = COMMANDS.filter((c) => fuzzy(c.label, q) || fuzzy(c.group, q));
        run(filtered[parseInt(el.dataset.idx, 10)]);
      }
    }
  });
  input.addEventListener('input', () => renderResults(input.value));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closePalette(); });
})();
