const DB_NAME = 'tokyo-manga-lab';
const DB_VERSION = 2;

const STORE_DEFS = {
  contentItems: { keyPath: 'id', indexes: { title: 'title', contentType: 'contentType', updatedAt: 'updatedAt' } },
  sourceEntries: { keyPath: 'id', indexes: { contentItemId: 'contentItemId', sourceId: 'sourceId', externalId: 'externalId', sourceExternal: { keyPath: ['sourceId', 'externalId'], options: { unique: false } } } },
  chapterRecords: { keyPath: 'id', indexes: { contentItemId: 'contentItemId', sourceEntryId: 'sourceEntryId', sortOrder: ['contentItemId', 'sortOrder'] } },
  chapterAssets: { keyPath: 'id', indexes: { chapterRecordId: 'chapterRecordId', position: ['chapterRecordId', 'position'] } },
  libraryEntries: { keyPath: 'id', indexes: { contentItemId: 'contentItemId', profileContent: { keyPath: ['profileId', 'contentItemId'], options: { unique: true } }, personalStatus: 'personalStatus', addedAt: 'addedAt', updatedAt: 'updatedAt' } },
  collections: { keyPath: 'id', indexes: { name: 'name', updatedAt: 'updatedAt' } },
  collectionItems: { keyPath: 'id', indexes: { collectionId: 'collectionId', libraryEntryId: 'libraryEntryId', membership: { keyPath: ['collectionId', 'libraryEntryId'], options: { unique: true } } } },
  savedViews: { keyPath: 'id', indexes: { name: 'name' } },
  readingProgress: { keyPath: 'id', indexes: { contentItemId: 'contentItemId', profileContent: { keyPath: ['profileId', 'contentItemId'], options: { unique: true } }, updatedAt: 'updatedAt' } },
  chapterProgress: { keyPath: 'id', indexes: { contentItemId: 'contentItemId', chapterRecordId: 'chapterRecordId', readingState: 'readingState' } },
  bookmarks: { keyPath: 'id', indexes: { contentItemId: 'contentItemId', chapterRecordId: 'chapterRecordId', createdAt: 'createdAt' } },
  localFiles: { keyPath: 'id', indexes: { checksum: 'checksum', importedAt: 'importedAt' } },
  downloadJobs: { keyPath: 'id', indexes: { status: 'status', updatedAt: 'updatedAt' } },
  downloadedAssets: { keyPath: 'id', indexes: { chapterRecordId: 'chapterRecordId', storageKey: 'storageKey' } },
  appSettings: { keyPath: 'key', indexes: { updatedAt: 'updatedAt' } },
  sourceSettings: { keyPath: 'sourceId', indexes: { isEnabled: 'isEnabled' } },
  apiCache: { keyPath: 'cacheKey', indexes: { expiresAt: 'expiresAt', sourceId: 'sourceId' } },
  readingSessions: { keyPath: 'id', indexes: { contentItemId: 'contentItemId', startedAt: 'startedAt' } },
  statisticsCache: { keyPath: 'key', indexes: { updatedAt: 'updatedAt' } },
  syncOutbox: { keyPath: 'id', indexes: { status: 'status', createdAt: 'createdAt' } },
  activityEvents: { keyPath: 'id', indexes: { occurredAt: 'occurredAt', type: 'type' } },
  accountLinks: { keyPath: 'provider' },
  syncLinks: { keyPath: 'id', indexes: { contentItemId: 'contentItemId', provider: 'provider' } },
  schemaMeta: { keyPath: 'key' }
};

let databasePromise;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

export function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('This browser does not support IndexedDB. Open the site in a modern browser.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = event => {
      const db = event.target.result;
      for (const [storeName, def] of Object.entries(STORE_DEFS)) {
        const store = db.objectStoreNames.contains(storeName)
          ? event.target.transaction.objectStore(storeName)
          : db.createObjectStore(storeName, { keyPath: def.keyPath });
        for (const [indexName, indexDef] of Object.entries(def.indexes || {})) {
          if (store.indexNames.contains(indexName)) continue;
          const keyPath = typeof indexDef === 'string' || Array.isArray(indexDef) ? indexDef : indexDef.keyPath;
          const options = typeof indexDef === 'object' && !Array.isArray(indexDef) ? (indexDef.options || {}) : {};
          store.createIndex(indexName, keyPath, options);
        }
      }
      const meta = event.target.transaction.objectStore('schemaMeta');
      meta.put({ key: 'schemaVersion', value: DB_VERSION, updatedAt: new Date().toISOString() });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); databasePromise = null; };
      resolve(db);
    };
    request.onerror = () => { databasePromise = null; reject(request.error || new Error('Could not open local database.')); };
    request.onblocked = () => reject(new Error('Database upgrade is blocked by another open tab. Close other Tokyo Manga Lab tabs and retry.'));
  });
  return databasePromise;
}

export async function getRecord(storeName, key) {
  const db = await openDatabase();
  return requestResult(db.transaction(storeName, 'readonly').objectStore(storeName).get(key));
}

export async function getAllRecords(storeName) {
  const db = await openDatabase();
  return requestResult(db.transaction(storeName, 'readonly').objectStore(storeName).getAll());
}

export async function getByIndex(storeName, indexName, value) {
  const db = await openDatabase();
  return requestResult(db.transaction(storeName, 'readonly').objectStore(storeName).index(indexName).getAll(value));
}

export async function putRecord(storeName, record) {
  const db = await openDatabase();
  return requestResult(db.transaction(storeName, 'readwrite').objectStore(storeName).put(record));
}

export async function putMany(storeName, records) {
  if (!Array.isArray(records) || records.length === 0) return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const record of records) store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error(`Could not write ${storeName}.`));
    tx.onabort = () => reject(tx.error || new Error(`Write to ${storeName} was aborted.`));
  });
}

export async function deleteRecord(storeName, key) {
  const db = await openDatabase();
  return requestResult(db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key));
}

export async function clearStore(storeName) {
  const db = await openDatabase();
  return requestResult(db.transaction(storeName, 'readwrite').objectStore(storeName).clear());
}

export async function getAllFromCursor(storeName, indexName, direction = 'next') {
  const db = await openDatabase();
  const store = db.transaction(storeName, 'readonly').objectStore(storeName);
  const source = indexName ? store.index(indexName) : store;
  return new Promise((resolve, reject) => {
    const rows = [];
    const request = source.openCursor(null, direction);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { resolve(rows); return; }
      rows.push(cursor.value);
      cursor.continue();
    };
    request.onerror = () => reject(request.error || new Error('Could not read local database.'));
  });
}

export const STORE_NAMES = Object.freeze(Object.keys(STORE_DEFS));
