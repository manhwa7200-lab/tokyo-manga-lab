// New-chapter checks: pure helpers (no DOM, no network, no storage) so the rules can be tested on their own.

export const INTERVAL_OPTIONS = Object.freeze([['30', 'Every 30 minutes'], ['60', 'Every hour'], ['180', 'Every 3 hours'], ['360', 'Every 6 hours']]);
export const SCOPE_OPTIONS = Object.freeze([['reading', 'Titles I am reading'], ['active', 'Reading + planned']]);
export const AUTO_LIMIT_OPTIONS = Object.freeze([['1', '1 chapter'], ['3', '3 chapters'], ['5', '5 chapters'], ['10', '10 chapters']]);
export const BATCH_SIZE = 50;          // titles per Worker request (the Worker allows 50)
export const MAX_TITLES_PER_RUN = 100;  // keeps one run well inside the Worker's request limit
export const FALLBACK_TITLES_PER_RUN = 12; // per-title lookups are used only when the Worker has no batch route
export const GRACE_MS = 10 * 60 * 1000;  // a chapter published just before the first check still counts as new

const ONE_MINUTE = 60 * 1000;

// Library rows -> the titles to watch. Only MangaDex titles can be checked; the scope setting picks which statuses count.
export function followedTitles(library, scope = 'reading') {
  const wanted = scope === 'active' ? new Set(['reading', 'planned']) : new Set(['reading']);
  const seen = new Set();
  const titles = [];
  for (const row of Array.isArray(library) ? library : []) {
    const item = row?.item;
    if (!item || item.sourceId !== 'mangadex' || !item.externalId || !wanted.has(row.personalStatus)) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    titles.push({ contentItemId: item.id, externalId: String(item.externalId), title: item.title || 'Untitled', coverUrl: item.coverUrl || '' });
  }
  return titles;
}

export function intervalMs(settings) {
  const minutes = Number(settings?.updatesInterval);
  return (Number.isFinite(minutes) && minutes >= 15 ? minutes : 60) * ONE_MINUTE;
}

// Is a check due? `lastRunAt` is an ISO time or null.
export function checkDue(lastRunAt, settings, now = Date.now()) {
  if (!lastRunAt) return true;
  const last = new Date(lastRunAt).getTime();
  return !Number.isFinite(last) || now - last >= intervalMs(settings);
}

export function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// Which titles to look at this run: titles never checked first, then the ones checked longest ago.
export function pickTitles(titles, watchById, max = MAX_TITLES_PER_RUN) {
  const checkedAt = title => watchById.get(title.contentItemId)?.checkedAt || '';
  return [...titles].sort((a, b) => checkedAt(a).localeCompare(checkedAt(b))).slice(0, max);
}

// The chapters of a title that count as new: not seen before and published after the title's `since` time.
export function newChapters(chapters, watch, knownIds = new Set()) {
  const since = watch?.since ? new Date(watch.since).getTime() - GRACE_MS : Infinity;
  return (Array.isArray(chapters) ? chapters : [])
    .filter(chapter => chapter?.externalId && !knownIds.has(chapter.externalId))
    .filter(chapter => {
      const published = new Date(chapter.publishedAt).getTime();
      return Number.isFinite(published) && published > since;
    })
    .sort((a, b) => String(a.publishedAt).localeCompare(String(b.publishedAt)));
}

// The inbox row for a chapter that was found.
export function updateRow(title, chapter, foundAt) {
  return {
    id: chapter.externalId, contentItemId: title.contentItemId, externalId: title.externalId,
    title: title.title, coverUrl: title.coverUrl || '',
    chapterNumber: chapter.chapterNumber ?? null, volumeNumber: chapter.volumeNumber ?? null, chapterTitle: chapter.title || '',
    language: chapter.language || '', publishedAt: chapter.publishedAt || foundAt, foundAt, read: false,
    chapter: {
      externalId: chapter.externalId, chapterNumber: chapter.chapterNumber ?? null, volumeNumber: chapter.volumeNumber ?? null,
      title: chapter.title || '', language: chapter.language || '', pages: Number(chapter.pages) || 0,
      scanlationGroups: Array.isArray(chapter.scanlationGroups) ? chapter.scanlationGroups.slice(0, 5) : []
    }
  };
}

