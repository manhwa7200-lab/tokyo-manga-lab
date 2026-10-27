// Pure helpers for importing a backup without overwriting newer local data.

export const BACKUP_STORES = Object.freeze([
  'contentItems', 'sourceEntries', 'libraryEntries', 'collections', 'collectionItems', 'readingProgress', 'chapterProgress',
  'bookmarks', 'localFiles', 'appSettings', 'sourceSettings', 'readingSessions', 'readingHistory', 'activityEvents', 'syncLinks'
]);

// `accountLinks` (the AniList sign-in token) is deliberately not part of a backup.
const KEY_PATHS = { appSettings: 'key', sourceSettings: 'sourceId' };
export const keyPathFor = store => KEY_PATHS[store] || 'id';

const timeOf = row => {
  const value = row?.updatedAt ?? row?.syncedAt ?? null;
  if (value == null) return null;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

// Returns the rows to write: new rows, and rows at least as new as the copy already on this device.
// A row without a usable timestamp (on either side) is written, as before. `skipped` counts what was kept local.
export function rowsToImport(store, incoming, existing) {
  const key = keyPathFor(store);
  const current = new Map(existing.map(row => [row?.[key], row]));
  const write = [];
  let skipped = 0;
  for (const row of incoming) {
    if (!row || typeof row !== 'object' || row[key] == null) { skipped += 1; continue; }
    const have = current.get(row[key]);
    const mine = timeOf(have);
    const theirs = timeOf(row);
    if (have && mine !== null && theirs !== null && mine > theirs) { skipped += 1; continue; }
    write.push(row);
  }
  return { write, skipped };
}
