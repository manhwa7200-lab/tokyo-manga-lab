// The download queue. One chapter at a time, a few pages at a time, politely:
//  - MangaDex limits "where are this chapter's pages" requests to 40 a minute, so the engine leaves a gap between them.
//  - Pages come straight from MangaDex's image servers (the Worker never relays image bytes) and every fetch from a
//    node outside mangadex.org is reported, exactly as the reader does.
//  - Everything is injected (storage, records, network), so the whole queue is unit-tested without a browser.
import { buildPageUrls, pagesExpired, pickQuality, shouldReport } from '../reader/reader-pages.js';
import { ACTIVE_STATES, DOWNLOAD_QUALITIES, storageLimitBytes } from './download-plan.js';
import { sleep as defaultSleep } from './network-wait.js';

const TRANSIENT = new Set(['NETWORK_ERROR', 'TIMEOUT', 'RATE_LIMITED', 'UPSTREAM_UNAVAILABLE']);
const SAVE_EVERY_PAGES = 3;

export function createDownloadManager({
  store, repo, loadPages, fetchImage, report = () => {}, getSettings = () => ({}), getConnection = () => ({ online: true, metered: false }),
  now = () => Date.now(), sleep = defaultSleep, makeUrl = blob => URL.createObjectURL(blob), revokeUrl = url => URL.revokeObjectURL(url),
  gapMs = 2500, concurrency = 3, pageRetryDelays = [800, 2500], chapterRetryDelays = [4000, 12000]
} = {}) {
  const jobs = new Map();
  const listeners = new Set();
  let order = 0;
  let paused = false;
  let running = false;
  let waiting = '';
  let current = null; // { id, controller, removed }
  let lastPagesCall = 0;

  const emit = () => { const view = snapshot(); for (const listener of listeners) { try { listener(view); } catch { /* a broken listener must not stop downloads */ } } };

  async function save(job) { job.updatedAt = new Date(now()).toISOString(); await repo.put(job); }

  function snapshot() {
    const list = [...jobs.values()].sort((a, b) => a.order - b.order);
    const done = list.filter(job => job.status === 'done');
    return {
      jobs: list, waiting, paused,
      usage: { bytes: list.reduce((sum, job) => sum + (Number(job.bytes) || 0), 0), chapters: done.length, active: list.filter(job => ACTIVE_STATES.includes(job.status)).length }
    };
  }

  async function init() {
    jobs.clear();
    for (const row of await repo.all()) {
      const job = { ...row };
      if (job.status === 'downloading') job.status = 'queued'; // the app closed mid-download: carry on where it stopped
      jobs.set(job.id, job);
      order = Math.max(order, Number(job.order) || 0);
    }
    emit();
    return snapshot();
  }

  // chapters: [{ externalId, chapterNumber, volumeNumber, title, language, pages, scanlationGroups }]
  async function enqueue(chapters, meta = {}) {
    const settings = getSettings() || {};
    const quality = DOWNLOAD_QUALITIES.includes(settings.downloadQuality) ? settings.downloadQuality : 'data-saver';
    let added = 0;
    let skipped = 0;
    for (const chapter of chapters || []) {
      const id = chapter?.externalId;
      if (!id) continue;
      const existing = jobs.get(id);
      if (existing && existing.status !== 'failed') { skipped += 1; continue; }
      const job = {
        ...(existing || {}), id, chapterId: id, contentItemId: meta.contentItemId || null, mangaTitle: String(meta.title || 'Untitled').slice(0, 200), coverUrl: meta.coverUrl || '',
        chapterNumber: chapter.chapterNumber ?? null, volumeNumber: chapter.volumeNumber ?? null, title: chapter.title || '', language: chapter.language || '',
        groups: Array.isArray(chapter.scanlationGroups) ? chapter.scanlationGroups.slice(0, 5) : [], pagesExpected: Math.max(0, Number(chapter.pages) || 0),
        quality, status: 'queued', donePages: existing?.donePages || 0, pageCount: existing?.pageCount || 0, bytes: existing?.bytes || 0, lastError: '',
        order: ++order, createdAt: existing?.createdAt || new Date(now()).toISOString(), completedAt: null
      };
      jobs.set(id, job);
      await save(job);
      added += 1;
    }
    emit();
    kick();
    return { added, skipped };
  }

  const nextJob = () => [...jobs.values()].filter(job => job.status === 'queued').sort((a, b) => a.order - b.order)[0] || null;

  function gate() {
    if (paused) return 'paused';
    const connection = getConnection() || {};
    if (connection.online === false) return 'offline';
    const settings = getSettings() || {};
    if (settings.downloadWifiOnly !== false && connection.metered) return 'wifi';
    const limit = storageLimitBytes(settings.downloadStorageLimitMb);
    if (limit && snapshot().usage.bytes >= limit) return 'storage';
    return '';
  }

  function kick() {
    if (running) return;
    running = true;
    run().catch(error => console.warn('Download queue stopped:', error)).finally(() => { running = false; emit(); });
  }

  async function run() {
    for (;;) {
      const job = nextJob();
      if (!job) { waiting = ''; return; }
      const blocked = gate();
      if (blocked !== waiting) { waiting = blocked; emit(); }
      if (blocked) return;
      await downloadChapter(job);
    }
  }

  async function getPages(job, signal) {
    const wait = lastPagesCall + gapMs - now();
    if (lastPagesCall && wait > 0) await sleep(wait, signal);
    lastPagesCall = now();
    return loadPages(job.chapterId, { signal });
  }

  async function downloadChapter(job) {
    const controller = new AbortController();
    current = { id: job.id, controller, removed: false };
    job.status = 'downloading';
    job.lastError = '';
    await save(job);
    emit();
    let attempt = 0;
    for (;;) {
      try {
        await fetchAll(job, controller);
        if (controller.signal.aborted) break;
        job.status = 'done';
        job.completedAt = new Date(now()).toISOString();
        await save(job);
        break;
      } catch (error) {
        if (controller.signal.aborted) break;
        const transient = TRANSIENT.has(error?.code) && attempt < chapterRetryDelays.length;
        if (transient) { await sleep(chapterRetryDelays[attempt], controller.signal); attempt += 1; if (controller.signal.aborted) break; continue; }
        job.status = 'failed';
        job.lastError = String(error?.message || 'Download failed.').slice(0, 200);
        await save(job);
        break;
      }
    }
    const handled = current;
    current = null;
    if (handled?.removed) { jobs.delete(job.id); await store.removeChapter(job.id); await repo.remove(job.id); } // a page may have landed after the delete
    else if (job.status === 'downloading') { job.status = 'queued'; await save(job); } // paused: pages stay, it resumes later
    emit();
  }

  async function fetchAll(job, controller) {
    const { signal } = controller;
    const ctx = { pages: await getPages(job, signal), refreshes: 0, refreshing: null };
    const quality = pickQuality(ctx.pages, job.quality);
    ctx.quality = quality;
    ctx.urls = buildPageUrls(ctx.pages, quality);
    const total = ctx.urls.length;
    job.quality = quality;
    job.pageCount = total;
    job.pagesExpected = total;
    const missing = [];
    let bytes = 0;
    for (let index = 0; index < total; index += 1) {
      const blob = await store.get(job.id, index);
      if (blob?.size) bytes += blob.size; else missing.push(index);
    }
    job.bytes = bytes;
    job.donePages = total - missing.length;
    await save(job);
    emit();

    const refresh = () => {
      if (ctx.refreshing) return ctx.refreshing;
      if (ctx.refreshes >= 2) return Promise.resolve(false);
      ctx.refreshes += 1;
      ctx.refreshing = getPages(job, signal).then(pages => { ctx.pages = pages; ctx.urls = buildPageUrls(pages, ctx.quality); return true; }).catch(() => false).finally(() => { ctx.refreshing = null; });
      return ctx.refreshing;
    };

    const failures = [];
    const queue = [...missing];
    async function worker() {
      while (queue.length && !signal.aborted && !failures.length) {
        const index = queue.shift();
        const result = await fetchOne(job, ctx, index, signal, refresh);
        if (signal.aborted) return;
        if (!result.ok) { failures.push(result); return; }
        job.bytes += result.size;
        job.donePages += 1;
        if (job.donePages % SAVE_EVERY_PAGES === 0) await save(job);
        emit();
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length || 1)) }, worker));
    if (signal.aborted) return;
    if (failures.length) {
      await save(job);
      const failure = failures[0];
      const error = new Error(failure.message);
      error.code = failure.code;
      throw error;
    }
    if (await store.count(job.id) < total) throw new Error('Some pages were not saved. Try again.');
  }

  async function fetchOne(job, ctx, index, signal, refresh) {
    let lastResult = null;
    for (let attempt = 0; attempt <= pageRetryDelays.length; attempt += 1) {
      if (signal.aborted) return { ok: false, message: 'Stopped.' };
      if (pagesExpired(ctx.pages, now())) await refresh();
      const url = ctx.urls[index];
      const result = await fetchImage(url, { signal });
      if (signal.aborted) return { ok: false, message: 'Stopped.' };
      if (shouldReport(url)) report({ url, success: result.ok, cached: result.cached, bytes: result.bytes || 0, duration: result.duration || 0 });
      if (result.ok) {
        try { await store.put(job.id, index, result.blob); }
        catch (error) { return { ok: false, code: 'STORAGE_FULL', message: 'Could not save a page. The device may be out of space.' }; }
        return { ok: true, size: result.blob.size };
      }
      lastResult = result;
      if (result.status === 403 || result.status === 404 || result.status === 410) await refresh(); // the address may have expired
      if (attempt < pageRetryDelays.length) await sleep(result.status === 429 ? 5000 : pageRetryDelays[attempt], signal);
    }
    const status = lastResult?.status ? ` (${lastResult.status})` : '';
    return { ok: false, code: 'PAGE_FAILED', message: `Page ${index + 1} would not download${status}. Try again later.` };
  }

  async function discard(job) {
    await store.removeChapter(job.id);
    await repo.remove(job.id);
    jobs.delete(job.id);
  }

  async function remove(chapterId) {
    const job = jobs.get(chapterId);
    if (!job) return;
    if (current?.id === chapterId) { current.removed = true; current.controller.abort(); }
    await store.removeChapter(chapterId);
    await repo.remove(chapterId);
    jobs.delete(chapterId);
    emit();
  }

  async function removeMany(ids) { for (const id of ids) await remove(id); }
  async function removeManga(contentItemId) { await removeMany([...jobs.values()].filter(job => job.contentItemId === contentItemId).map(job => job.id)); }
  async function removeAll() {
    if (current) { current.removed = true; current.controller.abort(); }
    for (const job of [...jobs.values()]) await repo.remove(job.id);
    jobs.clear();
    await store.clear();
    emit();
  }

  async function retry(chapterId) {
    const job = jobs.get(chapterId);
    if (!job || job.status !== 'failed') return;
    job.status = 'queued';
    job.lastError = '';
    job.order = ++order;
    await save(job);
    emit();
    kick();
  }

  async function retryFailed() { for (const job of [...jobs.values()].filter(row => row.status === 'failed')) await retry(job.id); }

  // Stops what is running. Finished pages stay saved, so resuming only fetches what is missing.
  function pause() { paused = true; waiting = 'paused'; current?.controller.abort(); emit(); }
  function resume() { paused = false; waiting = ''; emit(); kick(); }

  const isDownloaded = id => jobs.get(id)?.status === 'done';
  const statusOf = id => jobs.get(id)?.status || null;

  // Pages of a finished chapter for the reader, or null if the chapter is not (completely) on this device.
  async function openChapter(chapterId) {
    const job = jobs.get(chapterId);
    if (!job || job.status !== 'done' || !job.pageCount) return null;
    if (await store.count(chapterId) < job.pageCount) return null;
    const urls = [];
    try {
      for (let index = 0; index < job.pageCount; index += 1) {
        const blob = await store.get(chapterId, index);
        if (!blob) throw new Error('missing page');
        urls.push(makeUrl(blob));
      }
    } catch {
      for (const url of urls) revokeUrl(url);
      return null;
    }
    const names = urls.map((_, index) => `page-${index + 1}`);
    return { offline: true, chapterId, quality: job.quality, baseUrl: '', hash: '', data: names, dataSaver: [], urls, fetchedAt: now(), release() { for (const url of urls) revokeUrl(url); urls.length = 0; } };
  }

  return { init, enqueue, kick, pause, resume, remove, removeMany, removeManga, removeAll, retry, retryFailed, openChapter, isDownloaded, statusOf, snapshot, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, get: id => jobs.get(id) || null };
}
