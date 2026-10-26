// Fallback image loading for the Android app. If the WebView refuses to show a page image, the app's own
// network layer (Capacitor's native HTTP) can often fetch it. It also lets us report the real status code,
// size and X-Cache result to MangaDex, and gives the reader an honest reason to show when a page still fails.
const cap = () => (typeof window === 'undefined' ? undefined : window.Capacitor);

export function nativeHttpAvailable() {
  const c = cap();
  return Boolean(c?.isNativePlatform?.() && (c?.Plugins?.CapacitorHttp?.get || c?.nativePromise));
}

export function base64ToBlob(base64, type = 'image/jpeg') {
  const clean = String(base64 || '').replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

function headerValue(headers, name) {
  if (!headers || typeof headers !== 'object') return '';
  const key = Object.keys(headers).find(entry => entry.toLowerCase() === name);
  return key ? String(headers[key]) : '';
}

const IMAGE_TYPE = /^image\/(png|jpe?g|gif|webp|avif)$/i;

// Never throws. Resolves { ok, status, blob?, bytes, cached, duration, error? }.
export async function fetchImageNative(url, { timeoutMs = 25000 } = {}) {
  const started = performance.now();
  const c = cap();
  if (!nativeHttpAvailable()) return { ok: false, available: false, status: 0, error: 'unavailable', duration: 0 };
  const options = { url, responseType: 'blob', connectTimeout: timeoutMs, readTimeout: timeoutMs, headers: { Accept: 'image/*' } };
  try {
    const response = c.Plugins?.CapacitorHttp?.get
      ? await c.Plugins.CapacitorHttp.get(options)
      : await c.nativePromise('CapacitorHttp', 'get', options);
    const duration = performance.now() - started;
    const status = Number(response?.status) || 0;
    if (status < 200 || status >= 300) return { ok: false, available: true, status, error: 'http', duration };
    const type = headerValue(response.headers, 'content-type').split(';')[0].trim().toLowerCase();
    if (!IMAGE_TYPE.test(type)) return { ok: false, available: true, status, error: 'not-image', duration };
    const blob = base64ToBlob(response.data, type);
    if (!blob.size) return { ok: false, available: true, status, error: 'empty', duration };
    return { ok: true, available: true, status, blob, bytes: blob.size, cached: headerValue(response.headers, 'x-cache').toUpperCase().startsWith('HIT'), duration };
  } catch (error) {
    return { ok: false, available: true, status: 0, error: 'network', message: String(error?.message || error).slice(0, 120), duration: performance.now() - started };
  }
}

export function describeFailure(result, host = '') {
  const where = host ? ` (${host})` : '';
  if (result?.error === 'offline-copy') return 'This saved page could not be shown. Delete the download and save the chapter again.';
  if (!result || result.available === false) return `The image server${where} did not deliver this page.`;
  if (result.error === 'network') return `Could not connect to MangaDex's image server${where}. Your network may be blocking it, or you are offline.`;
  if (result.status === 403) return `MangaDex's image server${where} refused the request (403). The address may have expired.`;
  if (result.status === 404) return `MangaDex's image server${where} does not have this page (404).`;
  if (result.status === 429) return `MangaDex's image server${where} is rate-limiting requests (429). Wait a moment.`;
  if (result.status >= 500) return `MangaDex's image server${where} had an error (${result.status}).`;
  if (result.error === 'not-image' || result.error === 'empty') return `MangaDex's image server${where} sent something that is not an image.`;
  return `The page could not be loaded${where}.`;
}

export function shortDetails(result) {
  if (!result) return '';
  if (result.available === false) return 'app-network: unavailable';
  return `app-network: ${result.error === 'network' ? `error ${result.message || ''}`.trim() : `HTTP ${result.status || '?'}`}`;
}
