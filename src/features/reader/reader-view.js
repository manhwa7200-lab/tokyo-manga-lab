import { escapeHtml } from '../../shared/utils.js';
import { icon } from '../../shared/icons.js';
import { buildPageUrls, clampPage, isChapterId, pagesExpired, pickQuality, shouldReport } from './reader-pages.js';
import { sendReport } from './reader-report.js';
import { describeFailure, fetchImageNative, shortDetails } from './reader-native.js';
import { loadChapterProgress, recordReadingSession, saveChapterProgress } from './reader-progress.js';

const MODES = ['scroll', 'rtl', 'ltr'];
const MODE_LABEL = { scroll: 'Vertical scroll', rtl: 'Right to left', ltr: 'Left to right' };
const QUALITY_LABEL = { data: 'Original quality', 'data-saver': 'Data saver' };
const PRELOAD_AHEAD = 2;
const MIN_ERROR_REFRESH_GAP_MS = 3000; // spacing between refreshes triggered by failing images
const MAX_ERROR_REFRESHES = 4;         // per chapter visit, so a broken node cannot cause a request storm

export function renderReaderShell() {
  return `<section class="reader" id="readerRoot" aria-label="Manga reader"><div class="reader-status"><span class="spinner"></span><p>Opening chapter…</p></div></section>`;
}

function chapterLabel(chapter) {
  return chapter?.label || 'Chapter';
}

function friendlyError(error) {
  if (error?.code === 'CHAPTER_EXTERNAL') return { title: 'Hosted on another site', text: 'This chapter is not served by MangaDex, so it cannot be shown here. Open it from the source link.' };
  if (error?.status === 404) return { title: 'Reader not available yet', text: 'The catalogue API does not offer chapter pages yet, or this chapter is unavailable. If you host the Worker yourself, deploy the updated version, then try again.' };
  if (error?.code === 'RATE_LIMITED') return { title: 'Slow down a moment', text: 'MangaDex is rate-limiting requests. Wait a few seconds and try again.' };
  return { title: 'Could not open this chapter', text: error?.message || 'Check your connection and try again.' };
}

/**
 * Mounts the reader into `host`. Dependencies are passed in so this file never imports the app,
 * which keeps it testable and avoids circular imports.
 * Returns { destroy }.
 */
