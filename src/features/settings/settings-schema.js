// Settings are described as data: category (class) > sub-category (group) > item.
//
// Item types
//   toggle   - on/off, saved under `key`
//   select   - one of `options`, saved under `key`
//   action   - a button; `action` is a data-action name handled in app.js
//   link     - opens an https URL in a new tab
//   text     - short text, saved under `key` (use `inputMode` and `placeholder`)
//   info     - read-only value (`value`, or `valueFrom` for a live value computed in app.js)
//   planned  - not built yet; shown dimmed with a "Planned" badge
//
// Any item may carry `when`: 'anilistConnected' or 'anilistDisconnected' to show it only in that state.
//
// To add a setting: add the key to DEFAULT_SETTINGS in settings-service.js, then add an item here.
import { APP_NAME, APP_VERSION, MANGADEX_URL, REPO_URL } from '../../shared/app-info.js';
import { API_BASE_URL } from '../../services/api-client.js';

export const CHAPTER_LANGUAGES = Object.freeze([
  ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['pt', 'Portuguese'], ['it', 'Italian'],
  ['id', 'Indonesian'], ['ru', 'Russian'], ['tr', 'Turkish'], ['pl', 'Polish'], ['vi', 'Vietnamese'], ['th', 'Thai'],
  ['ar', 'Arabic'], ['hi', 'Hindi'], ['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese']
]);

