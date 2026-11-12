// NEW RECOMMENDATIONS — movies/tv (Seerr/TMDB, off the signed-in visitor's
// own watch history) + audiobooks (RMAB, off ABS listening history). There is
// no music category.
//
// Guests (not signed in) see a locked placeholder for both buckets —
// recommendations are inherently personal, so unlike Requests there's no
// "real but redacted" guest view, just a sign-in prompt.
let recConfig = {};
let recBucket = 'movies-tv';
const recData = { 'movies-tv': null, audiobooks: null };

function recEscapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function recSectionAvailable() {
  const seerrOn = !!recConfig.services?.seerr?.enabled;
  const audiobooksOn = !!recConfig.services?.abs?.enabled && !!recConfig.services?.rmab?.enabled;
  return seerrOn || audiobooksOn;
}

function buildRecPills() {
  const wrap = document.getElementById('rec-wrap');
  const pillsEl = document.getElementById('rec-pills');
  if (!wrap || !pillsEl) return;
  if (!recSectionAvailable()) { wrap.hidden = true; return; }
  wrap.hidden = false;

  const seerrOn = !!recConfig.services?.seerr?.enabled;
  const audiobooksOn = !!recConfig.services?.abs?.enabled && !!recConfig.services?.rmab?.enabled;
  const pills = [];
  if (seerrOn) pills.push({ key: 'movies-tv', label: 'Movies & TV' });
  if (audiobooksOn) pills.push({ key: 'audiobooks', label: 'Audiobooks' });
  if (!pills.some((p) => p.key === recBucket)) recBucket = pills[0]?.key || 'movies-tv';

  pillsEl.innerHTML = pills.map((p) => `<button class="carousel-tab${p.key === recBucket ? ' active' : ''}" data-bucket="${p.key}">${p.label}</button>`).join('');
  pillsEl.querySelectorAll('.carousel-tab').forEach((btn) => btn.addEventListener('click', () => switchRecBucket(btn.dataset.bucket)));
  loadRecBucket(recBucket);
}

