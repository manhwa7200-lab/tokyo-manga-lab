import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateChecker } from '../src/features/updates/update-checker.js';

function memoryStore() {
  const watch = new Map();
  const updates = new Map();
  let meta = { id: '__meta', lastRunAt: null, lastError: '', lastFound: 0, watched: 0 };
  return {
    watch, updates,
    getMeta: async () => ({ ...meta }), putMeta: async value => { meta = { ...value }; },
    listWatch: async () => [...watch.values()].map(row => ({ ...row })), putWatch: async row => { watch.set(row.id, { ...row }); }, removeWatch: async id => { watch.delete(id); },
    addUpdates: async rows => { const added = rows.filter(row => !updates.has(row.id)); for (const row of added) updates.set(row.id, row); return added; }
  };
}

const TITLE = { contentItemId: 'mangadex:a', externalId: 'A', title: 'Title A', coverUrl: '' };
const TITLE_B = { contentItemId: 'mangadex:b', externalId: 'B', title: 'Title B', coverUrl: '' };
const chapter = (id, at, n) => ({ externalId: id, chapterNumber: n, publishedAt: at, language: 'en', pages: 10 });

function setup({ titles = [TITLE], settings = {}, latest, chapters } = {}) {
  const store = memoryStore();
  const clock = { t: Date.parse('2026-10-27T10:00:00Z') };
  const calls = { latest: [], chapters: [], found: [] };
  const checker = createUpdateChecker({
    getFollowed: async () => titles, getSettings: () => ({ updatesEnabled: true, updatesInterval: '60', ...settings }),
    fetchLatestIds: async ids => { calls.latest.push(ids); return latest(ids); },
    fetchChapters: async id => { calls.chapters.push(id); return chapters(id); },
    store, onFound: async rows => { calls.found.push(rows); }, now: () => clock.t, sleep: async () => {}, gapMs: 0
  });
  return { store, clock, calls, checker };
}

test('first sight only records a starting point: nothing already out is reported', async () => {
  const s = setup({ latest: () => new Map([['A', 'c1']]), chapters: () => [chapter('c1', '2026-10-27T09:00:00Z', '1')] });
  const result = await s.checker.run({ force: true });
  assert.equal(result.found, 0);
  assert.equal(s.calls.chapters.length, 0, 'no chapter list was fetched');
  assert.equal(s.store.watch.get('mangadex:a').latestChapterId, 'c1');
  assert.equal(s.calls.found.length, 0);
});

test('an unchanged newest chapter id costs no chapter-list request', async () => {
  const s = setup({ latest: () => new Map([['A', 'c1']]), chapters: () => [] });
  await s.checker.run({ force: true });
  s.clock.t += 2 * 3600 * 1000;
  await s.checker.run();
  assert.equal(s.calls.chapters.length, 0);
  assert.equal(s.calls.latest.length, 2);
});

test('a changed newest chapter id finds the new chapter once, and reports it to the hook', async () => {
  let newest = 'c1';
  const s = setup({
    latest: () => new Map([['A', newest]]),
    chapters: () => [chapter('c2', '2026-10-27T10:20:00Z', '2'), chapter('c1', '2026-10-27T09:00:00Z', '1')]
  });
  await s.checker.run({ force: true });
  s.clock.t += 3600 * 1000 + 5000;
  newest = 'c2';
  const result = await s.checker.run();
  assert.equal(result.found, 1);
  assert.equal(s.calls.found[0][0].id, 'c2');
  assert.equal(s.calls.found[0][0].chapter.externalId, 'c2');
  assert.equal(s.store.watch.get('mangadex:a').latestChapterId, 'c2');
  s.clock.t += 3600 * 1000 + 5000;
  await s.checker.run();
  assert.equal(s.calls.found.length, 1, 'the same chapter is not reported again');
  assert.equal(s.calls.chapters.length, 1);
});

