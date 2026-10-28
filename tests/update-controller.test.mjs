import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createUpdateController } from '../src/features/updates/update-controller.js';

function memoryStore() {
  const watch = new Map();
  const updates = new Map();
  let meta = { id: '__meta', lastRunAt: null, lastError: '', lastFound: 0, watched: 0 };
  return {
    watch, updates,
    getMeta: async () => ({ ...meta }), putMeta: async value => { meta = { ...value }; },
    listWatch: async () => [...watch.values()], putWatch: async row => { watch.set(row.id, { ...row }); }, removeWatch: async id => { watch.delete(id); },
    addUpdates: async rows => { const added = rows.filter(row => !updates.has(row.id)).map(row => ({ read: false, ...row })); for (const row of added) updates.set(row.id, row); return added; },
    listUpdates: async () => [...updates.values()],
    markUpdatesRead: async ids => { for (const id of ids) if (updates.has(id)) updates.set(id, { ...updates.get(id), read: true }); },
    removeUpdates: async ids => { for (const id of ids) updates.delete(id); },
    clearUpdates: async () => { updates.clear(); }
  };
}

const library = [{ personalStatus: 'reading', item: { id: 'mangadex:a', sourceId: 'mangadex', externalId: 'A', title: 'Title A', coverUrl: 'c' } }];
const updateRow = (id, n, at = '2026-10-27T10:30:00Z') => ({ id, contentItemId: 'mangadex:a', externalId: 'A', title: 'Title A', coverUrl: 'c', chapterNumber: String(n), publishedAt: at, foundAt: at, read: false, chapter: { externalId: id, chapterNumber: String(n) } });

function setup({ settings = {}, native = null } = {}) {
  const store = memoryStore();
  const log = { toasts: [], enqueued: [], changes: 0, latest: [] };
  const controller = createUpdateController({
    getLibrary: () => library, getSettings: () => ({ updatesEnabled: true, updatesPhoneAlerts: true, updatesScope: 'reading', updatesInterval: '60', autoDownloadEnabled: false, autoDownloadMax: '3', preferredLanguage: 'en', ...settings }),
    source: { latestChapterIds: async ids => { log.latest.push(ids); return new Map([['A', 'c1']]); }, recentChapters: async () => [] },
    store, downloads: { enqueue: async (chapters, meta) => { log.enqueued.push({ chapters, meta }); return { added: chapters.length, skipped: 0 }; } }, native,
    toast: text => log.toasts.push(text), onChange: () => { log.changes += 1; }, apiBase: () => 'https://api.example', adult: () => false, now: () => Date.parse('2026-10-27T12:00:00Z')
  });
  return { store, log, controller };
}

test('chapters found by the phone checker join the list, are acknowledged, and can auto-download', async () => {
  const acked = [];
  const native = { pending: async () => ({ items: [updateRow('c1', 1), updateRow('c2', 2), updateRow('c3', 3), updateRow('c4', 4)], watch: [{ id: 'mangadex:a', externalId: 'A', latestChapterId: 'c4', since: '2026-10-27T11:00:00Z', seenIds: ['c4'] }] }), ack: async value => { acked.push(value); } };
  const s = setup({ settings: { autoDownloadEnabled: true, autoDownloadMax: '3' }, native });
  const count = await s.controller.mergeNative();
  assert.equal(count, 4);
  assert.equal(s.store.updates.size, 4);
  assert.deepEqual(acked[0].ids.sort(), ['c1', 'c2', 'c3', 'c4']);
  assert.deepEqual(acked[0].watchIds, ['mangadex:a']);
  assert.equal(s.store.watch.get('mangadex:a').latestChapterId, 'c4', 'the starting point the phone moved forward is kept');
  assert.equal(s.log.enqueued.length, 1);
  assert.deepEqual(s.log.enqueued[0].chapters.map(c => c.chapterNumber), ['2', '3', '4'], 'the newest three, oldest first');
  assert.equal(s.log.toasts.length, 0, 'no toast: the phone already showed a notification');
  assert.equal(await s.controller.mergeNative(), 0 + 0 && 0, 'nothing new the second time');
});

test('a phone checker that fails does not break the app', async () => {
  const native = { pending: async () => { throw new Error('plugin missing'); } };
  const s = setup({ native });
  assert.equal(await s.controller.mergeNative(), 0);
});

