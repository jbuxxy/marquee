const { configStore } = require('../config');

// Admin-managed list, stored the same way custom links are (see
// server/routes/libraryExclusions.js) — an arbitrary-length list has no
// sensible env-var override, so this bypasses the FIELDS/schema.js engine
// entirely and lives at a plain configStore path.
// Entry shape: { service: 'plex'|'jellyfin', id: string }
// - Plex: id is the library's sectionKey (matched against librarySectionID
//   on sessions/history entries, which carry the ID but not the title).
// - Jellyfin: id is the on-disk folder path from /Library/VirtualFolders
//   (matched as a prefix against each item's own Path) — Jellyfin sessions
//   and item listings carry a Path, not a stable library ID, for this.
function getExcludedLibraries() {
  return configStore.get('site.excludedLibraries', []);
}

function isPlexSectionExcluded(sectionKey) {
  if (sectionKey == null) return false;
  const excluded = getExcludedLibraries();
  return excluded.some((e) => e.service === 'plex' && String(e.id) === String(sectionKey));
}

function isJellyfinPathExcluded(itemPath) {
  if (!itemPath) return false;
  const excluded = getExcludedLibraries().filter((e) => e.service === 'jellyfin');
  return excluded.some((e) => itemPath.startsWith(e.id));
}

module.exports = { getExcludedLibraries, isPlexSectionExcluded, isJellyfinPathExcluded };
