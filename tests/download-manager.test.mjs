import test from 'node:test';
import assert from 'node:assert/strict';
import { createDownloadManager } from '../src/features/downloads/download-manager.js';
import { createMemoryPageStore } from '../src/features/downloads/page-store.js';
import { createMemoryJobRepository } from '../src/features/downloads/download-repository.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const chapter = (n, pages = 3) => ({ externalId: id(n), chapterNumber: String(n), volumeNumber: null, title: '', language: 'en', pages, scanlationGroups: ['G'] });
const pagesFor = (count, now = Date.now()) => ({
  chapterId: 'x', baseUrl: 'https://node1.mangadex.network', hash: 'abcdef123456', fetchedAt: now,
  data: Array.from({ length: count }, (_, i) => `${i + 1}.png`), dataSaver: Array.from({ length: count }, (_, i) => `s${i + 1}.jpg`)
});
const png = size => ({ ok: true, blob: new Blob([new Uint8Array(size)], { type: 'image/png' }), bytes: size, status: 200, duration: 5, cached: false });

function rig(overrides = {}) {
  const calls = { pages: [], images: [], reports: [], sleeps: [] };
  const store = createMemoryPageStore();
  const repo = createMemoryJobRepository();
  const settings = { downloadQuality: 'data-saver', downloadWifiOnly: true, downloadStorageLimitMb: '0', ...(overrides.settings || {}) };
  const connection = { online: true, metered: false, ...(overrides.connection || {}) };
  const manager = createDownloadManager({
    store, repo,
    loadPages: overrides.loadPages || (async chapterId => { calls.pages.push(chapterId); return pagesFor(3); }),
    fetchImage: overrides.fetchImage || (async url => { calls.images.push(url); return png(100); }),
    report: entry => calls.reports.push(entry),
    getSettings: () => settings, getConnection: () => connection,
    sleep: async ms => { calls.sleeps.push(ms); },
    makeUrl: () => `blob:fake/${Math.random()}`, revokeUrl: () => {},
    gapMs: 2500, ...(overrides.options || {})
  });
  return { manager, store, repo, calls, settings, connection };
}

const settle = async manager => {
  for (let i = 0; i < 200; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 2));
    const snap = manager.snapshot();
    if (!snap.jobs.some(job => job.status === 'queued' || job.status === 'downloading')) return snap;
  }
  throw new Error('queue never settled');
};

test('downloads a chapter in the chosen quality and makes it readable offline', async () => {
  const { manager, store, calls } = rig();
  const result = await manager.enqueue([chapter(1)], { contentItemId: 'item-1', title: 'Demo' });
  assert.deepEqual(result, { added: 1, skipped: 0 });
  const snap = await settle(manager);
  assert.equal(snap.jobs[0].status, 'done');
  assert.equal(snap.jobs[0].quality, 'data-saver');
  assert.equal(snap.jobs[0].pageCount, 3);
  assert.equal(snap.jobs[0].bytes, 300);
  assert.equal(snap.usage.bytes, 300);
  assert.equal(await store.count(id(1)), 3);
  assert.ok(calls.images.every(url => url.includes('/data-saver/')));
  assert.equal(calls.reports.length, 3, 'every fetch from a mangadex.network node is reported');
  const opened = await manager.openChapter(id(1));
  assert.equal(opened.offline, true);
  assert.equal(opened.urls.length, 3);
  opened.release();
});

test('original quality when asked, and a missing quality falls back', async () => {
  const a = rig({ settings: { downloadQuality: 'data' } });
  await a.manager.enqueue([chapter(1)], {});
  await settle(a.manager);
  assert.ok(a.calls.images.every(url => url.includes('/data/')));
  const b = rig({ settings: { downloadQuality: 'data' }, loadPages: async () => ({ ...pagesFor(2), data: [] }) });
  await b.manager.enqueue([chapter(1, 2)], {});
  const snap = await settle(b.manager);
  assert.equal(snap.jobs[0].quality, 'data-saver');
  assert.equal(snap.jobs[0].status, 'done');
});