const numberOf = row => { const n = Number.parseFloat(row.chapterNumber); return Number.isFinite(n) ? n : -1; };

// The newest `limit` chapters of each title, for auto-download. Returns [{ contentItemId, title, coverUrl, chapters[] }].
export function autoDownloadPlan(rows, limit) {
  const max = Math.max(1, Math.min(20, Number(limit) || 3));
  const byTitle = new Map();
  for (const row of rows || []) {
    if (!byTitle.has(row.contentItemId)) byTitle.set(row.contentItemId, { contentItemId: row.contentItemId, title: row.title, coverUrl: row.coverUrl, rows: [] });
    byTitle.get(row.contentItemId).rows.push(row);
  }
  return [...byTitle.values()].map(group => ({
    contentItemId: group.contentItemId, title: group.title, coverUrl: group.coverUrl,
    chapters: group.rows.sort((a, b) => numberOf(b) - numberOf(a) || String(b.publishedAt).localeCompare(String(a.publishedAt))).slice(0, max)
      .sort((a, b) => numberOf(a) - numberOf(b)).map(row => row.chapter)
  }));
}

const chapterLabel = row => (row.chapterNumber !== null && row.chapterNumber !== undefined && row.chapterNumber !== '' ? `Ch. ${row.chapterNumber}` : (row.chapterTitle || 'New chapter'));

// The inbox, one entry per title (newest first): { contentItemId, title, coverUrl, count, unread, label, newestAt, rows }.
export function groupUpdates(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    if (!groups.has(row.contentItemId)) groups.set(row.contentItemId, { contentItemId: row.contentItemId, title: row.title, coverUrl: row.coverUrl, rows: [] });
    groups.get(row.contentItemId).rows.push(row);
  }
  return [...groups.values()].map(group => {
    const rowsNewestFirst = group.rows.sort((a, b) => numberOf(b) - numberOf(a) || String(b.publishedAt).localeCompare(String(a.publishedAt)));
    const newest = rowsNewestFirst[0];
    return {
      ...group, rows: rowsNewestFirst, count: rowsNewestFirst.length, unread: rowsNewestFirst.filter(row => !row.read).length,
      label: rowsNewestFirst.length > 1 ? `${rowsNewestFirst.length} new chapters · up to ${chapterLabel(newest)}` : chapterLabel(newest),
      newestAt: rowsNewestFirst.reduce((best, row) => (String(row.foundAt) > best ? String(row.foundAt) : best), '')
    };
  }).sort((a, b) => String(b.newestAt).localeCompare(String(a.newestAt)));
}

// "5 min ago", "2 h ago", "3 d ago" (a plain label, not a locale string).
export function timeAgo(iso, now = Date.now()) {
  const time = new Date(iso).getTime();
  if (!iso || !Number.isFinite(time)) return 'never';
  const minutes = Math.max(0, Math.round((now - time) / ONE_MINUTE));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function statusText(meta, watched, now = Date.now()) {
  if (!meta?.lastRunAt) return watched ? `${watched} title${watched === 1 ? '' : 's'} · not checked yet` : 'No titles to watch yet';
  const base = `Checked ${timeAgo(meta.lastRunAt, now)} · ${watched} title${watched === 1 ? '' : 's'}`;
  return meta.lastError ? `${base} · failed` : base;
}

// One line for a phone alert (used by the optional native worker and by tests of the same wording).
export function alertText(groups) {
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  if (!total) return null;
  if (groups.length === 1) return { title: groups[0].title, text: groups[0].label };
  return { title: `${total} new chapters`, text: groups.slice(0, 3).map(group => group.title).join(', ') + (groups.length > 3 ? ` and ${groups.length - 3} more` : '') };
}
