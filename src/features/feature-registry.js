// Single list of features that are planned but not built yet.
// Add an entry here and it appears automatically in the "Planned" areas of the screens named in `screens`.
// When a feature ships, delete its entry (or change status to 'available' and give it a real UI).
export const FEATURES = Object.freeze([
  { id: 'account-sync', title: 'Cloud account', description: 'Sign in to keep your library on every device, without AniList.', icon: 'cloud', screens: ['profile'] },
  { id: 'creator-studio', title: 'Creator Studio', description: 'Apply to publish your own work and manage drafts.', icon: 'pen', screens: ['profile'] },
  { id: 'reading-goals', title: 'Reading goals', description: 'Set a weekly goal and track streaks from real reading time.', icon: 'target', screens: ['profile', 'home'] },
  { id: 'notifications', title: 'Notifications', description: 'Get told when a followed title has a new chapter.', icon: 'bell', screens: ['profile'] },
  { id: 'support-creators', title: 'Support creators', description: 'Optional donations to creators. Reading stays free.', icon: 'heart', screens: ['profile'] },
  { id: 'advanced-filters', title: 'Advanced filters', description: 'Filter by status, year, demographic and tags.', icon: 'sliders', screens: ['discover'] },
  { id: 'saved-searches', title: 'Saved searches', description: 'Keep your favourite searches one tap away.', icon: 'bookmark', screens: ['discover'] },
  { id: 'smart-collections', title: 'Smart collections', description: 'Collections that fill themselves from rules you set.', icon: 'layers', screens: ['library'] },
  { id: 'auto-download', title: 'Auto-download new chapters', description: 'Save new chapters of followed titles when you are on Wi-Fi.', icon: 'download', screens: ['downloads'] },
  { id: 'delete-after-reading', title: 'Delete after reading', description: 'Free space by removing a chapter once you finish it.', icon: 'trash', screens: ['downloads'] },
  { id: 'bulk-edit', title: 'Bulk edit', description: 'Change status or collection for many titles at once.', icon: 'check', screens: ['library'] },
]);

export function featuresFor(screen) {
  return FEATURES.filter(feature => feature.screens.includes(screen));
}
