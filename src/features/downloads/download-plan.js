// Pure helpers for the "Add to Download" screen: which chapters can be picked, how a pick is summarised, and how
// "jump to" finds a chapter. No storage, network or DOM access, so all of it is unit-tested.
import { chapterNumberValue, sortChapters } from '../chapters/chapter-view.js';
import { isChapterId } from '../reader/reader-pages.js';

export const DOWNLOAD_QUALITIES = Object.freeze(['data', 'data-saver']);
// Job states. `queued` and `downloading` are active; `done` is readable offline; `failed` can be retried.
export const JOB_STATES = Object.freeze(['queued', 'downloading', 'done', 'failed']);
export const ACTIVE_STATES = Object.freeze(['queued', 'downloading']);
// A very large pick is allowed, but the screen says so; the engine still goes one chapter at a time.
export const LARGE_SELECTION = 60;

// "Ch. 90", "Ch. 77.5", "Oneshot". Short on purpose: the picker shows one line per chapter.
export function shortLabel(chapter) {
  const number = chapterNumberValue(chapter);
  if (number === null) return chapter?.title ? String(chapter.title).slice(0, 40) : 'Oneshot';
  return `Ch. ${String(chapter.chapterNumber).trim().replace(/^0+(?=\d)/, '')}`;
}

// Only chapters the reader can open: a real MangaDex id and at least one page.
export function downloadableChapters(chapters) {
  return (Array.isArray(chapters) ? chapters : []).filter(chapter => isChapterId(chapter?.externalId) && Number(chapter.pages) > 0);
}

// Picker order: the person's sort direction by chapter number (highest first by default, like the reference screen).
export function pickerOrder(chapters, dir = 'desc') {
  return sortChapters(downloadableChapters(chapters), { sortKey: 'number', sortDir: dir === 'asc' ? 'asc' : 'desc' });
}

// What a chapter's download looks like right now: 'done' | 'downloading' | 'queued' | 'failed' | null.
export function statusFor(chapterId, jobs) {
  const job = jobs instanceof Map ? jobs.get(chapterId) : jobs?.[chapterId];
  return job?.status || null;
}

// Chapters that can still be picked: not downloaded and not already waiting in the queue.
export function isSelectable(chapterId, jobs) {
  const status = statusFor(chapterId, jobs);
  return status === null || status === 'failed';
}

export function toggleSelection(selected, chapterId) {
  const next = new Set(selected);
  if (next.has(chapterId)) next.delete(chapterId); else next.add(chapterId);
  return next;
}

// "Select all" picks every selectable row; when they are all picked already it clears the pick instead.
export function toggleAll(selected, rows, jobs) {
  const ids = rows.map(row => row.externalId).filter(id => isSelectable(id, jobs));
  const allPicked = ids.length > 0 && ids.every(id => selected.has(id));
  return allPicked ? new Set() : new Set(ids);
}

export function selectionSummary(selected, rows) {
  const picked = rows.filter(row => selected.has(row.externalId));
  return { count: picked.length, pages: picked.reduce((sum, row) => sum + (Number(row.pages) || 0), 0), large: picked.length > LARGE_SELECTION };
}

// Rough size, only to warn before a big pick. MangaDex pages average a few hundred KB; data saver is about half of that.
export function estimateBytes(pages, quality = 'data-saver') {
  return Math.round((Number(pages) || 0) * (quality === 'data' ? 600 : 300) * 1024);
}

// "jump to 77" finds chapter 77, or the nearest chapter below it, or the lowest one above it. Returns an externalId or ''.
export function jumpTarget(rows, query) {
  const wanted = Number.parseFloat(String(query ?? '').replace(',', '.'));
  if (!Number.isFinite(wanted)) return '';
  let best = null;
  for (const row of rows) {
    const value = chapterNumberValue(row);
    if (value === null) continue;
    const distance = Math.abs(value - wanted);
    // Prefer an exact hit, then the closest chapter at or below the number, then the closest above it.
    const rank = distance === 0 ? 0 : value < wanted ? 1 : 2;
    if (!best || rank < best.rank || (rank === best.rank && distance < best.distance)) best = { id: row.externalId, rank, distance };
  }
  return best?.id || '';
}

export function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(value < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

// The Settings choice is megabytes as text; "0" means no limit.
export function storageLimitBytes(setting) {
  const mb = Number.parseInt(setting, 10);
  return Number.isFinite(mb) && mb > 0 ? mb * 1024 * 1024 : 0;
}

// ---- Downloads screen -------------------------------------------------------------------------------------------
export function jobProgress(job) {
  const total = Number(job?.pageCount) || 0;
  if (job?.status === 'done') return 100;
  return total > 0 ? Math.min(100, Math.round((Number(job.donePages) || 0) / total * 100)) : 0;
}

export function waitingText(reason) {
  switch (reason) {
    case 'wifi': return 'Waiting for Wi-Fi. Turn off "Download on Wi-Fi only" in Settings to use mobile data.';
    case 'offline': return 'Waiting for a connection.';
    case 'storage': return 'Paused: the storage limit is reached. Delete chapters or raise the limit in Settings.';
    case 'paused': return 'Paused.';
    default: return '';
  }
}

// Finished chapters grouped by title, titles A to Z, chapters highest first. Only 'done' jobs count.
export function groupDownloads(jobs) {
  const groups = new Map();
  for (const job of jobs || []) {
    if (job.status !== 'done') continue;
    const key = job.contentItemId || `title:${job.mangaTitle}`;
    if (!groups.has(key)) groups.set(key, { key, contentItemId: job.contentItemId || null, title: job.mangaTitle || 'Untitled', coverUrl: job.coverUrl || '', chapters: [], bytes: 0 });
    const group = groups.get(key);
    group.chapters.push(job);
    group.bytes += Number(job.bytes) || 0;
  }
  const number = job => { const value = chapterNumberValue({ chapterNumber: job.chapterNumber }); return value === null ? -Infinity : value; };
  return [...groups.values()]
    .map(group => ({ ...group, chapters: group.chapters.sort((a, b) => number(b) - number(a)) }))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
}

export function jobLabel(job) {
  const volume = job?.volumeNumber ? `Vol. ${job.volumeNumber} · ` : '';
  const base = shortLabel({ chapterNumber: job?.chapterNumber, title: job?.title });
  return `${volume}${base}${job?.title && chapterNumberValue({ chapterNumber: job.chapterNumber }) !== null ? ` — ${job.title}` : ''}`;
}
