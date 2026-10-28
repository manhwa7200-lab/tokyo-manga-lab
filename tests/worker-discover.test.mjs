import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('../worker/src/index.js', import.meta.url), 'utf8');
async function loadWorker() {
  return (await import(`data:text/javascript;base64,${Buffer.from(SOURCE).toString('base64')}#${Math.random()}`)).default;
}
const LOLI_ID = '2d1f5d56-a1e5-4d0d-a961-2193588b08ec';
const SHOTA_ID = 'ddefd648-5140-4e5f-ba18-4eca4071d19b';
const ACTION = '391b0423-d847-456f-aff0-8b0cfc03066b';
const ROMANCE = '423e2eae-a7a2-4a8b-ac03-a8351462d71d';
const tag = (id, name, group = 'genre') => ({ id, attributes: { name: { en: name }, group } });
const TAGS = [tag(ROMANCE, 'Romance'), tag(ACTION, 'Action'), tag(LOLI_ID, 'Loli', 'theme'), tag(SHOTA_ID, 'Shota', 'theme'),
  tag('f5ba408b-0e7a-484d-8d49-4e9125ac96de', 'Sexual Violence', 'content'), tag('b13b2a48-c720-44a9-9c77-39c9979373fb', 'Doujinshi', 'format')];

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';
const manga = (id, rating = 'safe', tags = [], extra = {}) => ({
  id, attributes: { title: { en: `Title ${id.slice(0, 1)}` }, altTitles: [], description: { en: 'x' }, year: 2024, status: 'ongoing', contentRating: rating, originalLanguage: 'ja', tags, ...extra },
  relationships: [{ id: 'c1', type: 'cover_art', attributes: { fileName: 'c.jpg' } }]
});
const chapter = (id, mangaId, number, publishAt) => ({ id, attributes: { chapter: number, publishAt }, relationships: [{ id: mangaId, type: 'manga' }] });
const json = body => ({ ok: true, status: 200, json: async () => body });
function mockFetch(t, handler) {
  const original = globalThis.fetch;
  globalThis.fetch = async input => handler(new URL(typeof input === 'string' ? input : input.url));
  t.after(() => { globalThis.fetch = original; });
}
const req = (path, origin = 'https://tokyo720022-create.github.io') => new Request(`https://worker.test${path}`, { headers: origin ? { Origin: origin } : {} });

test('the genre list never offers loli or shota, and hides sexual-content tags outside the adult-gated case', async t => {
  const worker = await loadWorker();
  mockFetch(t, () => json({ data: TAGS }));
  const web = await (await worker.fetch(req('/api/v1/tags'))).json();
  
  const names = web.data.map(entry => entry.name);
  assert.ok(!names.includes('Loli') && !names.includes('Shota') && !names.includes('Sexual Violence'));
  assert.ok(names.includes('Action') && names.includes('Romance'));
  const browserAdult = await (await worker.fetch(req('/api/v1/tags?adult=1'))).json();
  assert.ok(!browserAdult.data.some(entry => entry.name === 'Sexual Violence'), 'a browser can never unlock adult tags');
  const app = await (await worker.fetch(req('/api/v1/tags?adult=1', ''))).json();
  assert.ok(app.data.some(entry => entry.name === 'Sexual Violence'));
  assert.ok(!app.data.some(entry => entry.id === LOLI_ID || entry.id === SHOTA_ID), 'blocked tags stay hidden even in the adult-gated case');
  const groups = web.data.map(entry => entry.group);
  assert.deepEqual(groups, [...groups].sort(), 'sorted by group');
});

test('the genre list is fetched from MangaDex once and then kept', async t => {
  const worker = await loadWorker();
  let calls = 0;
  mockFetch(t, () => { calls += 1; return json({ data: TAGS }); });
  await worker.fetch(req('/api/v1/tags'));
  await worker.fetch(req('/api/v1/tags'));
  assert.equal(calls, 1);
});

test('search passes genre, status and sort on, drops blocked or invalid values and skips the tagged extra request', async t => {
  const worker = await loadWorker();
  const seen = [];
  mockFetch(t, url => { seen.push(url); return json({ data: [manga(A)], total: 1 }); });
  const body = await (await worker.fetch(req(`/api/v1/search?query=love&genre=${ACTION},${LOLI_ID},${SHOTA_ID.toUpperCase()},not-an-id&status=completed&sort=popular`))).json();
  assert.equal(body.data.length, 1);
  assert.equal(seen.length, 1, 'no extra tagged request while filtering');
  const call = seen[0];
  assert.deepEqual(call.searchParams.getAll('includedTags[]'), [ACTION]);
  assert.equal(call.searchParams.get('includedTagsMode'), 'AND');
  assert.deepEqual(call.searchParams.getAll('status[]'), ['completed']);
  assert.equal(call.searchParams.get('order[followedCount]'), 'desc');
  assert.equal(call.searchParams.get('order[relevance]'), null, 'an explicit sort replaces relevance');
  assert.equal(call.searchParams.get('title'), 'love');
  assert.ok(call.searchParams.getAll('excludedTags[]').includes(LOLI_ID), 'the blocked tags are still excluded');
});

