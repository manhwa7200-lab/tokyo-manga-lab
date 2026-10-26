// Pure helpers for turning the Worker's page list into image URLs. No network or DOM access here, so they are unit-tested.
const FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/;
const HASH = /^[A-Za-z0-9]{8,64}$/;
const CHAPTER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// MangaDex guarantees 15 minutes; refresh a little early.
export const PAGE_URL_LIFETIME_MS = 14 * 60 * 1000;
export const QUALITIES = Object.freeze(['data', 'data-saver']);

export function isChapterId(value) { return CHAPTER_ID.test(String(value || '')); }

export function normalizePagesPayload(payload, now = Date.now()) {
  const raw = payload?.data;
  if (!raw || typeof raw !== 'object') throw new Error('The reader received an unexpected response.');
  let base;
  try { base = new URL(String(raw.baseUrl || '')); } catch { throw new Error('The reader received an invalid server address.'); }
  if (base.protocol !== 'https:' || base.username || base.password) throw new Error('The reader received an unsafe server address.');
  if (!HASH.test(String(raw.hash || ''))) throw new Error('The reader received an invalid chapter hash.');
  const clean = list => (Array.isArray(list) ? list : []).filter(name => typeof name === 'string' && FILENAME.test(name));
  const data = clean(raw.data);
  const dataSaver = clean(raw.dataSaver);
  if (!data.length && !dataSaver.length) throw new Error('This chapter has no readable pages.');
  return {
    chapterId: String(raw.chapterId || ''),
    baseUrl: base.origin + base.pathname.replace(/\/$/, ''),
    hash: String(raw.hash),
    data, dataSaver,
    fetchedAt: now
  };
}

// Falls back to the other quality when the preferred one is empty, so a chapter never opens blank.
export function pickQuality(pages, preferred) {
  const wanted = QUALITIES.includes(preferred) ? preferred : 'data';
  const list = wanted === 'data' ? pages.data : pages.dataSaver;
  if (list.length) return wanted;
  return wanted === 'data' ? 'data-saver' : 'data';
}

export function buildPageUrls(pages, preferred) {
  if (pages?.offline) return [...pages.urls]; // a downloaded chapter: blob addresses made from the saved pages
  const quality = pickQuality(pages, preferred);
  const names = quality === 'data' ? pages.data : pages.dataSaver;
  return names.map(name => `${pages.baseUrl}/${quality}/${encodeURIComponent(pages.hash)}/${encodeURIComponent(name)}`);
}

export function pagesExpired(pages, now = Date.now()) {
  if (pages?.offline) return false; // saved pages never expire
  return !pages || now - Number(pages.fetchedAt || 0) >= PAGE_URL_LIFETIME_MS;
}

// MangaDex asks clients to report every image fetched from a node that is not on mangadex.org.
export function shouldReport(imageUrl) {
  try {
    const url = new URL(imageUrl);
    return url.protocol === 'https:' && !url.hostname.toLowerCase().endsWith('mangadex.org'); // blob: pages of a download are never reported
  } catch { return false; }
}

export function clampPage(index, total) {
  const max = Math.max(0, Number(total) - 1);
  const value = Number.parseInt(index, 10);
  return Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : 0;
}
