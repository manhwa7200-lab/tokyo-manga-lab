import { isNativeApp } from '../features/anilist/anilist-native.js';

export const API_BASE_URL = 'https://tokyo-manga-lab-api2.haribp720.workers.dev';
const REQUEST_TIMEOUT_MS = 12000;

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'API_ERROR', requestId = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

// Adult ratings are requested only from the Android app and only while the preference is on.
// The public web build can never ask for them, and the Worker refuses browser origins as well.
let adultAllowed = false;
export function configureAdult(enabled) { adultAllowed = Boolean(enabled) && isNativeApp(); }
export const adultActive = () => adultAllowed;

async function getJson(path, params = {}, { signal } = {}) {
  const url = new URL(path.replace(/^\//, ''), `${API_BASE_URL}/`);
  if (adultAllowed && !path.includes('health') && !path.includes('sources')) url.searchParams.set('adult', '1');
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).length) url.searchParams.set(key, String(value));
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', abortFromCaller, { once: true });
  }
  try {
    const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, signal: controller.signal, cache: 'no-store' });
    let payload = null;
    try { payload = await response.json(); }
    catch {
      // An error page that is not JSON (for example a gateway error) still gets the normal friendly message below.
      if (response.ok) throw new ApiError('The catalogue returned an unreadable response.', { status: response.status, code: 'INVALID_JSON' });
    }
    if (!response.ok) {
      const code = response.status === 429 ? 'RATE_LIMITED' : response.status >= 500 ? 'UPSTREAM_UNAVAILABLE' : 'REQUEST_FAILED';
      const message = response.status === 429
        ? 'The catalogue is rate-limiting requests. Please wait a moment and retry.'
        : response.status >= 500
          ? 'The manga catalogue is temporarily unavailable. Try again shortly.'
          : (typeof payload?.error === 'string' ? payload.error : payload?.error?.message || `Request failed with HTTP ${response.status}.`);
      throw new ApiError(message, { status: response.status, code: typeof payload?.error?.code === 'string' ? payload.error.code : code });
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === 'AbortError') throw new ApiError('The catalogue took too long to respond. Please retry.', { code: 'TIMEOUT' });
    throw new ApiError('Could not connect to the manga catalogue. Check your connection and try again.', { code: 'NETWORK_ERROR' });
  } finally {
    if (signal) signal.removeEventListener('abort', abortFromCaller);
    window.clearTimeout(timeout);
  }
}

export const apiClient = {
  health: () => getJson('health'),
  // Keep search on the proven legacy route until the versioned endpoints are deployed.
  mangaSearch: ({ query = '', page = 1, signal } = {}) => getJson('manga', { q: String(query).trim().slice(0, 100), page: Math.max(1, Math.min(20, Number(page) || 1)) }, { signal }),
  mangaDetails: (externalId, { signal } = {}) => getJson(`api/v1/manga/${encodeURIComponent(String(externalId || ''))}`, {}, { signal }),
  mangaChapters: (externalId, { page = 1, language = 'en', limit, signal } = {}) => getJson(`api/v1/manga/${encodeURIComponent(String(externalId || ''))}/chapters`, { page: Math.max(1, Math.min(1000, Number(page) || 1)), language, limit: limit ? Math.max(1, Math.min(100, Number(limit) || 24)) : undefined }, { signal }),
  chapterPages: (chapterId, { signal } = {}) => getJson(`api/v1/chapters/${encodeURIComponent(String(chapterId || ''))}/pages`, {}, { signal }),
  sources: ({ signal } = {}) => getJson('api/v1/sources', {}, { signal })
};
