import { deleteRecord, getAllRecords, getByIndex, getRecord, putMany, putRecord } from '../database.js';
import { normalizeContentItem } from '../models.js';

const LOCAL_PROFILE_ID = 'local-default';
const makeId = () => globalThis.crypto?.randomUUID ? crypto.randomUUID() : `tml-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
const libraryIdFor = contentItemId => `${LOCAL_PROFILE_ID}:${contentItemId}`;

export async function cacheCatalogueItems(items) {
  const now = new Date().toISOString();
  const contentItems = [];
  const sourceEntries = [];
  for (const raw of items) {
    let canonicalId = raw.id;
    if (raw.sourceId && raw.externalId) {
      const sourceKey = `${raw.sourceId}:${raw.externalId}`;
      const mapped = await getRecord('sourceEntries', sourceKey);
      canonicalId = mapped?.contentItemId || makeId();
    } else if (!canonicalId || String(canonicalId).startsWith('mangadex:')) {
      canonicalId = makeId();
    }
    const item = normalizeContentItem({ ...raw, id: canonicalId });
    const existing = await getRecord('contentItems', item.id);
    item.createdAt = existing?.createdAt || item.createdAt;
    item.updatedAt = now;
    contentItems.push(item);
    if (item.sourceId && item.externalId) {
      sourceEntries.push({
        id: `${item.sourceId}:${item.externalId}`,
        contentItemId: item.id,
        sourceId: item.sourceId,
        externalId: item.externalId,
        sourceUrl: item.sourceUrl || null,
        sourceTitle: item.title,
        language: item.language || null,
        availabilityStatus: 'available',
        lastCheckedAt: now
      });
    }
  }
  await Promise.all([putMany('contentItems', contentItems), putMany('sourceEntries', sourceEntries)]);
  return contentItems;
}

export async function getCatalogueItems() {
  return getAllRecords('contentItems');
}

export async function getLibraryItems() {
  const entries = await getAllRecords('libraryEntries');
  const joined = await Promise.all(entries.map(async entry => ({ ...entry, item: await getRecord('contentItems', entry.contentItemId) })));
  return joined.filter(entry => entry.item).sort((a, b) => String(b.updatedAt || b.addedAt).localeCompare(String(a.updatedAt || a.addedAt)));
}

export async function getLibraryEntry(contentItemId) {
  return getRecord('libraryEntries', libraryIdFor(contentItemId));
}

export async function addToLibrary(rawItem, personalStatus = 'planned') {
  const [item] = await cacheCatalogueItems([rawItem]);
  const id = libraryIdFor(item.id);
  const existing = await getRecord('libraryEntries', id);
  const now = new Date().toISOString();
  const entry = {
    id,
    profileId: LOCAL_PROFILE_ID,
    contentItemId: item.id,
    personalStatus: personalStatus || existing?.personalStatus || 'planned',
    isFavorite: existing?.isFavorite || false,
    userRating: existing?.userRating ?? null,
    customTitle: existing?.customTitle || null,
    notes: existing?.notes || null,
    addedAt: existing?.addedAt || now,
    updatedAt: now
  };
  await putRecord('libraryEntries', entry);
  await putRecord('activityEvents', { id: makeId(), type: existing ? 'library_entry_updated' : 'library_entry_added', contentItemId: item.id, occurredAt: now });
  return { ...entry, item };
}

export async function removeFromLibrary(contentItemId) {
  const id = libraryIdFor(contentItemId);
  const memberships = await getByIndex('collectionItems', 'libraryEntryId', id);
  await Promise.all(memberships.map(row => deleteRecord('collectionItems', row.id)));
  await deleteRecord('libraryEntries', id);
  await putRecord('activityEvents', { id: makeId(), type: 'library_entry_removed', contentItemId, occurredAt: new Date().toISOString() });
}

export async function setLibraryStatus(rawItem, personalStatus) {
  const allowed = ['planned', 'reading', 'completed', 'paused', 'dropped'];
  if (!allowed.includes(personalStatus)) throw new Error('Unknown library status.');
  const entry = await addToLibrary(rawItem, personalStatus);
  const now = new Date().toISOString();
  const updated = { ...entry, personalStatus, updatedAt: now };
  delete updated.item;
  await putRecord('libraryEntries', updated);
  await putRecord('activityEvents', { id: makeId(), type: personalStatus === 'completed' ? 'title_completed' : 'reading_status_changed', contentItemId: rawItem.id, occurredAt: now });
  return { ...updated, item: entry.item };
}

export async function toggleFavorite(contentItemId) {
  const existing = await getRecord('libraryEntries', libraryIdFor(contentItemId));
  if (!existing) throw new Error('Add this title to your library first.');
  const updated = { ...existing, isFavorite: !existing.isFavorite, updatedAt: new Date().toISOString() };
  await putRecord('libraryEntries', updated);
  return updated;
}

export async function getCollections() {
  return (await getAllRecords('collections')).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function createCollection(name) {
  const cleanName = String(name || '').trim().slice(0, 80);
  if (!cleanName) throw new Error('Enter a collection name.');
  const existing = (await getCollections()).some(row => row.name.toLowerCase() === cleanName.toLowerCase());
  if (existing) throw new Error('A collection with that name already exists.');
  const now = new Date().toISOString();
  const row = { id: makeId(), name: cleanName, description: '', collectionType: 'manual', icon: '📚', color: null, sortMode: 'title', filterRules: null, createdAt: now, updatedAt: now };
  await putRecord('collections', row);
  return row;
}

export async function getCollectionItemIds(collectionId) {
  return getByIndex('collectionItems', 'collectionId', collectionId);
}

export async function addItemToCollection(collectionId, contentItemId) {
  const libraryEntry = await getLibraryEntry(contentItemId);
  if (!libraryEntry) throw new Error('Add this title to your library before placing it in a collection.');
  const membership = { id: `${collectionId}:${libraryEntry.id}`, collectionId, libraryEntryId: libraryEntry.id, position: Date.now(), addedAt: new Date().toISOString() };
  await putRecord('collectionItems', membership);
}

export async function getCollectionLibraryItems(collectionId) {
  const memberships = await getCollectionItemIds(collectionId);
  const entries = await Promise.all(memberships.map(async membership => {
    const entry = await getRecord('libraryEntries', membership.libraryEntryId);
    return entry ? { ...entry, item: await getRecord('contentItems', entry.contentItemId) } : null;
  }));
  return entries.filter(entry => entry?.item);
}

export async function exportBackup() {
  const storeNames = ['contentItems','sourceEntries','libraryEntries','collections','collectionItems','readingProgress','chapterProgress','bookmarks','localFiles','appSettings','sourceSettings','readingSessions','activityEvents'];
  const stores = {};
  for (const name of storeNames) stores[name] = await getAllRecords(name);
  return { app: 'Tokyo Manga Lab', formatVersion: 1, exportedAt: new Date().toISOString(), stores };
}

export async function importBackup(backup) {
  if (!backup || backup.app !== 'Tokyo Manga Lab' || backup.formatVersion !== 1 || !backup.stores || typeof backup.stores !== 'object') {
    throw new Error('This is not a supported Tokyo Manga Lab backup.');
  }
  const allowedStores = ['contentItems','sourceEntries','libraryEntries','collections','collectionItems','readingProgress','chapterProgress','bookmarks','localFiles','appSettings','sourceSettings','readingSessions','activityEvents'];
  for (const name of allowedStores) {
    const rows = backup.stores[name];
    if (rows === undefined) continue;
    if (!Array.isArray(rows) || rows.length > 100000) throw new Error(`Backup store ${name} has an invalid format.`);
  }
  for (const name of allowedStores) {
    const rows = backup.stores[name];
    if (Array.isArray(rows) && rows.length) await putMany(name, rows);
  }
}
