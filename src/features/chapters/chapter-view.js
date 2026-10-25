// How the chapter list on a title is ordered, filtered and labelled. Pure functions, no storage or network.
//
// The list arrives newest first (MangaDex's own order, "source order"). Sorting and filtering only change what is
// shown; the reader always gets the original order, because its Next and Previous buttons depend on it.
export const SORT_KEYS = Object.freeze([['source', 'By source'], ['number', 'By chapter number'], ['date', 'By upload date'], ['title', 'Alphabetically']]);
export const SORT_DIRS = Object.freeze([['desc', 'Newest or highest first'], ['asc', 'Oldest or lowest first']]);
export const DISPLAY_MODES = Object.freeze([['source-title', 'Source title'], ['number', 'Chapter number']]);

export const DEFAULT_CHAPTER_VIEW = Object.freeze({ sortKey: 'source', sortDir: 'desc', display: 'source-title', unread: false, bookmarked: false, scanlator: '' });

export function normalizeChapterView(input = {}) {
  const keys = SORT_KEYS.map(([value]) => value);
  const dirs = SORT_DIRS.map(([value]) => value);
  const displays = DISPLAY_MODES.map(([value]) => value);
  return {
    sortKey: keys.includes(input.sortKey) ? input.sortKey : DEFAULT_CHAPTER_VIEW.sortKey,
    sortDir: dirs.includes(input.sortDir) ? input.sortDir : DEFAULT_CHAPTER_VIEW.sortDir,
    display: displays.includes(input.display) ? input.display : DEFAULT_CHAPTER_VIEW.display,
    unread: Boolean(input.unread),
    bookmarked: Boolean(input.bookmarked),
    scanlator: String(input.scanlator || '').slice(0, 120)
  };
}

// "12" -> 12, "12.5" -> 12.5, "" / null / "abc" -> null (an extra such as an omake or one-shot).
export function chapterNumberValue(chapter) {
  const raw = chapter?.chapterNumber;
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export const isExtraChapter = chapter => chapterNumberValue(chapter) === null;

export function chapterLabel(chapter, display = 'source-title') {
  const number = chapterNumberValue(chapter);
  const base = number === null ? 'Extra / oneshot' : `Chapter ${String(chapter.chapterNumber).trim()}`;
  if (display === 'number') return base;
  const volume = chapter?.volumeNumber ? `Vol. ${chapter.volumeNumber} · ` : '';
  return `${volume}${base}${chapter?.title ? ` — ${chapter.title}` : ''}`;
}

const time = chapter => { const value = Date.parse(chapter?.publishedAt || ''); return Number.isFinite(value) ? value : null; };

// Returns a new array. Missing values (no chapter number, no date) always go last, whichever way it is sorted.
export function sortChapters(chapters, { sortKey = 'source', sortDir = 'desc' } = {}) {
  const list = Array.isArray(chapters) ? chapters.map((chapter, index) => ({ chapter, index })) : [];
  const factor = sortDir === 'asc' ? 1 : -1;
  if (sortKey === 'source') {
    const ordered = list.map(row => row.chapter);
    return sortDir === 'asc' ? ordered.reverse() : ordered;
  }
  const value = row => {
    if (sortKey === 'number') return chapterNumberValue(row.chapter);
    if (sortKey === 'date') return time(row.chapter);
    return null;
  };
  list.sort((a, b) => {
    if (sortKey === 'title') {
      const result = chapterLabel(a.chapter, 'source-title').localeCompare(chapterLabel(b.chapter, 'source-title'), undefined, { numeric: true, sensitivity: 'base' });
      return result * factor || a.index - b.index;
    }
    const left = value(a);
    const right = value(b);
    if (left === null && right === null) return a.index - b.index;
    if (left === null) return 1;
    if (right === null) return -1;
    return (left - right) * factor || a.index - b.index;
  });
  return list.map(row => row.chapter);
}

export function scanlatorsOf(chapters) {
  const names = new Set();
  for (const chapter of chapters || []) for (const group of chapter?.scanlationGroups || []) if (group) names.add(group);
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

// readIds / bookmarkIds are Sets of chapter external ids.
export function filterChapters(chapters, view, { readIds = new Set(), bookmarkIds = new Set() } = {}) {
  const wanted = normalizeChapterView(view);
  return (chapters || []).filter(chapter => {
    const id = chapter?.externalId;
    if (wanted.unread && readIds.has(id)) return false;
    if (wanted.bookmarked && !bookmarkIds.has(id)) return false;
    if (wanted.scanlator && !(chapter.scanlationGroups || []).includes(wanted.scanlator)) return false;
    return true;
  });
}

export function viewIsActive(view) {
  const wanted = normalizeChapterView(view);
  return wanted.unread || wanted.bookmarked || Boolean(wanted.scanlator);
}

// Every chapter of the list that comes before this one in reading order and has a chapter number (used by "mark previous as read").
export function chaptersBefore(chapters, chapterId) {
  const target = (chapters || []).find(chapter => chapter.externalId === chapterId);
  const limit = chapterNumberValue(target);
  if (limit === null) return [];
  return chapters.filter(chapter => { const value = chapterNumberValue(chapter); return value !== null && value < limit; });
}
