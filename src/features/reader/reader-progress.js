import { getRecord, putRecord } from '../../data/database.js';

const idFor = chapterId => `mangadex-chapter:${chapterId}`;

// A chapter is finished when its last page is reached. A one-page chapter counts as read only once the end card
// has been reached, so merely opening it does not mark it finished.
export function progressState(page, total, ended = false) {
  const last = Math.max(0, Number(total) - 1);
  if (ended && Number(total) > 0) return 'completed';
  if (Number(total) > 1 && Number(page) >= last) return 'completed';
  if (Number(total) === 1) return 'in-progress'; // opened, but the end card has not been reached yet
  return Number(page) > 0 ? 'in-progress' : 'not-started';
}

export async function loadChapterProgress(chapterId) {
  return (await getRecord('chapterProgress', idFor(chapterId))) || null;
}

export async function saveChapterProgress({ chapterId, contentItemId, page, total, ended = false }) {
  const existing = await loadChapterProgress(chapterId);
  const state = progressState(page, total, ended);
  // Never move a finished chapter backwards just because it was reopened.
  const readingState = existing?.readingState === 'completed' ? 'completed' : state;
  const record = {
    id: idFor(chapterId),
    chapterRecordId: idFor(chapterId),
    contentItemId: contentItemId || null,
    sourceChapterId: chapterId,
    page: Math.max(0, Number(page) || 0),
    totalPages: Math.max(0, Number(total) || 0),
    readingState,
    updatedAt: new Date().toISOString()
  };
  await putRecord('chapterProgress', record);
  return record;
}

// One row per reading visit; the statistics screen counts these once they exist.
export async function recordReadingSession({ chapterId, contentItemId, startedAt, activeSeconds }) {
  if (!(activeSeconds >= 5)) return null; // Ignore accidental opens.
  const record = {
    id: `session-${startedAt}-${chapterId}`,
    contentItemId: contentItemId || null,
    sourceChapterId: chapterId,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date().toISOString(),
    activeDurationSeconds: Math.round(activeSeconds)
  };
  await putRecord('readingSessions', record);
  return record;
}
