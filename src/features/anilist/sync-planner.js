// Pure three-way sync planner. No storage, no network, so it is easy to test.
//
// remote: [{ mediaId, status, updatedAtMs }]           AniList entries, status already in local vocabulary
// local:  [{ contentItemId, mediaId, status, updatedAtMs }]   library entries that have an AniList id
// bases:  { [mediaId]: status }                         the status both sides agreed on at the last sync
//
// Rules
//  * Same status on both sides: nothing to do.
//  * Only one side changed since the last sync: that side wins.
//  * Both changed (or no history): the more recent change wins and it is reported as a conflict.
//  * Nothing is ever deleted on either side.
export function planSync({ remote = [], local = [], bases = {}, pushEnabled = false } = {}) {
  const plan = { pulls: [], pushes: [], inSync: [], conflicts: [], removedRemotely: [], skippedPush: [] };
  const localByMedia = new Map(local.filter(row => row.mediaId != null).map(row => [String(row.mediaId), row]));
  const remoteIds = new Set();

  for (const entry of remote) {
    const mediaId = String(entry.mediaId);
    remoteIds.add(mediaId);
    const mine = localByMedia.get(mediaId);
    if (!mine) { plan.pulls.push({ mediaId, contentItemId: null, status: entry.status, reason: 'new-locally' }); continue; }
    if (mine.status === entry.status) { plan.inSync.push({ mediaId, contentItemId: mine.contentItemId, status: entry.status }); continue; }

    const base = bases[mediaId] ?? null;
    let winner;
    let conflict = false;
    if (base && mine.status === base) winner = 'remote';
    else if (base && entry.status === base) winner = 'local';
    else { conflict = true; winner = (mine.updatedAtMs || 0) > (entry.updatedAtMs || 0) ? 'local' : 'remote'; }
    if (conflict) plan.conflicts.push({ mediaId, contentItemId: mine.contentItemId, local: mine.status, remote: entry.status, winner });

    if (winner === 'remote') plan.pulls.push({ mediaId, contentItemId: mine.contentItemId, status: entry.status, reason: conflict ? 'conflict-remote-newer' : 'changed-on-anilist' });
    else if (pushEnabled) plan.pushes.push({ mediaId, contentItemId: mine.contentItemId, status: mine.status, reason: conflict ? 'conflict-local-newer' : 'changed-here' });
    else plan.skippedPush.push({ mediaId, contentItemId: mine.contentItemId, status: mine.status });
  }

  for (const mine of local) {
    if (mine.mediaId == null || remoteIds.has(String(mine.mediaId))) continue;
    if (bases[String(mine.mediaId)]) { plan.removedRemotely.push({ mediaId: String(mine.mediaId), contentItemId: mine.contentItemId }); continue; }
    if (pushEnabled) plan.pushes.push({ mediaId: String(mine.mediaId), contentItemId: mine.contentItemId, status: mine.status, reason: 'new-on-anilist' });
    else plan.skippedPush.push({ mediaId: String(mine.mediaId), contentItemId: mine.contentItemId, status: mine.status });
  }
  return plan;
}
