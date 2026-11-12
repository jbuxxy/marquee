// SEERR AUTO-APPROVE REQUEST PICKER — profile/root-folder dialog shown
// instead of the plain confirm (recommendations.js's handleRecRequestClick)
// for visitors who can auto-approve their own Seerr requests
// (server/services/seerr.js's resolveSeerrCapabilities). Opening this dialog
// IS the confirmation step for those sessions; everyone else falls through
// to the plain confirm+POST already in recommendations.js.
//
// Always resolves the default (non-4K) server for the media type — no
// server picker, since picking a server is exactly the kind of decision
// this dialog exists to skip past for someone who already trusts their own
// Seerr defaults. A session with separate 4K auto-approve permission
// additionally gets an "also request 4K" checkbox.
let _seerrCaps = { admin: false, autoApproveMovie: false, autoApproveTv: false, autoApprove4kMovie: false, autoApprove4kTv: false };

async function refreshSeerrAutoApprove() {
  if (isVisitorGuest()) {
    _seerrCaps = { admin: false, autoApproveMovie: false, autoApproveTv: false, autoApprove4kMovie: false, autoApprove4kTv: false };
    return;
  }
  try {
    const r = await fetchT('/api/seerr/my-permissions', {}, 8000);
    if (r.ok) _seerrCaps = await r.json();
  } catch {}
}

function canAutoApprove(mediaType) {
  return _seerrCaps.admin || (mediaType === 'tv' ? _seerrCaps.autoApproveTv : _seerrCaps.autoApproveMovie);
}
function canAutoApprove4k(mediaType) {
  return _seerrCaps.admin || (mediaType === 'tv' ? _seerrCaps.autoApprove4kTv : _seerrCaps.autoApprove4kMovie);
}
function seerrPickerService(mediaType) { return mediaType === 'tv' ? 'sonarr' : 'radarr'; }

let _pickerBtn = null, _pickerMediaType = null, _pickerTmdbId = null, _picker4k = null, _pickerServerId = null;

// Called by recommendations.js before it falls back to its own plain
// confirm — returns true if this took over (opened the picker), false if
// the caller should proceed with its own flow.
async function tryOpenSeerrRequestPicker(tmdbId, mediaType, btn) {
  if (!canAutoApprove(mediaType)) return false;
  await openSeerrRequestPicker(btn, mediaType, tmdbId);
  return true;
}

async function openSeerrRequestPicker(btn, mediaType, tmdbId) {
  _pickerBtn = btn; _pickerMediaType = mediaType; _pickerTmdbId = tmdbId; _picker4k = null; _pickerServerId = null;

  const overlay = document.getElementById('seerr-picker-overlay');
  const title = document.getElementById('seerr-picker-title');
  const loading = document.getElementById('seerr-picker-loading');
  const form = document.getElementById('seerr-picker-form');
  const errorEl = document.getElementById('seerr-picker-error');
  const fourKWrap = document.getElementById('seerr-picker-4k-wrap');
  const fourKBox = document.getElementById('seerr-picker-4k-checkbox');
  if (!overlay) return;

  title.textContent = mediaType === 'tv' ? 'Request TV Show' : 'Request Movie';
  errorEl.textContent = '';
  fourKBox.checked = false;
  fourKWrap.hidden = true;
  form.hidden = true;
  loading.hidden = false;
  loading.textContent = 'Loading…';
  overlay.classList.add('open');

  try {
    const svc = seerrPickerService(mediaType);
    const r = await fetchT(`/api/seerr/service/${svc}`, {}, 10000);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const servers = await r.json();
    const regularServer = servers.find((s) => !s.is4k && s.isDefault) || servers.find((s) => !s.is4k);
    if (!regularServer) { loading.textContent = 'No server configured for this in Seerr.'; return; }
    _pickerServerId = regularServer.id;
    await loadSeerrPickerServerDetail(svc, regularServer.id);

    // 4K checkbox only offered when both a 4K server exists AND this session
    // has real 4K auto-approve for this media type (regular and 4K
    // auto-approve are separate permission bits).
    const fourKServer = servers.find((s) => s.is4k && s.isDefault) || servers.find((s) => s.is4k);
    if (fourKServer && canAutoApprove4k(mediaType)) {
      const dr = await fetchT(`/api/seerr/service/${svc}/${fourKServer.id}`, {}, 10000);
      if (dr.ok) {
        const detail = await dr.json();
        _picker4k = { serverId: fourKServer.id, profileId: detail.server?.activeProfileId ?? null, rootFolder: detail.server?.activeDirectory ?? null };
        if (_picker4k.profileId == null || !_picker4k.rootFolder) _picker4k = null;
      }
    }
    fourKWrap.hidden = !_picker4k;
    loading.hidden = true;
    form.hidden = false;
  } catch {
    loading.textContent = 'Could not reach the server — try again.';
  }
}

