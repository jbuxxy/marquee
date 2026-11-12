// ════════════════════════════════════════════════════════════════════
// SHARED UTILITIES — loaded before every other script.
// ════════════════════════════════════════════════════════════════════

// HTML-escape any upstream/user-derived string before it goes into innerHTML. Escapes all
// five significant characters, so the result is safe in text and in single- or
// double-quoted attributes.
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Lazy CDN loading (map libraries) ─────────────────────────────────
// One promise per URL, so two features asking for the same library at once (live map +
// heatmap geo tab) share one <script> instead of loading Leaflet twice (a second copy
// replaces window.L and silently drops the L.heatLayer plugin). Every URL is
// version-pinned and SRI-checked, since these scripts run with full page access.
const _assetLoads = new Map();
function loadAssetOnce(url, integrity) {
  if (_assetLoads.has(url)) return _assetLoads.get(url);
  const p = new Promise((resolve, reject) => {
    const isCss = /\.css(\?|$)/.test(url);
    const el = document.createElement(isCss ? 'link' : 'script');
    if (isCss) { el.rel = 'stylesheet'; el.href = url; } else { el.src = url; }
    if (integrity) { el.integrity = integrity; el.crossOrigin = 'anonymous'; }
    el.onload = () => resolve();
    el.onerror = () => { _assetLoads.delete(url); reject(new Error('failed to load ' + url)); };
    document.head.appendChild(el);
  });
  _assetLoads.set(url, p);
  return p;
}

const _CDN = 'https://cdn.jsdelivr.net/npm/';
const MAP_LIBS = {
  leafletCss:  [_CDN + 'leaflet@1.9.4/dist/leaflet.css', 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H'],
  leafletJs:   [_CDN + 'leaflet@1.9.4/dist/leaflet.js', 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH'],
  maplibreCss: [_CDN + 'maplibre-gl@5.6.0/dist/maplibre-gl.css', 'sha384-Nq6PQ+9vJPvw7U/VfDELyrWoGQMsy0gi6QShhaSrGzkpF5KkM40csg2leky+YMTd'],
  maplibreJs:  [_CDN + 'maplibre-gl@5.6.0/dist/maplibre-gl.js', 'sha384-GfxBM9x46BaAFxtCq39Fxir8fNZ4VDnwgfi6Kzi5/F1tAFsm0amuuV8kd+Pxzuf/'],
  bridgeJs:    [_CDN + '@maplibre/maplibre-gl-leaflet@0.1.3/leaflet-maplibre-gl.js', 'sha384-LIxE/QjpJKC2A91yD40ZisdYtFbgAjl58jqpo9/MUZNgwhqsTfzwrTlqv6nDdzzB'],
  heatJs:      [_CDN + 'leaflet.heat@0.2.0/dist/leaflet-heat.js', 'sha384-mFKkGiGvT5vo1fEyGCD3hshDdKmW3wzXW/x+fWriYJArD0R3gawT6lMvLboM22c0'],
};

// Leaflet (markers, popups) + MapLibre GL (WebGL vector basemap), joined by the official
// maplibre-gl-leaflet bridge, which must load after both.
function ensureMapLibs() {
  return Promise.all([
    loadAssetOnce(...MAP_LIBS.leafletCss), loadAssetOnce(...MAP_LIBS.maplibreCss),
    loadAssetOnce(...MAP_LIBS.leafletJs), loadAssetOnce(...MAP_LIBS.maplibreJs),
  ]).then(() => loadAssetOnce(...MAP_LIBS.bridgeJs));
}

// Basemap: OpenFreeMap vector styles — free, keyless, and drawn by MapLibre on the GPU.
const BASEMAP_STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';
const BASEMAP_STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/positron';
const BASEMAP_ATTR = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OSM</a>';

function basemapStyleFor(isLight) { return isLight ? BASEMAP_STYLE_LIGHT : BASEMAP_STYLE_DARK; }

function createBasemapLayer(isLight) {
  const style = basemapStyleFor(isLight);
  const layer = L.maplibreGL({ style, attribution: BASEMAP_ATTR, interactive: false });
  layer._marqueeStyle = style;
  return layer;
}

// Swap the dark/light basemap in place (no-op if already on that style).
function setBasemapTheme(layer, isLight) {
  const style = basemapStyleFor(isLight);
  if (!layer || layer._marqueeStyle === style) return;
  layer._marqueeStyle = style;
  layer.getMaplibreMap?.()?.setStyle(style);
}

// ── Delegated UI actions (no inline on* handlers) ───────────────────
// The Content-Security-Policy forbids inline event handlers, so markup declares intent:
//   <button data-action="dismissNowPlaying">            calls window.dismissNowPlaying()
//   <button data-action="x" data-arg="42">              calls window.x("42")
//   <input data-action="selectSelf">                     built-in: selects its own text
//   <img data-img-fallback="hide">                       hides a broken image
// Only names in UI_ACTIONS can be invoked, so markup built from upstream data can never
// reach arbitrary globals.
const UI_ACTIONS = new Set([
  'openShortcuts', 'toggleNpExpand', 'dismissNowPlaying', 'reviveNowPlaying', 'closeStreamDetail',
]);
const UI_BUILTINS = {
  selectSelf: (el) => el.select?.(),
};

document.addEventListener('click', (e) => {
  const el = e.target.closest?.('[data-action]');
  if (!el) return;
  const name = el.dataset.action;
  if (UI_BUILTINS[name]) { UI_BUILTINS[name](el, e); return; }
  if (!UI_ACTIONS.has(name) || typeof window[name] !== 'function') return;
  if (el.dataset.stop !== undefined) e.stopPropagation();
  window[name](...(el.dataset.arg !== undefined ? [el.dataset.arg] : []));
});

// 'error' doesn't bubble, so listen in the capture phase.
document.addEventListener('error', (e) => {
  const el = e.target;
  if (!(el instanceof HTMLImageElement) || !el.dataset.imgFallback) return;
  if (el.dataset.imgFallback === 'hide') el.style.display = 'none';
}, true);
