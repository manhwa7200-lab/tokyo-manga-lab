import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_STORES, keyPathFor, rowsToImport } from '../src/data/backup-merge.js';

test('stores use the right key and the sign-in token is never part of a backup', () => {
  assert.equal(keyPathFor('appSettings'), 'key');
  assert.equal(keyPathFor('sourceSettings'), 'sourceId');
  assert.equal(keyPathFor('libraryEntries'), 'id');
  assert.equal(BACKUP_STORES.includes('accountLinks'), false);
  assert.equal(BACKUP_STORES.includes('syncLinks'), true);
});

test('rows newer on this device are kept; older, equal and new rows are written', () => {
  const existing = [{ id: 'a', updatedAt: '2026-03-01T00:00:00Z', v: 'local' }, { id: 'b', updatedAt: '2026-01-01T00:00:00Z', v: 'local' }, { id: 'c', updatedAt: '2026-02-01T00:00:00Z', v: 'local' }];
  const incoming = [
    { id: 'a', updatedAt: '2026-02-01T00:00:00Z', v: 'backup-older' },
    { id: 'b', updatedAt: '2026-02-01T00:00:00Z', v: 'backup-newer' },
    { id: 'c', updatedAt: '2026-02-01T00:00:00Z', v: 'backup-same' },
    { id: 'd', updatedAt: '2026-01-01T00:00:00Z', v: 'backup-new-row' }
  ];
  const { write, skipped } = rowsToImport('libraryEntries', incoming, existing);
  assert.deepEqual(write.map(row => row.id), ['b', 'c', 'd']);
  assert.equal(skipped, 1);
});

test('rows without timestamps are written as before, and malformed rows are skipped', () => {
  const existing = [{ id: 'a' }];
  const { write, skipped } = rowsToImport('bookmarks', [{ id: 'a', note: 'x' }, null, { note: 'no id' }, { id: 'z' }], existing);
  assert.deepEqual(write.map(row => row.id), ['a', 'z']);
  assert.equal(skipped, 2);
});

test('settings rows are matched by key; sync links by their sync time', () => {
  const settings = rowsToImport('appSettings', [{ key: 'theme', value: 'sakura', updatedAt: '2026-01-01T00:00:00Z' }], [{ key: 'theme', value: 'midnight', updatedAt: '2026-05-01T00:00:00Z' }]);
  assert.equal(settings.write.length, 0);
  const links = rowsToImport('syncLinks', [{ id: 'anilist:1', syncedAt: 100 }], [{ id: 'anilist:1', syncedAt: 200 }]);
  assert.equal(links.skipped, 1);
});
