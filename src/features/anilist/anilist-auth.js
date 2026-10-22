import {
  ANILIST_AUTH_URL, ANILIST_REDIRECT_HOST, ANILIST_REDIRECT_PROTOCOL, ANILIST_TOKEN_DEFAULT_TTL_SECONDS
} from './anilist-config.js';

export const isValidClientId = value => /^\d{1,9}$/.test(String(value || '').trim());

// Tokens are JWTs. We only check the shape; AniList validates it when we call Viewer.
export const looksLikeToken = value => typeof value === 'string' && /^[A-Za-z0-9._~+/=-]{40,4096}$/.test(value.trim());

export function buildAuthorizeUrl(clientId) {
  if (!isValidClientId(clientId)) throw new Error('Enter your AniList client ID first. It is a number.');
  const url = new URL(ANILIST_AUTH_URL);
  url.searchParams.set('client_id', String(clientId).trim());
  url.searchParams.set('response_type', 'token');
  return url.href;
}

// AniList returns the token in the URL fragment: tokyomangalab://anilist-auth#access_token=...&expires_in=...
export function parseAuthRedirect(urlString, now = Date.now()) {
  let url;
  try { url = new URL(String(urlString)); } catch { return { ok: false, reason: 'not-a-url' }; }
  if (url.protocol !== ANILIST_REDIRECT_PROTOCOL || url.hostname !== ANILIST_REDIRECT_HOST) return { ok: false, reason: 'not-ours' };
  const params = new URLSearchParams(url.hash.replace(/^#/, ''));
  const error = params.get('error') || new URLSearchParams(url.search).get('error');
  if (error) return { ok: false, reason: 'denied', message: params.get('error_description') || error };
  const accessToken = (params.get('access_token') || '').trim();
  if (!looksLikeToken(accessToken)) return { ok: false, reason: 'no-token' };
  const seconds = Number(params.get('expires_in'));
  const ttl = Number.isFinite(seconds) && seconds > 0 ? seconds : ANILIST_TOKEN_DEFAULT_TTL_SECONDS;
  return { ok: true, accessToken, expiresAt: now + ttl * 1000 };
}
