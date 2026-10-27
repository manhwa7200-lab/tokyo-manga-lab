// "Recent": one row per title you opened a chapter of, most recent first. Kept apart from reading progress and
// statistics, so clearing it never forgets which chapters you finished or changes your reading stats.
import { deleteRecord, getAllRecords, getRecord, putRecord } from '../database.js';

const MAX_ROWS = 300;

// entry: { contentItemId, title, coverUrl, contentRating, sourceId, externalId, sourceUrl,
//          chapterId, chapterNumber, chapterLabel, volumeNumber, page, totalPages }
export async function recordHistory(entry, now = new Date()) {
  if (!entry?.contentItemId || !entry?.chapterId) return null;
  const iso = now.toISOString();
  const existing = await getRecord('readingHistory', entry.contentItemId);
  const sameChapter = existing?.chapterId === entry.chapterId;
  const row = {
    id: entry.contentItemId, contentItemId: entry.contentItemId,
    title: String(entry.title || existing?.title || 'Untitled').slice(0, 200),
    coverUrl: entry.coverUrl || existing?.coverUrl || null,
    contentRating: entry.contentRating || existing?.contentRating || null,
    sourceId: entry.sourceId || existing?.sourceId || 'mangadex',
    externalId: entry.externalId || existing?.externalId || String(entry.contentItemId).replace(/^mangadex:/, ''),
    sourceUrl: entry.sourceUrl || existing?.sourceUrl || null,
    chapterId: entry.chapterId,
    chapterNumber: entry.chapterNumber ?? null,
    chapterLabel: String(entry.chapterLabel || '').slice(0, 160),
    volumeNumber: entry.volumeNumber ?? null,
    page: Math.max(0, Number(entry.page) || 0),
    totalPages: Math.max(0, Number(entry.totalPages) || 0),
    // Opening a chapter moves the title to the top. Saving page progress in the same chapter keeps its place.
    openedAt: sameChapter && entry.keepTime && existing?.openedAt ? existing.openedAt : iso,
    updatedAt: iso
  };
  await putRecord('readingHistory', row);
  return row;
}

export async function listHistory(limit = MAX_ROWS) {
  const rows = await getAllRecords('readingHistory');
  return rows.sort((a, b) => String(b.openedAt).localeCompare(String(a.openedAt))).slice(0, limit);
}

export const removeHistory = contentItemId => deleteRecord('readingHistory', contentItemId);

export async function clearHistory() {
  for (const row of await getAllRecords('readingHistory')) await deleteRecord('readingHistory', row.id);
}

// Keeps the newest MAX_ROWS rows; older ones fall off the end.
export async function trimHistory() {
  const rows = await listHistory(10 ** 6);
  for (const row of rows.slice(MAX_ROWS)) await deleteRecord('readingHistory', row.id);
}
