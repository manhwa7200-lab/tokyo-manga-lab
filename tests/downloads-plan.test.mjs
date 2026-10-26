import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadableChapters, estimateBytes, formatBytes, isSelectable, jumpTarget, pickerOrder, selectionSummary, shortLabel, storageLimitBytes, toggleAll, toggleSelection } from '../src/features/downloads/download-plan.js';
import { buildPageUrls, pagesExpired, shouldReport } from '../src/features/reader/reader-pages.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const chapter = (n, number, pages = 10, extra = {}) => ({ externalId: id(n), chapterNumber: number, pages, ...extra });

test('only readable chapters can be picked', () => {
  const list = [chapter(1, '1'), chapter(2, '2', 0), { externalId: 'not-a-uuid', chapterNumber: '3', pages: 5 }, chapter(4, '4')];
  assert.deepEqual(downloadableChapters(list).map(c => c.chapterNumber), ['1', '4']);
  assert.deepEqual(downloadableChapters(null), []);
});

test('picker lists the highest chapter first and flips on request', () => {
  const list = [chapter(1, '1'), chapter(2, '77.5'), chapter(3, '90'), chapter(4, '77'), chapter(5, null)];
  assert.deepEqual(pickerOrder(list).map(c => c.chapterNumber), ['90', '77.5', '77', '1', null]);
  assert.deepEqual(pickerOrder(list, 'asc').map(c => c.chapterNumber), ['1', '77', '77.5', '90', null]);
});

test('short labels match the picker style', () => {
  assert.equal(shortLabel({ chapterNumber: '090' }), 'Ch. 90');
  assert.equal(shortLabel({ chapterNumber: '77.5' }), 'Ch. 77.5');
  assert.equal(shortLabel({ chapterNumber: '0' }), 'Ch. 0');
  assert.equal(shortLabel({ chapterNumber: null }), 'Oneshot');
  assert.equal(shortLabel({ chapterNumber: null, title: 'Omake' }), 'Omake');
});

test('selection toggles, select all and clear', () => {
  const rows = [chapter(1, '1'), chapter(2, '2'), chapter(3, '3')];
  const jobs = new Map([[id(2), { status: 'done' }], [id(3), { status: 'failed' }]]);
  assert.equal(isSelectable(id(1), jobs), true);
  assert.equal(isSelectable(id(2), jobs), false);
  assert.equal(isSelectable(id(3), jobs), true, 'failed ones can be picked again');
  let picked = toggleSelection(new Set(), id(1));
  assert.deepEqual([...picked], [id(1)]);
  picked = toggleSelection(picked, id(1));
  assert.equal(picked.size, 0);
  const all = toggleAll(new Set(), rows, jobs);
  assert.deepEqual([...all].sort(), [id(1), id(3)].sort(), 'downloaded chapters are skipped');
  assert.equal(toggleAll(all, rows, jobs).size, 0, 'a second tap clears');
});

test('selection summary counts pages and flags big picks', () => {
  const rows = Array.from({ length: 70 }, (_, i) => chapter(i + 1, String(i + 1), 20));
  const small = selectionSummary(new Set([id(1), id(2)]), rows);
  assert.deepEqual(small, { count: 2, pages: 40, large: false });
  assert.equal(selectionSummary(new Set(rows.map(r => r.externalId)), rows).large, true);
});

test('jump to finds the exact, then nearest lower, then nearest higher chapter', () => {
  const rows = [chapter(1, '90'), chapter(2, '77.5'), chapter(3, '77'), chapter(4, '10'), chapter(5, null)];
  assert.equal(jumpTarget(rows, '77'), id(3));
  assert.equal(jumpTarget(rows, '78'), id(2));
  assert.equal(jumpTarget(rows, '5'), id(4), 'nothing at or below 5, so the closest above');
  assert.equal(jumpTarget(rows, '1000'), id(1));
  assert.equal(jumpTarget(rows, 'abc'), '');
  assert.equal(jumpTarget([], '5'), '');
});

test('byte helpers', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
  assert.equal(formatBytes(3 * 1024 ** 3), '3.00 GB');
  assert.equal(storageLimitBytes('1024'), 1024 * 1024 * 1024);
  assert.equal(storageLimitBytes('0'), 0);
  assert.equal(storageLimitBytes('x'), 0);
  assert.ok(estimateBytes(10, 'data') > estimateBytes(10, 'data-saver'));
});

test('saved pages never expire and are never reported to MangaDex', () => {
  const offline = { offline: true, urls: ['blob:a', 'blob:b'], fetchedAt: 0 };
  assert.equal(pagesExpired(offline, Date.now() + 10 ** 9), false);
  assert.deepEqual(buildPageUrls(offline, 'data'), ['blob:a', 'blob:b']);
  assert.equal(shouldReport('blob:https://app.example/123'), false);
  assert.equal(shouldReport('https://abc.def.mangadex.network/data/h/1.jpg'), true);
  assert.equal(shouldReport('https://uploads.mangadex.org/data/h/1.jpg'), false);
  assert.equal(shouldReport('http://abc.mangadex.network/data/h/1.jpg'), false);
});
