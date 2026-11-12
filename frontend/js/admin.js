const SERVICE_FORM_META = [
  {
    key: 'seerr', label: 'Seerr', badge: 'required',
    fields: [
      { name: 'url', label: 'URL', type: 'text' },
      { name: 'apiKey', label: 'API key', type: 'password' },
      { name: 'publicUrl', label: 'Public URL (optional, for the "Open" link)', type: 'text' },
    ],
  },
  {
    key: 'plex', label: 'Plex', badge: 'one of Plex/Jellyfin required',
    fields: [
      { name: 'url', label: 'URL', type: 'text' },
      { name: 'token', label: 'Token', type: 'password' },
      { name: 'publicUrl', label: 'Public URL (optional)', type: 'text' },
    ],
    // Tautulli tracks Plex specifically, so its fields render nested inside
    // this fieldset (a sub-section) instead of as a separate top-level one.
    companion: {
      key: 'tautulli', label: 'Tautulli (optional — activity stats & heatmap)',
      fields: [
        { name: 'url', label: 'URL', type: 'text' },
        { name: 'apiKey', label: 'API key', type: 'password' },
      ],
    },
  },
  {
    key: 'jellyfin', label: 'Jellyfin', badge: 'one of Plex/Jellyfin required',
    fields: [
      { name: 'url', label: 'URL', type: 'text' },
      { name: 'apiKey', label: 'API key', type: 'password' },
      { name: 'publicUrl', label: 'Public URL (optional)', type: 'text' },
    ],
    // Jellystat is Tautulli's Jellyfin-side counterpart — same nesting.
    companion: {
      key: 'jellystat', label: 'Jellystat (optional — activity stats & heatmap)',
      fields: [
        { name: 'url', label: 'URL', type: 'text' },
        { name: 'apiKey', label: 'API key', type: 'password' },
      ],
    },
  },
  {
    key: 'abs', label: 'AudioBookShelf', badge: 'optional',
    fields: [
      { name: 'url', label: 'URL', type: 'text' },
      { name: 'apiKey', label: 'API key', type: 'password' },
      { name: 'publicUrl', label: 'Public URL (optional)', type: 'text' },
    ],
  },
  {
    key: 'rmab', label: 'ReadMeABook', badge: 'optional — powers audiobook recommendations alongside AudioBookShelf',
    fields: [
      { name: 'url', label: 'URL', type: 'text' },
      { name: 'apiToken', label: 'API token', type: 'password' },
    ],
  },
  {
    key: 'tmdb', label: 'TMDB', badge: 'optional',
    fields: [{ name: 'readToken', label: 'Read access token', type: 'password' }],
  },
  {
    key: 'trakt', label: 'Trakt', badge: 'optional — enriches digital release dates',
    fields: [{ name: 'clientId', label: 'Client ID', type: 'password' }],
  },
];

const TESTABLE_SERVICES = new Set(['seerr', 'plex', 'jellyfin', 'abs', 'rmab']);

// escapeHtml() comes from js/util.js.

// ── Tabs ──────────────────────────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll('.admin-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.admin-tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.querySelector(`.admin-tab-panel[data-panel="${btn.dataset.tab}"]`).classList.add('active');
    });
  });
}

// ── Services form (schema-driven, unchanged pattern) ───────────────────────

function fieldHtml(path, label, type, resolved) {
  const isSecret = resolved && typeof resolved === 'object' && 'configured' in resolved;
  const locked = resolved?.source === 'env';
  const displayValue = isSecret ? '' : (resolved?.value ?? '');
  const placeholder = isSecret ? (resolved.configured ? '•••• configured (leave blank to keep)' : 'not set') : '';
  const badge = locked
    ? '<span class="badge env">managed by environment</span>'
    : isSecret
      ? `<span class="badge ${resolved.configured ? 'configured' : 'unconfigured'}">${resolved.configured ? 'configured' : 'not set'}</span>`
      : '';
  return `<label>${escapeHtml(label)} ${badge}
    <input type="${type}" name="${path}" value="${escapeHtml(displayValue)}" placeholder="${escapeHtml(placeholder)}" ${locked ? 'disabled' : ''}>
  </label>`;
}

