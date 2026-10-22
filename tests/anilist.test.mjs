import test from 'node:test';
import assert from 'node:assert/strict';
import { toLocalStatus, toRemoteStatus, extractMangaDexId, normalizeRemoteEntry } from '../src/features/anilist/anilist-mapper.js';
import { buildAuthorizeUrl, parseAuthRedirect, isValidClientId, looksLikeToken } from '../src/features/anilist/anilist-auth.js';
import { planSync } from '../src/features/anilist/sync-planner.js';
import { createAniListClient, AniListError } from '../src/features/anilist/anilist-client.js';

const TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.' + 'a'.repeat(60) + '.' + 'b'.repeat(40);
const UUID = '32d76d19-8a05-4db0-9fc2-e0b0648fe9d0';

test('status maps round-trip and REPEATING reads as reading', () => {
  for (const local of ['reading', 'planned', 'completed', 'paused', 'dropped']) assert.equal(toLocalStatus(toRemoteStatus(local)), local);
  assert.equal(toLocalStatus('REPEATING'), 'reading');
  assert.equal(toLocalStatus('NOPE'), null);
  assert.equal(toRemoteStatus('nope'), null);
});

test('MangaDex id is read from AniList external links, exact matches only', () => {
  assert.equal(extractMangaDexId([{ site: 'Twitter', url: 'https://x.com/a' }, { site: 'MangaDex', url: `https://mangadex.org/title/${UUID}/some-slug` }]), UUID);
  assert.equal(extractMangaDexId([{ site: 'MangaDex', url: 'https://mangadex.org/title/not-a-uuid' }]), null);
  assert.equal(extractMangaDexId([{ site: 'Other', url: `https://mangadex.org/title/${UUID}` }]), null);
  assert.equal(extractMangaDexId(null), null);
});

test('remote entries become MangaDex-linked or AniList-only items', () => {
  const base = { id: 9, mediaId: 30013, status: 'CURRENT', progress: 112, updatedAt: 1700000000, media: { id: 30013, title: { romaji: 'One Piece', english: null, native: 'ONE PIECE' }, coverImage: { large: 'https://s4.anilist.co/x.jpg' }, siteUrl: 'https://anilist.co/manga/30013', startDate: { year: 1997 }, genres: ['Action'], isAdult: false, externalLinks: [] } };
  const plain = normalizeRemoteEntry(base);
  assert.equal(plain.item.sourceId, 'anilist');
  assert.equal(plain.item.externalId, '30013');
  assert.equal(plain.status, 'reading');
  assert.equal(plain.progress, 112);
  assert.equal(plain.updatedAtMs, 1700000000000);
  const linked = normalizeRemoteEntry({ ...base, media: { ...base.media, externalLinks: [{ site: 'MangaDex', url: `https://mangadex.org/title/${UUID}` }] } });
  assert.equal(linked.item.sourceId, 'mangadex');
  assert.equal(linked.item.externalId, UUID);
  assert.equal(linked.item.anilistId, '30013');
  assert.equal(normalizeRemoteEntry({ mediaId: 1, status: 'WEIRD', media: { id: 1 } }), null);
  assert.equal(normalizeRemoteEntry({ status: 'CURRENT' }), null);
});

test('authorize URL needs a numeric client id', () => {
  assert.ok(isValidClientId('12345'));
  assert.ok(!isValidClientId('abc'));
  assert.ok(!isValidClientId(''));
  const url = new URL(buildAuthorizeUrl('12345'));
  assert.equal(url.origin + url.pathname, 'https://anilist.co/api/v2/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), '12345');
  assert.equal(url.searchParams.get('response_type'), 'token');
  assert.throws(() => buildAuthorizeUrl('x; drop'));
});

test('redirect parsing accepts our link and rejects everything else', () => {
  const ok = parseAuthRedirect(`tokyomangalab://anilist-auth#access_token=${TOKEN}&token_type=Bearer&expires_in=31536000`, 1000);
  assert.equal(ok.ok, true);
  assert.equal(ok.accessToken, TOKEN);
  assert.equal(ok.expiresAt, 1000 + 31536000 * 1000);
  assert.equal(parseAuthRedirect(`https://evil.example/#access_token=${TOKEN}`).reason, 'not-ours');
  assert.equal(parseAuthRedirect(`tokyomangalab://other-host#access_token=${TOKEN}`).reason, 'not-ours');
  assert.equal(parseAuthRedirect('tokyomangalab://anilist-auth#access_token=short').reason, 'no-token');
  assert.equal(parseAuthRedirect('tokyomangalab://anilist-auth#error=access_denied&error_description=nope').reason, 'denied');
  assert.equal(parseAuthRedirect('garbage').ok, false);
  assert.ok(looksLikeToken(TOKEN));
  assert.ok(!looksLikeToken('<script>'));
});

const remote = (mediaId, status, updatedAtMs = 0) => ({ mediaId: String(mediaId), status, updatedAtMs });
const local = (mediaId, status, updatedAtMs = 0) => ({ contentItemId: `c${mediaId}`, mediaId: String(mediaId), status, updatedAtMs });

test('planner: new remote titles are pulled, new local titles are pushed only when enabled', () => {
  const on = planSync({ remote: [remote(1, 'reading')], local: [local(2, 'planned')], pushEnabled: true });
  assert.deepEqual(on.pulls.map(p => p.mediaId), ['1']);
  assert.deepEqual(on.pushes.map(p => p.mediaId), ['2']);
  const off = planSync({ remote: [remote(1, 'reading')], local: [local(2, 'planned')], pushEnabled: false });
  assert.equal(off.pushes.length, 0);
  assert.deepEqual(off.skippedPush.map(p => p.mediaId), ['2']);
});

test('planner: only the side that changed since the last sync wins', () => {
  const bases = { 1: 'planned', 2: 'planned' };
  const plan = planSync({
    remote: [remote(1, 'reading'), remote(2, 'planned')],
    local: [local(1, 'planned'), local(2, 'completed')],
    bases, pushEnabled: true
  });
  assert.deepEqual(plan.pulls.map(p => [p.mediaId, p.status]), [['1', 'reading']]);
  assert.deepEqual(plan.pushes.map(p => [p.mediaId, p.status]), [['2', 'completed']]);
  assert.equal(plan.conflicts.length, 0);
});

test('planner: both changed means the newer change wins and it is reported', () => {
  const bases = { 1: 'planned', 2: 'planned' };
  const plan = planSync({
    remote: [remote(1, 'reading', 2000), remote(2, 'dropped', 1000)],
    local: [local(1, 'completed', 1000), local(2, 'paused', 2000)],
    bases, pushEnabled: true
  });
  assert.equal(plan.conflicts.length, 2);
  assert.deepEqual(plan.pulls.map(p => p.mediaId), ['1']);
  assert.deepEqual(plan.pushes.map(p => p.mediaId), ['2']);
});

test('planner: matching statuses are in sync, and nothing is ever deleted', () => {
  const plan = planSync({ remote: [remote(1, 'reading')], local: [local(1, 'reading'), local(3, 'completed')], bases: { 3: 'completed' }, pushEnabled: true });
  assert.equal(plan.inSync.length, 1);
  assert.equal(plan.pulls.length + plan.pushes.length, 0);
  assert.deepEqual(plan.removedRemotely.map(row => row.mediaId), ['3']);
});

test('planner: without push enabled a local-only change is kept, not overwritten', () => {
  const plan = planSync({ remote: [remote(1, 'planned')], local: [local(1, 'completed')], bases: { 1: 'planned' }, pushEnabled: false });
  assert.equal(plan.pulls.length, 0);
  assert.equal(plan.skippedPush.length, 1);
});

const fakeResponse = (status, body, headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: name => headers[name] ?? null }, json: async () => body });

