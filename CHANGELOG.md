# Changelog

## 0.3.0 — visitor sign-in, live push, security hardening

- **Visitor sign-in** with Plex (PIN flow) or Jellyfin. Only accounts with
  access to your server are accepted (checked against plex.tv), sessions are
  re-verified daily, and Jellyfin tokens are revoked on sign-out. Optional
  Redis keeps sign-ins across restarts.
- **Three viewer tiers**: guests get an anonymized teaser, signed-in visitors
  get real titles with other viewers' IPs tokenized and paths/emails removed,
  and the owner sees everything.
- **Seerr requests as the visitor's own Seerr user**, with an auto-approve
  picker for quality profile / root folder / 4K when Seerr allows it, and a
  per-user rate limit.
- **Recommendations**: movies/shows from each visitor's watch history, and
  audiobooks via ReadMeABook.
- **Live push**: now-playing reaches browsers over server-sent events, driven
  by Plex and Seerr webhooks and a lightweight Jellyfin poll; status dots show
  the server's real view of each service.
- **Library exclusions** for Plex and Jellyfin.
- **Jellyfin 10.11+/12 support**: authentication moved to the `Authorization`
  header (the legacy `api_key` parameter is rejected by newer servers), and
  now-playing comes from a `/Sessions` poll.
- **Maps**: OpenFreeMap vector tiles rendered with MapLibre GL (the previous
  raster tile provider started requiring an API key). Geo-IP lookups moved to
  HTTPS and only send the network part of each address.
- **Coming Soon**: parses BingeBase's redesigned calendar; estimates digital
  dates from theatrical release; shows undated requests.
- **Performance**: the activity waveform draws in a Web Worker on an
  OffscreenCanvas; animations pause when off-screen or in a hidden tab and
  respect reduced-motion.
- **Security**: enforced Content-Security-Policy (no inline script),
  `__Host-` cookies over HTTPS, `TRUST_PROXY` uses `X-Real-IP` for rate
  limits, JSON-only logins, sandboxed relayed responses.
- Fixes: heat map geo tab never loaded; progress bars no longer jump
  backwards; sign-in button worked only once per page load.

## 0.2.0 — full feature port

Everything from the original private project's roadmap, generalized to work
across any subset of configured services:

- **Now-playing ticker** (Plex/Jellyfin/ABS), app deep-linking, and an
  activity waveform — both scale to however many watch services are
  actually configured (one service shows one waveform thread and one card,
  not three with two looking broken).
- **Search**, a **Recently Added** carousel, and **Seerr request cards**
  that deep-link "available" items to whichever media server actually has
  them.
- **Activity insights + heatmap** from **Tautulli** (Plex) or the new
  **Jellystat** integration (Jellyfin's equivalent) — whichever matches your
  setup, or whichever tracks the preferred server if both are configured.
- **Live map** (geo view + a network-graph view) with an independently
  optional home-location marker — works with or without one.
- **Command palette**, **keyboard shortcuts**, fullscreen **Now Casting**
  mode, and ambient UI effects (particles, card tilt, scroll reveal).
- **15-theme picker** and **calendar-driven seasonal effects** (10 holidays,
  manual override), both admin-toggleable independently of each other.
- **Custom links** (admin-defined cards or footer bookmarks) for anything
  without a built-in integration, each with an MDI icon and hex accent color
  chosen from a picker or typed in manually (required for card placement).
- **Guides**: admin-uploaded PDF pills below the services grid, plus an
  optional "need access?" contact card — absent entirely with nothing
  configured.
- Now-playing bar and live map panel both gain drag handles (reposition the
  bar anywhere on screen, resize the map panel), and the header logo gets
  idle glitch/chromatic-aberration flourishes plus a click pulse ring.
- Live map's network mode restores all three original visual styles (orbit
  with drag-to-rotate, radar sweep, matrix grid) instead of orbit alone.
- **Admin-controlled display/privacy toggles**: username anonymization
  (optional/always/never), seasonal effects on/off, extra themes on/off,
  opt-in live map (sends visitor IPs to a third-party geo-IP lookup).
- Independently-optional light/dark logo variants, layered on top of the
  existing single-logo upload.
- Bug fix: ip-api.com's batch geolocation endpoint ignores its top-level
  `?fields=` once a per-item `fields` list is present, silently dropping the
  `query` field needed to match results back to their IP — found via live
  testing against the real API, not just the mocks.

## 0.1.0 — initial release

- First public release: dashboard, admin settings UI, setup wizard.
- Required: Seerr, and at least one of Plex/Jellyfin.
- Optional: AudioBookShelf, Tautulli (credentials only), TMDB (credentials only).
- Config via environment variables and/or the admin UI, with env vars taking
  precedence and locking the corresponding field read-only.
- Custom or default logo/favicon/site name.
- Auth: scrypt-hashed admin password, signed sessions, CSRF protection,
  rate-limited login, no default password (generated and logged on first boot).
- Single combined Docker image, no external dependencies.
