// Connects the pieces: AniList client + planner + local library. UI code calls only this module.
import { getAllRecords, getRecord, putRecord } from '../../data/database.js';
import { addToLibrary, cacheCatalogueItems } from '../../data/repositories/library-repository.js';
import { MAX_PUSHES_PER_RUN, PUSH_SPACING_MS } from './anilist-config.js';
import { AniListError, createAniListClient } from './anilist-client.js';
import { normalizeRemoteEntry, toRemoteStatus } from './anilist-mapper.js';
import { planSync } from './sync-planner.js';
import {
  clearAccount, deleteOutbox, getAccount, getOutbox, getSyncLinks, putOutbox, putSyncLinks, saveAccount, syncLinkId
} from './anilist-store.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const LIBRARY_PROFILE = 'local-default';

export async function connectWithToken({ accessToken, expiresAt }, { fetchImpl } = {}) {
  const client = createAniListClient({ token: accessToken, fetchImpl });
  const viewer = await client.viewer();
  const previous = await getAccount();
  const account = { accessToken, expiresAt, viewer, connectedAt: Date.now(), lastSync: previous?.viewer?.id === viewer.id ? previous.lastSync || null : null };
  await saveAccount(account);
  return account;
}

export async function disconnect() { await clearAccount(); }

export function describeAccount(account, now = Date.now()) {
  if (!account) return { connected: false, expired: false, label: 'Not connected' };
  if (account.expiresAt && account.expiresAt < now) return { connected: false, expired: true, label: 'Sign-in expired. Connect again.' };
  return { connected: true, expired: false, label: `Connected as ${account.viewer?.name || 'AniList user'}` };
}

async function activeClient(fetchImpl) {
  const account = await getAccount();
  const state = describeAccount(account);
  if (!state.connected) throw new AniListError(state.expired ? 'AniList sign-in expired. Connect again.' : 'Connect your AniList account first.', { code: 'UNAUTHORIZED' });
  return { account, client: createAniListClient({ token: account.accessToken, fetchImpl }) };
}

// Maps: AniList id <-> internal content id, built from sourceEntries (provider ids live there by design).
async function loadMappings() {
  // Chapter-source link rows describe where chapters come from; they are not identity mappings.
  const rows = (await getAllRecords('sourceEntries')).filter(row => !row.linkRole);
  const byKey = new Map(rows.map(row => [`${row.sourceId}:${row.externalId}`, row.contentItemId]));
  const mediaByContent = new Map();
  for (const row of rows) if (row.sourceId === 'anilist') mediaByContent.set(row.contentItemId, String(row.externalId));
  return { byKey, mediaByContent };
}

export async function flushOutbox({ fetchImpl, sleepMs = PUSH_SPACING_MS } = {}) {
  const rows = (await getOutbox()).sort((a, b) => a.createdAt - b.createdAt);
  if (!rows.length) return { sent: 0, remaining: 0 };
  const { account, client } = await activeClient(fetchImpl);
  let sent = 0;
  for (const row of rows) {
    try {
      const saved = await client.saveEntry({ mediaId: row.mediaId, status: toRemoteStatus(row.libraryStatus) });
      await deleteOutbox(row.id);
      await putSyncLinks([{ id: syncLinkId(row.mediaId), provider: 'anilist', userId: account.viewer.id, mediaId: row.mediaId, contentItemId: row.contentItemId, entryId: saved.id, baseStatus: row.libraryStatus, remoteProgress: saved.progress ?? 0, remoteUpdatedAtMs: (saved.updatedAt || 0) * 1000, syncedAt: Date.now() }]);
      sent += 1;
      if (sleepMs) await sleep(sleepMs);
    } catch (error) {
      if (error.code === 'UNAUTHORIZED') { await clearAccount(); throw error; }
      if (['RATE_LIMITED', 'UNAVAILABLE', 'NETWORK_ERROR', 'TIMEOUT'].includes(error.code)) {
        // AniList is busy, down or unreachable. Keep the change queued and stop instead of hammering it.
        await putOutbox({ ...row, lastError: error.message, retryAfter: Date.now() + (error.retryAfter || 300) * 1000 });
        break;
      }
      await putOutbox({ ...row, attempts: (row.attempts || 0) + 1, lastError: error.message });
    }
  }
  return { sent, remaining: (await getOutbox()).length };
}

