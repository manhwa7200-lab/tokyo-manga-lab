// Per-chapter marks for a title: which chapters are read, and which are bookmarked.
// "Read" lives in `chapterProgress` (the reader writes it too); bookmarks live in `bookmarks`.
import { deleteRecord, getByIndex, putMany, putRecord } from '../database.js';

const progressId = chapterId => `mangadex-chapter:${chapterId}`;
const bookmarkId = chapterId => `bookmark:${chapterId}`;

export async function listReadChapterIds(contentItemId) {
  if (!contentItemId) return new Set();
  const rows = await getByIndex('chapterProgress', 'contentItemId', contentItemId);
  return new Set(rows.filter(row => row.readingState === 'completed').map(row => row.sourceChapterId));
}

// chapters: [{ externalId, pages }]. Marking unread keeps the record but resets it, so the page position is forgotten too.
export async function setChaptersRead(contentItemId, chapters, read) {
  const now = new Date().toISOString();
  const rows = (chapters || []).filter(chapter => chapter?.externalId).map(chapter => {
    const pages = Math.max(0, Number(chapter.pages) || 0);
    return {
      id: progressId(chapter.externalId), chapterRecordId: progressId(chapter.externalId), contentItemId: contentItemId || null,
      sourceChapterId: chapter.externalId, page: read ? Math.max(0, pages - 1) : 0, totalPages: pages,
      readingState: read ? 'completed' : 'not-started', updatedAt: now
    };
  });
  if (rows.length) await putMany('chapterProgress', rows);
  return rows.length;
}

export async function listBookmarkedChapterIds(contentItemId) {
  if (!contentItemId) return new Set();
  const rows = await getByIndex('bookmarks', 'contentItemId', contentItemId);
  return new Set(rows.map(row => row.sourceChapterId).filter(Boolean));
}

export async function setBookmark(contentItemId, chapterId, on) {
  if (!chapterId) return;
  if (on) await putRecord('bookmarks', { id: bookmarkId(chapterId), contentItemId: contentItemId || null, chapterRecordId: progressId(chapterId), sourceChapterId: chapterId, createdAt: new Date().toISOString() });
  else await deleteRecord('bookmarks', bookmarkId(chapterId));
}

// Where the reader stopped in chapters that were started but not finished: Map(chapterId -> page index).
export async function listChapterPages(contentItemId) {
  if (!contentItemId) return new Map();
  const rows = await getByIndex('chapterProgress', 'contentItemId', contentItemId);
  return new Map(rows.filter(row => row.readingState === 'in-progress' && Number(row.page) > 0).map(row => [row.sourceChapterId, Number(row.page)]));
}
