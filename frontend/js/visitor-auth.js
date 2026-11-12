// VISITOR AUTH — Plex OAuth (PIN flow) + Jellyfin login + guest-mode state.
// Single source of truth for "is this browser a signed-in visitor right now".
// Everything else (recommendations.js, requests.js) reads window.__marqueeGuest/
// window.__marqueeProvider or listens for "marquee:auth-changed" — nothing else
// talks to /api/visitor-auth/* directly. The site owner signs in separately at
// /admin; this only handles Plex OAuth and Jellyfin login, whichever of the two
// the admin has actually configured.

window.__marqueeGuest = true;
window.__marqueeProvider = null;
let _visitorConfig = {};

function isVisitorGuest() { return window.__marqueeGuest === true; }

// Resolves once the first session check has finished (or after 5s if it can't), so
// features that only work for signed-in visitors can wait for the answer instead of
// firing requests a guest is guaranteed to be refused.
let _resolveAuthReady;
window.marqueeAuthReady = new Promise((resolve) => { _resolveAuthReady = resolve; });
setTimeout(() => _resolveAuthReady(), 5000);

// Double-submit cookie pattern, same shape as frontend/js/api.js's admin
// equivalent — read the non-httpOnly CSRF cookie and echo it back as a
// header on state-changing visitor requests (POST /api/seerr/request, etc).
let _visitorAuthSig = null;
function visitorCsrfToken() {
  const match = document.cookie.match(/(?:^|; )(?:__Host-)?marquee_visitor_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

async function checkVisitorSession() {
  try {
    const r = await fetchT('/api/visitor-auth/session', {}, 6000);
    const data = await r.json();
    applyVisitorAuthUI(!!data.authenticated, data.username || null, data.provider || null);
    return true;
  } catch {
    return false; // network hiccup — leave the UI as it was
  }
}

// Right after a login action the server has already set a valid session
// cookie — a failure here is just this one follow-up request hiccuping, not
// a real "not logged in". Retry a couple times before giving up.
async function checkVisitorSessionAfterLogin(retries = 3, delayMs = 900) {
  for (let i = 0; i < retries; i++) {
    if (await checkVisitorSession()) return;
    if (i < retries - 1) await new Promise((res) => setTimeout(res, delayMs));
  }
}

function applyVisitorAuthUI(authenticated, username, provider) {
  window.__marqueeGuest = !authenticated;
  window.__marqueeProvider = authenticated ? provider : null;

  const badge = document.getElementById('visitor-auth-badge');
  const signinBtn = document.getElementById('visitor-signin-btn');
  const signoutBtn = document.getElementById('visitor-signout-btn');
  if (badge) {
    if (authenticated) {
      badge.textContent = username || (provider === 'jellyfin' ? 'Jellyfin' : 'Plex');
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }
  if (signinBtn) signinBtn.hidden = authenticated;
  if (signoutBtn) signoutBtn.hidden = !authenticated;

  // Only on a real change: every listener (push stream, carousels, stats) re-fetches on
  // this event, and the first session check after load usually confirms the initial state.
  const sig = `${authenticated}|${username}|${provider}`;
  if (sig === _visitorAuthSig) return;
  const first = _visitorAuthSig === null;
  _visitorAuthSig = sig;
  _resolveAuthReady();
  document.dispatchEvent(new CustomEvent('marquee:auth-changed', { detail: { authenticated, username, provider, initial: first } }));
}

// ── Plex OAuth (PIN flow) ───────────────────────────────────────────────
let _visitorPinPollTimer = null;

async function startVisitorPlexLogin() {
  showVisitorLoginModal({ status: 'starting' });
  // Open the window synchronously inside the click; popup blockers reject window.open
  // calls made after an await. It's pointed at Plex once the PIN exists.
  const popup = window.open('about:blank', 'marquee-plex-auth', 'width=480,height=720');
  let pinResp;
  try {
    const r = await fetchT('/api/visitor-auth/pin', { method: 'POST' }, 8000);
    pinResp = await r.json();
    if (!pinResp?.id) throw new Error('no pin');
  } catch {
    try { popup?.close(); } catch {}
    showVisitorLoginModal({ status: 'error', message: 'Could not reach the server. Try again in a moment.' });
    return;
  }

  const authUrl = 'https://app.plex.tv/auth#?' + new URLSearchParams({
    clientID: pinResp.clientId,
    code: pinResp.code,
    'context[device][product]': _visitorConfig.siteName || 'Marquee',
  }).toString();
  if (popup && !popup.closed) popup.location.href = authUrl;
  else window.open(authUrl, 'marquee-plex-auth', 'width=480,height=720');
  showVisitorLoginModal({ status: 'waiting' });

  const deadline = Date.now() + 2 * 60 * 1000; // Plex PINs live ~15min; 2min is plenty of UX patience
  clearInterval(_visitorPinPollTimer);
  _visitorPinPollTimer = setInterval(async () => {
    if (Date.now() > deadline) {
      clearInterval(_visitorPinPollTimer);
      showVisitorLoginModal({ status: 'timeout' });
      try { popup?.close(); } catch {}
      return;
    }
    let data;
    try {
      const r = await fetchT(`/api/visitor-auth/pin/${pinResp.id}`, {}, 6000);
      data = await r.json();
    } catch { return; } // transient — keep polling
    if (data.pending) return;
    clearInterval(_visitorPinPollTimer);
    try { popup?.close(); } catch {}
    if (data.error === 'no_server_access') { showVisitorLoginModal({ status: 'no_access' }); return; }
    if (data.error) { showVisitorLoginModal({ status: 'error', message: data.message || 'Login failed.' }); return; }
    if (data.ok) { hideVisitorLoginModal(); await checkVisitorSessionAfterLogin(); }
  }, 2000);
}

async function submitVisitorJellyfinLogin() {
  const userEl = document.getElementById('visitor-jellyfin-username');
  const passEl = document.getElementById('visitor-jellyfin-password');
  const errEl = document.getElementById('visitor-jellyfin-error');
  const btn = document.getElementById('visitor-jellyfin-submit-btn');
  const username = userEl?.value.trim() || '';
  const password = passEl?.value || '';
  if (!username || !password) { if (errEl) errEl.textContent = 'Enter a username and password.'; return; }
  if (btn) btn.disabled = true;
  if (errEl) errEl.textContent = '';
  try {
    const r = await fetchT('/api/visitor-auth/jellyfin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }, 8000);
    if (r.status === 429) { if (errEl) errEl.textContent = 'Too many attempts — try again shortly.'; return; }
    if (!r.ok) { if (errEl) errEl.textContent = 'Invalid username or password.'; return; }
    if (passEl) passEl.value = '';
    hideVisitorLoginModal();
    await checkVisitorSessionAfterLogin();
  } catch {
    if (errEl) errEl.textContent = 'Could not reach the server.';
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function visitorLogout() {
  try {
    await fetchT('/api/visitor-auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': visitorCsrfToken() } }, 5000);
  } catch {}
  applyVisitorAuthUI(false, null, null);
}

// ── Login modal — Plex primary view, Jellyfin fallback view in the same
// modal. Which view(s) are reachable at all depends on which media server(s)
// the admin actually configured (see wireVisitorAuthAvailability below) —
// this satisfies the "works with Plex OR Jellyfin alone" requirement by
// simply never offering the option that has nothing behind it.
function showVisitorLoginModal(state) {
  const overlay = document.getElementById('visitor-login-overlay');
  const body = document.getElementById('visitor-login-body');
  const startBtn = document.getElementById('visitor-login-plex-btn');
  if (!overlay) return;

  if (state.status !== 'jellyfin-view') showVisitorPlexView();

  const copy = {
    prompt: 'Sign in with your Plex account to unlock personalized recommendations and requests.',
    starting: 'Starting sign-in…',
    waiting: 'Complete sign-in in the Plex window that just opened, then come back here.',
    no_access: "That Plex account doesn't have access to this server, so it can't be signed in here.",
    error: state.message || 'Something went wrong signing in.',
    timeout: 'Sign-in took too long and timed out. Try again.',
  };
  if (body && state.status !== 'jellyfin-view') {
    body.textContent = copy[state.status] ?? copy.prompt;
    body.classList.toggle('visitor-login-error-copy', ['no_access', 'error', 'timeout'].includes(state.status));
  }
  if (startBtn) {
    startBtn.textContent = ['no_access', 'error', 'timeout'].includes(state.status) ? 'Try again' : 'Sign in with Plex';
    startBtn.disabled = state.status === 'starting' || state.status === 'waiting';
  }
  overlay.classList.add('open');
}
function hideVisitorLoginModal() {
  document.getElementById('visitor-login-overlay')?.classList.remove('open');
}
function showVisitorJellyfinView() {
  document.getElementById('visitor-login-plex-view')?.setAttribute('hidden', '');
  document.getElementById('visitor-login-jellyfin-view')?.removeAttribute('hidden');
  const err = document.getElementById('visitor-jellyfin-error');
  if (err) err.textContent = '';
  document.getElementById('visitor-jellyfin-username')?.focus();
}
function showVisitorPlexView() {
  document.getElementById('visitor-login-jellyfin-view')?.setAttribute('hidden', '');
  document.getElementById('visitor-login-plex-view')?.removeAttribute('hidden');
}

// Shows the sign-in entry point at all only once at least one media server is
// configured, and only offers each provider's own view when that provider is
// actually configured — a Jellyfin-only marquee instance never shows a
// "Sign in with Plex" button, and vice versa.
let _visitorProviders = { plexOn: false, jellyfinOn: false };
let _visitorSigninWired = false;
function wireVisitorAuthAvailability(config) {
  const plexOn = !!config.services?.plex?.enabled;
  const jellyfinOn = !!config.services?.jellyfin?.enabled;
  const slot = document.getElementById('visitor-auth-slot');
  if (slot) slot.hidden = !(plexOn || jellyfinOn);

  const plexBtn = document.getElementById('visitor-login-plex-btn');
  const jellyfinLink = document.getElementById('visitor-login-jellyfin-link');
  const usePlexLink = document.getElementById('visitor-login-use-plex-link');
  if (plexBtn) plexBtn.hidden = !plexOn;
  if (jellyfinLink) jellyfinLink.hidden = !jellyfinOn;
  if (usePlexLink) usePlexLink.hidden = !plexOn;

  _visitorProviders = { plexOn, jellyfinOn };
  if (!_visitorSigninWired) {
    _visitorSigninWired = true;
    // Neither is configured, or only Jellyfin is — the Plex view isn't reachable, so
    // open straight to the Jellyfin form when signing in.
    document.getElementById('visitor-signin-btn')?.addEventListener('click', () => {
      const { plexOn: p, jellyfinOn: j } = _visitorProviders;
      if (!p && j) { showVisitorLoginModal({ status: 'jellyfin-view' }); showVisitorJellyfinView(); }
      else showVisitorLoginModal({ status: 'prompt' });
    });
  }
}

// ── Wiring ──────────────────────────────────────────────────────────────
document.addEventListener('marquee:config', (e) => {
  _visitorConfig = e.detail || {};
  wireVisitorAuthAvailability(_visitorConfig);
  checkVisitorSession().then((ok) => { if (!ok) _resolveAuthReady(); });
});

(function wireVisitorAuthControls() {
  const byId = (id) => document.getElementById(id);
  byId('visitor-signout-btn')?.addEventListener('click', visitorLogout);
  byId('visitor-login-plex-btn')?.addEventListener('click', startVisitorPlexLogin);
  byId('visitor-login-jellyfin-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    showVisitorLoginModal({ status: 'jellyfin-view' });
    showVisitorJellyfinView();
  });
  byId('visitor-login-use-plex-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    showVisitorLoginModal({ status: 'prompt' });
  });
  byId('visitor-jellyfin-submit-btn')?.addEventListener('click', (e) => { e.preventDefault(); submitVisitorJellyfinLogin(); });
  for (const id of ['visitor-jellyfin-username', 'visitor-jellyfin-password']) {
    byId(id)?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitVisitorJellyfinLogin(); } });
  }
  const close = () => { clearInterval(_visitorPinPollTimer); hideVisitorLoginModal(); };
  byId('visitor-login-close')?.addEventListener('click', close);
  byId('visitor-login-overlay')?.addEventListener('click', (e) => { if (e.target.id === 'visitor-login-overlay') close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && byId('visitor-login-overlay')?.classList.contains('open')) close();
  });
})();
