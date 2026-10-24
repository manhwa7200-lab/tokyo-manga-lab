import test from 'node:test';
import assert from 'node:assert/strict';
import { backupFileName, nativeShareAvailable, saveBackupFile } from '../src/features/backup/backup-export.js';

function withWindow(value, run) {
  const had = Object.hasOwn(globalThis, 'window');
  const before = globalThis.window;
  globalThis.window = value;
  return Promise.resolve(run()).finally(() => { if (had) globalThis.window = before; else delete globalThis.window; });
}

const backup = { app: 'Tokyo Manga Lab', formatVersion: 1, stores: {} };

test('file name carries the date', () => {
  assert.equal(backupFileName(new Date('2026-10-23T10:00:00Z')), 'tokyo-manga-lab-backup-2026-10-23.json');
});

test('in the Android app the backup is written to cache and handed to the share sheet', () => withWindow({
  Capacitor: {
    isNativePlatform: () => true,
    Plugins: {
      Filesystem: { async writeFile(args) { this.args = args; return { uri: 'file:///cache/' + args.path }; } },
      Share: { async share(args) { this.args = args; } }
    }
  }
}, async () => {
  const caps = window.Capacitor.Plugins;
  assert.equal(nativeShareAvailable(), true);
  assert.equal(await saveBackupFile(backup, { fileName: 'b.json' }), 'shared');
  assert.equal(caps.Filesystem.args.directory, 'CACHE');
  assert.equal(caps.Filesystem.args.encoding, 'utf8');
  assert.equal(JSON.parse(caps.Filesystem.args.data).app, 'Tokyo Manga Lab');
  assert.equal(caps.Share.args.url, 'file:///cache/b.json');
}));

test('closing the share sheet is not an error', () => withWindow({
  Capacitor: { isNativePlatform: () => true, Plugins: { Filesystem: { writeFile: async () => ({ uri: 'file:///x' }) }, Share: { share: async () => { throw new Error('Share canceled'); } } } }
}, async () => {
  assert.equal(await saveBackupFile(backup), 'shared');
}));

test('a real failure gives a readable message', () => withWindow({
  Capacitor: { isNativePlatform: () => true, Plugins: { Filesystem: { writeFile: async () => { throw new Error('disk full'); } }, Share: { share: async () => {} } } }
}, async () => {
  await assert.rejects(saveBackupFile(backup), /share sheet/);
}));

test('an app build without the file plugins says so instead of silently doing nothing', () => withWindow({
  Capacitor: { isNativePlatform: () => true, Plugins: {} }
}, async () => {
  assert.equal(nativeShareAvailable(), false);
  await assert.rejects(saveBackupFile(backup), /cannot save files/);
}));
