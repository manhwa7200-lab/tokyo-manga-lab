// Storage for the AniList connection. Tokens live in the `accountLinks` store, which is never included in backups.
import { deleteRecord, getAllRecords, getRecord, putMany, putRecord } from '../../data/database.js';

const PROVIDER = 'anilist';
const PENDING = 'anilist-pending';

export const getAccount = () => getRecord('accountLinks', PROVIDER);
export const saveAccount = account => putRecord('accountLinks', { ...account, provider: PROVIDER });
export const clearAccount = () => deleteRecord('accountLinks', PROVIDER);

export const markAuthAttempt = (now = Date.now()) => putRecord('accountLinks', { provider: PENDING, startedAt: now });
export const getAuthAttempt = () => getRecord('accountLinks', PENDING);
export const clearAuthAttempt = () => deleteRecord('accountLinks', PENDING);

export async function getSyncLinks(userId) {
  const rows = await getAllRecords('syncLinks');
  return new Map(rows.filter(row => row.provider === PROVIDER && row.userId === userId).map(row => [row.mediaId, row]));
}
export const putSyncLinks = rows => putMany('syncLinks', rows);
export const clearSyncLinks = async () => { for (const row of await getAllRecords('syncLinks')) await deleteRecord('syncLinks', row.id); };

export const syncLinkId = mediaId => `${PROVIDER}:${mediaId}`;

export const getOutbox = async () => (await getAllRecords('syncOutbox')).filter(row => row.provider === PROVIDER && row.status !== 'done');
export const putOutbox = row => putRecord('syncOutbox', row);
export const deleteOutbox = id => deleteRecord('syncOutbox', id);
