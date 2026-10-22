import test from 'node:test';
import assert from 'node:assert/strict';
import { base64ToBlob, describeFailure, fetchImageNative, nativeHttpAvailable, shortDetails } from '../src/features/reader/reader-native.js';

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function withCapacitor(t, capacitor) {
  globalThis.window = { Capacitor: capacitor };
  t.after(() => { delete globalThis.window; });
}
const native = get => ({ isNativePlatform: () => true, Plugins: { CapacitorHttp: { get } } });

test('base64ToBlob decodes bytes and keeps the type', async () => {
  const blob = base64ToBlob(PNG_B64, 'image/png');
  assert.equal(blob.type, 'image/png');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  assert.equal(base64ToBlob(`data:image/png;base64,${PNG_B64}`, 'image/png').size, blob.size);
});

test('native fetch is only offered inside the app', t => {
  assert.equal(nativeHttpAvailable(), false);
  withCapacitor(t, { isNativePlatform: () => false, Plugins: {} });
  assert.equal(nativeHttpAvailable(), false);
  withCapacitor(t, native(async () => ({})));
  assert.equal(nativeHttpAvailable(), true);
});

test('fetchImageNative returns a blob, size and X-Cache result on success', async t => {
  withCapacitor(t, native(async () => ({ status: 200, data: PNG_B64, headers: { 'Content-Type': 'image/png', 'X-Cache': 'HIT from node' } })));
  const result = await fetchImageNative('https://node.example.network/data/h/1.png');
  assert.equal(result.ok, true);
  assert.equal(result.cached, true);
  assert.equal(result.bytes, result.blob.size);
});

test('fetchImageNative explains HTTP errors, non-images and network failures without throwing', async t => {
  withCapacitor(t, native(async () => ({ status: 403, data: '', headers: {} })));
  const denied = await fetchImageNative('https://n/x.png');
  assert.deepEqual([denied.ok, denied.status, denied.error], [false, 403, 'http']);
  assert.match(describeFailure(denied, 'n'), /refused the request \(403\)/);

  withCapacitor(t, native(async () => ({ status: 200, data: 'PGh0bWw+', headers: { 'content-type': 'text/html' } })));
  assert.equal((await fetchImageNative('https://n/x.png')).error, 'not-image');

  withCapacitor(t, native(async () => { throw new Error('Unable to resolve host'); }));
  const down = await fetchImageNative('https://n/x.png');
  assert.equal(down.error, 'network');
  assert.match(describeFailure(down, 'n'), /Could not connect/);
  assert.match(shortDetails(down), /Unable to resolve host/);
});

test('without the app network layer the result says so', async () => {
  const result = await fetchImageNative('https://n/x.png');
  assert.equal(result.available, false);
  assert.match(shortDetails(result), /unavailable/);
});