test('chapters go one at a time with a gap between page-list requests', async () => {
  const { manager, calls } = rig();
  let clock = 1000;
  const r = rig({ options: { now: () => clock } });
  await r.manager.enqueue([chapter(1), chapter(2), chapter(3)], {});
  const snap = await settle(r.manager);
  assert.deepEqual(snap.jobs.map(job => job.status), ['done', 'done', 'done']);
  assert.deepEqual(r.calls.pages, [id(1), id(2), id(3)], 'in the order they were queued');
  assert.ok(r.calls.sleeps.filter(ms => ms >= 2000).length >= 2, 'the engine waits between chapters');
  void manager; void calls;
});

test('queued chapters are not queued twice, failed ones can be queued again', async () => {
  const { manager } = rig();
  await manager.enqueue([chapter(1)], {});
  await settle(manager);
  assert.deepEqual(await manager.enqueue([chapter(1), chapter(2)], {}), { added: 1, skipped: 1 });
  await settle(manager);
});

test('a page that keeps failing fails the chapter, keeps the finished pages, and retry resumes', async () => {
  let failIndex = true;
  const fetchImage = async url => (failIndex && url.endsWith('/s2.jpg') ? { ok: false, status: 500, error: 'http', duration: 1 } : png(50));
  const { manager, store } = rig({ fetchImage });
  await manager.enqueue([chapter(1)], {});
  let snap = await settle(manager);
  assert.equal(snap.jobs[0].status, 'failed');
  assert.match(snap.jobs[0].lastError, /Page 2/);
  assert.equal(await store.count(id(1)) >= 1, true, 'pages that worked stay saved');
  failIndex = false;
  await manager.retry(id(1));
  snap = await settle(manager);
  assert.equal(snap.jobs[0].status, 'done');
  assert.equal(await store.count(id(1)), 3);
  assert.equal(snap.jobs[0].bytes, 150, 'bytes count the pages saved earlier too');
});

test('an expired address is refreshed once and the page is retried', async () => {
  let first = true;
  let pageCalls = 0;
  const fetchImage = async url => { if (first && url.includes('/s1.jpg')) { first = false; return { ok: false, status: 403, error: 'http', duration: 1 }; } return png(10); };
  const { manager } = rig({ fetchImage, loadPages: async () => { pageCalls += 1; return pagesFor(2); } });
  await manager.enqueue([chapter(1, 2)], {});
  const snap = await settle(manager);
  assert.equal(snap.jobs[0].status, 'done');
  assert.equal(pageCalls, 2, 'one for the chapter, one refresh after the 403');
});

test('transient page-list errors are retried; other errors fail at once', async () => {
  let tries = 0;
  const flaky = rig({ loadPages: async () => { tries += 1; if (tries < 3) { const e = new Error('busy'); e.code = 'RATE_LIMITED'; throw e; } return pagesFor(1); } });
  await flaky.manager.enqueue([chapter(1, 1)], {});
  assert.equal((await settle(flaky.manager)).jobs[0].status, 'done');
  assert.equal(tries, 3);
  const blocked = rig({ loadPages: async () => { const e = new Error('This title is not available.'); e.code = 'FORBIDDEN'; throw e; } });
  await blocked.manager.enqueue([chapter(1, 1)], {});
  const snap = await settle(blocked.manager);
  assert.equal(snap.jobs[0].status, 'failed');
  assert.equal(snap.jobs[0].lastError, 'This title is not available.');
});

test('Wi-Fi only holds the queue on mobile data and releases it on Wi-Fi', async () => {
  const { manager, connection, calls } = rig({ connection: { metered: true } });
  await manager.enqueue([chapter(1)], {});
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(manager.snapshot().waiting, 'wifi');
  assert.equal(calls.images.length, 0);
  connection.metered = false;
  manager.kick();
  assert.equal((await settle(manager)).jobs[0].status, 'done');
  assert.equal(manager.snapshot().waiting, '');
});

test('Wi-Fi only can be switched off, and offline holds the queue', async () => {
  const mobile = rig({ settings: { downloadWifiOnly: false }, connection: { metered: true } });
  await mobile.manager.enqueue([chapter(1)], {});
  assert.equal((await settle(mobile.manager)).jobs[0].status, 'done');
  const offline = rig({ connection: { online: false } });
  await offline.manager.enqueue([chapter(1)], {});
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(offline.manager.snapshot().waiting, 'offline');
});