test('client sends a bearer token and unwraps data', async () => {
  let seen;
  const client = createAniListClient({ token: TOKEN, fetchImpl: async (url, init) => { seen = { url, init }; return fakeResponse(200, { data: { Viewer: { id: 7, name: 'Kai', siteUrl: 'https://anilist.co/user/Kai', avatar: { medium: 'https://a/x.png' } } } }); } });
  const viewer = await client.viewer();
  assert.equal(viewer.name, 'Kai');
  assert.equal(seen.init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(seen.url, 'https://graphql.anilist.co');
});

test('client reports rate limits, revoked tokens and network failures clearly', async () => {
  const limited = createAniListClient({ token: TOKEN, fetchImpl: async () => fakeResponse(429, {}, { 'Retry-After': '42' }) });
  await assert.rejects(limited.viewer(), error => error instanceof AniListError && error.code === 'RATE_LIMITED' && error.retryAfter === 42);
  const revoked = createAniListClient({ token: TOKEN, fetchImpl: async () => fakeResponse(400, { errors: [{ message: 'Invalid token', status: 400 }] }) });
  await assert.rejects(revoked.viewer(), error => error.code === 'UNAUTHORIZED');
  const offline = createAniListClient({ token: TOKEN, fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(offline.viewer(), error => error.code === 'NETWORK_ERROR');
  assert.throws(() => createAniListClient({ token: '' }), error => error.code === 'UNAUTHORIZED');
});

test('client pages through list chunks and de-duplicates custom-list copies', async () => {
  const calls = [];
  const entry = (mediaId, status = 'CURRENT') => ({ id: mediaId * 10, mediaId, status, progress: 1, updatedAt: 1, media: { id: mediaId } });
  const client = createAniListClient({ token: TOKEN, fetchImpl: async (url, init) => {
    const { variables } = JSON.parse(init.body); calls.push(variables.chunk);
    return fakeResponse(200, { data: { MediaListCollection: variables.chunk === 1
      ? { hasNextChunk: true, lists: [{ entries: [entry(1), entry(2)] }, { entries: [entry(1)] }] }
      : { hasNextChunk: false, lists: [{ entries: [entry(3)] }] } } });
  } });
  const rows = await client.mangaList(7);
  assert.deepEqual(calls, [1, 2]);
  assert.deepEqual(rows.map(row => row.mediaId), [1, 2, 3]);
});

test('client save sends the AniList status name', async () => {
  let body;
  const client = createAniListClient({ token: TOKEN, fetchImpl: async (url, init) => { body = JSON.parse(init.body); return fakeResponse(200, { data: { SaveMediaListEntry: { id: 5, mediaId: 30013, status: 'CURRENT', progress: 0, updatedAt: 1 } } }); } });
  const saved = await client.saveEntry({ mediaId: '30013', status: 'CURRENT' });
  assert.equal(saved.id, 5);
  assert.deepEqual(body.variables, { mediaId: 30013, status: 'CURRENT' });
});

test('client explains a maintenance outage and does not treat it as a bad token', async () => {
  for (const status of [502, 503, 504]) {
    const client = createAniListClient({ token: TOKEN, fetchImpl: async () => ({ status, ok: false, headers: { get: () => null }, json: async () => { throw new SyntaxError('<html>maintenance</html>'); } }) });
    await assert.rejects(client.viewer(), error => error.code === 'UNAVAILABLE' && /maintenance/i.test(error.message) && error.status === status);
  }
});
