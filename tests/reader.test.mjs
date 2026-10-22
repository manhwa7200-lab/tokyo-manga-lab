import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPageUrls, clampPage, isChapterId, normalizePagesPayload, pagesExpired, pickQuality, shouldReport, PAGE_URL_LIFETIME_MS } from '../src/features/reader/reader-pages.js';
import { buildReport } from '../src/features/reader/reader-report.js';
import { progressState } from '../src/features/reader/reader-progress.js';
import { parseRoute } from '../src/core/router.js';

const ID = '22222222-2222-4222-8222-222222222222';
const payload = (over = {}) => ({ data: { chapterId: ID, baseUrl: 'https://node.example.network/', hash: 'abc123def456', data: ['1-a.png', '2-b.png'], dataSaver: ['1-a.jpg', '2-b.jpg'], ...over } });

test('normalizePagesPayload accepts a good payload and trims the base URL', () => {
  const pages = normalizePagesPayload(payload(), 1000);
  assert.equal(pages.baseUrl, 'https://node.example.network');
  assert.equal(pages.fetchedAt, 1000);
  assert.deepEqual(pages.data, ['1-a.png', '2-b.png']);
});

test('normalizePagesPayload rejects unsafe or malformed input', () => {
  assert.throws(() => normalizePagesPayload(null));
  assert.throws(() => normalizePagesPayload(payload({ baseUrl: 'http://node.example' })));
  assert.throws(() => normalizePagesPayload(payload({ baseUrl: 'https://user:pw@node.example' })));
  assert.throws(() => normalizePagesPayload(payload({ baseUrl: 'javascript:alert(1)' })));
  assert.throws(() => normalizePagesPayload(payload({ hash: '../x' })));
  assert.throws(() => normalizePagesPayload(payload({ data: [], dataSaver: [] })));
  assert.deepEqual(normalizePagesPayload(payload({ data: ['ok.png', '../evil.png', 'a/b.png'] })).data, ['ok.png']);
});

test('buildPageUrls follows baseUrl/quality/hash/filename and falls back when a quality is empty', () => {
  const pages = normalizePagesPayload(payload());
  assert.equal(buildPageUrls(pages, 'data')[0], 'https://node.example.network/data/abc123def456/1-a.png');
  assert.equal(buildPageUrls(pages, 'data-saver')[1], 'https://node.example.network/data-saver/abc123def456/2-b.jpg');
  const onlySaver = normalizePagesPayload(payload({ data: [] }));
  assert.equal(pickQuality(onlySaver, 'data'), 'data-saver');
  assert.match(buildPageUrls(onlySaver, 'data')[0], /\/data-saver\//);
  assert.equal(pickQuality(pages, 'bogus'), 'data');
});

test('page URLs expire before MangaDex’s 15 minute guarantee', () => {
  const pages = normalizePagesPayload(payload(), 0);
  assert.equal(pagesExpired(pages, PAGE_URL_LIFETIME_MS - 1), false);
  assert.equal(pagesExpired(pages, PAGE_URL_LIFETIME_MS), true);
  assert.equal(pagesExpired(null), true);
  assert.ok(PAGE_URL_LIFETIME_MS < 15 * 60 * 1000);
});

test('reports are required off mangadex.org only, and bodies are well formed', () => {
  assert.equal(shouldReport('https://abc.mangadex.network/data/h/1.png'), true);
  assert.equal(shouldReport('https://uploads.mangadex.org/data/h/1.png'), false);
  assert.equal(shouldReport('not a url'), false);
  assert.deepEqual(buildReport({ url: 'https://n/x.png', success: false, bytes: 999, duration: 12.6 }), { url: 'https://n/x.png', success: false, cached: false, bytes: 0, duration: 13 });
  assert.equal(buildReport({ url: 'https://n/x.png', success: true, bytes: 2048.4, duration: 5 }).bytes, 2048);
});

test('progress state and page clamping', () => {
  assert.equal(progressState(0, 10), 'not-started');
  assert.equal(progressState(4, 10), 'in-progress');
  assert.equal(progressState(9, 10), 'completed');
  assert.equal(progressState(0, 0), 'not-started');
  assert.equal(clampPage(99, 10), 9);
  assert.equal(clampPage(-3, 10), 0);
  assert.equal(clampPage('x', 10), 0);
  assert.equal(isChapterId(ID), true);
  assert.equal(isChapterId('../../etc'), false);
});

test('read route keeps the chapter id as its param', () => {
  assert.deepEqual(parseRoute(`#read/${ID}`), { route: 'read', param: ID });
  assert.deepEqual(parseRoute('#read/../x'), { route: 'read', param: '' });
});
