const crypto = require('crypto');

// Deterministic within one running process — the same real id always
// redacts to the same fake id for the lifetime of this server, so a guest
// polling the requests list repeatedly doesn't see it visibly "reshuffle".
// A restart naturally reshuffles it, which is fine: nothing depends on a
// redacted id surviving a restart, only on it being stable moment-to-moment.
const REDACT_SECRET = crypto.randomBytes(32);

function redactId(id) {
  if (id == null) return null;
  return crypto.createHmac('sha256', REDACT_SECRET).update(String(id)).digest('hex').slice(0, 12);
}

const GUEST_PSEUDONYMS = [
  'A Viewer', 'A Guest', 'Someone', 'A Household Member', 'A Visitor',
  'A Night Owl', 'A Mystery Guest', 'A Friend', 'A Fellow Fan', 'A Watcher',
  'A Listener', 'A Regular', 'A New Face', 'A Familiar Face', 'A Quiet One',
];

// Same real user must always land on the same fake name within one running
// process — otherwise a name picked fresh on every broadcast would make
// the frontend's own dedupe/diff key (which includes the display name)
// treat every update as "a different stream," restarting its animation
// constantly. Deterministic hash of the REAL name (never sent to the
// client) into a small fixed pool.
function stableAnonName(realName) {
  if (!realName) return GUEST_PSEUDONYMS[0];
  const hash = crypto.createHmac('sha256', REDACT_SECRET).update(String(realName)).digest();
  return GUEST_PSEUDONYMS[hash.readUInt32BE(0) % GUEST_PSEUDONYMS.length];
}

// Plex/Jellyfin now-playing sessions, sanitized for an unauthenticated
// visitor. Whitelist-reconstructed (never blacklisted) against exactly the
// fields frontend/js/service-status.js's parsePlexEntries/parseJellyfinEntries
// actually read — title is treated as identifying (same reasoning as Seerr's
// "Hidden Title") and dropped along with thumb art, IP, and any real
// username; type/progress/player-product stay so a guest still gets a live,
// if anonymous, sense of activity.
function sanitizePlexSessionsForGuest(json) {
  const items = (json?.MediaContainer?.Metadata ?? []).map((s) => ({
    type: s.type,
    parentIndex: s.parentIndex,
    index: s.index,
    title: 'Hidden Title',
    parentTitle: s.parentTitle ? 'Hidden Title' : undefined,
    grandparentTitle: s.grandparentTitle ? 'Hidden Title' : undefined,
    User: { title: stableAnonName(s.User?.title) },
    Player: s.Player ? { product: s.Player.product, state: s.Player.state } : undefined,
    viewOffset: s.viewOffset,
    duration: s.duration,
  }));
  return { MediaContainer: { size: items.length, Metadata: items } };
}

function sanitizeJellyfinSessionsForGuest(json) {
  const items = Array.isArray(json) ? json : [];
  return items.map((s) => ({
    UserName: stableAnonName(s.UserName),
    Client: s.Client,
    PlayState: s.PlayState ? { IsPaused: s.PlayState.IsPaused, PositionTicks: s.PlayState.PositionTicks } : undefined,
    NowPlayingItem: s.NowPlayingItem
      ? {
          Name: 'Hidden Title',
          SeriesName: s.NowPlayingItem.SeriesName ? 'Hidden Title' : undefined,
          Type: s.NowPlayingItem.Type,
          ParentIndexNumber: s.NowPlayingItem.ParentIndexNumber,
          IndexNumber: s.NowPlayingItem.IndexNumber,
          RunTimeTicks: s.NowPlayingItem.RunTimeTicks,
        }
      : undefined,
  }));
}

// Overseerr/Jellyseerr's /api/v1/request list response, sanitized for an
// unauthenticated visitor — "tease, don't vanish": the item's existence and
// workflow status still show, but the real tmdbId/tvdbId (which a guest
// could otherwise use to look up the real title on TMDB directly) are
// replaced with a stable-but-fake value, and the requester's own identity is
// dropped entirely.
function sanitizeSeerrRequestsForGuest(data) {
  if (!data || !Array.isArray(data.results)) return data;
  return {
    ...data,
    results: data.results.map((r) => ({
      id: r.id,
      status: r.status,
      media: r.media
        ? {
            id: r.media.id,
            mediaType: r.media.mediaType,
            status: r.media.status,
            status4k: r.media.status4k,
            tmdbId: redactId(r.media.tmdbId),
            tvdbId: r.media.tvdbId != null ? redactId(r.media.tvdbId) : undefined,
          }
        : null,
    })),
  };
}