export const SETTINGS_CATEGORIES = Object.freeze([
  {
    id: 'appearance', title: 'Appearance', icon: 'palette', summary: 'Theme, motion and cover size',
    groups: [
      { id: 'theme', title: 'Theme', items: [
        { type: 'select', key: 'theme', title: 'Colour theme', description: 'Sakura Night is the default. Midnight Blue uses cooler accents.', options: [['sakura', 'Sakura Night'], ['midnight', 'Midnight Blue']] },
        { type: 'planned', id: 'accent-colour', title: 'Accent colour', description: 'Pick your own accent.' },
        { type: 'planned', id: 'pure-black', title: 'Pure black mode', description: 'True black backgrounds for AMOLED screens.' }
      ] },
      { id: 'display', title: 'Display', items: [
        { type: 'select', key: 'coverSize', title: 'Cover size', description: 'Comfortable shows two covers per row on a phone. Compact shows three.', options: [['comfortable', 'Comfortable'], ['compact', 'Compact']] },
        { type: 'toggle', key: 'reducedMotion', title: 'Reduce motion', description: 'Turn off animations and transitions.' },
        { type: 'planned', id: 'text-size', title: 'Text size', description: 'Make text larger or smaller across the app.' }
      ] }
    ]
  },
  {
    id: 'library', title: 'Library', icon: 'library', summary: 'Sorting, collections and backup',
    groups: [
      { id: 'shelf', title: 'Shelf', items: [
        { type: 'select', key: 'defaultLibrarySort', title: 'Sort library by', description: 'How titles are ordered when you open your library.', options: [['recently-updated', 'Recently updated'], ['recently-added', 'Recently added'], ['title', 'Title (A to Z)']] }
      ] },
      { id: 'collections', title: 'Collections', items: [
        { type: 'planned', id: 'smart-collections', title: 'Smart collections', description: 'Collections that fill themselves from rules.' },
        { type: 'planned', id: 'manage-collections', title: 'Manage collections', description: 'Rename, reorder and delete collections.' }
      ] },
      { id: 'backup', title: 'Backup and restore', items: [
        { type: 'action', action: 'export-backup', title: 'Export backup', description: 'Save your library, collections and settings as a JSON file.', button: 'Export' },
        { type: 'action', action: 'import-backup', title: 'Import backup', description: 'Merge a backup file into this device. Downloaded files are not part of a backup.', button: 'Import' }
      ] }
    ]
  },
  {
    id: 'reading', title: 'Reading', icon: 'bookOpen', summary: 'Reader, progress and downloads',
    groups: [
      { id: 'reader', title: 'Reader', items: [
        { type: 'select', key: 'readerMode', title: 'Reading mode', description: 'Vertical scroll suits webtoons. Right to left suits manga. You can also change it inside the reader.', options: [['scroll', 'Vertical scroll'], ['rtl', 'Right to left'], ['ltr', 'Left to right']] },
        { type: 'select', key: 'readerFit', title: 'Page fit', description: 'Applies to the page-by-page modes.', options: [['width', 'Fit width'], ['height', 'Fit height']] },
        { type: 'select', key: 'readerQuality', title: 'Image quality', description: 'Data saver uses smaller, compressed pages. Handy on mobile data.', options: [['data', 'Original quality'], ['data-saver', 'Data saver']] },
        { type: 'planned', id: 'keep-awake', title: 'Keep screen on', description: 'Stop the screen sleeping while you read.' }
      ] },
      { id: 'progress', title: 'Progress', items: [
        { type: 'info', title: 'Resume where you left off', value: 'Automatic', description: 'The reader reopens a chapter at the page you stopped on. Finished chapters reopen at page one.' },
        { type: 'planned', id: 'reading-goals', title: 'Reading goals', description: 'Weekly goals and streaks.' }
      ] },
      { id: 'downloads', title: 'Downloads', items: [
        { type: 'planned', id: 'wifi-only', title: 'Download on Wi-Fi only', description: 'Save mobile data.' },
        { type: 'planned', id: 'storage-limit', title: 'Storage limit', description: 'Cap how much space downloads can use.' }
      ] }
    ]
  },
  {
    id: 'content', title: 'Language and content', icon: 'globe', summary: 'Chapter language and content safety',
    groups: [
      { id: 'language', title: 'Language', items: [
        { type: 'select', key: 'preferredLanguage', title: 'Chapter language', description: 'The language chapter lists open in. You can still change it per title.', options: CHAPTER_LANGUAGES }
      ] },
      { id: 'safety', title: 'Content safety', items: [
        { type: 'toggle', key: 'adultContentEnabled', title: 'Adult-content preference', description: 'Off by default and only available in the Android app. This is a preference on this device, not age verification. It adds MangaDex titles rated erotica or pornographic.' },
        { type: 'info', title: 'Catalogue ratings', valueFrom: 'ratings', description: 'Titles tagged loli or shota are never shown, whatever this setting says.' }
      ] }
    ]
  },
  {
    id: 'sources', title: 'Sources and connection', icon: 'plug', summary: 'Catalogue sources and API status',
    groups: [
      { id: 'catalogue', title: 'Catalogue', items: [
        { type: 'toggle', key: 'enableOnlineSearch', title: 'Online catalogue search', description: 'Allow requests to MangaDex through the catalogue API. Your library still works when this is off.' },
        { type: 'info', title: 'Active source', value: 'MangaDex' },
        { type: 'planned', id: 'more-sources', title: 'More sources', description: 'Additional sources, added one at a time after review.' }
      ] },
      { id: 'connection', title: 'Connection', items: [
        { type: 'info', title: 'API address', value: API_BASE_URL },
        { type: 'action', action: 'check-api', title: 'Test connection', description: 'Check that the catalogue API is reachable.', button: 'Test', resultId: 'apiTestResult' }
      ] }
    ]
  },
  {
    id: 'privacy', title: 'Privacy and data', icon: 'shield', summary: 'What is stored and where',
    groups: [
      { id: 'storage', title: 'On this device', items: [
        { type: 'info', title: 'Where your data lives', value: 'This device only', description: 'Library, progress and settings are stored locally. There are no accounts and no cloud sync in this build.' },
        { type: 'planned', id: 'storage-usage', title: 'Storage usage', description: 'See how much space the app uses.' },
        { type: 'planned', id: 'clear-cache', title: 'Clear cached covers', description: 'Free space without touching your library.' }
      ] }
    ]
  },
  {
    id: 'account', title: 'Account and sync', icon: 'cloud', summary: 'AniList sync and future accounts',
    groups: [
      { id: 'anilist', title: 'AniList', items: [
        { type: 'info', title: 'Account', valueFrom: 'anilistStatus' },
        { type: 'text', key: 'anilistClientId', title: 'AniList client ID', description: 'Create a free app at anilist.co/settings/developer and set its redirect URL to tokyomangalab://anilist-auth. Then paste the app ID (a number) here.', inputMode: 'numeric', placeholder: 'Number', when: 'anilistDisconnected' },
        { type: 'action', action: 'anilist-connect', title: 'Sign in with AniList', description: 'Opens AniList. Approve access and you return to this app.', button: 'Sign in', when: 'anilistDisconnected' },
        { type: 'action', action: 'anilist-paste-token', title: 'Paste a token instead', description: 'Use this if the sign-in does not return to the app.', button: 'Paste', when: 'anilistDisconnected' },
        { type: 'toggle', key: 'anilistPushEnabled', title: 'Send changes to AniList', description: 'When on, status changes you make here are also saved on AniList. Sync never deletes anything on either side.', when: 'anilistConnected' },
        { type: 'action', action: 'anilist-sync', title: 'Sync now', description: 'Bring your AniList manga list in, and send your changes back when that is on.', button: 'Sync', resultId: 'anilistResult', when: 'anilistConnected' },
        { type: 'info', title: 'Last sync', valueFrom: 'anilistLastSync', when: 'anilistConnected' },
        { type: 'action', action: 'anilist-disconnect', title: 'Sign out', description: 'Removes the sign-in from this device. To revoke access completely, remove the app at anilist.co/settings/apps.', button: 'Sign out', danger: true, when: 'anilistConnected' }
      ] },
      { id: 'tokyo-account', title: 'Tokyo Manga Lab account', items: [
        { type: 'planned', id: 'sign-in', title: 'Sign in', description: 'Create an account to sync without AniList and to apply as a creator.' },
        { type: 'planned', id: 'profile-details', title: 'Profile details', description: 'Name, avatar and bio.' }
      ] },
      { id: 'sync', title: 'Cloud sync', items: [
        { type: 'planned', id: 'cloud-sync', title: 'Cloud sync', description: 'Keep library and progress identical on every device.' }
      ] }
    ]
  },
  {
    id: 'notifications', title: 'Notifications', icon: 'bell', summary: 'Chapter alerts and reminders', planned: true,
    groups: [
      { id: 'alerts', title: 'Alerts', items: [
        { type: 'planned', id: 'new-chapters', title: 'New chapters', description: 'Tell me when a followed title updates.' },
        { type: 'planned', id: 'reminders', title: 'Reading reminders', description: 'A gentle nudge at a time you choose.' }
      ] }
    ]
  },
  {
    id: 'about', title: 'About', icon: 'info', summary: 'Version, credits and links',
    groups: [
      { id: 'app', title: 'App', items: [
        { type: 'info', title: 'Version', value: `${APP_NAME} ${APP_VERSION}` },
        { type: 'info', title: 'Made by', value: 'Hariharasuthan Karunakaran', description: 'Tokyo Brotherhood' }
      ] },
      { id: 'links', title: 'Links', items: [
        { type: 'link', title: 'Source code', href: REPO_URL, description: 'View the project on GitHub.' },
        { type: 'link', title: 'MangaDex', href: MANGADEX_URL, description: 'Catalogue data and covers come from MangaDex.' }
      ] }
    ]
  }
]);

export function findCategory(id) {
  return SETTINGS_CATEGORIES.find(category => category.id === id) || null;
}

export const SETTING_CONDITIONS = Object.freeze(['anilistConnected', 'anilistDisconnected']);
export const DYNAMIC_VALUES = Object.freeze(['anilistStatus', 'anilistLastSync', 'ratings']);

export function allSettingKeys() {
  const keys = [];
  for (const category of SETTINGS_CATEGORIES) for (const group of category.groups) for (const item of group.items) if (item.key) keys.push(item.key);
  return keys;
}
