import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('../worker/src/index.js', import.meta.url), 'utf8');
const EMPTY_LIST = /const ALWAYS_BLOCKED_IDS = new Set\(\[[^\]]*\]\);/;

const TAGGED = '33333333-3333-4333-8333-333333333333';
const PLAIN = '55555555-5555-4555-8555-555555555555';
const LOLI = { id: '2d1f5d56-a1e5-4d0d-a961-2193588b08ec', attributes: { name: { en: 'Loli' } } };

async function loadWorker(blocked = []) {
  const code = SOURCE.replace(EMPTY_LIST, `const ALWAYS_BLOCKED_IDS = new Set(${JSON.stringify(blocked)});`);
  assert.ok(blocked.length === 0 || code !== SOURCE, 'the block list marker was not found');
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${Math.random()}`)).default;
}
const manga = (id, rating = 'safe', tags = [LOLI], title = 'Quiet Cafe Days') => ({
  id, attributes: { title: { en: title }, altTitles: [], description: { en: 'x' }, year: 2024, status: 'ongoing', contentRating: rating, originalLanguage: 'ja', tags },
  relationships: [{ id: 'c1', type: 'cover_art', attributes: { fileName: 'c.jpg' } }]
});
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
function mockFetch(t, handler) {
  const original = globalThis.fetch;
  globalThis.fetch = async input => handler(new URL(typeof input === 'string' ? input : input.url));
  t.after(() => { globalThis.fetch = original; });
}
const req = (path, origin = 'https://tokyo720022-create.github.io') => new Request(`https://worker.test${path}`, { headers: origin ? { Origin: origin } : {} });

test('the shipped block list is empty and the policy markers exist', () => {
  assert.match(SOURCE, EMPTY_LIST);
  assert.match(SOURCE, /const SEXUAL_TAG_WORDS = /);
});

test('search adds safe-rated tagged titles: name matches first, only safe ratings asked for, page one only', async t => {
  const worker = await loadWorker();
  const seen = [];
  mockFetch(t, url => {
    seen.push(url);
    if (url.searchParams.has('includedTags[]')) return json({ data: [manga(TAGGED), manga('66666666-6666-4666-8666-666666666666', 'suggestive', [LOLI], 'Quiet Other')], total: 2 });
    return json({ data: [manga(PLAIN, 'safe', [], 'Cafe Stories')], total: 1 });
  });
  const hit = await (await worker.fetch(req('/api/v1/search?query=quiet%20cafe'))).json();
  assert.deepEqual(hit.data.map(item => item.externalId), [TAGGED, PLAIN], 'the suggestive tagged title is dropped, the safe one is first');
  const extraCall = seen.find(url => url.searchParams.has('includedTags[]'));
  assert.deepEqual(extraCall.searchParams.getAll('contentRating[]'), ['safe']);
  assert.equal(extraCall.searchParams.get('includedTagsMode'), 'OR');
  const pageTwo = await (await worker.fetch(req('/api/v1/search?query=quiet%20cafe&page=2'))).json();
  assert.ok(!pageTwo.data.some(item => item.externalId === TAGGED));
  const noQuery = seen.length;
  await worker.fetch(req('/api/v1/search'));
  assert.equal(seen.length, noQuery + 1, 'a search with no words makes no extra request');
  const legacy = await (await worker.fetch(req('/manga?q=quiet'))).json();
  assert.equal(legacy.data[0].id, TAGGED);
});

test('a tagged title that is safe-rated but also has a sexual-content tag is dropped from search', async t => {
  const worker = await loadWorker();
  const SEXUAL = { id: 's', attributes: { name: { en: 'Sexual Violence' } } };
  mockFetch(t, url => (url.searchParams.has('includedTags[]') ? json({ data: [manga(TAGGED, 'safe', [LOLI, SEXUAL])] }) : json({ data: [] })));
  assert.equal((await (await worker.fetch(req('/api/v1/search?query=quiet'))).json()).data.length, 0);
});

test('a title in ALWAYS_BLOCKED_IDS is hidden everywhere', async t => {
  const worker = await loadWorker([TAGGED]);
  mockFetch(t, url => (url.pathname.startsWith('/manga/') ? json({ data: manga(TAGGED) }) : url.searchParams.has('includedTags[]') ? json({ data: [manga(TAGGED)] }) : json({ data: [manga(TAGGED, 'safe', [])] })));
  assert.equal((await worker.fetch(req(`/api/v1/manga/${TAGGED}`))).status, 404);
  assert.equal((await (await worker.fetch(req('/api/v1/search?query=quiet'))).json()).data.length, 0, 'even an untagged copy of a blocked id is hidden');
});

test('a failing extra lookup never breaks the normal search', async t => {
  const worker = await loadWorker();
  mockFetch(t, url => (url.searchParams.has('includedTags[]') ? json({}, 500) : json({ data: [manga(PLAIN, 'safe', [], 'Cafe Stories')], total: 1 })));
  assert.equal((await (await worker.fetch(req('/api/v1/search?query=cafe'))).json()).data.length, 1);
});