// A single movie/tv detail lookup is keyed by the real tmdb id in the URL
// path itself — unlike the list above, there's no id left to redact, so
// guests get a fully generic placeholder instead of the real title/poster.
function lockedMediaDetail() {
  return { title: 'Hidden Title', name: 'Hidden Title', posterPath: null, releaseDate: null, firstAirDate: null, _locked: true };
}

// Guests only ever need enough to filter/label carousel tabs (key, title,
// type) — Plex's real /library/sections response also carries each
// library's on-disk Location paths, uuid, agent, and scanner, none of which
// belong in an unauthenticated response.
function sanitizePlexSectionsForGuest(json) {
  const dirs = (json?.MediaContainer?.Directory ?? []).map((d) => ({
    key: d.key, title: d.title, type: d.type,
  }));
  return { MediaContainer: { size: dirs.length, Directory: dirs } };
}

// "Tease, don't vanish" — same principle as sanitizeSeerrRequestsForGuest:
// a guest still sees that something new landed (type, addedAt) and gets a
// _locked card the frontend renders as a skeleton, but every id that could
// be used to fetch the real title/art (ratingKey/key/guid/slug and their
// parent/grandparent equivalents) is redacted rather than passed through.
function sanitizePlexRecentlyAddedForGuest(json) {
  const items = (json?.MediaContainer?.Metadata ?? []).map((it) => ({
    ratingKey: redactId(it.ratingKey), key: redactId(it.key),
    guid: redactId(it.guid), slug: redactId(it.slug),
    parentRatingKey: redactId(it.parentRatingKey),
    grandparentRatingKey: redactId(it.grandparentRatingKey),
    grandparentKey: redactId(it.grandparentKey),
    grandparentGuid: redactId(it.grandparentGuid), grandparentSlug: redactId(it.grandparentSlug),
    title: 'Hidden Title', parentTitle: 'Hidden Title', grandparentTitle: 'Hidden Title',
    type: it.type, addedAt: it.addedAt,
    _locked: true,
  }));
  return { MediaContainer: { size: items.length, Metadata: items } };
}

// Jellyfin /Items/Latest, same "tease, don't vanish" treatment as Plex recently added.
function sanitizeJellyfinLatestForGuest(items) {
  return (Array.isArray(items) ? items : []).map((it) => ({
    Id: redactId(it.Id), Name: 'Hidden Title', Type: it.Type, DateCreated: it.DateCreated, _locked: true,
  }));
}

// AudioBookShelf session objects appear in two different response shapes
// (a live listening session vs. a plain library item) — both get the same
// title/author redaction, real ids/device info/progress stay since neither
// is identifying on its own.
function sanitizeAbsSessionObject(s) {
  return {
    id: s.id, userId: s.userId,
    displayTitle: 'Hidden Title', displayAuthor: null,
    libraryItem: s.libraryItem?.media?.metadata
      ? { media: { metadata: { title: 'Hidden Title', authorName: null, authors: null } } }
      : undefined,
    currentTime: s.currentTime, duration: s.duration, updatedAt: s.updatedAt,
  };
}

function sanitizeAbsSessionsForGuest(json) {
  return { sessions: (json?.sessions ?? []).map(sanitizeAbsSessionObject) };
}

function sanitizeAbsLibrariesForGuest(json) {
  return { libraries: (json?.libraries ?? []).map((l) => ({ id: l.id, name: l.name, mediaType: l.mediaType })) };
}

function sanitizeAbsItemsForGuest(json) {
  const results = (json?.results ?? []).map((it) => ({
    id: redactId(it.id), addedAt: it.addedAt, _locked: true,
    media: it.media?.metadata ? { metadata: { title: 'Hidden Title', authorName: null, authors: null } } : undefined,
  }));
  return { results };
}

module.exports = {
  redactId,
  stableAnonName,
  sanitizeSeerrRequestsForGuest,
  lockedMediaDetail,
  sanitizePlexSessionsForGuest,
  sanitizeJellyfinSessionsForGuest,
  sanitizePlexSectionsForGuest,
  sanitizePlexRecentlyAddedForGuest,
  sanitizeJellyfinLatestForGuest,
  sanitizeAbsSessionsForGuest,
  sanitizeAbsLibrariesForGuest,
  sanitizeAbsItemsForGuest,
};