function renderSettingsForm(settingsTree) {
  const form = document.getElementById('settings-form');
  form.innerHTML = '';

  const siteFs = document.createElement('fieldset');
  siteFs.innerHTML = `<legend>Site</legend>${fieldHtml('site.siteName', 'Site name', 'text', settingsTree.site.siteName)}`;
  form.appendChild(siteFs);

  for (const meta of SERVICE_FORM_META) {
    const svc = settingsTree.services[meta.key] || {};
    const fs = document.createElement('fieldset');
    let html = `<legend>${escapeHtml(meta.label)} <span class="badge unconfigured">${escapeHtml(meta.badge)}</span></legend>`;
    for (const f of meta.fields) html += fieldHtml(`services.${meta.key}.${f.name}`, f.label, f.type, svc[f.name]);
    if (TESTABLE_SERVICES.has(meta.key)) {
      html += `<div class="field-row"><button type="button" class="secondary test-btn" data-test="${meta.key}">Test connection</button><span class="test-result" id="test-result-${meta.key}"></span></div>`;
    }
    // Real-time now-playing push: the admin pastes this URL into Plex's own
    // Settings > Webhooks page. The secret is auto-generated server-side
    // (server/lib/push.js) — nothing to type here, just to copy.
    if (meta.key === 'plex' && settingsTree.push?.plexWebhookSecret?.value) {
      const webhookUrl = `${window.location.origin}/api/webhooks/plex/${settingsTree.push.plexWebhookSecret.value}`;
      html += `<label>Webhook URL (paste into Plex &rarr; Settings &rarr; Webhooks, for instant now-playing updates)
        <input type="text" value="${escapeHtml(webhookUrl)}" readonly data-action="selectSelf">
      </label>`;
    }
    // Same idea for Seerr: Settings > Notifications > Webhook. Powers
    // instant request-list updates instead of waiting on the 60s poll.
    if (meta.key === 'seerr' && settingsTree.push?.seerrWebhookSecret?.value) {
      const webhookUrl = `${window.location.origin}/api/webhooks/seerr/${settingsTree.push.seerrWebhookSecret.value}`;
      html += `<label>Webhook URL (paste into Seerr &rarr; Settings &rarr; Notifications &rarr; Webhook, for instant request updates)
        <input type="text" value="${escapeHtml(webhookUrl)}" readonly data-action="selectSelf">
      </label>`;
    }
    if (meta.companion) {
      const csvc = settingsTree.services[meta.companion.key] || {};
      html += `<div class="companion-service"><div class="companion-service-label">${escapeHtml(meta.companion.label)}</div>`;
      for (const f of meta.companion.fields) html += fieldHtml(`services.${meta.companion.key}.${f.name}`, f.label, f.type, csvc[f.name]);
      html += `</div>`;
    }
    fs.innerHTML = html;
    form.appendChild(fs);
  }

  // Not a service card (no test button, no routes of its own) — purely a
  // write-through backup for visitor sessions (server/auth/visitorSession.js),
  // so it stays optional and out of SERVICE_FORM_META.
  const redis = settingsTree.services.redis || {};
  const redisFs = document.createElement('fieldset');
  redisFs.innerHTML = `<legend>Advanced</legend>
    ${fieldHtml('services.redis.url', 'Redis URL (optional — keeps visitor logins across restarts)', 'text', redis.url)}
    ${fieldHtml('services.redis.password', 'Redis password', 'password', redis.password)}`;
  form.appendChild(redisFs);
}

function formToNestedSettings(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled || el.value === '') continue;
    const parts = el.name.split('.');
    let cur = out;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = cur[parts[i]] || {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = el.value;
  }
  return out;
}

// ── Branding (logo/favicon + optional light/dark variants) ────────────────

function brandingRow(asset, label, accept, heightPx) {
  const stamp = Date.now();
  return `
    <div class="branding-row">
      <img src="/branding/${asset}?v=${stamp}" alt="${escapeHtml(label)}" style="height:${heightPx}px;">
      <span>${escapeHtml(label)}</span>
      <div class="branding-actions">
        <label class="secondary" style="cursor:pointer;">
          <input type="file" accept="${accept}" data-upload="${asset}" hidden>
          <span>Upload…</span>
        </label>
        <button class="secondary" data-reset="${asset}" type="button">Reset to default</button>
      </div>
    </div>`;
}