test('a chapter the person already dismissed does not come back', async () => {
  let newest = 'c1';
  const list = [chapter('c2', '2026-10-27T10:20:00Z', '2'), chapter('c1', '2026-10-27T09:00:00Z', '1')];
  const s = setup({ latest: () => new Map([['A', newest]]), chapters: () => list });
  await s.checker.run({ force: true });
  s.clock.t += 3700 * 1000; newest = 'c2';
  await s.checker.run();
  s.store.updates.clear(); // dismissed from the inbox
  s.clock.t += 3700 * 1000; newest = 'c3';
  const again = await s.checker.run();
  assert.equal(again.found, 0);
});

test('not due, switched off, and single-flight', async () => {
  const s = setup({ latest: () => new Map([['A', 'c1']]), chapters: () => [] });
  await s.checker.run({ force: true });
  s.clock.t += 600 * 1000;
  assert.deepEqual(await s.checker.run(), { skipped: 'not-due' });
  const off = setup({ settings: { updatesEnabled: false }, latest: () => new Map(), chapters: () => [] });
  assert.deepEqual(await off.checker.run(), { skipped: 'off' });
  assert.equal(off.calls.latest.length, 0);
  const forced = await off.checker.run({ force: true });
  assert.ok(!forced.skipped, 'Check now works even when automatic checks are off');
  const one = setup({ latest: () => new Map([['A', 'c1']]), chapters: () => [] });
  const [x, y] = [one.checker.run({ force: true }), one.checker.run({ force: true })];
  assert.equal(x, y);
  await x;
  assert.equal(one.calls.latest.length, 1);
});

test('without a batch route each title is read directly, a starting point first', async () => {
  let list = [chapter('c1', '2026-10-27T09:00:00Z', '1')];
  const s = setup({ latest: () => null, chapters: () => list });
  await s.checker.run({ force: true });
  assert.equal(s.store.watch.get('mangadex:a').latestChapterId, 'c1');
  assert.equal(s.calls.found.length, 0);
  s.clock.t += 3700 * 1000;
  list = [chapter('c2', '2026-10-27T10:30:00Z', '2'), ...list];
  const result = await s.checker.run();
  assert.equal(result.found, 1);
});

test('a catalogue that cannot be reached keeps the last good time and says so', async () => {
  const s = setup({ latest: () => { throw new Error('offline'); }, chapters: () => [] });
  await s.store.putMeta({ lastRunAt: '2026-10-27T08:00:00.000Z', lastError: '', lastFound: 0, watched: 1 });
  const result = await s.checker.run({ force: true });
  assert.equal(result.error, 'offline');
  const meta = await s.store.getMeta();
  assert.equal(meta.lastRunAt, '2026-10-27T08:00:00.000Z');
  assert.equal(meta.lastError, 'offline');
  assert.equal(s.checker.snapshot().running, false);
});

test('a rate limit stops the run but keeps what was found', async () => {
  let newest = { A: 'c1', B: 'd1' };
  const s = setup({
    titles: [TITLE, TITLE_B], latest: () => new Map(Object.entries(newest)),
    chapters: id => { if (id === 'A') return [chapter('c2', '2026-10-27T10:30:00Z', '2')]; const e = new Error('slow down'); e.code = 'RATE_LIMITED'; throw e; }
  });
  await s.checker.run({ force: true });
  s.clock.t += 3700 * 1000; newest = { A: 'c2', B: 'd2' };
  const result = await s.checker.run();
  assert.equal(result.found, 1);
  assert.match(result.error, /rate-limiting/);
  assert.equal(s.store.watch.get('mangadex:b').latestChapterId, 'd1', 'B stays as it was and is retried next time');
});

test('a title that is no longer followed is forgotten', async () => {
  const titles = [TITLE, TITLE_B];
  const s = setup({ titles, latest: ids => new Map(ids.map(id => [id, 'x'])), chapters: () => [] });
  await s.checker.run({ force: true });
  assert.equal(s.store.watch.size, 2);
  titles.pop();
  await s.checker.run({ force: true });
  assert.equal(s.store.watch.size, 1);
});

test('a title the Worker leaves out (not available here) is skipped quietly', async () => {
  const s = setup({ latest: () => new Map(), chapters: () => [] });
  const result = await s.checker.run({ force: true });
  assert.equal(result.checked, 0);
  assert.equal(s.store.watch.size, 0);
});
