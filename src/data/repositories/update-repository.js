// New-chapter checks. `updateWatch` has one row per title being watched (the newest chapter id seen and the time from which
// a chapter counts as new); `chapterUpdates` is the inbox of chapters found. Neither is part of a backup: they only make
// sense on the device that did the checking.
import { deleteRecord, getAllRecords, getRecord, putMany, putRecord } from '../database.js';

const MAX_UPDATES = 200;
const META_ID = '__meta';

export async function listWatch() {
  return (await getAllRecords('updateWatch')).filter(row => row.id !== META_ID);
}
export const putWatch = row => putRecord('updateWatch', row);
export const removeWatch = id => deleteRecord('updateWatch', id);

export async function getMeta() {
  return (await getRecord('updateWatch', META_ID)) || { id: META_ID, lastRunAt: null, lastError: '', lastFound: 0, watched: 0 };
}
export const putMeta = meta => putRecord('updateWatch', { ...meta, id: META_ID });

// Adds chapters found; one already in the inbox (same chapter id) is left alone. Returns only the rows that were new.
export async function addUpdates(rows) {
  const added = [];
  for (const row of rows || []) {
    if (!row?.id || !row?.contentItemId) continue;
    if (await getRecord('chapterUpdates', row.id)) continue;
    added.push({ read: false, ...row });
  }
  if (added.length) await putMany('chapterUpdates', added);
  await trimUpdates();
  return added;
}

export async function listUpdates() {
  return (await getAllRecords('chapterUpdates')).sort((a, b) => String(b.foundAt).localeCompare(String(a.foundAt)) || String(b.publishedAt).localeCompare(String(a.publishedAt)));
}

export async function markUpdatesRead(ids) {
  const rows = await getAllRecords('chapterUpdates');
  const wanted = ids ? new Set(ids) : null;
  const changed = rows.filter(row => !row.read && (!wanted || wanted.has(row.id))).map(row => ({ ...row, read: true }));
  if (changed.length) await putMany('chapterUpdates', changed);
  return changed.length;
}

export async function removeUpdates(ids) {
  for (const id of ids || []) await deleteRecord('chapterUpdates', id);
}

export async function clearUpdates() {
  for (const row of await getAllRecords('chapterUpdates')) await deleteRecord('chapterUpdates', row.id);
}

async function trimUpdates() {
  const rows = await listUpdates();
  for (const row of rows.slice(MAX_UPDATES)) await deleteRecord('chapterUpdates', row.id);
}
