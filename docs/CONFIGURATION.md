# Configuration reference

Every setting can come from an environment variable **or** the admin settings
UI at `/admin`. When an environment variable is set, it wins and the admin UI
shows that field as read-only ("managed by environment"); otherwise it's
editable there and persisted to `/config/settings.json`.

## Required before the dashboard unlocks

| Setting | Env var | Notes |
|---|---|---|
| Seerr URL | `SEERR_URL` | Overseerr or Jellyseerr base URL |
| Seerr API key | `SEERR_KEY` | Found in Seerr's Settings → General |
| Plex URL | `PLEX_URL` | At least one of Plex or Jellyfin is required |
| Plex token | `PLEX_TOKEN` | See Plex's docs for "Finding an authentication token" |
| Jellyfin URL | `JELLYFIN_URL` | At least one of Plex or Jellyfin is required |
| Jellyfin API key | `JELLYFIN_KEY` | Created under Jellyfin's Dashboard → API Keys |

Until Seerr and at least one media server are configured — by env var or by
finishing the setup wizard at `/setup` — every visit to `/` redirects to the
wizard instead of showing a dashboard with nothing on it.

## Optional integrations

| Setting | Env var | Notes |
|---|---|---|
| AudioBookShelf URL / key | `ABS_URL` / `ABS_KEY` | Adds an ABS watch-card, search, Recently Added (audiobooks), and now-playing support |
| Tautulli URL / key | `TAUTULLI_URL` / `TAUTULLI_KEY` | Activity insights + heatmap, sourced from Plex playback history |
| Jellystat URL / key | `JELLYSTAT_URL` / `JELLYSTAT_KEY` | Same activity insights + heatmap, sourced from Jellyfin playback history — Tautulli's counterpart for Jellyfin. If both Tautulli and Jellystat are configured, whichever tracks the preferred/primary media server (below) wins. |
| TMDB read access token | `TMDB_READ_TOKEN` | Enriches now-playing/search detail with posters, ratings, overviews |
| Trakt client ID | `TRAKT_CLIENT_ID` | Enriches the "Coming Soon" digital-release-dates strip (see below) — optional even when that feature is on |
| ReadMeABook URL / token | `RMAB_URL` / `RMAB_API_TOKEN` | Audiobook recommendations: same-author picks from AudioBookShelf listening history, looked up in ReadMeABook. Needs ABS too. |

These are entirely optional. Leaving them unset simply hides the
corresponding card/feature — nothing else breaks.

## Visitor sign-in (Plex / Jellyfin)

Visitors can sign in with the Plex or Jellyfin account they already use for
your server. The "Sign in" button only offers the provider(s) you configured.

- **Plex:** standard Plex sign-in (a PIN flow in a pop-up). The account must
  own or have been shared your server; any other plex.tv account is refused.
- **Jellyfin:** username and password for an account on your Jellyfin server.

What a visitor sees depends on their tier:

| Tier | Who | Sees |
|---|---|---|
| Guest | Not signed in | Activity with titles hidden, anonymous names; no search, stats, map, or requests |
| Member | Signed in | Real titles, search, stats, map, recommendations, and requests made **as their own Seerr user**. Viewers' IP addresses are replaced with opaque tokens, and file paths and email addresses are removed |
| Owner | The `/admin` session, the Plex account that owns the server, or a Jellyfin administrator | Everything, unredacted |

Requests go through Seerr as the visitor's own Seerr user, so Seerr's own
permissions, quotas and auto-approve rules apply. A visitor whose account was
never imported into Seerr gets a message asking them to contact you.

Sessions last 30 days from last use (180 days at most) and are re-checked
against Plex/Jellyfin daily, so revoking someone's access there signs them
out here too.

