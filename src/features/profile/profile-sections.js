// What the Profile screen lists. `href` rows are live; planned rows come from the feature registry.
import { featuresFor } from '../feature-registry.js';

export const PROFILE_GROUPS = Object.freeze([
  {
    id: 'reading', title: 'Reading',
    rows: [
      { id: 'library', title: 'My library', description: 'Status, favourites and collections', icon: 'library', href: '#library' },
      { id: 'downloads', title: 'Downloads', description: 'Offline content and storage', icon: 'download', href: '#downloads' }
    ]
  },
  {
    id: 'accounts', title: 'Accounts',
    rows: [
      { id: 'anilist', title: 'AniList', description: 'Sign in and sync your manga list', icon: 'cloud', href: '#settings/account' }
    ]
  },
  {
    id: 'preferences', title: 'Preferences',
    rows: [
      { id: 'appearance', title: 'Appearance', description: 'Theme, motion and cover size', icon: 'palette', href: '#settings/appearance' },
      { id: 'content', title: 'Language and content', description: 'Chapter language and content safety', icon: 'globe', href: '#settings/content' },
      { id: 'backup', title: 'Backup and restore', description: 'Export or import your library', icon: 'database', href: '#settings/library' },
      { id: 'all-settings', title: 'All settings', description: 'Every category in one place', icon: 'sliders', href: '#settings' }
    ]
  }
]);

export function plannedProfileRows() {
  return featuresFor('profile').map(feature => ({ ...feature, planned: true }));
}
