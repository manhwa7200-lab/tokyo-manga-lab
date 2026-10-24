import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Loads sw.js in a stand-in service-worker scope and returns what it defined.
async function loadWorker(href) {
  const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const listeners = {};
  const scope = {
    self: null,
    URL, Request, Response, console,
    caches: { open: async () => ({}), keys: async () => [], match: async () => undefined, delete: async () => true },
    fetch: async () => new Response('x'),
    registration: { scope: 'https://example.test/app/' }
  };
  scope.self = { location: { href }, addEventListener: (name, fn) => { listeners[name] = fn; }, registration: scope.registration, clients: { claim: async () => {} }, skipWaiting: async () => {} };
  vm.createContext(scope);
  vm.runInContext(`${source}\n;globalThis.__out = { CACHE_NAME, COVER_CACHE, APP_SHELL };`, scope);
  return { ...scope.__out, listeners };
}

test('the shell cache is named after the version in the registration address', async () => {
  const a = await loadWorker('https://example.test/app/sw.js?v=0.9.2');
  const b = await loadWorker('https://example.test/app/sw.js?v=0.9.3');
  assert.equal(a.CACHE_NAME, 'tokyo-manga-lab-shell-0.9.2');
  assert.notEqual(a.CACHE_NAME, b.CACHE_NAME);
});

test('without or with a hostile version the cache name stays safe', async () => {
  assert.equal((await loadWorker('https://example.test/app/sw.js')).CACHE_NAME, 'tokyo-manga-lab-shell-dev');
  assert.match((await loadWorker('https://example.test/app/sw.js?v=../../x%20y')).CACHE_NAME, /^tokyo-manga-lab-shell-[0-9A-Za-z._-]+$/);
});

test('covers use their own cache, which is not a shell cache', async () => {
  const { COVER_CACHE, CACHE_NAME } = await loadWorker('https://example.test/app/sw.js?v=1');
  assert.ok(!COVER_CACHE.startsWith('tokyo-manga-lab-shell-'));
  assert.notEqual(COVER_CACHE, CACHE_NAME);
});

test('the app version in app-info matches package.json', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const { APP_VERSION } = await import('../src/shared/app-info.js');
  assert.equal(APP_VERSION, pkg.version);
});

test('every precached file exists', async () => {
  const { APP_SHELL } = await loadWorker('https://example.test/app/sw.js?v=1');
  for (const path of APP_SHELL) {
    if (path === './') continue;
    await readFile(new URL(`../${path.slice(2)}`, import.meta.url));
  }
});
