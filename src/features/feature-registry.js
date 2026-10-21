// Single list of features that are planned but not built yet.
// Add an entry here and it appears automatically in the "Planned" areas of the screens named in `screens`.
// When a feature ships, delete its entry (or change status to 'available' and give it a real UI).
export const FEATURES = Object.freeze([
  { id: 'account-sync', title: 'Account and sync', description: 'Sign in and keep your library on every device.', icon: 'cloud', screens: ['profile'] },
  { id: 'creator-studio', title: 'Creator Studio', description: 'Apply to publish your own work and manage drafts.', icon: 'pen', screens: ['profile'] },
  { id: 'reading-goals', title: 'Reading goals', description: 'Set a weekly goal and track streaks from real reading time.', icon: 'target', screens: ['profile', 'home'] },
  { id: 'notifications', title: 'Notifications', description: 'Get told when a followed title has a new chapter.', icon: 'bell', screens: ['profile'] },
  { id: 'support-creators', title: 'Support creators', description: 'Optional donations to creators. Reading stays free.', icon: 'heart', screens: ['profile'] },
  { id: 'advanced-filters', title: 'Advanced filters', description: 'Filter by status, year, demographic and tags.', icon: 'sliders', screens: ['discover'] },
  { id: 'saved-searches', title: 'Saved searches', description: 'Keep your favourite searches one tap away.', icon: 'bookmark', screens: ['discover'] },
  { id: 'smart-collections', title: 'Smart collections', description: 'Collections that fill themselves from rules you set.', icon: 'layers', screens: ['library'] },
  { id: 'bulk-edit', title: 'Bulk edit', description: 'Change status or collection for many titles at once.', icon: 'check', screens: ['library'] },
  { id: 'offline-chapters', title: 'Offline chapters', description: 'Download chapters where the source allows it.', icon: 'download', screens: ['downloads'] },
  { id: 'storage-manager', title: 'Storage manager', description: 'See what uses space and clear it safely.', icon: 'database', screens: ['downloads'] },
  { id: 'wifi-only', title: 'Wi-Fi only downloads', description: 'Save mobile data by downloading on Wi-Fi.', icon: 'wifi', screens: ['downloads'] }
]);

export function featuresFor(screen) {
  return FEATURES.filter(feature => feature.screens.includes(screen));
}