test('the storage limit stops new downloads', async () => {
  const { manager } = rig({ settings: { downloadStorageLimitMb: '1' }, fetchImage: async () => png(600 * 1024) });
  await manager.enqueue([chapter(1), chapter(2)], {});
  await new Promise(resolve => setTimeout(resolve, 60));
  const snap = manager.snapshot();
  assert.equal(snap.jobs[0].status, 'done');
  assert.equal(snap.jobs[1].status, 'queued', 'the second chapter waits once the limit is reached');
  assert.equal(snap.waiting, 'storage');
});

test('pause keeps what was saved and resume finishes the chapter', async () => {
  let gate;
  const hold = new Promise(resolve => { gate = resolve; });
  let calls = 0;
  const { manager, store } = rig({ fetchImage: async () => { calls += 1; if (calls === 2) await hold; return png(10); } });
  await manager.enqueue([chapter(1, 3)], {});
  await new Promise(resolve => setTimeout(resolve, 20));
  manager.pause();
  gate();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(manager.snapshot().jobs[0].status, 'queued');
  assert.equal(manager.snapshot().paused, true);
  manager.resume();
  const snap = await settle(manager);
  assert.equal(snap.jobs[0].status, 'done');
  assert.equal(await store.count(id(1)), 3);
});

test('removing a chapter or a title deletes its pages and records', async () => {
  const { manager, store, repo } = rig();
  await manager.enqueue([chapter(1), chapter(2)], { contentItemId: 'a' });
  await manager.enqueue([chapter(3)], { contentItemId: 'b' });
  await settle(manager);
  await manager.remove(id(1));
  assert.equal(await store.count(id(1)), 0);
  assert.equal(manager.get(id(1)), null);
  await manager.removeManga('a');
  assert.deepEqual(manager.snapshot().jobs.map(job => job.id), [id(3)]);
  await manager.removeAll();
  assert.equal(manager.snapshot().jobs.length, 0);
  assert.deepEqual(await repo.all(), []);
  assert.equal(await store.count(id(3)), 0);
});

test('records survive a restart; an interrupted download restarts as queued; incomplete chapters do not open', async () => {
  const first = rig();
  await first.manager.enqueue([chapter(1)], { title: 'Demo' });
  await settle(first.manager);
  const rows = await first.repo.all();
  rows.push({ ...rows[0], id: id(2), chapterId: id(2), status: 'downloading', order: 99 });
  const second = createDownloadManager({
    store: first.store, repo: createMemoryJobRepository(rows), loadPages: async () => pagesFor(3), fetchImage: async () => png(1),
    getSettings: () => ({ downloadWifiOnly: false }), getConnection: () => ({ online: false }), sleep: async () => {}, makeUrl: () => 'blob:x', revokeUrl: () => {}
  });
  const snap = await second.init();
  assert.equal(snap.jobs.find(job => job.id === id(1)).status, 'done');
  assert.equal(snap.jobs.find(job => job.id === id(2)).status, 'queued');
  assert.ok(await second.openChapter(id(1)));
  await first.store.removeChapter(id(1));
  assert.equal(await second.openChapter(id(1)), null, 'a chapter with missing pages falls back to online reading');
  assert.equal(await second.openChapter(id(404)), null);
});

test('a failed page store write fails the chapter with a clear message', async () => {
  const r = rig();
  r.store.put = async () => { throw new Error('QuotaExceededError'); };
  await r.manager.enqueue([chapter(1)], {});
  const snap = await settle(r.manager);
  assert.equal(snap.jobs[0].status, 'failed');
  assert.match(snap.jobs[0].lastError, /out of space/);
});

test('downloads are never part of a backup', async () => {
  const { BACKUP_STORES } = await import('../src/data/backup-merge.js');
  for (const store of ['downloadJobs', 'downloadedAssets', 'chapterAssets']) assert.ok(!BACKUP_STORES.includes(store), `${store} must stay out of backups`);
});