function switchRecBucket(bucket) {
  recBucket = bucket;
  document.querySelectorAll('#rec-pills .carousel-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.bucket === bucket));
  loadRecBucket(bucket);
}

// Recommendations are entirely personal (watch-history-derived) — there's no
// real backing data to show a guest the way redacted Recently Added/Requests
// cards do (those redact a REAL item; there is no real "your recs" for a
// signed-out session at all). Still shown as a full row of generic locked
// placeholder cards though ("tease, don't vanish"), rather than collapsing to a single centered message.
function recLockedCardHTML() {
  return `<div class="carousel-item carousel-item-locked" title="Sign in to view">
    <div class="carousel-item-locked-cover"><i class="ti ti-lock" aria-hidden="true"></i></div>
    <div class="carousel-item-title">Hidden Title</div>
  </div>`;
}

async function loadRecBucket(bucket) {
  const track = document.getElementById('rec-track');
  const basedOn = document.getElementById('rec-based-on');
  if (!track) return;

  if (isVisitorGuest()) {
    track.innerHTML = Array(10).fill(recLockedCardHTML()).join('');
    if (basedOn) basedOn.textContent = '';
    return;
  }

  if (recData[bucket] === null) {
    track.innerHTML = '<div class="carousel-loading">Loading…</div>';
    recData[bucket] = await fetchRecBucket(bucket);
  }
  if (recBucket !== bucket) return;
  renderRecTrack(bucket, recData[bucket]);
}

async function fetchRecBucket(bucket) {
  try {
    const url = bucket === 'audiobooks' ? '/api/recommendations/audiobooks' : '/api/recommendations/movies-tv';
    const r = await fetchT(url, {}, 15000);
    if (!r.ok) return { items: [] };
    const data = await r.json();
    if (bucket === 'audiobooks') {
      return { items: data.items || [], basedOn: data.basedOnBooks || [] };
    }
    const items = [
      ...(data.movies || []).map((m) => ({ ...m, mediaType: 'movie' })),
      ...(data.tv || []).map((t) => ({ ...t, mediaType: 'tv' })),
    ];
    const basedOn = [...(data.basedOnMovies || []), ...(data.basedOnTv || [])].slice(0, 3);
    return { items, basedOn };
  } catch { return { items: [], basedOn: [] }; }
}

function recCardHTML(item, bucket) {
  if (bucket === 'audiobooks') {
    return `<div class="carousel-item rec-item">
      ${item.coverUrl ? `<img src="${item.coverUrl}" alt="" loading="lazy" data-img-fallback="hide">` : '<div class="carousel-item-empty"></div>'}
      <div class="carousel-item-title">${recEscapeHtml(item.title)}</div>
      <div class="rec-item-sub">${recEscapeHtml(item.author || '')}</div>
    </div>`;
  }
  const poster = item.posterPath ? `https://image.tmdb.org/t/p/w300${item.posterPath}` : null;
  return `<div class="carousel-item rec-item" data-tmdb-id="${item.tmdbId}" data-media-type="${item.mediaType}">
    ${poster ? `<img src="${poster}" alt="" loading="lazy" data-img-fallback="hide">` : '<div class="carousel-item-empty"></div>'}
    <div class="carousel-item-title">${recEscapeHtml(item.title)}</div>
    <button class="secondary rec-request-btn" data-tmdb-id="${item.tmdbId}" data-media-type="${item.mediaType}">Request</button>
  </div>`;
}

function renderRecTrack(bucket, data) {
  const track = document.getElementById('rec-track');
  const basedOnEl = document.getElementById('rec-based-on');
  if (!track) return;
  const items = data.items || [];
  if (basedOnEl) {
    const basedOn = data.basedOn || [];
    basedOnEl.textContent = basedOn.length
      ? `Based on your ${bucket === 'audiobooks' ? 'listening of' : 'watching of'} ${basedOn.join(', ')}`
      : '';
  }
  if (!items.length) { track.innerHTML = '<div class="carousel-empty">Nothing new to recommend right now.</div>'; return; }
  track.innerHTML = items.map((item) => recCardHTML(item, bucket)).join('');
  track.querySelectorAll('.rec-request-btn').forEach((btn) => btn.addEventListener('click', () => handleRecRequestClick(btn)));
}

// Plain confirm-and-submit. Area 4 (Seerr requests + the auto-approve
// picker) layers a richer modal on top of this same click handler for
// sessions that have auto-approve permission — see seerr-request-picker.js.
async function handleRecRequestClick(btn) {
  const tmdbId = Number(btn.dataset.tmdbId);
  const mediaType = btn.dataset.mediaType;
  if (typeof window.tryOpenSeerrRequestPicker === 'function' && await window.tryOpenSeerrRequestPicker(tmdbId, mediaType, btn)) return;
  if (!confirm('Request this title?')) return;
  btn.disabled = true;
  btn.textContent = 'Requesting…';
  try {
    const r = await fetchT('/api/seerr/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': visitorCsrfToken() },
      body: JSON.stringify({ mediaId: tmdbId, mediaType }),
    }, 10000);
    if (r.ok) { btn.textContent = 'Requested'; return; }
    const err = await r.json().catch(() => ({}));
    btn.textContent = err.error === 'not_linked' ? 'Not set up in Seerr' : r.status === 429 ? 'Try later' : 'Failed';
    btn.title = err.message || '';
    if (err.error !== 'not_linked') btn.disabled = false;
  } catch {
    btn.textContent = 'Failed';
    btn.disabled = false;
  }
}

document.getElementById('rec-arrow-left')?.addEventListener('click', () => document.getElementById('rec-track')?.scrollBy({ left: -300, behavior: 'smooth' }));
document.getElementById('rec-arrow-right')?.addEventListener('click', () => document.getElementById('rec-track')?.scrollBy({ left: 300, behavior: 'smooth' }));

document.addEventListener('marquee:config', (e) => {
  recConfig = e.detail;
  buildRecPills();
});
document.addEventListener('marquee:auth-changed', () => {
  recData['movies-tv'] = null;
  recData.audiobooks = null;
  if (recSectionAvailable()) loadRecBucket(recBucket);
});
