import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeContentItem } from '../src/data/models.js';

test('normalizes a manga catalogue result without losing its source identity', () => {
  const item = normalizeContentItem({
    id: 'tml-test-1', sourceId: 'mangadex', externalId: 'abc-123', contentType: 'manga',
    title: '  One Piece  ', authors: ['Eiichiro Oda'], tags: ['Adventure'], releaseYear: 1997,
    sourceUrl: 'https://mangadex.org/title/abc-123', contentRating: 'safe'
  });
  assert.equal(item.id, 'tml-test-1');
  assert.equal(item.sourceId, 'mangadex');
  assert.equal(item.externalId, 'abc-123');
  assert.equal(item.title, 'One Piece');
  assert.deepEqual(item.authors, ['Eiichiro Oda']);
  assert.equal(item.contentType, 'manga');
});

test('bounds long descriptions and normalizes unknown optional fields', () => {
  const item = normalizeContentItem({ id: 'local-1', title: 'Local import', description: 'x'.repeat(13000) });
  assert.equal(item.description.length, 12000);
  assert.equal(item.sourceId, 'local');
  assert.equal(item.coverUrl, null);
  assert.equal(item.contentRating, 'unknown');
});

test('supports the planned novel formats in the shared content model', () => {
  assert.equal(normalizeContentItem({ id: 'novel-1', contentType: 'novel', title: 'Example EPUB' }).contentType, 'novel');
  assert.equal(normalizeContentItem({ id: 'web-1', contentType: 'web_novel', title: 'Example Web Novel' }).contentType, 'web_novel');
});