function renderBranding(settingsTree) {
  const el = document.getElementById('branding-section');
  const tagline = settingsTree?.site?.tagline?.value || '';
  el.innerHTML =
    `<form id="tagline-form" class="field-row" style="align-items:flex-end;">
      <label style="flex:1;">Tagline (shown under the logo)
        <input type="text" id="tagline-input" placeholder="Your self-hosted media hub" value="${escapeHtml(tagline)}">
      </label>
      <button type="submit">Save</button>
    </form>
    <p id="tagline-status" class="status-text"></p>` +
    brandingRow('logo', 'Logo', 'image/png,image/jpeg,image/svg+xml', 40) +
    `<p class="status-text">Light/dark variants are optional — leave either unset and it falls back to the logo above (or the default, if that's unset too).</p>` +
    brandingRow('logo-light', 'Logo (light theme variant)', 'image/png,image/jpeg,image/svg+xml', 40) +
    brandingRow('logo-dark', 'Logo (dark theme variant)', 'image/png,image/jpeg,image/svg+xml', 40) +
    brandingRow('favicon', 'Favicon', 'image/x-icon,image/png', 24);

  document.getElementById('tagline-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('tagline-status');
    try {
      await apiPost('/admin/api/settings', { site: { tagline: document.getElementById('tagline-input').value.trim() } });
      statusEl.textContent = 'Saved.';
    } catch (err) {
      statusEl.textContent = err.message;
    }
  });

  el.querySelectorAll('input[type="file"]').forEach((input) => {
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const dataUri = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      try {
        await apiPost(`/admin/api/branding/${input.dataset.upload}`, { data: dataUri });
        renderBranding();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  el.querySelectorAll('[data-reset]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await apiDelete(`/admin/api/branding/${btn.dataset.reset}`);
        renderBranding();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

// ── Media server (preferred Plex/Jellyfin tie-break) ───────────────────────

function renderMediaServer(settingsTree, publicConfig) {
  const el = document.getElementById('media-server-section');
  const plexOn = !!publicConfig?.services?.plex?.enabled;
  const jellyfinOn = !!publicConfig?.services?.jellyfin?.enabled;

  if (!plexOn || !jellyfinOn) {
    el.innerHTML = `<p class="status-text">Only meaningful once both Plex and Jellyfin are configured (Services tab) — with just one, it's used automatically for everything that needs a single media server.</p>`;
    return;
  }

  const current = settingsTree.site.preferredMediaServer?.value || 'plex';
  el.innerHTML = `
    <p class="status-text">Both Plex and Jellyfin are configured. Pick which one wins for features that need a single answer (matching an "available" request to a real item, Recently Added dedup).</p>
    <form id="media-server-form">
      <label>Preferred server
        <select name="site.preferredMediaServer">
          <option value="plex" ${current === 'plex' ? 'selected' : ''}>Plex</option>
          <option value="jellyfin" ${current === 'jellyfin' ? 'selected' : ''}>Jellyfin</option>
        </select>
      </label>
      <button type="submit">Save</button>
      <p id="media-server-status" class="status-text"></p>
    </form>`;

  document.getElementById('media-server-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = new FormData(e.target).get('site.preferredMediaServer');
    const statusEl = document.getElementById('media-server-status');
    try {
      await apiPost('/admin/api/settings', { site: { preferredMediaServer: value } });
      statusEl.textContent = 'Saved.';
    } catch (err) {
      statusEl.textContent = err.message;
    }
  });
}

// ── Display (anonymize usernames, seasonal effects, extra themes) ─────────

function renderDisplaySettings(settingsTree) {
  const el = document.getElementById('display-section');
  const site = settingsTree.site;
  const anon = site.anonymizeUsers?.value || 'optional';
  const seasonalOn = site.enableSeasonalEffects?.value !== 'false';
  const extraThemesOn = site.enableExtraThemes?.value !== 'false';

  el.innerHTML = `
    <form id="display-form">
      <label>Anonymize usernames (now-playing, stats, casting)
        <select name="anonymizeUsers">
          <option value="optional" ${anon === 'optional' ? 'selected' : ''}>Optional — masked by default, each visitor's browser can turn it off</option>
          <option value="always" ${anon === 'always' ? 'selected' : ''}>Always — force masked, no visitor toggle</option>
          <option value="never" ${anon === 'never' ? 'selected' : ''}>Never — force real usernames, no visitor toggle</option>
        </select>
      </label>
      <label class="field-row"><input type="checkbox" name="enableSeasonalEffects" ${seasonalOn ? 'checked' : ''} style="width:auto;"> Enable seasonal effects (holiday flair)</label>
      <label class="field-row"><input type="checkbox" name="enableExtraThemes" ${extraThemesOn ? 'checked' : ''} style="width:auto;"> Enable extra themes beyond dark/light</label>
      <button type="submit">Save</button>
      <p id="display-status" class="status-text"></p>
    </form>`;

  document.getElementById('display-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('display-status');
    try {
      await apiPost('/admin/api/settings', {
        site: {
          anonymizeUsers: e.target.elements.anonymizeUsers.value,
          enableSeasonalEffects: e.target.elements.enableSeasonalEffects.checked ? 'true' : 'false',
          enableExtraThemes: e.target.elements.enableExtraThemes.checked ? 'true' : 'false',
        },
      });
      statusEl.textContent = 'Saved.';
    } catch (err) {
      statusEl.textContent = err.message;
    }
  });
}

// ── Map & privacy (opt-in geo map, optional home location) ────────────────

function renderMapPrivacy(settingsTree) {
  const el = document.getElementById('map-privacy-section');
  const site = settingsTree.site;
  const geoOn = site.enableGeoMap?.value === 'true' || site.enableGeoMap?.value === true;
  const lat = site.homeLocation?.lat?.value ?? '';
  const lon = site.homeLocation?.lon?.value ?? '';
  const city = site.homeLocation?.city?.value ?? '';

  el.innerHTML = `
    <p class="status-text">Off by default — enabling this looks up approximate viewer locations with a third-party geo-IP service (ipwho.is, falling back to GeoJS) to plot them on a live map. Only the network part of each address is sent (IPv4 /24, IPv6 /48), never a full IP, and results are cached for a day.</p>
    <form id="map-privacy-form">
      <label class="field-row"><input type="checkbox" name="enableGeoMap" ${geoOn ? 'checked' : ''} style="width:auto;"> Enable live map</label>
      <p class="status-text">Home location is entirely optional — leave blank and the map just plots client/viewer nodes with no home marker.</p>
      <label>Home latitude <input type="text" name="lat" value="${escapeHtml(lat)}" placeholder="e.g. 39.74"></label>
      <label>Home longitude <input type="text" name="lon" value="${escapeHtml(lon)}" placeholder="e.g. -104.99"></label>
      <label>Home city (label only, optional) <input type="text" name="city" value="${escapeHtml(city)}" placeholder="e.g. Denver"></label>
      <button type="submit">Save</button>
      <p id="map-privacy-status" class="status-text"></p>
    </form>`;

  document.getElementById('map-privacy-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const statusEl = document.getElementById('map-privacy-status');
    try {
      await apiPost('/admin/api/settings', {
        site: {
          enableGeoMap: e.target.elements.enableGeoMap.checked ? 'true' : 'false',
          homeLocation: { lat: form.get('lat') || '', lon: form.get('lon') || '', city: form.get('city') || '' },
        },
      });
      statusEl.textContent = 'Saved.';
    } catch (err) {
      statusEl.textContent = err.message;
    }
  });
}

// ── Digital release dates (opt-in BingeBase + optional Trakt) ─────────────

function renderDigitalDates(settingsTree) {
  const el = document.getElementById('digital-dates-section');
  const on = settingsTree.site.digitalReleaseDates?.value === 'true' || settingsTree.site.digitalReleaseDates?.value === true;

  el.innerHTML = `
    <p class="status-text">Off by default. Adds a "Coming Soon" strip of upcoming digital releases for your Seerr requests, sourced from BingeBase (no credentials needed) and optionally cross-checked against Trakt (Services tab) for more accurate dates.</p>
    <form id="digital-dates-form">
      <label class="field-row"><input type="checkbox" name="digitalReleaseDates" ${on ? 'checked' : ''} style="width:auto;"> Enable digital release dates</label>
      <button type="submit">Save</button>
      <p id="digital-dates-status" class="status-text"></p>
    </form>`;

  document.getElementById('digital-dates-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('digital-dates-status');
    try {
      await apiPost('/admin/api/settings', {
        site: { digitalReleaseDates: e.target.elements.digitalReleaseDates.checked ? 'true' : 'false' },
      });
      statusEl.textContent = 'Saved.';
    } catch (err) {
      statusEl.textContent = err.message;
    }
  });
}

