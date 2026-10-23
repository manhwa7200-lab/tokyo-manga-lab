import { deleteRecord, getAllRecords, getRecord, putRecord } from '../database.js';
import { buildLinkRow, isLinkRow, linkRowId } from '../../features/linking/mangadex-link.js';

// Links live in `sourceEntries` as a separate row per AniList item (id "chapter-source:<contentItemId>").
// They never reuse the "mangadex:<uuid>" key, so a MangaDex title saved on its own is never re-pointed or merged.
export async function getMangaDexLink(contentItemId) {
  if (!contentItemId) return null;
  const row = await getRecord('sourceEntries', linkRowId(contentItemId));
  return isLinkRow(row) && row.contentItemId === contentItemId ? row : null;
}

export async function listMangaDexLinks() {
  return (await getAllRecords('sourceEntries')).filter(isLinkRow);
}

export async function saveMangaDexLink(item, candidate, kind) {
  const row = buildLinkRow(item, candidate, kind);
  const previous = await getRecord('sourceEntries', row.id);
  await putRecord('sourceEntries', row);
  await putRecord('activityEvents', {
    id: globalThis.crypto?.randomUUID ? crypto.randomUUID() : `tml-${Date.now().toString(36)}`,
    type: previous ? 'mangadex_link_changed' : 'mangadex_link_added',
    contentItemId: item.id, occurredAt: row.linkedAt
  });
  return row;
}

export async function removeMangaDexLink(contentItemId) {
  const row = await getMangaDexLink(contentItemId);
  if (!row) return false;
  await deleteRecord('sourceEntries', row.id);
  await putRecord('activityEvents', {
    id: globalThis.crypto?.randomUUID ? crypto.randomUUID() : `tml-${Date.now().toString(36)}`,
    type: 'mangadex_link_removed', contentItemId, occurredAt: new Date().toISOString()
  });
  return true;
}

// True when a different saved title already points at the same MangaDex ID (informational only; nothing is merged).
export async function findOtherItemsForMangaDex(mangadexId, exceptContentItemId) {
  const direct = await getRecord('sourceEntries', `mangadex:${mangadexId}`);
  return direct && direct.contentItemId !== exceptContentItemId ? direct.contentItemId : null;
}
