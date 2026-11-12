// THEME PICKER — dark/light always available; 13 more themes are offered
// only when site.enableExtraThemes is on — off shows just dark/light
// in the picker, regardless of how many themes this file knows about.
const THEME_LIST = [
  { id: 'dark', label: 'Dark (Default)', bg: '#08080d', accent: 'rgb(41,171,226)' },
  { id: 'light', label: 'Light', bg: '#f0f0f8', accent: 'rgb(41,171,226)' },
  { id: 'cyberpunk', label: 'Cyberpunk', bg: '#0a0014', accent: 'rgb(255,0,170)' },
  { id: 'synthwave', label: 'Synthwave', bg: '#1a1025', accent: 'rgb(255,110,199)' },
  { id: 'nord', label: 'Nord', bg: '#2e3440', accent: 'rgb(136,192,208)' },
  { id: 'dracula', label: 'Dracula', bg: '#282a36', accent: 'rgb(80,250,123)' },
  { id: 'solarized', label: 'Solarized Light', bg: '#fdf6e3', accent: 'rgb(42,161,152)' },
  { id: 'matrix', label: 'Matrix', bg: '#030a05', accent: 'rgb(0,255,65)' },
  { id: 'abyss', label: 'Deep Ocean', bg: '#04141c', accent: 'rgb(45,235,196)' },
  { id: 'galaxy', label: 'Galaxy', bg: '#06040d', accent: 'rgb(175,90,255)' },
  { id: 'frost', label: 'Frost', bg: '#e6f2fa', accent: 'rgb(74,190,240)' },
  { id: 'volcanic', label: 'Volcanic', bg: '#100604', accent: 'rgb(255,86,34)' },
  { id: 'royal', label: 'Royal Gold', bg: '#150a28', accent: 'rgb(224,180,70)' },
  { id: 'retrocrt', label: 'Retro CRT', bg: '#f8ecf2', accent: 'rgb(0,194,168)' },
  { id: 'autumn', label: 'Autumn', bg: '#1c0f08', accent: 'rgb(224,122,42)' },
];
const THEME_META_COLOR = {
  dark: '#08080d', light: '#f0f0f8', cyberpunk: '#0a0014', synthwave: '#1a1025',
  nord: '#2e3440', dracula: '#282a36', solarized: '#fdf6e3', matrix: '#030a05',
  abyss: '#04141c', galaxy: '#06040d', frost: '#e6f2fa', volcanic: '#100604',
  royal: '#150a28', retrocrt: '#f8ecf2', autumn: '#1c0f08',
};

const LIGHT_FAMILY_THEMES = new Set(['light', 'solarized', 'frost', 'retrocrt']);
function isLightFamilyTheme(theme) {
  return LIGHT_FAMILY_THEMES.has(theme ?? currentTheme());
}

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

let extraThemesEnabled = true;
let themePanel = null;

function availableThemes() {
  return extraThemesEnabled ? THEME_LIST : THEME_LIST.filter((t) => t.id === 'dark' || t.id === 'light');
}

function updateThemeChrome(theme) {
  const metaColor = document.querySelector('meta[name="theme-color"]');
  if (metaColor) metaColor.setAttribute('content', THEME_META_COLOR[theme] || THEME_META_COLOR.dark);
  const logo = document.getElementById('site-logo');
  if (logo) {
    const variant = isLightFamilyTheme(theme) ? 'logo-light' : 'logo-dark';
    logo.src = `/branding/${variant}?v=${Date.now()}`;
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('marquee-theme', theme);
  } catch {
    // localStorage unavailable (private browsing, etc) — theme just won't persist
  }
  updateThemeChrome(theme);
  window.MarqueeParticles?.setTheme?.(theme);
  window.MarqueeWaveform?.setTheme?.(theme);
  syncThemePanel();
}

function buildThemePanel() {
  if (themePanel) themePanel.remove();
  themePanel = document.createElement('div');
  themePanel.className = 'theme-panel';
  availableThemes().forEach((t) => {
    const opt = document.createElement('div');
    opt.className = 'theme-opt';
    opt.dataset.tid = t.id;
    opt.innerHTML = `<span class="theme-swatch" style="background:linear-gradient(135deg, ${t.bg} 50%, ${t.accent} 50%)"></span><span>${t.label}</span>`;
    opt.addEventListener('click', (e) => { e.stopPropagation(); applyTheme(t.id); themePanel.classList.remove('open'); });
    themePanel.appendChild(opt);
  });
  document.body.appendChild(themePanel);
  syncThemePanel();
}

function syncThemePanel() {
  if (!themePanel) return;
  const cur = currentTheme();
  themePanel.querySelectorAll('.theme-opt').forEach((o) => o.classList.toggle('sel', o.dataset.tid === cur));
}

document.addEventListener('marquee:config', (e) => {
  extraThemesEnabled = e.detail.enableExtraThemes !== false;
  // If the current theme is no longer offered (extra themes just got turned
  // off), fall back to dark/light by family rather than an orphaned choice.
  if (!extraThemesEnabled && !['dark', 'light'].includes(currentTheme())) {
    applyTheme(isLightFamilyTheme(currentTheme()) ? 'light' : 'dark');
  }
  buildThemePanel();
  updateThemeChrome(currentTheme());
});

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  // Admin/setup pages don't load config.js, so 'marquee:config' never fires there —
  // build with the full list immediately; the dashboard's listener above rebuilds it
  // with the gated list once config actually arrives.
  if (!themePanel) buildThemePanel();
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!themePanel) return;
    const opening = !themePanel.classList.contains('open');
    if (opening) {
      syncThemePanel();
      const r = btn.getBoundingClientRect();
      themePanel.style.top = r.bottom + 6 + 'px';
      themePanel.style.right = window.innerWidth - r.right + 'px';
    }
    themePanel.classList.toggle('open');
  });
  document.addEventListener('click', () => themePanel?.classList.remove('open'));
});