// ── Extra links (custom cards / bookmarks) ─────────────────────────────────

// A curated subset of MDI (Material Design Icons) glyphs relevant to
// self-hosted apps — the picker is a shortcut, not the only way in; the text
// input next to it accepts any valid MDI icon name typed manually.
const ICON_CHOICES = [
  'movie', 'television-classic', 'music', 'book-open-page-variant', 'silverware-fork-knife', 'chef-hat',
  'calendar-month', 'cloud', 'database', 'folder', 'home', 'server', 'monitor-dashboard', 'shield-lock',
  'chart-line', 'email', 'message-text', 'camera', 'gamepad-variant', 'weather-partly-cloudy', 'file-document',
  'printer', 'wrench', 'cog', 'note-text', 'image', 'video', 'headphones', 'microphone-variant', 'radio',
  'podcast', 'robot', 'code-tags', 'console', 'package-variant-closed', 'truck-delivery', 'cart',
  'bookshelf', 'timer-outline', 'alarm', 'network-outline', 'download', 'star', 'heart', 'palette',
];

function iconPickerPopoverHtml() {
  return `<div class="icon-picker-popover">${ICON_CHOICES.map((i) => `<button type="button" class="icon-pick-btn" data-icon="${i}" title="${i}"><i class="mdi mdi-${i}"></i></button>`).join('')}</div>`;
}

