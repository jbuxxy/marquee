function escapeHtmlBookmark(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function bookmarkIconHtml(link) {
  if (!link.icon) return '';
  const style = link.color ? ` style="color:${escapeHtmlBookmark(link.color)}"` : '';
  return `<i class="mdi mdi-${escapeHtmlBookmark(link.icon)}"${style} aria-hidden="true"></i>`;
}

function buildBookmarksBar(config) {
  const bar = document.getElementById('bookmarks-bar');
  if (!bar) return;

  const bookmarks = (config.customLinks || []).filter((l) => l.placement === 'bookmark');
  if (bookmarks.length === 0) {
    bar.hidden = true;
    bar.innerHTML = '';
    return;
  }

  bar.hidden = false;
  bar.innerHTML = bookmarks
    .map(
      (link) => `
    <a class="bookmark-link" href="${escapeHtmlBookmark(link.url)}" target="_blank" rel="noopener" title="${escapeHtmlBookmark(link.label)}">
      ${bookmarkIconHtml(link)}
      <span>${escapeHtmlBookmark(link.label)}</span>
    </a>`
    )
    .join('');
}

document.addEventListener('marquee:config', (e) => buildBookmarksBar(e.detail));
