// Tracking a title on AniList: find which AniList title it is, show and edit the person's own entry, and send changes
// right away when AniList can be reached (or keep them queued on this device until it can).
import { deleteRecord, getAllRecords, putRecord } from '../../data/database.js';
import { activeClient, describeAccount, flushOutbox, loadMappings, queueTrackingPatch, trackingRowFromEntry } from '../anilist/anilist-sync.js';
import { deleteTracking, getAccount, getOutbox, getTracking, putTracking, syncLinkId } from '../anilist/anilist-store.js';
import { cleanPatch, describePatch } from './tracking.js';

const isAniListNumeric = value => /^\d{1,9}$/.test(String(value ?? ''));

// Which AniList title is this? Exact matches only: the title is an AniList title itself, a link we already stored
// (from sync or chosen by the person), or the AniList ID MangaDex lists for it. Names are never guessed.
export async function resolveMediaId(item) {
  if (!item) return null;
  if (item.sourceId === 'anilist' && isAniListNumeric(item.externalId)) return String(item.externalId);
  const { mediaByContent } = await loadMappings();
  if (mediaByContent.has(item.id)) return mediaByContent.get(item.id);
  if (isAniListNumeric(item.anilistId)) return String(item.anilistId);
  return null;
}

export async function trackingStatus() {
  return describeAccount(await getAccount());
}

export async function getTrackingState(item) {
  const status = await trackingStatus();
  if (!status.connected) return { connected: false, mediaId: null, row: null, pending: false };
  const mediaId = await resolveMediaId(item);
  const row = mediaId ? await getTracking(item.id) : null;
  const pending = mediaId ? (await getOutbox()).some(entry => entry.id === syncLinkId(mediaId)) : false;
  return { connected: true, mediaId, row: row && String(row.mediaId) === String(mediaId) ? row : null, pending };
}

// Reads the person's entry from AniList and keeps a copy. Skipped while changes for the title are still waiting to be
// sent, so an older AniList copy never replaces what the person just set.
export async function pullTracking(item, { fetchImpl } = {}) {
  const state = await getTrackingState(item);
  if (!state.connected || !state.mediaId) return state;
  if (state.pending) return state;
  const { account, client } = await activeClient(fetchImpl);
  const media = await client.mediaEntry(state.mediaId);
  const row = trackingRowFromEntry({ mediaId: state.mediaId, contentItemId: item.id, userId: account.viewer.id, entry: media.mediaListEntry, media, previous: state.row });
  await putTracking(row);
  return { ...state, row };
}

export async function searchTitles(query, { allowAdult = false, fetchImpl } = {}) {
  const { client } = await activeClient(fetchImpl);
  return client.searchManga(query, { allowAdult });
}

// The person picked an AniList title for this one. Stored as the same kind of record the library sync already uses.
export async function linkTitle(item, media) {
  if (!item || item.sourceId === 'anilist') throw new TypeError('This title is already an AniList title.');
  if (!isAniListNumeric(media?.id)) throw new TypeError('That is not an AniList title.');
  await unlinkTitle(item);
  await putRecord('sourceEntries', {
    id: `anilist:${media.id}`, contentItemId: item.id, sourceId: 'anilist', externalId: String(media.id),
    sourceUrl: `https://anilist.co/manga/${media.id}`, sourceTitle: media.title?.english || media.title?.romaji || media.title?.native || '',
    language: null, availabilityStatus: 'available', lastCheckedAt: new Date().toISOString(), linkKind: 'user-selected'
  });
  return String(media.id);
}

export async function unlinkTitle(item) {
  if (!item || item.sourceId === 'anilist') return false;
  let removed = false;
  for (const row of await getAllRecords('sourceEntries')) {
    if (row.contentItemId === item.id && row.sourceId === 'anilist' && !row.linkRole) { await deleteRecord('sourceEntries', row.id); removed = true; }
  }
  const tracking = await getTracking(item.id);
  if (tracking) await deleteTracking(tracking.mediaId);
  return removed;
}

function applyPatchToRow(row, patch, base) {
  const next = { ...(row || base), ...patch, onList: true };
  if (patch.score !== undefined) next.score = patch.score;
  return next;
}

// Saves the person's edits. Shows them at once on this device, then tries to send them to AniList straight away.
//   outcome 'sent'    AniList confirmed the change
//   outcome 'queued'  AniList could not be reached; it stays queued and goes out later
export async function saveTracking(item, rawPatch, { fetchImpl } = {}) {
  const mediaId = await resolveMediaId(item);
  if (!mediaId) throw new Error('This title is not linked to AniList yet.');
  const patch = cleanPatch(rawPatch);
  const current = await getTracking(item.id);
  // A title that is not on the person's list yet needs a status; reading progress means "reading", otherwise "planning".
  if (!current?.onList && patch.status === undefined) patch.status = (patch.progress || 0) > 0 ? 'CURRENT' : 'PLANNING';
  const base = { mediaId, contentItemId: item.id, status: null, progress: 0, score: 0, startedAt: null, completedAt: null, totalChapters: 0, title: item.title || '', entryId: null };
  const account = await getAccount();
  await putTracking({ ...applyPatchToRow(current, patch, base), userId: account?.viewer?.id });
  await queueTrackingPatch({ mediaId, contentItemId: item.id, patch });
  const result = await flushOutbox({ fetchImpl, sleepMs: 0 });
  const stillWaiting = (await getOutbox()).some(entry => entry.id === syncLinkId(mediaId));
  return { outcome: stillWaiting ? 'queued' : 'sent', mediaId, patch, summary: describePatch(patch), flushed: result.sent };
}

// A chapter was read (or marked read). The outbox row resolves it against AniList's live entry when it is sent.
export async function trackChapterRead(item, chapterNumber, { fetchImpl } = {}) {
  const mediaId = await resolveMediaId(item);
  if (!mediaId) return { outcome: 'skipped', reason: 'not-linked' };
  const status = await trackingStatus();
  if (!status.connected) return { outcome: 'skipped', reason: 'not-connected' };
  const number = Number(chapterNumber);
  if (!Number.isFinite(number) || number < 1) return { outcome: 'skipped', reason: 'no-number' };
  await queueTrackingPatch({ mediaId, contentItemId: item.id, autoReadChapter: Math.floor(number) });
  const result = await flushOutbox({ fetchImpl, sleepMs: 0 });
  const stillWaiting = (await getOutbox()).some(entry => entry.id === syncLinkId(mediaId));
  const applied = result.applied.find(entry => entry.mediaId === String(mediaId));
  return { outcome: stillWaiting ? 'queued' : applied ? 'sent' : 'unchanged', mediaId, summary: applied ? describePatch(applied.patch) : '' };
}
