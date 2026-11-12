// Fetches /api/config/public once and applies branding at runtime — nothing
// about site name/logo/favicon is baked into index.html, so changing them
// in the admin UI never requires editing or rebuilding any file.
async function loadPublicConfig() {
  const res = await fetch('/api/config/public');
  const config = await res.json();

  document.title = config.siteName || 'Marquee';
  const titleEl = document.getElementById('site-title');
  if (titleEl) titleEl.textContent = config.siteName || 'Marquee';

  const logoEl = document.getElementById('site-logo');
  // The light/dark variant for the current theme (theme.js swaps it on theme changes).
  const variant = typeof isLightFamilyTheme === 'function' && isLightFamilyTheme(document.documentElement.getAttribute('data-theme'))
    ? 'logo-light' : 'logo-dark';
  if (logoEl) logoEl.src = `/branding/${variant}?v=${Date.now()}`;

  const taglineEl = document.getElementById('header-tagline');
  if (taglineEl && config.tagline) taglineEl.textContent = config.tagline;

  const faviconEl = document.getElementById('favicon-link');
  if (faviconEl) faviconEl.href = `/branding/favicon?v=${Date.now()}`;

  document.dispatchEvent(new CustomEvent('marquee:config', { detail: config }));
  return config;
}

document.addEventListener('DOMContentLoaded', () => {
  loadPublicConfig();
});