// Called after the user changes a title's status here. Quietly queues a push when the title has an AniList id.
export async function notifyLocalChange(contentItemId, { fetchImpl, flush = true } = {}) {
  const account = await getAccount();
  if (!describeAccount(account).connected) return { queued: false, reason: 'not-connected' };
  const { mediaByContent } = await loadMappings();
  const mediaId = mediaByContent.get(contentItemId);
  if (!mediaId) return { queued: false, reason: 'not-linked' };
  const entry = await getRecord('libraryEntries', `${LIBRARY_PROFILE}:${contentItemId}`);
  if (!entry || !toRemoteStatus(entry.personalStatus)) return { queued: false, reason: 'no-entry' };
  await putOutbox({ id: syncLinkId(mediaId), provider: 'anilist', mediaId, contentItemId, libraryStatus: entry.personalStatus, status: 'pending', createdAt: Date.now(), attempts: 0 });
  if (flush) flushOutbox({ fetchImpl }).catch(() => {});
  return { queued: true, mediaId };
}

async function applyPull(pull, remote, userId) {
  const raw = remote.item;
  let contentItemId = pull.contentItemId;
  if (!contentItemId) {
    const [item] = await cacheCatalogueItems([raw]);
    contentItemId = item.id;
    await addToLibrary(item, pull.status);
  } else {
    const entryId = `${LIBRARY_PROFILE}:${contentItemId}`;
    const entry = await getRecord('libraryEntries', entryId);
    if (entry) await putRecord('libraryEntries', { ...entry, personalStatus: pull.status, updatedAt: new Date().toISOString() });
  }
  return contentItemId;
}

