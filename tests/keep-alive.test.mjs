import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { attachKeepAlive, keepAliveState } from '../src/features/downloads/keep-alive.js';

const job = (id, status, extra = {}) => ({ id, status, mangaTitle: 'Demo', chapterNumber: id, pageCount: 10, donePages: 4, ...extra });

test('notification text follows the queue', () => {
  assert.equal(keepAliveState({ waiting: '', jobs: [job('1', 'done')] }), null);
  assert.equal(keepAliveState({ waiting: 'wifi', jobs: [job('1', 'queued')] }), null, 'nothing is downloading while it waits');
  const state = keepAliveState({ waiting: '', jobs: [job('1', 'downloading'), job('2', 'queued'), job('3', 'queued')] });
  assert.equal(state.done, 4);
  assert.equal(state.total, 10);
  assert.match(state.text, /Ch\. 1 · Demo · 2 more waiting/);
});

test('start once, update at most every two seconds, stop when the queue ends', async () => {
  const calls = [];
  const plugin = { start: async p => calls.push(['start', p.done]), update: async p => calls.push(['update', p.done]), stop: async () => calls.push(['stop']) };
  let listener;
  let clock = 0;
  attachKeepAlive({ subscribe: fn => { listener = fn; return () => {}; } }, plugin, { now: () => clock });
  const snap = done => ({ waiting: '', jobs: [job('1', 'downloading', { donePages: done })] });
  listener(snap(1)); clock += 500;
  listener(snap(2)); clock += 2500;
  listener(snap(3));
  listener({ waiting: '', jobs: [job('1', 'done')] });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(calls, [['start', 1], ['update', 3], ['stop']]);
});

test('without the plugin nothing happens', () => {
  let subscribed = false;
  attachKeepAlive({ subscribe: () => { subscribed = true; return () => {}; } }, undefined);
  assert.equal(subscribed, false);
});

test('the Kotlin plugin name matches what the web app calls, and the opt-in files exist', () => {
  const plugin = readFileSync(new URL('../native/android/kotlin/TmlDownloadsPlugin.kt', import.meta.url), 'utf8');
  assert.match(plugin, /@CapacitorPlugin\(name = "TmlDownloads"\)/);
  for (const method of ['start', 'update', 'stop']) assert.match(plugin, new RegExp(`fun ${method}\\(call: PluginCall\\)`));
  assert.ok(existsSync(new URL('../scripts/android-native-downloads.sh', import.meta.url)));
  assert.ok(!existsSync(new URL('../native/android/ENABLED', import.meta.url)), 'the plugin must be opt-in: the ENABLED marker is not shipped');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /Plugins\?\.TmlDownloads/);
});

test('.gitignore only hides the generated top-level android/ and www/ folders, never native/android/', () => {
  const lines = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8').split('\n').map(line => line.trim());
  assert.ok(!lines.includes('android/') && !lines.includes('www/'), 'use /android/ and /www/ so native/android/ is not ignored');
  assert.ok(lines.includes('/android/') && lines.includes('/www/'));
});
