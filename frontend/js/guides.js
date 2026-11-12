// Resource dock — admin-uploaded PDF guides plus an optional static
// "need access?" contact card. Entirely absent unless at least one guide is
// configured or a contact message is set.
function escapeHtmlGuide(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function guidePillHtml(guide) {
  return `
    <a class="resource-pill" href="${escapeHtmlGuide(guide.fileUrl)}" target="_blank" rel="noopener">
      <i class="ti ti-file-text resource-pill-icon" aria-hidden="true"></i>
      <div class="resource-pill-body">
        <span class="resource-pill-label">${escapeHtmlGuide(guide.label)}</span>
        ${guide.sublabel ? `<span class="resource-pill-sub">${escapeHtmlGuide(guide.sublabel)}</span>` : ''}
      </div>
      <span class="resource-pill-action"><i class="ti ti-external-link"></i> Open</span>
    </a>`;
}

function needAccessPillHtml(message) {
  return `
    <div class="resource-pill pill-static">
      <i class="ti ti-lock resource-pill-icon" aria-hidden="true"></i>
      <div class="resource-pill-body">
        <span class="resource-pill-label">Need Access?</span>
        <span class="resource-pill-sub">${escapeHtmlGuide(message)}</span>
      </div>
    </div>`;
}

function buildResourceDock(config) {
  const wrap = document.getElementById('guides-wrap');
  const dock = document.getElementById('resource-dock');
  if (!wrap || !dock) return;

  const guides = config.guides || [];
  const needAccessMessage = config.needAccessMessage || '';

  if (guides.length === 0 && !needAccessMessage) {
    wrap.hidden = true;
    dock.innerHTML = '';
    return;
  }

  wrap.hidden = false;
  dock.innerHTML = guides.map(guidePillHtml).join('') + (needAccessMessage ? needAccessPillHtml(needAccessMessage) : '');
}

document.addEventListener('marquee:config', (e) => buildResourceDock(e.detail));
