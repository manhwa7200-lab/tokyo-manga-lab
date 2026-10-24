import { isValidClientId } from './anilist-auth.js';

// Which AniList client ID to use. A number the person typed in Settings (advanced) wins; otherwise the one built
// into the app, so signing in is one tap. Client IDs are public numbers, not secrets.
export function resolveClientId({ saved = '', builtIn = '' } = {}) {
  const own = String(saved || '').trim();
  if (isValidClientId(own)) return own;
  const shipped = String(builtIn || '').trim();
  return isValidClientId(shipped) ? shipped : '';
}

// What the sign-in button can do right now. Signing in is always optional; this only explains why a tap would not work.
//   ready      one tap opens AniList (Android app with a client ID)
//   needs-app  one-tap return needs the Android app; a browser can still paste a token
//   needs-id   this build has no AniList client ID yet; the person can add their own in Settings
export function loginAvailability({ native, clientId }) {
  if (!native) return { state: 'needs-app', message: 'One-tap sign-in works in the Android app. In a browser, paste an AniList token from Settings.' };
  if (!clientId) return { state: 'needs-id', message: 'This build has no AniList app ID built in yet. You can add your own in Settings, under Account and sync.' };
  return { state: 'ready', message: '' };
}

export const ANILIST_REGISTER_URL = 'https://anilist.co/signup';
export const ANILIST_APPS_URL = 'https://anilist.co/settings/apps';
