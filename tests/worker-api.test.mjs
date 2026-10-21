import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';

const MANGA_ID = '11111111-1111-4111-8111-111111111111';
const CHAPTER_ID = '22222222-2222-4222-8222-222222222222';

function sampleManga(rating = 'safe') {
  return {
    id: MANGA_ID,
    attributes: {
      title: { en: 'Example Manga' },
      altTitles: [{ ja: '例の漫画' }],
      description: { en: 'A test synopsis.' },
      year: 2024,
      status: 'ongoing',
      contentRating: rating,
      originalLanguage: 'ja',
      tags: [{ attributes: { name: { en: 'Adventure' } } }]
    },
    relationships: [
      { id: 'author-1', type: 'author', attributes: { name: 'Example Author' } },
      { id: 'artist-1', type: 'artist', attributes: { name: 'Example Artist' } },
      { id: 'cover-1', type: 'cover_art', attributes: { fileName: 'cover.jpg' } }
    ]
  };
}

function sampleChapter() {
  return {
    id: CHAPTER_ID,
    attributes: {
      chapter: '12.5', volume: '3', title: 'The Next Step',
      translatedLanguage: 'en', pages: 21, publishAt: '2025-03-01T12:00:00+00:00'
    },
    relationships: [{ id: 'group-1', type: 'scanlation_group', attributes: { name: 'Example Group' } }]
  };
}

function mockFetch(t, handler) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => handler(new URL(typeof input === 'string' ? input : input.url), init);
  t.after(() => { globalThis.fetch = original; });
}

function apiRequest(path, { origin = 'https://tokyo720022-create.github.io', method = 'GET' } = {}) {
  return new Request(`https://worker.test${path}`, { method, headers: origin ? { Origin: origin } : {} });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

test('legacy /health route remains available', async () => {
  const response = await worker.fetch(apiRequest('/health'));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.ok(body.contentRatings.includes('safe'));
});

test('source registry exposes metadata-only capabilities', async () => {
  const response = await worker.fetch(apiRequest('/api/v1/sources'));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data[0].id, 'mangadex');
  assert.equal(body.data[0].capabilities.titleDetails, true);
  assert.equal(body.data[0].capabilities.chapterContent, false);
  assert.equal(body.data[0].capabilities.offlineDownloads, false);
});

test('versioned search returns normalized source entries and pagination', async t => {
  mockFetch(t, async url => {
    assert.equal(url.pathname, '/manga');
    assert.equal(url.searchParams.get('title'), 'Example');
    assert.deepEqual(url.searchParams.getAll('contentRating[]'), ['safe', 'suggestive']);
    return jsonResponse({ data: [sampleManga()], total: 25, limit: 24, offset: 0 });
  });
  const response = await worker.fetch(apiRequest('/api/v1/search?query=Example&type=manga&page=1'));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data[0].sourceId, 'mangadex');
  assert.equal(body.data[0].externalId, MANGA_ID);
  assert.equal(body.data[0].title, 'Example Manga');
  assert.equal(body.data[0].publicationStatus, 'releasing');
  assert.equal(body.data[0].coverUrl, `https://uploads.mangadex.org/covers/${MANGA_ID}/cover.jpg.256.jpg`);
  assert.equal(body.pagination.hasNext, true);
  assert.equal(body.meta.apiVersion, '1');
});

test('versioned details returns metadata and filters explicit ratings', async t => {
  mockFetch(t, async url => {
    assert.equal(url.pathname, `/manga/${MANGA_ID}`);
    return jsonResponse({ data: sampleManga() });
  });
  const response = await worker.fetch(apiRequest(`/api/v1/manga/${MANGA_ID}`));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.title, 'Example Manga');
  assert.deepEqual(body.data.authors, ['Example Author']);
  assert.deepEqual(body.data.artists, ['Example Artist']);
});

test('versioned details excludes explicit-rated title records', async t => {
  mockFetch(t, async () => jsonResponse({ data: sampleManga('pornographic') }));
  const response = await worker.fetch(apiRequest(`/api/v1/manga/${MANGA_ID}`));
  const body = await response.json();
  assert.equal(response.status, 404);
  assert.equal(body.error.code, 'TITLE_UNAVAILABLE');
});

test('chapter route returns paginated metadata and canonical source links, not chapter content', async t => {
  let calls = 0;
  mockFetch(t, async url => {
    calls += 1;
    if (url.pathname === `/manga/${MANGA_ID}`) return jsonResponse({ data: sampleManga() });
    assert.equal(url.pathname, `/manga/${MANGA_ID}/feed`);
    assert.equal(url.searchParams.get('translatedLanguage[]'), 'en');
    return jsonResponse({ data: [sampleChapter()], total: 1, limit: 24, offset: 0 });
  });
  const response = await worker.fetch(apiRequest(`/api/v1/manga/${MANGA_ID}/chapters?page=1&language=en`));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  assert.equal(body.data[0].chapterNumber, '12.5');
  assert.equal(body.data[0].scanlationGroups[0], 'Example Group');
  assert.equal(body.data[0].sourceUrl, `https://mangadex.org/chapter/${CHAPTER_ID}`);
  assert.equal('content' in body.data[0], false);
  assert.equal(body.pagination.hasNext, false);
});

test('invalid MangaDex IDs and language filters are rejected', async () => {
  const invalidId = await worker.fetch(apiRequest('/api/v1/manga/not-a-uuid'));
  assert.equal(invalidId.status, 400);
  assert.equal((await invalidId.json()).error.code, 'INVALID_MANGA_ID');

  const invalidLanguage = await worker.fetch(apiRequest(`/api/v1/manga/${MANGA_ID}/chapters?language=english`));
  assert.equal(invalidLanguage.status, 400);
  assert.equal((await invalidLanguage.json()).error.code, 'INVALID_LANGUAGE');
});

test('legacy /manga response shape remains compatible', async t => {
  mockFetch(t, async () => jsonResponse({ data: [sampleManga()], total: 1, limit: 24, offset: 0 }));
  const response = await worker.fetch(apiRequest('/manga?q=Example&page=1'));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data[0].id, MANGA_ID);
  assert.equal(body.data[0].title, 'Example Manga');
  assert.equal(body.data[0].status, 'ongoing');
  assert.equal(body.data[0].mangaDexUrl, `https://mangadex.org/title/${MANGA_ID}`);
});

test('unapproved browser origins are rejected', async () => {
  const response = await worker.fetch(apiRequest('/health', { origin: 'https://evil.example' }));
  assert.equal(response.status, 403);
});

test('local preview origin is allowed by CORS preflight', async () => {
  const response = await worker.fetch(apiRequest('/api/v1/sources', { origin: 'http://127.0.0.1:8000', method: 'OPTIONS' }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'http://127.0.0.1:8000');
});