| Setting | Env var | Notes |
|---|---|---|
| Redis URL / password | `REDIS_URL` / `REDIS_PASSWORD` | Optional. Keeps visitor sign-ins across restarts (otherwise they're in memory only). See the commented `redis` service in `docker-compose.yml` |
| Plex client identifier | `PLEX_CLIENT_IDENTIFIER` | Optional. Generated and saved on first use |
| Visitor session secret | `VISITOR_SESSION_SECRET` | Auto-generated and persisted to `/config/visitor-session-secret` if unset |

## Live updates (webhooks)

Now-playing updates reach browsers instantly over a server-sent event stream.
Jellyfin needs nothing extra (marquee polls it every few seconds while anyone
has the page open). For Plex and Seerr, paste the webhook URLs shown in
`/admin` into each app:

- **Plex:** Settings → Webhooks → add `https://<your marquee>/api/webhooks/plex/<secret>`
  (Plex Pass required; without it marquee still refreshes every 30 seconds).
- **Seerr:** Settings → Notifications → Webhook → `https://<your marquee>/api/webhooks/seerr/<secret>`.

The secret in each URL is generated on first boot. Treat the URLs like
passwords.

## Library exclusions

Set from `/admin` → Media server. Hide whole Plex or Jellyfin libraries (home
videos, for example) from now playing, Recently Added and recommendations.
Search is deliberately left alone, so signed-in visitors can still find
anything they have access to.

## Preferred media server

Only meaningful once **both** Plex and Jellyfin are configured — otherwise
whichever one you have is used automatically. Set from `/admin` → Media
server. Controls which server wins for features that need a single answer:
matching a "available" Seerr request to a real item, Recently Added
categories, and which activity tracker (Tautulli vs Jellystat) is used when
both are configured.

There's no env var for this — it's admin-settings only, since it only
matters after both servers are already set up.

## Live map & privacy

Off by default. Set from `/admin` → Map & privacy.

| Setting | Env var | Notes |
|---|---|---|
| Enable live map | `ENABLE_GEO_MAP` | `true`/`false`. Looks up approximate viewer locations over HTTPS with ipwho.is (GeoJS as fallback). Only the network part of each address is sent (IPv4 /24, IPv6 /48), never a full IP; results are cached for a day. Opt-in, independent of whether a home location is set. |
| Home latitude | `HOME_LAT` | Optional, even with the map enabled |
| Home longitude | `HOME_LON` | Optional, even with the map enabled |
| Home city (label only) | `HOME_CITY` | Optional, cosmetic |

If no home location is set, the live map simply plots remote/client stream
locations with no home marker or arcs — it still works, just without that
one enrichment. The activity heatmap's "Geo Map" tab is also gated on this
same toggle.

## Digital release dates ("Coming Soon")

Off by default. Set from `/admin` → Digital release dates
(`ENABLE_DIGITAL_RELEASE_DATES` env var). Adds a "Coming Soon" strip of
upcoming digital releases for your pending Seerr requests, sourced from
BingeBase (no credentials needed) and optionally cross-checked against Trakt
(`TRAKT_CLIENT_ID` above) for more accurate dates.

Each item's date is chosen in this order: a confirmed digital/physical date
(shown up to 60 days ahead), otherwise an estimate of theatrical release + 90
days (shown once the film is in theatres), otherwise "Requested".

## Display & privacy toggles

Set from `/admin` → Display.

| Setting | Env var | Values | Notes |
|---|---|---|---|
| Anonymize usernames | `ANONYMIZE_USERS` | `optional` (default) / `always` / `never` | `optional` masks usernames by default but lets each visitor's browser turn it off for themselves; `always`/`never` force the behavior and hide the toggle entirely |
| Enable seasonal effects | `ENABLE_SEASONAL_EFFECTS` | `true` (default) / `false` | Calendar-driven holiday flair, with a manual override to a specific holiday or off |
| Enable extra themes | `ENABLE_EXTRA_THEMES` | `true` (default) / `false` | When off, the theme picker only offers dark/light regardless of the full 15-theme list |

## Custom links

Not an env var — set from `/admin` → Extra links. Add your own cards
(rendered in the dashboard's services grid) or bookmark links (rendered in
the footer) for anything marquee doesn't have a built-in integration for.
Each entry is a label, URL, a placement (card or bookmark), and an icon +
hex color chosen from the admin's MDI (Material Design Icons) picker or
typed in manually. Card-placement links require both an icon and a color;
bookmark links leave them optional.

## Guides

Not an env var — set from `/admin` → Extra links → Guides. Upload your own
PDF guides (streaming setup instructions, audio app walkthroughs, etc.) and
they render as a row of pills below the services grid, each linking to its
uploaded file. Absent entirely with no guides configured. A separate,
optional "Need access?" contact card can be shown alongside them by setting
a contact message — leave it blank to hide that card.

## Public-facing links

Each media/request service has a separate, optional "public URL" used only
for the card's "Open" link (e.g. `https://plex.example.com`), independent of
the internal URL marquee uses to talk to it server-side (e.g.
`http://192.168.1.20:32400`). If unset, the card just won't show an "Open"
link.

| Setting | Env var |
|---|---|
| Seerr public URL | `SEERR_PUBLIC_URL` |
| Plex public URL | `PLEX_PUBLIC_URL` |
| Jellyfin public URL | `JELLYFIN_PUBLIC_URL` |
| AudioBookShelf public URL | `ABS_PUBLIC_URL` |

## Branding

Set a custom site name, logo, and favicon via env var or the admin UI
(`/admin` → Branding, accepts PNG/JPG/SVG for the logo and ICO/PNG for the
favicon, 2MB max). Leave everything unset to use the shipped generic
defaults.

The logo additionally supports independently-optional light/dark variants:
upload just a dark-theme variant, just a light one, both, or neither — any
variant left unset falls back to the single base logo, which itself falls
back to the shipped default.

| Setting | Env var |
|---|---|
| Site name | `SITE_NAME` |
| Tagline (under the logo) | admin UI only |
| Theme | `THEME` — any of the 15 theme ids (`dark`, `light`, `cyberpunk`, `synthwave`, `nord`, `dracula`, `solarized`, `matrix`, `abyss`, `galaxy`, `frost`, `volcanic`, `royal`, `retrocrt`, `autumn`) |

## Admin access & security

| Setting | Env var | Notes |
|---|---|---|
| Admin password | `ADMIN_PASSWORD` | Hashed on first boot; if unset, marquee generates one and prints it once to `docker logs` |
| Admin password hash | `ADMIN_PASSWORD_HASH` | Advanced: bring your own `scrypt$...` hash instead |
| Session signing secret | `SESSION_SECRET` | Auto-generated and persisted to `/config/session-secret` if unset |
| Trust reverse proxy | `TRUST_PROXY` | Set to `true` only behind a reverse proxy that sets `X-Forwarded-Proto` and `X-Real-IP`. Over HTTPS, cookies then get the `Secure` flag and `__Host-` prefix, and login rate limits use the visitor's real IP instead of the proxy's |

See [SECURITY.md](SECURITY.md) for the reasoning behind these defaults.

## Networking

| Setting | Env var | Default |
|---|---|---|
| Port the server listens on | `PORT` | `8080` |
| Config/data directory | `MARQUEE_CONFIG_DIR` | `/config` |

## Persisted state layout

Everything writable lives under the `/config` volume:

```
/config/settings.json     # branding, service credentials, admin password hash,
                           # custom links, and every toggle above
/config/session-secret     # auto-generated admin session signing key
/config/visitor-session-secret  # auto-generated visitor session signing key
/config/branding/          # uploaded logo/favicon (+ light/dark variants), if any
```

Back this volume up if you want to preserve settings across a full
reinstall — it's the only stateful part of the container.
