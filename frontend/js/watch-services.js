// Shared helper so every "watch" feature (now-playing ticker, waveform,
// search, carousel, casting) derives its working set from actual config
// instead of each hardcoding its own {plex, jellyfin, abs} triple.
const WATCH_SERVICE_META = {
  plex: { label: 'Plex', color: '#e5a00d', rgb: '229,160,13' },
  jellyfin: { label: 'Jellyfin', color: '#29abe2', rgb: '41,171,226' },
  abs: { label: 'AudioBookShelf', color: '#cb86ff', rgb: '203,134,255' },
};
const MUSIC_RGB = '131,192,42';
const AUDIOBOOK_RGB = '203,134,255';

// Content type wins over platform for the "accent" color (icon glow, progress
// sliver, waveform thread) EXCEPT Plex, which always stays Plex-gold even for
// a music entry — the platform label itself always shows its own identity
// color regardless (see WATCH_SERVICE_META[svcId].color), so you still know
// which platform it's on either way.
function streamAccentRGB(svcId, mediaType) {
  if (mediaType === 'audiobook') return AUDIOBOOK_RGB;
  if (mediaType === 'music' && svcId !== 'plex') return MUSIC_RGB;
  return WATCH_SERVICE_META[svcId]?.rgb || '41,171,226';
}

// Returns configured watch services in a stable order, each with label/color
// (for waveform threads, badges, etc) and publicUrl (for external links) —
// entries for services that aren't configured/enabled are simply absent,
// never present-but-disabled.
function enabledWatchServices(config) {
  return Object.keys(WATCH_SERVICE_META)
    .filter((key) => config?.services?.[key]?.enabled)
    .map((key) => ({
      key,
      ...WATCH_SERVICE_META[key],
      publicUrl: config.services[key].publicUrl || null,
    }));
}

// Resolves which of Plex/Jellyfin should back a single-answer feature
// (Seerr "available" deep-link matching, Recently Added categories that only
// make sense from one backend). If only one is configured, use it. If both,
// use the admin's explicit preference (default "plex" if never set, to match
// prior single-server behavior). Returns null only if neither is configured
// (shouldn't happen — the group is required).
function resolvePreferredServer(config) {
  const plexOn = !!config?.services?.plex?.enabled;
  const jellyfinOn = !!config?.services?.jellyfin?.enabled;
  if (plexOn && !jellyfinOn) return 'plex';
  if (jellyfinOn && !plexOn) return 'jellyfin';
  if (plexOn && jellyfinOn) return config.preferredMediaServer || 'plex';
  return null;
}

// Stats/heatmap come from Tautulli (Plex) or Jellystat (Jellyfin) —
// whichever tracker belongs to the resolved preferred/primary media server
// wins when both are configured, rather than picking Tautulli unconditionally.
function resolveStatsBackend(config) {
  const tautulliOn = !!config?.services?.tautulli?.enabled;
  const jellystatOn = !!config?.services?.jellystat?.enabled;
  if (tautulliOn && !jellystatOn) return 'tautulli';
  if (jellystatOn && !tautulliOn) return 'jellystat';
  if (tautulliOn && jellystatOn) return resolvePreferredServer(config) === 'jellyfin' ? 'jellystat' : 'tautulli';
  return null;
}
