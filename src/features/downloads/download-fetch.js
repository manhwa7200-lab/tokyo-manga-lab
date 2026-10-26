// Fetches one page image for a download and returns { ok, blob?, status, bytes, cached, duration, error? }. Never throws.
// In the Android app the app's own network layer is used (no browser cross-origin rules). In a browser, a normal
// anonymous fetch is used: no cookies, no sign-in headers (MangaDex rejects image requests that carry them).
import { fetchImageNative, nativeHttpAvailable } from '../reader/reader-native.js';

const IMAGE_TYPE = /^image\/(png|jpe?g|gif|webp|avif)$/i;

export async function fetchImageBlob(url, { signal, timeoutMs = 25000 } = {}) {
  const started = performance.now();
  if (nativeHttpAvailable()) return fetchImageNative(url, { timeoutMs });
  const timer = new AbortController();
  const timeout = setTimeout(() => timer.abort(), timeoutMs);
  const onAbort = () => timer.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetch(url, { signal: timer.signal, credentials: 'omit', referrerPolicy: 'no-referrer', mode: 'cors', headers: { Accept: 'image/*' } });
    const duration = performance.now() - started;
    if (!response.ok) return { ok: false, available: true, status: response.status, error: 'http', duration };
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!IMAGE_TYPE.test(type)) return { ok: false, available: true, status: response.status, error: 'not-image', duration };
    const blob = await response.blob();
    if (!blob.size) return { ok: false, available: true, status: response.status, error: 'empty', duration };
    return { ok: true, available: true, status: response.status, blob, bytes: blob.size, cached: (response.headers.get('x-cache') || '').toUpperCase().startsWith('HIT'), duration: performance.now() - started };
  } catch (error) {
    if (signal?.aborted) return { ok: false, available: true, status: 0, error: 'aborted', duration: performance.now() - started };
    return { ok: false, available: true, status: 0, error: 'network', message: String(error?.message || error).slice(0, 120), duration: performance.now() - started };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

// Wi-Fi only needs to know if the connection is metered. Chrome's WebView exposes navigator.connection; when it does
// not, the answer is "not metered" (the setting is then a best effort, and Settings says so).
export function connectionInfo(nav = typeof navigator === 'undefined' ? {} : navigator) {
  const connection = nav.connection || nav.mozConnection || nav.webkitConnection || null;
  const online = nav.onLine !== false;
  const metered = Boolean(connection && (connection.type === 'cellular' || connection.saveData === true));
  return { online, metered, known: Boolean(connection && connection.type) };
}
