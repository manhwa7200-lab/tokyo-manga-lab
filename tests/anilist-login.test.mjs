import test from 'node:test';
import assert from 'node:assert/strict';
import { loginAvailability, resolveClientId } from '../src/features/anilist/anilist-login.js';
import { buildAuthorizeUrl } from '../src/features/anilist/anilist-auth.js';

test('a client ID the person typed wins over the built-in one', () => {
  assert.equal(resolveClientId({ saved: ' 777 ', builtIn: '54060' }), '777');
});

test('the built-in client ID is used when nothing was typed', () => {
  assert.equal(resolveClientId({ saved: '', builtIn: '54060' }), '54060');
  assert.equal(resolveClientId({ builtIn: '54060' }), '54060');
});

test('invalid or missing IDs resolve to nothing', () => {
  assert.equal(resolveClientId({ saved: 'abc', builtIn: '' }), '');
  assert.equal(resolveClientId({ saved: 'abc', builtIn: 'xyz' }), '');
  assert.equal(resolveClientId(), '');
});

test('a bad typed ID falls back to the built-in one', () => {
  assert.equal(resolveClientId({ saved: 'abc', builtIn: '54060' }), '54060');
});

test('sign-in availability explains itself and never blocks the app', () => {
  assert.equal(loginAvailability({ native: true, clientId: '54060' }).state, 'ready');
  assert.equal(loginAvailability({ native: true, clientId: '' }).state, 'needs-id');
  assert.equal(loginAvailability({ native: false, clientId: '54060' }).state, 'needs-app');
  assert.match(loginAvailability({ native: true, clientId: '' }).message, /Settings/);
});

test('the authorize link carries the client ID and asks for a token, with no redirect_uri', () => {
  const url = new URL(buildAuthorizeUrl('54060'));
  assert.equal(url.origin + url.pathname, 'https://anilist.co/api/v2/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), '54060');
  assert.equal(url.searchParams.get('response_type'), 'token');
  assert.equal(url.searchParams.has('redirect_uri'), false, 'AniList uses the redirect URL saved on the client');
});
