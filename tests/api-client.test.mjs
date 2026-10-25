import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { setTimeout: (...args) => setTimeout(...args), clearTimeout: (...args) => clearTimeout(...args) };
const { apiClient, ApiError } = await import('../src/services/api-client.js');

function stubFetch(t, status, body, { json = true } = {}) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: status >= 200 && status < 300, status, json: async () => { if (!json) throw new SyntaxError('Unexpected token <'); return body; } });
  t.after(() => { globalThis.fetch = original; });
}

test('a gateway error page that is not JSON is reported as the catalogue being unavailable', async t => {
  stubFetch(t, 502, null, { json: false });
  await assert.rejects(apiClient.health(), error => error instanceof ApiError && error.code === 'UPSTREAM_UNAVAILABLE' && /temporarily unavailable/.test(error.message));
});

test('a rate-limit page that is not JSON keeps the rate-limit message', async t => {
  stubFetch(t, 429, null, { json: false });
  await assert.rejects(apiClient.health(), error => error.code === 'RATE_LIMITED');
});

test('a successful response that is not JSON is still an unreadable-response error', async t => {
  stubFetch(t, 200, null, { json: false });
  await assert.rejects(apiClient.health(), error => error.code === 'INVALID_JSON');
});

test('error codes from the Worker pass through', async t => {
  stubFetch(t, 422, { error: { code: 'CHAPTER_EXTERNAL', message: 'Hosted elsewhere.' } });
  await assert.rejects(apiClient.chapterPages('11111111-1111-4111-8111-111111111111'), error => error.code === 'CHAPTER_EXTERNAL' && error.message === 'Hosted elsewhere.');
});

test('a short connection drop is retried quietly and then succeeds', async t => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; if (calls === 1) throw new TypeError('Failed to fetch'); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  t.after(() => { globalThis.fetch = original; });
  assert.deepEqual(await apiClient.health(), { ok: true });
  assert.equal(calls, 2);
});

test('a real error answer is not retried', async t => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return { ok: false, status: 404, json: async () => ({ error: 'Not found.' }) }; };
  t.after(() => { globalThis.fetch = original; });
  await assert.rejects(apiClient.mangaDetails('x'), error => error.status === 404);
  assert.equal(calls, 1);
});

test('connection status listeners hear about a failure and the recovery', async t => {
  const { onApiStatus } = await import('../src/services/api-client.js');
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const seen = [];
  const off = onApiStatus(status => seen.push(status));
  t.after(off);
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(apiClient.mangaDetails('x'), error => error.code === 'NETWORK_ERROR');
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });
  await apiClient.health();
  assert.deepEqual(seen, ['offline', 'online']);
});