function customLinkRowHtml(link) {
  const l = link || { id: '', label: '', url: '', icon: '', color: '', placement: 'card' };
  const color = l.color || '#29abe2';
  return `
    <div class="custom-link-row" data-id="${escapeHtml(l.id)}">
      <input type="text" data-field="label" value="${escapeHtml(l.label)}" placeholder="Label">
      <input type="text" data-field="url" value="${escapeHtml(l.url)}" placeholder="https://...">
      <div class="icon-field-wrap">
        <i class="mdi mdi-${escapeHtml(l.icon || 'help-circle-outline')} icon-field-preview" style="color:${escapeHtml(color)}"></i>
        <input type="text" data-field="icon" value="${escapeHtml(l.icon)}" placeholder="mdi icon name" class="icon-field-input">
        <button type="button" class="secondary icon-pick-toggle">Browse</button>
        ${iconPickerPopoverHtml()}
      </div>
      <div class="color-field-wrap">
        <input type="color" data-field="colorPicker" value="${escapeHtml(color)}">
        <input type="text" data-field="color" value="${escapeHtml(l.color)}" placeholder="#29abe2" class="color-field-input">
      </div>
      <select data-field="placement">
        <option value="card" ${l.placement === 'card' ? 'selected' : ''}>Card</option>
        <option value="bookmark" ${l.placement === 'bookmark' ? 'selected' : ''}>Bookmark</option>
      </select>
      <span class="status-text card-icon-hint" ${l.placement === 'bookmark' ? 'hidden' : ''}>Icon + color required for cards</span>
      <button type="button" class="secondary remove-link-btn">Remove</button>
    </div>`;
}

