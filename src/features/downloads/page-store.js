// Storage adapter for downloaded chapter pages. Image bytes live in their own IndexedDB database, never in the
// metadata stores (CLAUDE.md: keep large binaries out of the structured data). Download records live in `downloadJobs`.
// Pages are only ever read back by this app's reader; nothing here is shared, exported or part of a backup.
const DB_NAME = 'tokyo-manga-lab-pages';
const STORE = 'pages';

export const pageKey = (chapterId, index) => `${chapterId}:${String(index).padStart(4, '0')}`;

// Same interface as the IndexedDB store, kept in memory. Used by unit tests and when IndexedDB is missing.
export function createMemoryPageStore() {
  const map = new Map();
  return {
    kind: 'memory',
    async put(chapterId, index, blob) { map.set(pageKey(chapterId, index), blob); },
    async get(chapterId, index) { return map.get(pageKey(chapterId, index)) || null; },
    async has(chapterId, index) { return map.has(pageKey(chapterId, index)); },
    async count(chapterId) { let n = 0; for (const key of map.keys()) if (key.startsWith(`${chapterId}:`)) n += 1; return n; },
    async removeChapter(chapterId) { for (const key of [...map.keys()]) if (key.startsWith(`${chapterId}:`)) map.delete(key); },
    async clear() { map.clear(); }
  };
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Page storage request failed.'));
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Page storage write failed.'));
    tx.onabort = () => reject(tx.error || new Error('Page storage write was cancelled. The device may be out of space.'));
  });
}

export function createIdbPageStore() {
  let dbPromise;
  const open = () => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open page storage.'));
    });
    return dbPromise;
  };
  const range = chapterId => IDBKeyRange.bound(`${chapterId}:`, `${chapterId}:￿`);
  return {
    kind: 'indexeddb',
    async put(chapterId, index, blob) {
      const tx = (await open()).transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, pageKey(chapterId, index));
      await transactionDone(tx);
    },
    async get(chapterId, index) {
      const tx = (await open()).transaction(STORE, 'readonly');
      return (await requestResult(tx.objectStore(STORE).get(pageKey(chapterId, index)))) || null;
    },
    async has(chapterId, index) {
      const tx = (await open()).transaction(STORE, 'readonly');
      return (await requestResult(tx.objectStore(STORE).count(pageKey(chapterId, index)))) > 0;
    },
    async count(chapterId) {
      const tx = (await open()).transaction(STORE, 'readonly');
      return requestResult(tx.objectStore(STORE).count(range(chapterId)));
    },
    async removeChapter(chapterId) {
      const tx = (await open()).transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(range(chapterId));
      await transactionDone(tx);
    },
    async clear() {
      const tx = (await open()).transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      await transactionDone(tx);
    }
  };
}

export function createPageStore() {
  return typeof indexedDB !== 'undefined' ? createIdbPageStore() : createMemoryPageStore();
}
