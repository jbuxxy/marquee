// APP DEEP-LINKING — tries a native-app URL scheme first on mobile (falling
// back to a web link if the app isn't installed / after a timeout), for
// whichever services are actually configured. openLink()/svcIdForLink() are
// plain top-level functions so both the delegated click listener below and
// nowplaying.js's stream-detail popup can reuse the exact same logic.
//
// No Jellyfin entry: the official Jellyfin iOS/Android apps don't support
// custom URL scheme deep-linking (open upstream feature request, see
// github.com/jellyfin/jellyfin-ios/issues/466) — attempting one would only
// add a guaranteed-to-fail delay before the same web-link fallback that
// opening the link directly gives immediately.
const APP_SCHEMES = { plex: 'plex://' };

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// "music" is its own svcId (not folded into "plex") so openLink() can give it
// the Plexamp-first stage — everything else about a music item is identical
// to a movie/TV link on the same Plex server otherwise.
function svcIdForLink(el) {
  if (el.classList.contains('music')) return 'music';
  if (el.classList.contains('plex')) return 'plex';
  if (el.classList.contains('jellyfin')) return 'jellyfin';
  if (el.classList.contains('abs')) return 'abs';
  return null;
}

// Silently attempts a custom scheme via a hidden iframe — never navigates the
// page itself, never opens a visible tab — and reports back whether the OS
// appears to have handed off to an installed app, via blur/visibilitychange
// within the timeout window.
function detectApp(scheme, onDetected, onNotDetected) {
  let leftPage = false;
  const markLeft = () => { leftPage = true; };
  document.addEventListener('visibilitychange', markLeft, { once: true });
  window.addEventListener('blur', markLeft, { once: true });
  const frame = document.createElement('iframe');
  frame.style.display = 'none';
  frame.src = scheme;
  document.body.appendChild(frame);
  setTimeout(() => {
    document.removeEventListener('visibilitychange', markLeft);
    window.removeEventListener('blur', markLeft);
    frame.remove();
    (leftPage || document.hidden ? onDetected : onNotDetected)();
  }, 1800);
}

function tryAppSchemes(schemes, webUrl) {
  if (!isMobileDevice() || !schemes.length) { window.open(webUrl, '_blank', 'noopener'); return; }
  let i = 0;
  function attemptNext() {
    if (i >= schemes.length) { window.location.href = webUrl; return; }
    detectApp(schemes[i++], () => {}, attemptNext);
  }
  attemptNext();
}

// appUrl, when given, is a custom scheme URL targeting a specific item
// (plex://preplay/?metadataKey=...) rather than just the app's generic
// launch scheme.
function openLink(svcId, webUrl, e, appUrl) {
  if (e) e.preventDefault();

  if (appUrl && /^https?:\/\//.test(appUrl)) {
    if (isMobileDevice()) window.location.href = appUrl;
    else window.open(appUrl, '_blank', 'noopener');
    return;
  }

  const schemes =
    svcId === 'music' ? ['plexamp://'] :
    svcId === 'plex' ? [appUrl || APP_SCHEMES.plex] :
    APP_SCHEMES[svcId] ? [APP_SCHEMES[svcId]] : [];
  tryAppSchemes(schemes, webUrl);
}

// Plex numeric metadataType values used by Plex's own APIs.
function plexMetadataType(type) {
  return { movie: 1, show: 2, season: 3, episode: 4, artist: 8, album: 9, track: 10 }[type] || 1;
}

// Plex's app deep-link scheme for a specific piece of media — opens straight
// to that title's detail screen instead of the app's home/default view.
// Format: plex://preplay/?metadataKey=X&metadataType=Y&server=Z, per
// https://gist.github.com/Burry/7f6c2caa9cf645ca511ffefd697b3126 — metadataKey
// is the full "/library/metadata/12345" path (percent-encoded), not the bare
// ratingKey.
function plexAppUrl(ratingKey, machineId, metadataType = 1) {
  if (!ratingKey || !machineId) return null;
  const detailsKey = `/library/metadata/${ratingKey}`;
  return `plex://preplay/?metadataKey=${encodeURIComponent(detailsKey)}&metadataType=${metadataType}&server=${machineId}`;
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('.watch-card, .carousel-item, .search-result-item, .np-local-link, .req-card');
  if (!el || !el.href) return;
  const svcId = svcIdForLink(el);
  if (svcId) openLink(svcId, el.href, e, el.dataset.appUrl || null);
});