async function loadSeerrPickerServerDetail(svc, serverId) {
  const profileSelect = document.getElementById('seerr-picker-profile');
  const rootFolderSelect = document.getElementById('seerr-picker-rootfolder');
  const langWrap = document.getElementById('seerr-picker-lang-wrap');
  const langSelect = document.getElementById('seerr-picker-lang');
  const errorEl = document.getElementById('seerr-picker-error');
  try {
    const r = await fetchT(`/api/seerr/service/${svc}/${serverId}`, {}, 10000);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const detail = await r.json();

    profileSelect.innerHTML = '';
    for (const p of detail.profiles ?? []) {
      const opt = document.createElement('option');
      opt.value = String(p.id); opt.textContent = p.name;
      profileSelect.appendChild(opt);
    }
    if (detail.server?.activeProfileId != null) profileSelect.value = String(detail.server.activeProfileId);

    rootFolderSelect.innerHTML = '';
    for (const f of detail.rootFolders ?? []) {
      const opt = document.createElement('option');
      opt.value = f.path; opt.textContent = f.path;
      rootFolderSelect.appendChild(opt);
    }
    if (detail.server?.activeDirectory) rootFolderSelect.value = detail.server.activeDirectory;

    // Sonarr-only, and only present on older/legacy-language-profile setups —
    // most current Sonarr v3 servers report an empty array, so the row stays
    // hidden rather than showing a select with nothing meaningful to pick.
    if (detail.languageProfiles?.length) {
      langSelect.innerHTML = '';
      for (const lp of detail.languageProfiles) {
        const opt = document.createElement('option');
        opt.value = String(lp.id); opt.textContent = lp.name;
        langSelect.appendChild(opt);
      }
      if (detail.server?.activeLanguageProfileId != null) langSelect.value = String(detail.server.activeLanguageProfileId);
      langWrap.hidden = false;
    } else {
      langWrap.hidden = true;
      langSelect.innerHTML = '';
    }
  } catch {
    errorEl.textContent = 'Could not load profiles/folders for that server.';
  }
}

function closeSeerrRequestPicker() {
  document.getElementById('seerr-picker-overlay')?.classList.remove('open');
  _pickerBtn = null; _pickerMediaType = null; _pickerTmdbId = null; _picker4k = null; _pickerServerId = null;
}

async function submitSeerrPicker() {
  const submitBtn = document.getElementById('seerr-picker-submit-btn');
  const errorEl = document.getElementById('seerr-picker-error');
  const profileSelect = document.getElementById('seerr-picker-profile');
  const rootFolderSelect = document.getElementById('seerr-picker-rootfolder');
  const langWrap = document.getElementById('seerr-picker-lang-wrap');
  const langSelect = document.getElementById('seerr-picker-lang');
  const fourKBox = document.getElementById('seerr-picker-4k-checkbox');
  if (!_pickerBtn || !_pickerMediaType || _pickerTmdbId == null) return;

  errorEl.textContent = '';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Requesting…';

  // Server-side (server/services/seerr.js#handleCreateRequest) re-validates
  // this session actually has the permission before honoring any of these —
  // sending them is an optimization for a permitted session, not a trust
  // boundary in itself.
  const body = {
    mediaId: _pickerTmdbId,
    mediaType: _pickerMediaType,
    serverId: _pickerServerId,
    profileId: Number(profileSelect.value),
    rootFolder: rootFolderSelect.value,
    ...(!langWrap.hidden && langSelect.value ? { languageProfileId: Number(langSelect.value) } : {}),
    ...(fourKBox.checked && _picker4k ? {
      also4k: true,
      serverId4k: _picker4k.serverId,
      profileId4k: _picker4k.profileId,
      rootFolder4k: _picker4k.rootFolder,
    } : {}),
  };

  let ok = false, message = 'Request failed — try again.';
  try {
    const r = await fetchT('/api/seerr/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': visitorCsrfToken() },
      body: JSON.stringify(body),
    }, 15000);
    ok = r.ok;
    if (!ok) {
      const err = await r.json().catch(() => ({}));
      if (err.message) message = err.message;
      else if (r.status === 429) message = 'Too many requests — try again later.';
    }
  } catch { ok = false; }

  submitBtn.disabled = false;
  submitBtn.textContent = 'Request';
  if (!ok) { errorEl.textContent = message; return; }

  if (_pickerBtn) { _pickerBtn.disabled = true; _pickerBtn.textContent = 'Requested'; }
  closeSeerrRequestPicker();
}

document.addEventListener('marquee:auth-changed', refreshSeerrAutoApprove);
document.addEventListener('DOMContentLoaded', () => {
  refreshSeerrAutoApprove();
  document.getElementById('seerr-picker-submit-btn')?.addEventListener('click', submitSeerrPicker);
  document.getElementById('seerr-picker-cancel-btn')?.addEventListener('click', closeSeerrRequestPicker);
  document.getElementById('seerr-picker-close')?.addEventListener('click', closeSeerrRequestPicker);
  document.getElementById('seerr-picker-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'seerr-picker-overlay') closeSeerrRequestPicker();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('seerr-picker-overlay')?.classList.contains('open')) closeSeerrRequestPicker();
  });
});

window.tryOpenSeerrRequestPicker = tryOpenSeerrRequestPicker;