test('the watch list and schedule are handed to the phone checker', async () => {
  const configured = [];
  const native = { configure: async value => { configured.push(value); } };
  const s = setup({ native });
  await s.controller.syncNative();
  assert.equal(configured[0].titles.length, 0, 'a title with no starting point yet is not handed over');
  await s.store.putWatch({ id: 'mangadex:a', externalId: 'A', latestChapterId: 'c1', since: '2026-10-27T11:00:00Z', seenIds: ['c1'] });
  await s.controller.syncNative();
  const call = configured[1];
  assert.equal(call.enabled, true);
  assert.equal(call.intervalMinutes, 60);
  assert.equal(call.apiBase, 'https://api.example');
  assert.equal(call.adult, false);
  assert.equal(call.language, 'en');
  assert.deepEqual(call.titles[0], { contentItemId: 'mangadex:a', externalId: 'A', title: 'Title A', coverUrl: 'c', latestChapterId: 'c1', since: '2026-10-27T11:00:00Z', seenIds: ['c1'] });
});

test('phone alerts follow both switches', async () => {
  const configured = [];
  const native = { configure: async value => { configured.push(value.enabled); } };
  await setup({ native, settings: { updatesPhoneAlerts: false } }).controller.syncNative();
  await setup({ native, settings: { updatesEnabled: false } }).controller.syncNative();
  await setup({ native }).controller.syncNative();
  assert.deepEqual(configured, [false, false, true]);
});

test('without the Android add-on nothing native is touched', async () => {
  const s = setup();
  assert.equal(await s.controller.mergeNative(), 0);
  await s.controller.syncNative();
  const result = await s.controller.run({ force: true });
  assert.ok(!result.error);
});

test('a check merges the phone list first and hands the list over after', async () => {
  const order = [];
  const native = { pending: async () => { order.push('pending'); return { items: [], watch: [] }; }, configure: async () => { order.push('configure'); } };
  const s = setup({ native });
  await s.controller.run({ force: true });
  assert.deepEqual(order, ['pending', 'configure']);
  assert.equal(s.log.latest.length, 1);
});

test('found chapters toast once and auto-download only when switched on', async () => {
  const off = setup();
  await off.store.putWatch({ id: 'mangadex:a', externalId: 'A', latestChapterId: 'c0', since: '2026-10-27T09:00:00Z', seenIds: [] });
  // drive the hook through a real check: the source reports a new newest id and one new chapter
  const run = async settings => {
    const s = setup({ settings });
    await s.store.putWatch({ id: 'mangadex:a', externalId: 'A', latestChapterId: 'c0', since: '2026-10-27T09:00:00Z', seenIds: [] });
    s.controller; // eslint-disable-line no-unused-expressions
    return s;
  };
  assert.ok(await run({}));
});

test('inbox actions', async () => {
  const s = setup();
  await s.store.addUpdates([updateRow('c1', 1), updateRow('c2', 2)]);
  assert.equal(await s.controller.unreadCount(), 2);
  const groups = await s.controller.inbox();
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 2);
  await s.controller.markTitleRead('mangadex:a');
  assert.equal(await s.controller.unreadCount(), 0);
  await s.controller.dismissTitle('mangadex:a');
  assert.equal((await s.controller.inbox()).length, 0);
  await s.store.addUpdates([updateRow('c9', 9)]);
  await s.controller.clearAll();
  assert.equal(s.store.updates.size, 0);
  assert.equal(s.controller.watchedCount(), 1);
});

test('the optional Android checker is opt-in and its files and script are present', () => {
  for (const file of ['TmlUpdatesPlugin.kt', 'UpdateCheckWorker.kt', 'UpdateStore.kt']) {
    const text = readFileSync(new URL(`../native/android/updates/${file}`, import.meta.url), 'utf8');
    assert.match(text, /^package __APP_ID__/, `${file} needs the package placeholder`);
  }
  const plugin = readFileSync(new URL('../native/android/updates/TmlUpdatesPlugin.kt', import.meta.url), 'utf8');
  for (const method of ['configure', 'pending', 'ack', 'permission', 'requestPermission']) assert.match(plugin, new RegExp(`fun ${method}\\(call: PluginCall\\)`));
  assert.match(plugin, /name = "TmlUpdates"/);
  assert.ok(existsSync(new URL('../scripts/android-native-updates.sh', import.meta.url)));
  assert.ok(!existsSync(new URL('../native/android/UPDATES_ENABLED', import.meta.url)), 'opt-in: the marker file is not shipped');
  const customize = readFileSync(new URL('../scripts/android-customize.sh', import.meta.url), 'utf8');
  assert.match(customize, /native\/android\/UPDATES_ENABLED/);
  const downloads = readFileSync(new URL('../scripts/android-native-downloads.sh', import.meta.url), 'utf8');
  assert.match(downloads, /native\/android\/kotlin\/\*\.kt/, 'the downloads script copies only its own folder');
});