export function mountReader(host, { chapterId, context, settings, loadPages, onClose, onOpenChapter, onSetting }) {
  const chapters = Array.isArray(context?.chapters) ? context.chapters : [];
  const position = chapters.findIndex(chapter => chapter.id === chapterId);
  const current = position >= 0 ? chapters[position] : null;
  // The chapter list is newest first, so "next" is the previous array entry.
  const nextChapter = position > 0 ? chapters[position - 1] : null;
  const prevChapter = position >= 0 && position < chapters.length - 1 ? chapters[position + 1] : null;
  const contentItemId = context?.contentItemId || null;

  const view = {
    pages: null, urls: [], page: 0, total: 0, ended: false,
    mode: MODES.includes(settings?.readerMode) ? settings.readerMode : 'scroll',
    quality: settings?.readerQuality === 'data-saver' ? 'data-saver' : 'data',
    fit: settings?.readerFit === 'height' ? 'height' : 'width',
    uiVisible: true, destroyed: false, refreshing: null, lastRefresh: 0, lastErrorRefresh: 0, errorRefreshes: 0,
    startedAt: Date.now(), activeSeconds: 0, saveTimer: null, observer: null, loadObserver: null
  };
  const controller = new AbortController();
  const started = new Map(); // index -> { start, url, retried }
  const blobUrls = new Map(); // index -> object URL for pages loaded through the app's own network layer
  const failures = new Map(); // index -> last failure result, shown to the reader

  const sourceUrl = isChapterId(chapterId) ? `https://mangadex.org/chapter/${encodeURIComponent(chapterId)}` : '';

  function setStatus(html) { host.innerHTML = `<div class="reader-status">${html}</div>`; }

  function showError(error) {
    const { title, text } = friendlyError(error);
    setStatus(`<h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p><div class="reader-status-actions"><button class="button" data-reader="retry">Try again</button>${sourceUrl ? `<a class="button" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Open on MangaDex ↗</a>` : ''}<button class="button-subtle" data-reader="close">Back</button></div>`);
  }

  // ---- page URL management -------------------------------------------------------------
  async function fetchPages() {
    const pages = await loadPages(chapterId, { signal: controller.signal });
    view.pages = pages;
    view.quality = pickQuality(pages, view.quality);
    view.urls = buildPageUrls(pages, view.quality);
    view.total = view.urls.length;
    view.lastRefresh = Date.now();
  }

  // Single-flight refresh so several failing images trigger one request.
  // `expiry` (URLs aged out) and `manual` (the person tapped retry) are always allowed; refreshes caused by
  // failing images are rate-limited and capped so a broken node cannot make the app hammer the API.
  function refreshPages({ expiry = false, manual = false } = {}) {
    if (view.refreshing) return view.refreshing;
    if (!expiry && !manual) {
      if (view.errorRefreshes >= MAX_ERROR_REFRESHES || Date.now() - view.lastErrorRefresh < MIN_ERROR_REFRESH_GAP_MS) return Promise.resolve(false);
      view.errorRefreshes += 1;
      view.lastErrorRefresh = Date.now();
    }
    view.refreshing = fetchPages().then(() => true).catch(() => false).finally(() => { view.refreshing = null; });
    return view.refreshing;
  }

  async function urlFor(index) {
    if (pagesExpired(view.pages)) await refreshPages({ expiry: true });
    return view.urls[index];
  }

  // ---- image loading + MangaDex reports ------------------------------------------------
  function resourceBytes(url) {
    try {
      const entries = performance.getEntriesByName(url);
      const entry = entries[entries.length - 1];
      return entry ? (entry.encodedBodySize || 0) : 0; // 0 when the browser hides cross-origin sizes.
    } catch { return 0; }
  }

  async function loadImage(img) {
    const index = Number(img.dataset.index);
    if (!Number.isFinite(index) || img.dataset.state === 'loading' || img.dataset.state === 'done') return;
    img.dataset.state = 'loading';
    if (blobUrls.has(index)) { img.src = blobUrls.get(index); return; }
    const url = await urlFor(index);
    if (view.destroyed || !url) return;
    started.set(index, { start: performance.now(), url, retried: started.get(index)?.retried || false });
    img.src = url;
  }

  function onImageLoad(img) {
    const index = Number(img.dataset.index);
    img.dataset.state = 'done';
    const info = started.get(index);
    if (info && shouldReport(info.url)) {
      sendReport({ url: info.url, success: true, cached: false, bytes: resourceBytes(info.url), duration: performance.now() - info.start });
    }
  }

  // Shows a page that the WebView would not load, using the app's own network layer.
  async function recoverWithNativeFetch(img, index, url) {
    const result = await fetchImageNative(url);
    if (result.ok) {
      const objectUrl = URL.createObjectURL(result.blob);
      blobUrls.set(index, objectUrl);
      if (shouldReport(url)) sendReport({ url, success: true, cached: result.cached, bytes: result.bytes, duration: result.duration });
      if (!view.destroyed) { img.dataset.native = '1'; img.dataset.state = 'loading'; img.src = objectUrl; }
    }
    return result;
  }

  async function onImageError(img) {
    const index = Number(img.dataset.index);
    if (img.dataset.native === '1') { // the app-network copy would not decode either
      img.dataset.state = 'failed';
      showFailure(img, index, { ok: false, available: true, status: 0, error: 'not-image' });
      return;
    }
    const info = started.get(index);
    if (info && shouldReport(info.url)) sendReport({ url: info.url, success: false, bytes: 0, duration: performance.now() - info.start });
    if (view.destroyed || !info) return;
    // First, ask the app's network layer for the same address. If that works the WebView was the problem.
    const result = await recoverWithNativeFetch(img, index, info.url);
    if (result.ok || view.destroyed) return;
    failures.set(index, result);
    // Otherwise the address may have expired: get fresh ones once and try again.
    if (!info.retried) {
      info.retried = true;
      const refreshed = await refreshPages();
      if (refreshed && !view.destroyed && view.urls[index]) {
        started.set(index, { start: performance.now(), url: view.urls[index], retried: true });
        img.dataset.state = 'loading';
        img.src = view.urls[index];
        return;
      }
    }
    img.dataset.state = 'failed';
    showFailure(img, index, result);
  }

  function hostOf(url) { try { return new URL(url).host; } catch { return ''; } }

  function showFailure(img, index, result) {
    const holder = img.closest('.reader-slot');
    if (!holder || holder.querySelector('.reader-retry')) return;
    const host = hostOf(started.get(index)?.url || view.urls[index]);
    holder.insertAdjacentHTML('beforeend', `<div class="reader-retry"><p>${escapeHtml(describeFailure(result, host))}</p><small>${escapeHtml(shortDetails(result))}</small><button class="button" data-reader="retry-image" data-index="${index}">Retry page ${index + 1}</button></div>`);
  }

  function bindImage(img) {
    img.addEventListener('load', () => onImageLoad(img));
    img.addEventListener('error', () => onImageError(img));
  }

  async function retryImage(index) {
    const img = host.querySelector(`.reader-img[data-index="${index}"]`);
    if (!img) return;
    img.closest('.reader-slot')?.querySelector('.reader-retry')?.remove();
    img.dataset.native = '';
    failures.delete(index);
    if (blobUrls.has(index)) { URL.revokeObjectURL(blobUrls.get(index)); blobUrls.delete(index); }
    const info = started.get(index) || { retried: false };
    started.set(index, { ...info, retried: false });
    await refreshPages({ manual: true });
    img.dataset.state = '';
    await loadImage(img);
  }

  // ---- layout --------------------------------------------------------------------------
  function slotMarkup(index) {
    return `<div class="reader-slot" data-slot="${index}"><img class="reader-img" data-index="${index}" alt="Page ${index + 1} of ${view.total}" decoding="async" referrerpolicy="no-referrer" draggable="false"></div>`;
  }

  function endCardMarkup() {
    return `<div class="reader-end" data-end="true"><h3>End of ${escapeHtml(chapterLabel(current))}</h3><div class="reader-status-actions">${nextChapter ? `<button class="button" data-reader="next-chapter">Next: ${escapeHtml(chapterLabel(nextChapter))}</button>` : ''}<button class="button-subtle" data-reader="close">Back to title</button></div>${nextChapter ? '' : '<p class="muted">No newer chapter in the list you opened this from.</p>'}</div>`;
  }

  function barMarkup() {
    const groups = current ? '' : '';
    return `<header class="reader-bar" ${view.uiVisible ? '' : 'hidden'}>
      <button class="icon-button" data-reader="close" aria-label="Close reader">${icon('chevronLeft')}</button>
      <div class="reader-title"><strong>${escapeHtml(context?.title || 'Reading')}</strong><small>${escapeHtml(chapterLabel(current))}</small></div>
      <button class="button-subtle reader-chip" data-reader="mode" aria-label="Reading mode: ${MODE_LABEL[view.mode]}. Tap to change">${MODE_LABEL[view.mode]}</button>
      <button class="button-subtle reader-chip" data-reader="quality" aria-label="Image quality: ${QUALITY_LABEL[view.quality]}. Tap to change">${view.quality === 'data' ? 'HD' : 'Saver'}</button>
      ${groups}</header>`;
  }

  function footMarkup() {
    const shown = Math.min(view.page + 1, view.total);
    return `<footer class="reader-foot" ${view.uiVisible ? '' : 'hidden'}>
      <button class="button-subtle" data-reader="prev-chapter" ${prevChapter ? '' : 'disabled'} aria-label="Previous chapter">‹ Prev</button>
      <label class="reader-slider"><span class="reader-count" id="readerCount">${shown} / ${view.total}</span><input type="range" min="1" max="${Math.max(1, view.total)}" value="${shown}" data-reader="seek" aria-label="Go to page" ${view.mode === 'rtl' ? 'dir="rtl"' : ''}></label>
      <button class="button-subtle" data-reader="next-chapter" ${nextChapter ? '' : 'disabled'} aria-label="Next chapter">Next ›</button>
    </footer>`;
  }

  function attribution() {
    const groups = Array.isArray(current?.groups) && current.groups.length ? `Group: ${escapeHtml(current.groups.join(', '))} · ` : '';
    return `<p class="reader-credit">${groups}Pages are served by MangaDex and are not stored by this app. ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Open on MangaDex ↗</a>` : ''}</p>`;
  }

  function teardownObservers() {
    view.observer?.disconnect();
    view.loadObserver?.disconnect();
    view.observer = view.loadObserver = null;
  }

  function render() {
    teardownObservers();
    const slots = view.mode === 'scroll'
      ? Array.from({ length: view.total }, (_, index) => slotMarkup(index)).join('') + endCardMarkup()
      : (view.ended ? endCardMarkup() : slotMarkup(view.page));
    host.innerHTML = `${barMarkup()}<div class="reader-stage" data-mode="${view.mode}" data-fit="${view.fit}" tabindex="0">${slots}${view.mode === 'scroll' ? attribution() : ''}</div>${footMarkup()}`;
    host.querySelectorAll('.reader-img').forEach(bindImage);
    const stage = host.querySelector('.reader-stage');
    if (view.mode === 'scroll') setupScrollMode(stage);
    else setupPagedMode();
    stage?.focus({ preventScroll: true });
  }

  function setupScrollMode(stage) {
    // Load images shortly before they scroll into view instead of using native lazy loading,
    // so the load timer that MangaDex asks us to report starts when the request really starts.
    view.loadObserver = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { loadImage(entry.target); view.loadObserver.unobserve(entry.target); }
    }, { rootMargin: '150% 0px' });
    view.observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setPage(Number(visible.target.dataset.index), { fromScroll: true });
    }, { threshold: [0.35, 0.6] });
    host.querySelectorAll('.reader-img').forEach(img => { view.loadObserver.observe(img); view.observer.observe(img); });
    const target = stage.querySelector(`.reader-slot[data-slot="${view.page}"]`);
    if (target && view.page > 0) target.scrollIntoView({ block: 'start' });
  }

  function setupPagedMode() {
    if (view.ended) return;
    const img = host.querySelector('.reader-img');
    if (img) loadImage(img);
    // Warm the next pages so turning is instant.
    for (let step = 1; step <= PRELOAD_AHEAD; step += 1) {
      const index = view.page + step;
      if (index >= view.total) break;
      urlFor(index).then(url => { if (url && !view.destroyed) { const warm = new Image(); warm.referrerPolicy = 'no-referrer'; warm.src = url; } });
    }
  }

  // ---- paging + progress ---------------------------------------------------------------
  function updateCounter() {
    const count = host.querySelector('#readerCount');
    const slider = host.querySelector('.reader-slider input');
    const shown = Math.min(view.page + 1, view.total);
    if (count) count.textContent = `${shown} / ${view.total}`;
    if (slider) slider.value = String(shown);
  }

  function scheduleSave() {
    window.clearTimeout(view.saveTimer);
    view.saveTimer = window.setTimeout(() => {
      saveChapterProgress({ chapterId, contentItemId, page: view.page, total: view.total }).catch(error => console.warn('Reading progress not saved:', error));
    }, 600);
  }

  function setPage(index, { fromScroll = false } = {}) {
    const next = clampPage(index, view.total);
    if (next === view.page && !fromScroll && !view.ended) return;
    view.page = next;
    view.ended = false;
    updateCounter();
    scheduleSave();
  }

  function goPaged(delta) {
    if (view.mode === 'scroll') return;
    if (view.ended) { if (delta < 0) { view.ended = false; render(); } return; }
    const target = view.page + delta;
    if (target >= view.total) {
      view.ended = true;
      scheduleSave();
      render();
      return;
    }
    if (target < 0) { if (prevChapter) onOpenChapter(prevChapter.id); return; }
    view.page = target;
    scheduleSave();
    render();
  }

  // In right-to-left mode the "next page" direction is leftwards.
  const forwardDelta = side => (view.mode === 'rtl' ? (side === 'left' ? 1 : -1) : (side === 'left' ? -1 : 1));

  function cycleMode() {
    const nextMode = MODES[(MODES.indexOf(view.mode) + 1) % MODES.length];
    view.mode = nextMode;
    view.ended = false;
    onSetting?.('readerMode', nextMode);
    render();
  }

  function toggleQuality() {
    const nextQuality = view.quality === 'data' ? 'data-saver' : 'data';
    if (!(nextQuality === 'data' ? view.pages.data : view.pages.dataSaver).length) return;
    view.quality = nextQuality;
    view.urls = buildPageUrls(view.pages, nextQuality);
    started.clear();
    for (const objectUrl of blobUrls.values()) URL.revokeObjectURL(objectUrl);
    blobUrls.clear();
    onSetting?.('readerQuality', nextQuality);
    render();
  }

  // ---- events --------------------------------------------------------------------------
  function handleClick(event) {
    const control = event.target.closest('[data-reader]');
    if (control) {
      switch (control.dataset.reader) {
        case 'close': onClose(); break;
        case 'retry': start(); break;
        case 'retry-image': retryImage(Number(control.dataset.index)); break;
        case 'mode': cycleMode(); break;
        case 'quality': toggleQuality(); break;
        case 'next-chapter': if (nextChapter) onOpenChapter(nextChapter.id); break;
        case 'prev-chapter': if (prevChapter) onOpenChapter(prevChapter.id); break;
        default: break;
      }
      return;
    }
    const stage = event.target.closest('.reader-stage');
    if (!stage || event.target.closest('a, button, input')) return;
    const rect = stage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(1, rect.width);
    if (view.mode !== 'scroll' && !view.ended && x < 0.3) goPaged(forwardDelta('left'));
    else if (view.mode !== 'scroll' && !view.ended && x > 0.7) goPaged(forwardDelta('right'));
    else toggleUi();
  }

  function toggleUi() {
    view.uiVisible = !view.uiVisible;
    host.querySelector('.reader-bar')?.toggleAttribute('hidden', !view.uiVisible);
    host.querySelector('.reader-foot')?.toggleAttribute('hidden', !view.uiVisible);
  }

  function handleInput(event) {
    if (event.target.dataset?.reader !== 'seek') return;
    const index = Number(event.target.value) - 1;
    if (view.mode === 'scroll') {
      view.page = clampPage(index, view.total);
      host.querySelector(`.reader-slot[data-slot="${view.page}"]`)?.scrollIntoView({ block: 'start' });
      updateCounter();
      scheduleSave();
    } else {
      view.page = clampPage(index, view.total);
      view.ended = false;
      scheduleSave();
      render();
    }
  }

  function handleKey(event) {
    if (event.target.matches?.('input, textarea, select')) return;
    if (event.key === 'Escape') { onClose(); return; }
    if (view.mode === 'scroll') return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); goPaged(forwardDelta('left')); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); goPaged(forwardDelta('right')); }
    else if (event.key === ' ') { event.preventDefault(); goPaged(1); }
  }

  host.addEventListener('click', handleClick);
  host.addEventListener('input', handleInput);
  document.addEventListener('keydown', handleKey);
  const timer = window.setInterval(() => { if (document.visibilityState === 'visible') view.activeSeconds += 1; }, 1000);

  async function start() {
    setStatus('<span class="spinner"></span><p>Opening chapter…</p>');
    try {
      await fetchPages();
      const saved = await loadChapterProgress(chapterId).catch(() => null);
      // Resume unless the chapter was already finished; a finished chapter reopens at page one.
      view.page = saved && saved.readingState !== 'completed' ? clampPage(saved.page, view.total) : 0;
      if (view.destroyed) return;
      render();
      if (view.page > 0) {
        const note = document.createElement('div');
        note.className = 'reader-toast';
        note.textContent = `Resumed at page ${view.page + 1}`;
        host.appendChild(note);
        window.setTimeout(() => note.remove(), 2200);
      }
    } catch (error) {
      if (view.destroyed || error?.name === 'AbortError') return;
      showError(error);
    }
  }

  start();

  return {
    destroy() {
      if (view.destroyed) return;
      view.destroyed = true;
      controller.abort();
      teardownObservers();
      for (const objectUrl of blobUrls.values()) URL.revokeObjectURL(objectUrl);
      blobUrls.clear();
      window.clearInterval(timer);
      window.clearTimeout(view.saveTimer);
      host.removeEventListener('click', handleClick);
      host.removeEventListener('input', handleInput);
      document.removeEventListener('keydown', handleKey);
      if (view.total > 0) saveChapterProgress({ chapterId, contentItemId, page: view.page, total: view.total }).catch(() => {});
      recordReadingSession({ chapterId, contentItemId, startedAt: view.startedAt, activeSeconds: view.activeSeconds }).catch(() => {});
    }
  };
}