function wireCustomLinkRow(row) {
  const iconInput = row.querySelector('[data-field="icon"]');
  const iconPreview = row.querySelector('.icon-field-preview');
  const colorInput = row.querySelector('[data-field="color"]');
  const colorPicker = row.querySelector('[data-field="colorPicker"]');
  const placementSelect = row.querySelector('[data-field="placement"]');
  const hint = row.querySelector('.card-icon-hint');
  const popover = row.querySelector('.icon-picker-popover');

  function updatePreview() {
    iconPreview.className = `mdi mdi-${(iconInput.value || 'help-circle-outline').trim()} icon-field-preview`;
    iconPreview.style.color = colorInput.value || '#29abe2';
  }

  iconInput.addEventListener('input', updatePreview);
  colorInput.addEventListener('input', () => { colorPicker.value = /^#[0-9a-f]{6}$/i.test(colorInput.value) ? colorInput.value : colorPicker.value; updatePreview(); });
  colorPicker.addEventListener('input', () => { colorInput.value = colorPicker.value; updatePreview(); });
  placementSelect.addEventListener('change', () => { hint.hidden = placementSelect.value !== 'card'; });

  row.querySelector('.icon-pick-toggle').addEventListener('click', () => popover.classList.toggle('open'));
  popover.addEventListener('click', (e) => {
    const btn = e.target.closest('.icon-pick-btn');
    if (!btn) return;
    iconInput.value = btn.dataset.icon;
    updatePreview();
    popover.classList.remove('open');
  });
}

function readCustomLinkRows() {
  return [...document.querySelectorAll('.custom-link-row')]
    .map((row) => ({
      id: row.dataset.id || undefined,
      label: row.querySelector('[data-field="label"]').value.trim(),
      url: row.querySelector('[data-field="url"]').value.trim(),
      icon: row.querySelector('[data-field="icon"]').value.trim(),
      color: row.querySelector('[data-field="color"]').value.trim(),
      placement: row.querySelector('[data-field="placement"]').value,
    }))
    .filter((l) => l.label && l.url);
}

async function renderCustomLinks() {
  const el = document.getElementById('custom-links-section');
  const data = await apiGet('/admin/api/custom-links');
  el.innerHTML = `
    <div id="custom-links-rows">${data.links.map(customLinkRowHtml).join('')}</div>
    <button type="button" class="secondary add-custom-link-btn">+ Add link</button>
    <div class="field-row" style="margin-top:12px;">
      <button type="button" id="save-custom-links-btn">Save extra links</button>
      <span id="custom-links-status" class="status-text"></span>
    </div>`;

  const rowsEl = document.getElementById('custom-links-rows');
  rowsEl.querySelectorAll('.custom-link-row').forEach(wireCustomLinkRow);

  el.querySelector('.add-custom-link-btn').addEventListener('click', () => {
    rowsEl.insertAdjacentHTML('beforeend', customLinkRowHtml(null));
    wireCustomLinkRow(rowsEl.lastElementChild);
  });

  rowsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.remove-link-btn');
    if (btn) btn.closest('.custom-link-row').remove();
  });

  document.getElementById('save-custom-links-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('custom-links-status');
    const rows = [...rowsEl.querySelectorAll('.custom-link-row')];
    const invalidCard = rows.some((row) => {
      const placement = row.querySelector('[data-field="placement"]').value;
      const label = row.querySelector('[data-field="label"]').value.trim();
      if (placement !== 'card' || !label) return false;
      return !row.querySelector('[data-field="icon"]').value.trim() || !row.querySelector('[data-field="color"]').value.trim();
    });
    if (invalidCard) {
      statusEl.textContent = 'Card links need both an icon and a color.';
      return;
    }
    try {
      const result = await apiPost('/admin/api/custom-links', { links: readCustomLinkRows() });
      statusEl.textContent = 'Saved.';
      el.querySelector('#custom-links-rows').innerHTML = result.links.map(customLinkRowHtml).join('');
      el.querySelectorAll('.custom-link-row').forEach(wireCustomLinkRow);
    } catch (err) {
      statusEl.textContent = err.message;
    }
  });
}

// ── Library exclusions (hide a Plex/Jellyfin library everywhere but search)

let libraryExclusionsFolders = []; // Jellyfin /Library/VirtualFolders response, kept for save-time lookup

