// KEYBOARD SHORTCUTS CHEAT SHEET — Shift+? or via the command palette.
(function () {
  const overlay = document.getElementById('shortcuts-overlay');
  const closeBtn = document.getElementById('shortcuts-close');
  const body = document.getElementById('shortcuts-body');
  if (!overlay) return;

  const SHORTCUTS = [
    { group: 'Navigation', items: [
      { keys: ['/'], desc: 'Focus search' },
      { keys: ['?'], desc: 'Command palette' },
      { keys: ['Shift', '?'], desc: 'Keyboard shortcuts' },
      { keys: ['Esc'], desc: 'Close any overlay' },
    ] },
    { group: 'Command Palette', items: [
      { keys: ['↑', '↓'], desc: 'Move selection' },
      { keys: ['Enter'], desc: 'Run command' },
    ] },
    { group: 'Views', items: [
      { keys: ['Shift', 'F'], desc: 'Now Casting fullscreen' },
    ] },
  ];

  function render() {
    body.innerHTML = SHORTCUTS.map((g) => `
      <div class="sc-group">
        <div class="sc-group-label">${g.group}</div>
        ${g.items.map((r) => `
          <div class="sc-row">
            <span class="sc-keys">${r.keys.map((k, i) => `${i > 0 ? '<span class="sc-plus">+</span>' : ''}<kbd class="sc-key">${k}</kbd>`).join('')}</span>
            <span class="sc-desc">${r.desc}</span>
          </div>`).join('')}
      </div>`).join('');
  }

  window.openShortcuts = function () {
    render();
    overlay.classList.add('open');
    overlay.removeAttribute('aria-hidden');
  };
  function close() { overlay.classList.remove('open'); overlay.setAttribute('aria-hidden', 'true'); }

  closeBtn?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === '?' && e.shiftKey && !e.target.matches('input,textarea,select')) {
      e.preventDefault();
      overlay.classList.contains('open') ? close() : window.openShortcuts();
    }
    if (e.key === 'Escape' && overlay.classList.contains('open')) close();
  });
})();
