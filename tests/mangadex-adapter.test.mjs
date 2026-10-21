import test from 'node:test';
import assert from 'node:assert/strict';
import { mangaDexAdapter } from '../src/sources/manga/mangadex-adapter.js';

const MANGA_ID = '11111111-1111-4111-8111-111111111111';
const CHAPTER_ID = '22222222-2222-4222-8222-222222222222';

const normalizedManga = {
  sourceId: 'mangadex', externalId: MANGA_ID, contentType: 'manga', title: 'Example Manga',
  alternateTitles: ['例の漫画'], description: 'A test synopsis.', coverUrl: null,
  authors: ['Example Author'], artists: ['Example Artist'], genres: ['adventure'], tags: ['Adventure'],
  publicationStatus: 'ongoing', releaseYear: 2024, language: 'ja',
  sourceUrl: `https://mangadex.org/title/${MANGA_ID}`, contentRating: 'safe'
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function installApiMocks(t) {
  const oldFetch = globalThis.fetch;
  const oldWindow = globalThis.window;
  globalThis.window = { setTimeout, clearTimeout };
  globalThis.fetch = async input => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.endsWith(`/api/v1/manga/${MANGA_ID}/chapters`)) {
      return jsonResponse({
        data: [{ sourceId: 'mangadex', externalId: CHAPTER_ID, mangaExternalId: MANGA_ID,
          chapterNumber: '12.5', volumeNumber: '3', title: 'The Next Step', language: 'en',
          pages: 21, publishedAt: null, scanlationGroups: [], sourceUrl: `https://mangadex.org/chapter/${CHAPTER_ID}` }],
        pagination: { page: 1, limit: 24, total: 1, hasNext: false }, meta: { apiVersion: '1' }
      });
    }
    if (url.pathname.endsWith(`/api/v1/manga/${MANGA_ID}`)) return jsonResponse({ data: normalizedManga, meta: { apiVersion: '1' } });
    return jsonResponse({ error: { code: 'NOT_FOUND', message: 'Unexpected route' } }, 404);
  };
  t.after(() => {
    globalThis.fetch = oldFetch;
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
  });
}

test('details adapter preserves normalized status, year, language, artists and source identity', async t => {
  installApiMocks(t);
  const item = await mangaDexAdapter.details(MANGA_ID);
  assert.equal(item.id, `mangadex:${MANGA_ID}`);
  assert.equal(item.externalId, MANGA_ID);
  assert.equal(item.publicationStatus, 'releasing');
  assert.equal(item.releaseYear, 2024);
  assert.equal(item.language, 'ja');
  assert.deepEqual(item.artists, ['Example Artist']);
});

test('chapter adapter returns canonical source links and pagination without chapter content', async t => {
  installApiMocks(t);
  const result = await mangaDexAdapter.chapters(MANGA_ID, { page: 1, language: 'en' });
  assert.equal(result.items[0].chapterNumber, '12.5');
  assert.equal(result.items[0].sourceUrl, `https://mangadex.org/chapter/${CHAPTER_ID}`);
  assert.equal(result.pagination.hasNext, false);
  assert.equal('content' in result.items[0], false);
});