async function renderLibraryExclusions(publicConfig) {
  const el = document.getElementById('library-exclusions-section');
  if (!el) return;
  const plexOn = !!publicConfig?.services?.plex?.enabled;
  const jellyfinOn = !!publicConfig?.services?.jellyfin?.enabled;
  if (!plexOn && !jellyfinOn) {
    el.innerHTML = `<p class="status-text">Configure Plex or Jellyfin (Services tab) to exclude a library.</p>`;
    return;
  }

  const [current, plexSections, jellyfinFolders] = await Promise.all([
    apiGet('/admin/api/library-exclusions').catch(() => ({ excluded: [] })),
    plexOn ? apiGet('/api/plex/sections').then((d) => d?.MediaContainer?.Directory ?? []).catch(() => []) : Promise.resolve([]),
    jellyfinOn ? apiGet('/api/jellyfin/library-folders').then((d) => (Array.isArray(d) ? d : [])).catch(() => []) : Promise.resolve([]),
  ]);
  libraryExclusionsFolders = jellyfinFolders;

  const excludedPlexKeys = new Set(current.excluded.filter((e) => e.service === 'plex').map((e) => String(e.id)));
  const excludedJellyfinPaths = new Set(current.excluded.filter((e) => e.service === 'jellyfin').map((e) => e.id));

  const plexRows = plexSections.map((s) => `
    <label class="exclusion-row">
      <input type="checkbox" data-service="plex" value="${escapeHtml(s.key)}" ${excludedPlexKeys.has(String(s.key)) ? 'checked' : ''}>
      ${escapeHtml(s.title)} <span class="status-text">(Plex)</span>
    </label>`).join('');

  const jellyfinRows = jellyfinFolders.map((f, i) => {
    const anyExcluded = (f.Locations || []).some((loc) => excludedJellyfinPaths.has(loc));
    return `
    <label class="exclusion-row">
      <input type="checkbox" data-service="jellyfin" data-folder-index="${i}" ${anyExcluded ? 'checked' : ''}>
      ${escapeHtml(f.Name)} <span class="status-text">(Jellyfin)</span>
    </label>`;
  }).join('');

  if (!plexRows && !jellyfinRows) {
    el.innerHTML = `<p class="status-text">No libraries found.</p>`;
    return;
  }

  el.innerHTML = `
    <p class="status-text">Hide a library from Recently Added, recommendations, and live now-playing everywhere on the dashboard. It still shows up if someone searches for it directly.</p>
    ${plexRows}${jellyfinRows}
    <div class="field-row" style="margin-top:12px;">
      <button type="button" id="save-library-exclusions-btn">Save</button>
      <span id="library-exclusions-status" class="status-text"></span>
    </div>`;

  document.getElementById('save-library-exclusions-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('library-exclusions-status');
    const entries = [];
    el.querySelectorAll('input[type="checkbox"]:checked').forEach((cb) => {
      if (cb.dataset.service === 'plex') {
        const section = plexSections.find((s) => String(s.key) === cb.value);
        entries.push({ service: 'plex', id: cb.value, name: section?.title || '' });
      } else if (cb.dataset.service === 'jellyfin') {
        const folder = libraryExclusionsFolders[Number(cb.dataset.folderIndex)];
        for (const loc of folder?.Locations || []) entries.push({ service: 'jellyfin', id: loc, name: folder.Name });
      }
    });
    try {
      await apiPost('/admin/api/library-exclusions', { excluded: entries });
      statusEl.textContent = 'Saved.';
    } catch (err) {
      statusEl.textContent = err.message;
    }
  });
}

// ── Guides (PDF uploads + optional "need access" contact card) ────────────

function guideRowHtml(guide) {
  return `
    <div class="guide-row" data-id="${escapeHtml(guide.id)}">
      <input type="text" data-field="label" value="${escapeHtml(guide.label)}" placeholder="Label (e.g. Stream Guide)">
      <input type="text" data-field="sublabel" value="${escapeHtml(guide.sublabel || '')}" placeholder="Sub-label (optional)">
      <label class="secondary guide-upload-label" style="cursor:pointer;">
        <input type="file" accept="application/pdf" data-upload hidden>
        <span>${guide.fileName ? 'Replace PDF…' : 'Upload PDF…'}</span>
      </label>
      <button type="button" class="secondary remove-guide-btn">Remove</button>
    </div>`;
}

async function renderGuides() {
  const el = document.getElementById('guides-section');
  const data = await apiGet('/admin/api/guides');
  const settings = await apiGet('/admin/api/settings');
  const needAccess = settings.settings.site.needAccessMessage?.value || '';

  el.innerHTML = `
    <div id="guides-rows">${data.guides.map(guideRowHtml).join('')}</div>
    <button type="button" class="secondary add-guide-btn">+ Add guide</button>
    <p id="guides-status" class="status-text"></p>
    <label style="margin-top:16px;">"Need access?" contact message (optional — leave blank to hide the card)
      <input type="text" id="need-access-input" value="${escapeHtml(needAccess)}" placeholder="e.g. Contact the admin">
    </label>
    <div class="field-row" style="margin-top:8px;">
      <button type="button" id="save-need-access-btn">Save</button>
      <span id="need-access-status" class="status-text"></span>
    </div>`;

  const rowsEl = document.getElementById('guides-rows');

  el.querySelector('.add-guide-btn').addEventListener('click', () => {
    rowsEl.insertAdjacentHTML('beforeend', guideRowHtml({ id: '', label: '', sublabel: '', fileName: '' }));
  });

  rowsEl.addEventListener('click', async (e) => {
    const removeBtn = e.target.closest('.remove-guide-btn');
    if (removeBtn) {
      const row = removeBtn.closest('.guide-row');
      if (row.dataset.id) {
        try { await apiDelete(`/admin/api/guides/${row.dataset.id}`); } catch (err) { alert(err.message); return; }
      }
      row.remove();
    }
  });

  rowsEl.addEventListener('change', async (e) => {
    const input = e.target.closest('[data-upload]');
    if (!input) return;
    const row = input.closest('.guide-row');
    const file = input.files[0];
    if (!file) return;
    const label = row.querySelector('[data-field="label"]').value.trim();
    if (!label) { alert('Add a label before uploading a file.'); return; }
    const dataUri = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    try {
      const result = await apiPost('/admin/api/guides', {
        id: row.dataset.id || undefined,
        label,
        sublabel: row.querySelector('[data-field="sublabel"]').value.trim(),
        data: dataUri,
      });
      document.getElementById('guides-status').textContent = 'Saved.';
      rowsEl.innerHTML = result.guides.map(guideRowHtml).join('');
    } catch (err) {
      document.getElementById('guides-status').textContent = err.message;
    }
  });

  document.getElementById('save-need-access-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('need-access-status');
    try {
      await apiPost('/admin/api/settings', { site: { needAccessMessage: document.getElementById('need-access-input').value.trim() } });
      statusEl.textContent = 'Saved.';
    } catch (err) {
      statusEl.textContent = err.message;
    }
  });
}

