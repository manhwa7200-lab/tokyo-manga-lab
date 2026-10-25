import test from 'node:test';
import assert from 'node:assert/strict';
import { chapterLabel, chapterNumberValue, chaptersBefore, filterChapters, normalizeChapterView, scanlatorsOf, sortChapters, viewIsActive } from '../src/features/chapters/chapter-view.js';

const ch = (id, number, extra = {}) => ({ externalId: id, chapterNumber: number, title: '', publishedAt: null, scanlationGroups: [], ...extra });
// MangaDex order: newest first.
const LIST = [ch('c3', '3', { publishedAt: '2024-03-01T00:00:00Z', title: 'Gamma', scanlationGroups: ['B Scans'] }), ch('c2', '2', { publishedAt: '2024-02-01T00:00:00Z', title: 'Beta', scanlationGroups: ['A Scans'] }), ch('c10', '10', { publishedAt: '2024-01-01T00:00:00Z', title: 'Alpha' }), ch('cx', null, { publishedAt: null, title: 'Omake' })];
const ids = list => list.map(chapter => chapter.externalId);

test('chapter numbers parse and extras are null', () => {
  assert.equal(chapterNumberValue(ch('a', '12.5')), 12.5);
  assert.equal(chapterNumberValue(ch('a', '')), null);
  assert.equal(chapterNumberValue(ch('a', null)), null);
  assert.equal(chapterNumberValue(ch('a', 'abc')), null);
});

test('by source keeps the loaded order and ascending reverses it', () => {
  assert.deepEqual(ids(sortChapters(LIST, { sortKey: 'source', sortDir: 'desc' })), ['c3', 'c2', 'c10', 'cx']);
  assert.deepEqual(ids(sortChapters(LIST, { sortKey: 'source', sortDir: 'asc' })), ['cx', 'c10', 'c2', 'c3']);
});

test('by chapter number sorts numerically, extras last either way', () => {
  assert.deepEqual(ids(sortChapters(LIST, { sortKey: 'number', sortDir: 'asc' })), ['c2', 'c3', 'c10', 'cx']);
  assert.deepEqual(ids(sortChapters(LIST, { sortKey: 'number', sortDir: 'desc' })), ['c10', 'c3', 'c2', 'cx']);
});

test('by upload date puts missing dates last', () => {
  assert.deepEqual(ids(sortChapters(LIST, { sortKey: 'date', sortDir: 'asc' })), ['c10', 'c2', 'c3', 'cx']);
  assert.deepEqual(ids(sortChapters(LIST, { sortKey: 'date', sortDir: 'desc' })), ['c3', 'c2', 'c10', 'cx']);
});

test('alphabetical sorts by the displayed name with natural numbers', () => {
  const list = [ch('a', '10'), ch('b', '2'), ch('c', '1')];
  assert.deepEqual(ids(sortChapters(list, { sortKey: 'title', sortDir: 'asc' })), ['c', 'b', 'a']);
  assert.deepEqual(ids(sortChapters(list, { sortKey: 'title', sortDir: 'desc' })), ['a', 'b', 'c']);
});

test('sorting never changes the original array', () => {
  const copy = ids(LIST);
  sortChapters(LIST, { sortKey: 'number', sortDir: 'asc' });
  assert.deepEqual(ids(LIST), copy);
});

test('filters: unread, bookmarked and scanlator combine', () => {
  const marks = { readIds: new Set(['c2']), bookmarkIds: new Set(['c3', 'c2']) };
  assert.deepEqual(ids(filterChapters(LIST, { unread: true }, marks)), ['c3', 'c10', 'cx']);
  assert.deepEqual(ids(filterChapters(LIST, { bookmarked: true }, marks)), ['c3', 'c2']);
  assert.deepEqual(ids(filterChapters(LIST, { unread: true, bookmarked: true }, marks)), ['c3']);
  assert.deepEqual(ids(filterChapters(LIST, { scanlator: 'A Scans' }, marks)), ['c2']);
  assert.deepEqual(ids(filterChapters(LIST, {}, marks)), ids(LIST));
});

test('scanlators are listed once, sorted', () => {
  assert.deepEqual(scanlatorsOf(LIST), ['A Scans', 'B Scans']);
});

test('labels follow the display mode', () => {
  const chapter = ch('a', '5', { title: 'Hello', volumeNumber: '2' });
  assert.equal(chapterLabel(chapter, 'source-title'), 'Vol. 2 · Chapter 5 — Hello');
  assert.equal(chapterLabel(chapter, 'number'), 'Chapter 5');
  assert.equal(chapterLabel(ch('x', null, { title: 'Omake' }), 'number'), 'Extra / oneshot');
});

test('view settings are validated and filters are detected', () => {
  assert.deepEqual(normalizeChapterView({ sortKey: 'nope', sortDir: 'sideways', display: 'x' }), normalizeChapterView({}));
  assert.equal(viewIsActive({ unread: true }), true);
  assert.equal(viewIsActive({ sortKey: 'number' }), false);
});

test('"mark previous as read" covers lower numbered chapters only', () => {
  assert.deepEqual(ids(chaptersBefore(LIST, 'c3')), ['c2']);
  assert.deepEqual(ids(chaptersBefore(LIST, 'c10')), ['c3', 'c2']);
  assert.deepEqual(chaptersBefore(LIST, 'cx'), []);
});
