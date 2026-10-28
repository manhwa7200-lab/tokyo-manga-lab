import test from 'node:test';
import assert from 'node:assert/strict';
import { alertText, autoDownloadPlan, checkDue, chunk, followedTitles, groupUpdates, newChapters, pickTitles, statusText, timeAgo, updateRow } from '../src/features/updates/update-plan.js';

const row = (id, status, extra = {}) => ({ personalStatus: status, item: { id: `mangadex:${id}`, sourceId: 'mangadex', externalId: id, title: `T${id}`, coverUrl: '', ...extra } });

test('followed titles follow the scope and skip other sources', () => {
  const library = [row('a', 'reading'), row('b', 'planned'), row('c', 'completed'), row('d', 'reading', { sourceId: 'anilist' }), row('e', 'dropped'), row('a', 'reading')];
  assert.deepEqual(followedTitles(library, 'reading').map(t => t.externalId), ['a']);
  assert.deepEqual(followedTitles(library, 'active').map(t => t.externalId), ['a', 'b']);
  assert.deepEqual(followedTitles(null), []);
});

test('a check is due after the interval and never when the last run is recent', () => {
  const now = Date.parse('2026-10-27T12:00:00Z');
  assert.equal(checkDue(null, {}, now), true);
  assert.equal(checkDue('2026-10-27T11:30:00Z', { updatesInterval: '60' }, now), false);
  assert.equal(checkDue('2026-10-27T10:59:00Z', { updatesInterval: '60' }, now), true);
  assert.equal(checkDue('2026-10-27T11:20:00Z', { updatesInterval: '30' }, now), true);
  assert.equal(checkDue('garbage', {}, now), true);
  assert.equal(checkDue('2026-10-27T11:50:00Z', { updatesInterval: '1' }, now), false, 'an absurdly short interval is raised to the default');
});

test('chunking and picking: never-checked titles first, then the oldest checked', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  const titles = [{ contentItemId: 'x' }, { contentItemId: 'y' }, { contentItemId: 'z' }];
  const watch = new Map([['x', { checkedAt: '2026-10-27T11:00:00Z' }], ['z', { checkedAt: '2026-10-27T09:00:00Z' }]]);
  assert.deepEqual(pickTitles(titles, watch, 2).map(t => t.contentItemId), ['y', 'z']);
});

test('new chapters: published after since (with a short grace), not seen before, oldest first', () => {
  const watch = { since: '2026-10-27T10:00:00Z' };
  const ch = (id, at) => ({ externalId: id, publishedAt: at });
  const list = [ch('new2', '2026-10-27T11:00:00Z'), ch('old', '2026-10-20T11:00:00Z'), ch('new1', '2026-10-27T10:30:00Z'), ch('justBefore', '2026-10-27T09:55:00Z'), ch('seen', '2026-10-27T10:40:00Z'), ch('bad', 'nonsense'), { publishedAt: '2026-10-27T11:00:00Z' }];
  assert.deepEqual(newChapters(list, watch, new Set(['seen'])).map(c => c.externalId), ['justBefore', 'new1', 'new2']);
  assert.deepEqual(newChapters(list, null), [], 'no starting point means nothing is new');
});

test('inbox rows keep what is needed to download the chapter', () => {
  const r = updateRow({ contentItemId: 'mangadex:a', externalId: 'a', title: 'T', coverUrl: 'u' }, { externalId: 'c1', chapterNumber: '12', volumeNumber: null, title: 'X', language: 'en', pages: 20, scanlationGroups: ['G'], publishedAt: '2026-10-27T10:00:00Z' }, '2026-10-27T10:05:00Z');
  assert.equal(r.id, 'c1');
  assert.equal(r.read, false);
  assert.deepEqual(r.chapter, { externalId: 'c1', chapterNumber: '12', volumeNumber: null, title: 'X', language: 'en', pages: 20, scanlationGroups: ['G'] });
});

test('auto-download plan: newest N chapters per title, downloaded oldest first', () => {
  const mk = (n, title = 'T', id = 'a') => ({ contentItemId: id, title, coverUrl: '', publishedAt: `2026-10-27T10:0${n}:00Z`, chapterNumber: String(n), chapter: { externalId: `c${id}${n}`, chapterNumber: String(n) } });
  const plan = autoDownloadPlan([mk(1), mk(2), mk(3), mk(4), mk(1, 'U', 'b')], 2);
  assert.equal(plan.length, 2);
  assert.deepEqual(plan[0].chapters.map(c => c.chapterNumber), ['3', '4']);
  assert.deepEqual(plan[1].chapters.map(c => c.chapterNumber), ['1']);
  assert.equal(autoDownloadPlan([mk(1), mk(2)], 'nonsense')[0].chapters.length, 2, 'a bad limit falls back to 3');
});

test('inbox groups: one entry per title, newest first, with a readable label', () => {
  const mk = (id, n, found, read = false) => ({ id: `c${id}${n}`, contentItemId: id, title: `T${id}`, coverUrl: '', chapterNumber: n, publishedAt: found, foundAt: found, read });
  const groups = groupUpdates([mk('a', '1', '2026-10-27T08:00:00Z'), mk('a', '2', '2026-10-27T08:00:00Z', true), mk('b', '7', '2026-10-27T09:00:00Z')]);
  assert.deepEqual(groups.map(g => g.contentItemId), ['b', 'a']);
  assert.equal(groups[0].label, 'Ch. 7');
  assert.equal(groups[1].label, '2 new chapters · up to Ch. 2');
  assert.equal(groups[1].unread, 1);
});

test('time and status wording', () => {
  const now = Date.parse('2026-10-27T12:00:00Z');
  assert.equal(timeAgo('2026-10-27T11:59:40Z', now), 'just now');
  assert.equal(timeAgo('2026-10-27T11:15:00Z', now), '45 min ago');
  assert.equal(timeAgo('2026-10-27T09:00:00Z', now), '3 h ago');
  assert.equal(timeAgo('2026-10-20T12:00:00Z', now), '7 d ago');
  assert.equal(timeAgo(null, now), 'never');
  assert.equal(statusText({}, 0), 'No titles to watch yet');
  assert.equal(statusText({}, 3), '3 titles · not checked yet');
  assert.match(statusText({ lastRunAt: '2026-10-27T11:00:00Z', lastError: 'x' }, 1, now), /1 title · failed/);
});

test('phone alert text', () => {
  assert.equal(alertText([]), null);
  assert.deepEqual(alertText([{ title: 'T', label: 'Ch. 3', count: 1 }]), { title: 'T', text: 'Ch. 3' });
  const many = alertText([{ title: 'A', count: 2 }, { title: 'B', count: 1 }, { title: 'C', count: 1 }, { title: 'D', count: 1 }]);
  assert.equal(many.title, '5 new chapters');
  assert.match(many.text, /A, B, C and 1 more/);
});