test('unknown status and sort values are ignored; sorts map to fixed MangaDex keys', async t => {
  const worker = await loadWorker();
  const seen = [];
  mockFetch(t, url => { seen.push(url); return json({ data: [], total: 0 }); });
  await worker.fetch(req('/api/v1/search?status=drop%20table&sort=title'));
  assert.equal(seen[0].searchParams.getAll('status[]').length, 0);
  assert.ok(!seen[0].searchParams.has('order[title]'));
  assert.equal(seen[0].searchParams.get('order[latestUploadedChapter]'), 'desc', 'the default browse order');
  await worker.fetch(req('/api/v1/search?sort=new'));
  assert.equal(seen[1].searchParams.get('order[createdAt]'), 'desc');
  await worker.fetch(req('/api/v1/search?sort=updated'));
  assert.equal(seen[2].searchParams.get('order[latestUploadedChapter]'), 'desc');
});

test('the legacy /manga route accepts the same filters and returns lastChapter', async t => {
  const worker = await loadWorker();
  const seen = [];
  mockFetch(t, url => { seen.push(url); return json({ data: [manga(A, 'safe', [], { lastChapter: '57', status: 'completed' })], total: 1 }); });
  const body = await (await worker.fetch(req(`/manga?q=&genre=${ROMANCE}&status=ongoing`))).json();
  assert.deepEqual(seen[0].searchParams.getAll('includedTags[]'), [ROMANCE]);
  assert.equal(body.data[0].lastChapter, '57');
  assert.equal(body.data[0].status, 'completed');
});

test('Latest lists each title once, newest first, with its newest chapter, and applies the content policy', async t => {
  const worker = await loadWorker();
  const seen = [];
  mockFetch(t, url => {
    seen.push(url);
    if (url.pathname === '/chapter') {
      return json({ total: 300, data: [chapter('c1', B, '12', '2026-10-24T10:00:00+00:00'), chapter('c2', A, '5.5', '2026-10-24T09:00:00+00:00'),
        chapter('c3', B, '11', '2026-10-24T08:00:00+00:00'), chapter('c4', C, '1', '2026-10-24T07:00:00+00:00'), chapter('c5', D, '3', '2026-10-24T06:00:00+00:00')] });
    }
    // Returned out of order on purpose; C is erotica and D carries a blocked tag.
    return json({ data: [manga(A), manga(C, 'erotica'), manga(B), manga(D, 'suggestive', [tag(LOLI_ID, 'Loli', 'theme')], {})] });
  });
  const body = await (await worker.fetch(req('/api/v1/latest'))).json();
  assert.deepEqual(body.data.map(item => item.externalId), [B, A]);
  assert.deepEqual(body.data[0].latestChapter, { number: '12', publishedAt: '2026-10-24T10:00:00+00:00' });
  assert.equal(body.pagination.hasNext, true);
  const chapterCall = seen.find(url => url.pathname === '/chapter');
  assert.equal(chapterCall.searchParams.get('order[publishAt]'), 'desc');
  assert.equal(chapterCall.searchParams.get('translatedLanguage[]'), 'en');
  assert.deepEqual(chapterCall.searchParams.getAll('contentRating[]'), ['safe', 'suggestive']);
  const mangaCall = seen.find(url => url.pathname === '/manga');
  assert.deepEqual(mangaCall.searchParams.getAll('ids[]').sort(), [A, B, C, D].sort());
  assert.ok(mangaCall.searchParams.getAll('excludedTags[]').includes(LOLI_ID));
});

test('Latest asks for adult ratings only in the gated case and survives an empty window', async t => {
  const worker = await loadWorker();
  const seen = [];
  mockFetch(t, url => { seen.push(url); return json({ data: [], total: 0 }); });
  const body = await (await worker.fetch(req('/api/v1/latest?adult=1'))).json();
  assert.deepEqual(body.data, []);
  assert.ok(!seen[0].searchParams.getAll('contentRating[]').includes('pornographic'));
  await worker.fetch(req('/api/v1/latest?adult=1', ''));
  assert.ok(seen[1].searchParams.getAll('contentRating[]').includes('pornographic'));
});

test('Latest reports an upstream failure as a friendly error', async t => {
  const worker = await loadWorker();
  mockFetch(t, () => ({ ok: false, status: 503, json: async () => ({}) }));
  const response = await worker.fetch(req('/api/v1/latest'));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, 'UPSTREAM_UNAVAILABLE');
});

test('update check: one request for many titles returns each newest chapter id, and applies the content policy', async t => {
  const worker = await loadWorker();
  const seen = [];
  const CH = '99999999-9999-4999-8999-999999999999';
  mockFetch(t, url => {
    seen.push(url);
    return json({ data: [manga(A, 'safe', [], { latestUploadedChapter: CH, updatedAt: '2026-10-24T10:00:00+00:00' }), manga(B), manga(C, 'erotica')] });
  });
  const body = await (await worker.fetch(req(`/api/v1/updates?ids=${A},${B},${C},${A},not-an-id`))).json();
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].searchParams.getAll('ids[]'), [A, B, C]);
  assert.deepEqual(body.data.map(item => item.externalId), [A, B], 'the erotica title is dropped');
  assert.equal(body.data[0].latestChapterId, CH);
  assert.equal(body.data[1].latestChapterId, null);
  assert.ok(!seen[0].searchParams.getAll('contentRating[]').includes('erotica'));
});

test('update check rejects an empty or oversized id list', async t => {
  const worker = await loadWorker();
  mockFetch(t, () => json({ data: [] }));
  assert.equal((await worker.fetch(req('/api/v1/updates'))).status, 400);
  assert.equal((await worker.fetch(req('/api/v1/updates?ids=nonsense'))).status, 400);
  const many = Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`).join(',');
  const response = await worker.fetch(req(`/api/v1/updates?ids=${many}`));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'TOO_MANY_IDS');
});
