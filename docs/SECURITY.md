# Security notes

marquee is designed to be run by people who aren't you, on servers you don't
control, often reachable from the public internet. That changes the security
bar compared to a one-off homelab script — a few defaults here are
deliberately stricter or more opinionated than they'd need to be for a
private deployment.

## Admin authentication

- There is no default password. On first boot, if you haven't set
  `ADMIN_PASSWORD` or `ADMIN_PASSWORD_HASH`, marquee generates a random one,
  hashes it, and prints the plaintext **once** to `docker logs`. Save it —
  it won't be shown again, though you can set a new one from `/admin` once
  logged in.
- Passwords are hashed with Node's built-in `crypto.scrypt` (no native
  dependencies, no bcrypt compile step in the image). The stored format
  (`scrypt$N$r$p$salt$hash`) is self-describing so the cost parameters can be
  tuned later without invalidating existing hashes.
- Failed logins are rate-limited two ways: per-IP (in-memory, escalating
  lockout) and per-account (persisted, so a distributed attempt across many
  IPs still can't grind forever).

## Sessions & CSRF

- Sessions are opaque random tokens, HMAC-signed with a secret that's
  auto-generated and persisted to `/config/session-secret` on first boot
  (or supplied via `SESSION_SECRET`). Admin sessions live in memory only, so
  restarting the container signs the admin out.
- Cookies are `HttpOnly` and `SameSite=Lax`. Over HTTPS they're also `Secure`
  and use the `__Host-` prefix, which stops a sibling subdomain from planting
  or overwriting them. HTTPS is only detected when you've opted in with
  `TRUST_PROXY=true` **and** the request carries `X-Forwarded-Proto: https`;
  marquee never trusts that header by default.
- All state-changing requests (admin and visitor) require a CSRF token
  (double-submit cookie pattern) in addition to the session cookie. Login
  endpoints only accept `application/json`, which blocks cross-site form
  posts (login CSRF).

## Visitor sessions

- Visitor (Plex/Jellyfin) sessions are a separate trust domain from the admin
  session: separate cookies, a separate signing secret
  (`/config/visitor-session-secret`), separate login rate limits.
- Plex sign-in is only accepted for accounts that own or have been shared your
  server, checked against plex.tv's list of that account's servers. The PIN
  is bound to the browser that started sign-in.
- Each session stores the visitor's own Plex or Jellyfin token, so marquee can
  act as them (their watch history, Seerr requests as their Seerr user). With
  `REDIS_URL` set, sessions (including those tokens) are written to Redis so
  they survive restarts. Keep Redis on a private network, ideally with a
  password.
- Sessions expire after 30 days unused and 180 days regardless, and are
  re-verified with Plex/Jellyfin daily. Signing out of a Jellyfin session
  also revokes its Jellyfin access token.

## What each viewer can see

- **Guests** (not signed in) get whitelisted fields only: titles are replaced
  with "Hidden Title", usernames with stable pseudonyms, and IDs that could be
  looked up elsewhere are replaced with opaque values. No IPs, device names,
  search, stats or map.
- **Members** (signed in, not the owner) see real titles, but every viewer IP
  is replaced with an opaque token (the live map still works: the server
  resolves tokens when geolocating), and file paths and email addresses are
  removed.
- **The owner** (the admin session, the Plex account that owns the server, or
  a Jellyfin administrator) sees everything.

## Browser hardening

- Every page is served with an enforced Content-Security-Policy: no inline
  scripts or inline event handlers, third-party code only from
  `cdn.jsdelivr.net` (version-pinned, with Subresource Integrity), and network
  access only to marquee itself plus the map tiles, Open Library and jsDelivr.
  A test (`test/csp.test.js`) fails the build if inline script creeps back in.
- Responses relayed from Plex, Jellyfin and the rest carry
  `Content-Security-Policy: sandbox` and `nosniff`, image routes only pass
  real images, and every upstream ID and path is validated before it's used.

## Webhooks

The Plex and Seerr webhook URLs contain a random secret, compared in constant
time; a wrong secret gets a 404. Anyone with the URL can only make marquee
refresh its own data, but treat it like a password anyway.

## Service credentials never reach the browser

The browser only ever calls same-origin `/api/<service>/*` paths; the
server attaches the real Plex token / Seerr API key / etc. before forwarding
upstream. The admin settings API follows the same rule in the other
direction: a credential field is only ever reported to the browser as
`{ "configured": true }`, never its actual value. The one exception is the
webhook URLs, which the admin page shows so you can paste them into Plex and
Seerr.

## Container hardening

- Runs as the non-root `node` user baked into the `node:22-alpine` base
  image (fixed uid/gid `1000`), not root.
- One npm dependency (`ioredis`, only loaded when `REDIS_URL` is set) and
  no native/compiled code, so nothing in the image needs a build toolchain.
- `/config` is the only writable volume; everything else is read-only
  application code.

## Operational recommendations

- **Run behind a reverse proxy that terminates TLS** (Traefik, Nginx Proxy
  Manager, Caddy, ...) if marquee is reachable from the internet, and set
  `TRUST_PROXY=true` when you do. Make sure the proxy sets `X-Real-IP` and
  overwrites any value the client sent.
- Back up `/config` — it holds your admin password hash, session secret, and
  every service credential you've entered through the UI.
- The live map is off by default. When on, only the network part of each
  viewer address (IPv4 /24, IPv6 /48) is sent to the geo-IP service, over
  HTTPS.
- Optional integrations (AudioBookShelf, Tautulli, TMDB) are exactly that —
  optional. Only configure what you actually use; there's no security or
  functional benefit to wiring up an integration you don't need.

## Reporting a vulnerability

If you find a security issue, please open a private security advisory on
GitHub rather than a public issue.