export async function runSync({ pushEnabled = false, allowAdult = false, confirmPush = null, fetchImpl, sleepMs = PUSH_SPACING_MS, onProgress = () => {} } = {}) {
  const { account, client } = await activeClient(fetchImpl);
  const userId = account.viewer.id;
  const summary = { at: Date.now(), pulled: 0, pushed: 0, inSync: 0, conflicts: 0, hiddenAdult: 0, unlinked: 0, removedRemotely: 0, skippedPush: 0, pending: 0, notes: [] };

  await flushOutbox({ fetchImpl, sleepMs }).catch(error => { if (error.code === 'UNAUTHORIZED') throw error; });

  onProgress('Reading your AniList manga list');
  const remoteAll = (await client.mangaList(userId)).map(normalizeRemoteEntry).filter(Boolean);
  const remote = allowAdult ? remoteAll : remoteAll.filter(entry => !entry.isAdult);
  summary.hiddenAdult = remoteAll.length - remote.length;
  const remoteById = new Map(remote.map(entry => [entry.mediaId, entry]));

  // Exact links only: attach an AniList id to a MangaDex title we already have when AniList lists that MangaDex id.
  const { byKey, mediaByContent: initialMedia } = await loadMappings();
  for (const entry of remote) {
    if (!entry.mangadexId || byKey.has(`anilist:${entry.mediaId}`)) continue;
    const existing = byKey.get(`mangadex:${entry.mangadexId}`);
    if (existing && !initialMedia.has(existing)) {
      // Only add the id mapping. Never overwrite the MangaDex metadata we already have.
      await putRecord('sourceEntries', {
        id: `anilist:${entry.mediaId}`, contentItemId: existing, sourceId: 'anilist', externalId: entry.mediaId,
        sourceUrl: `https://anilist.co/manga/${entry.mediaId}`, sourceTitle: entry.item.title, language: null,
        availabilityStatus: 'available', lastCheckedAt: new Date().toISOString()
      });
    }
  }
  const { mediaByContent } = await loadMappings();

  const libraryEntries = await getAllRecords('libraryEntries');
  const local = libraryEntries.filter(row => mediaByContent.has(row.contentItemId)).map(row => ({
    contentItemId: row.contentItemId, mediaId: mediaByContent.get(row.contentItemId), status: row.personalStatus, updatedAtMs: Date.parse(row.updatedAt) || 0
  }));
  summary.unlinked = libraryEntries.length - local.length;

  const links = await getSyncLinks(userId);
  const bases = Object.fromEntries([...links.values()].map(row => [row.mediaId, row.baseStatus]));
  const plan = planSync({ remote, local, bases, pushEnabled });

  let doPush = pushEnabled;
  if (pushEnabled && plan.pushes.length && typeof confirmPush === 'function') {
    doPush = await confirmPush(plan.pushes.length);
    if (!doPush) { summary.notes.push('Skipped sending changes to AniList.'); }
  }
  const pushes = doPush ? plan.pushes : [];
  summary.skippedPush = plan.skippedPush.length + (doPush ? 0 : plan.pushes.length);
  summary.conflicts = plan.conflicts.length;
  summary.removedRemotely = plan.removedRemotely.length;

  const now = Date.now();
  const linkRows = [];
  const makeLink = (mediaId, contentItemId, status, remoteEntry) => ({
    id: syncLinkId(mediaId), provider: 'anilist', userId, mediaId, contentItemId,
    entryId: remoteEntry?.entryId ?? links.get(mediaId)?.entryId ?? null, baseStatus: status,
    remoteProgress: remoteEntry?.progress ?? links.get(mediaId)?.remoteProgress ?? 0, remoteUpdatedAtMs: remoteEntry?.updatedAtMs ?? 0, syncedAt: now
  });

  onProgress('Updating your library');
  for (const pull of plan.pulls) {
    const entry = remoteById.get(pull.mediaId);
    const contentItemId = await applyPull(pull, entry, userId);
    linkRows.push(makeLink(pull.mediaId, contentItemId, pull.status, entry));
    summary.pulled += 1;
  }
  for (const row of plan.inSync) {
    linkRows.push(makeLink(row.mediaId, row.contentItemId, row.status, remoteById.get(row.mediaId)));
    summary.inSync += 1;
  }
  await putSyncLinks(linkRows);

  let stopped = null;
  const batch = pushes.slice(0, MAX_PUSHES_PER_RUN);
  summary.pending = pushes.length - batch.length;
  for (const [index, push] of batch.entries()) {
    onProgress(`Sending changes to AniList (${index + 1} of ${batch.length})`);
    try {
      const saved = await client.saveEntry({ mediaId: push.mediaId, status: toRemoteStatus(push.status) });
      await putSyncLinks([{ ...makeLink(push.mediaId, push.contentItemId, push.status, null), entryId: saved.id, remoteProgress: saved.progress ?? 0, remoteUpdatedAtMs: (saved.updatedAt || 0) * 1000 }]);
      summary.pushed += 1;
      if (sleepMs) await sleep(sleepMs);
    } catch (error) {
      if (error.code === 'UNAUTHORIZED') { await clearAccount(); throw error; }
      stopped = error;
      summary.pending += batch.length - index;
      break;
    }
  }
  if (stopped) summary.notes.push(stopped.code === 'RATE_LIMITED' ? stopped.message : `Stopped early: ${stopped.message}`);
  if (summary.pending && !stopped) summary.notes.push(`${summary.pending} more changes will go out next time you sync.`);

  const fresh = await getAccount();
  if (fresh) await saveAccount({ ...fresh, lastSync: summary });
  return summary;
}

export function describeSummary(summary) {
  if (!summary) return 'Not synced yet.';
  const parts = [];
  if (summary.pulled) parts.push(`${summary.pulled} updated here`);
  if (summary.pushed) parts.push(`${summary.pushed} sent to AniList`);
  if (summary.conflicts) parts.push(`${summary.conflicts} conflict${summary.conflicts === 1 ? '' : 's'} (newer change kept)`);
  if (summary.hiddenAdult) parts.push(`${summary.hiddenAdult} adult title${summary.hiddenAdult === 1 ? '' : 's'} skipped`);
  if (summary.removedRemotely) parts.push(`${summary.removedRemotely} no longer on AniList (kept here)`);
  if (summary.unlinked) parts.push(`${summary.unlinked} not linked to AniList yet`);
  const lead = parts.length ? parts.join(', ') : 'Everything matches';
  return [`${lead}.`, ...(summary.notes || [])].join(' ');
}
