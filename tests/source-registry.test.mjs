import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceRegistry } from '../src/sources/source-registry.js';

test('registers MangaDex as the first modular source adapter', () => {
  const mangaDex = sourceRegistry.list().find(source => source.id === 'mangadex');
  assert.ok(mangaDex);
  assert.deepEqual(mangaDex.contentTypes, ['manga']);
  assert.equal(mangaDex.capabilities.search, true);
  assert.equal(mangaDex.capabilities.chapters, true);
});

test('allows new adapters to be registered without changing the registry interface', () => {
  const id = `test-${Date.now()}`;
  sourceRegistry.register({ id, label: 'Test source', contentTypes: ['manga'], capabilities: { search: true }, async search() { return { items: [], pagination: { page: 1, limit: 24, total: 0, hasNext: false } }; } });
  assert.equal(sourceRegistry.get(id).id, id);
  assert.throws(() => sourceRegistry.register({ id, async search() { return []; } }), /already registered/);
});