// ── Bootstrapping ──────────────────────────────────────────────────────────

async function showSettings() {
  const [data, publicConfig] = await Promise.all([apiGet('/admin/api/settings'), apiGet('/api/config/public')]);
  document.getElementById('login-section').hidden = true;
  document.getElementById('settings-section').hidden = false;
  renderBranding(data.settings);
  renderSettingsForm(data.settings);
  renderMediaServer(data.settings, publicConfig);
  renderLibraryExclusions(publicConfig);
  renderDisplaySettings(data.settings);
  renderMapPrivacy(data.settings);
  renderDigitalDates(data.settings);
  renderCustomLinks();
  renderGuides();
}

initTabs();

(async function init() {
  try {
    await showSettings();
  } catch {
    // not logged in yet — leave the login form showing
  }
})();

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';
  try {
    await apiPost('/admin/api/login', { password });
    await showSettings();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await apiPost('/admin/api/logout', {});
  window.location.reload();
});

document.getElementById('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('settings-error');
  const statusEl = document.getElementById('settings-status');
  errorEl.textContent = '';
  statusEl.textContent = '';
  try {
    const body = formToNestedSettings(e.target);
    const result = await apiPost('/admin/api/settings', body);
    statusEl.textContent = result.setupComplete ? 'Saved.' : 'Saved. Seerr, and at least one of Plex/Jellyfin, is still needed to unlock the dashboard.';
    const [refreshed, publicConfig] = await Promise.all([apiGet('/admin/api/settings'), apiGet('/api/config/public')]);
    renderSettingsForm(refreshed.settings);
    renderMediaServer(refreshed.settings, publicConfig);
    renderLibraryExclusions(publicConfig);
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById('settings-form').addEventListener('click', async (e) => {
  const btn = e.target.closest('.test-btn');
  if (!btn) return;
  const serviceKey = btn.dataset.test;
  const fieldset = btn.closest('fieldset');
  const body = {};
  fieldset.querySelectorAll('input').forEach((input) => {
    if (input.disabled) return;
    const field = input.name.split('.').pop();
    if (input.value) body[field] = input.value;
  });

  const resultEl = document.getElementById(`test-result-${serviceKey}`);
  resultEl.textContent = 'Testing…';
  resultEl.className = 'test-result';
  try {
    const result = await apiPost(`/admin/api/test/${serviceKey}`, body);
    resultEl.textContent = result.ok ? 'Connected' : `Failed${result.error ? `: ${result.error}` : ''}`;
    resultEl.className = `test-result ${result.ok ? 'ok' : 'fail'}`;
  } catch (err) {
    resultEl.textContent = err.message;
    resultEl.className = 'test-result fail';
  }
});

document.getElementById('password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('password-error');
  const statusEl = document.getElementById('password-status');
  errorEl.textContent = '';
  statusEl.textContent = '';
  const newPassword = new FormData(e.target).get('newPassword');
  try {
    await apiPost('/admin/api/change-password', { newPassword });
    statusEl.textContent = 'Password changed.';
    e.target.reset();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});
