import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_SPEEDS, autoSpeed, findNeighbor, formatStatusLine, isExtra, markTipsSeen, resetTips, setOrientation,
  setStatusBarVisible, setVolumeCapture, shareLink, tipsSeen, volumeAction
} from '../src/features/reader/reader-features.js';
import { friendlyError } from '../src/features/reader/reader-view.js';
import { DEFAULT_SETTINGS, normalizeSettingValue } from '../src/features/settings/settings-service.js';

// Newest first, like the chapter list in the app.
const LIST = [
  { id: 'c5', number: '5' }, { id: 'extra', number: null }, { id: 'c4', number: '4' }, { id: 'c3', number: '3' }
];

function withWindow(t, value) {
  globalThis.window = value;
  t.after(() => { delete globalThis.window; });
}

test('auto read speeds are ordered and fall back to medium', () => {
  assert.equal(AUTO_SPEEDS.length, 5);
  for (let i = 1; i < AUTO_SPEEDS.length; i += 1) {
    assert.ok(AUTO_SPEEDS[i].pxPerSecond > AUTO_SPEEDS[i - 1].pxPerSecond, 'scroll speed rises');
    assert.ok(AUTO_SPEEDS[i].secondsPerPage < AUTO_SPEEDS[i - 1].secondsPerPage, 'page time shrinks');
  }
  assert.equal(autoSpeed('5').label, 'Very fast');
  assert.equal(autoSpeed('nonsense').id, '3');
  assert.equal(autoSpeed(undefined).id, '3');
});

test('next and previous chapter, with and without skipping extras', () => {
  assert.equal(findNeighbor(LIST, 2, 'next')?.id, 'extra');
  assert.equal(findNeighbor(LIST, 2, 'next', true)?.id, 'c5');
  assert.equal(findNeighbor(LIST, 0, 'prev')?.id, 'extra');
  assert.equal(findNeighbor(LIST, 0, 'prev', true)?.id, 'c4');
  assert.equal(findNeighbor(LIST, 0, 'next'), null);
  assert.equal(findNeighbor(LIST, 3, 'prev'), null);
  assert.equal(findNeighbor(LIST, -1, 'next'), null);
  assert.equal(findNeighbor([], 0, 'next'), null);
});

test('chapters saved by older versions have no number and are never skipped', () => {
  assert.equal(isExtra({ id: 'old' }), false);
  assert.equal(isExtra({ id: 'x', number: '' }), true);
  assert.equal(isExtra({ id: 'x', number: '0' }), false);
  const legacy = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(findNeighbor(legacy, 1, 'next', true)?.id, 'a');
});

test('volume keys: down goes forward, up goes back', () => {
  assert.equal(volumeAction('down'), 'next');
  assert.equal(volumeAction('AudioVolumeDown'), 'next');
  assert.equal(volumeAction('up'), 'prev');
  assert.equal(volumeAction('AudioVolumeUp'), 'prev');
  assert.equal(volumeAction('Enter'), null);
  assert.equal(volumeAction(undefined), null);
});

test('status line shows time, and battery only when known', () => {
  const when = new Date(2026, 9, 23, 18, 5);
  assert.match(formatStatusLine(when, null), /\d{1,2}:\d{2}/);
  assert.ok(!formatStatusLine(when, null).includes('%'));
  assert.match(formatStatusLine(when, { percent: 41, charging: false }), /· 41%$/);
  assert.match(formatStatusLine(when, { percent: 41, charging: true }), /41% ⚡$/);
  assert.ok(!formatStatusLine(when, { percent: NaN }).includes('%'));
});

test('operation tips are remembered and can be reset', t => {
  const store = new Map();
  const original = globalThis.localStorage;
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  t.after(() => { if (original === undefined) delete globalThis.localStorage; else globalThis.localStorage = original; });
  assert.equal(tipsSeen(), false);
  markTipsSeen();
  assert.equal(tipsSeen(), true);
  resetTips();
  assert.equal(tipsSeen(), false);
});

test('tips still work when storage throws', t => {
  const original = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  t.after(() => { if (original === undefined) delete globalThis.localStorage; else globalThis.localStorage = original; });
  assert.equal(tipsSeen(), false);
  assert.doesNotThrow(() => { markTipsSeen(); resetTips(); });
});

test('status bar and rotation say "unavailable" outside the app and call the plugins inside it', async t => {
  assert.equal(await setStatusBarVisible(false), 'unavailable');
  assert.equal(await setOrientation('portrait'), 'unavailable');

  const calls = [];
  withWindow(t, { Capacitor: { isNativePlatform: () => true, Plugins: {
    StatusBar: { hide: async () => calls.push('hide'), show: async () => calls.push('show') },
    ScreenOrientation: { lock: async o => calls.push(`lock:${o.orientation}`), unlock: async () => calls.push('unlock') }
  } } });
  assert.equal(await setStatusBarVisible(false), 'ok');
  assert.equal(await setStatusBarVisible(true), 'ok');
  assert.equal(await setOrientation('landscape'), 'ok');
  assert.equal(await setOrientation('auto'), 'ok');
  assert.deepEqual(calls, ['hide', 'show', 'lock:landscape', 'unlock']);
});

test('a failing plugin reports "failed" instead of throwing', async t => {
  withWindow(t, { Capacitor: { isNativePlatform: () => true, Plugins: { StatusBar: { hide: async () => { throw new Error('nope'); } } } } });
  assert.equal(await setStatusBarVisible(false), 'failed');
});

test('volume capture marks the reader address only inside the app', t => {
  const writes = [];
  const make = native => ({
    Capacitor: { isNativePlatform: () => native },
    location: { hash: '#read/abc' },
    history: { state: null, replaceState: (_s, _t, url) => writes.push(url) }
  });
  withWindow(t, make(true));
  setVolumeCapture(true, 'abc');
  assert.deepEqual(writes, ['#read/abc?vol=1']);
  withWindow(t, make(false));
  setVolumeCapture(true, 'abc');
  assert.equal(writes.length, 1, 'a plain browser never gets the marker');
  withWindow(t, { ...make(true), location: { hash: '#read/abc?vol=1' } });
  setVolumeCapture(false, 'abc');
  assert.equal(writes[1], '#read/abc');
});

test('share uses the share sheet, falls back to the clipboard, and reports failure', async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const setNav = value => Object.defineProperty(globalThis, 'navigator', { value, configurable: true });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'navigator', original); else delete globalThis.navigator; });

  const shared = [];
  setNav({ share: async data => shared.push(data) });
  assert.equal(await shareLink({ title: 'T', url: 'https://mangadex.org/chapter/x' }), 'shared');
  assert.deepEqual(shared, [{ title: 'T', url: 'https://mangadex.org/chapter/x' }]);

  const copied = [];
  setNav({ clipboard: { writeText: async text => copied.push(text) } });
  assert.equal(await shareLink({ title: 'T', url: 'https://mangadex.org/chapter/x' }), 'copied');
  assert.deepEqual(copied, ['https://mangadex.org/chapter/x']);

  setNav({ share: async () => { const e = new Error('closed'); e.name = 'AbortError'; throw e; } });
  assert.equal(await shareLink({ title: 'T', url: 'https://mangadex.org/chapter/x' }), 'shared');

  setNav({});
  assert.equal(await shareLink({ title: 'T', url: 'https://mangadex.org/chapter/x' }), 'failed');
  assert.equal(await shareLink({ title: 'T', url: '' }), 'failed');
});

test('reader errors are chosen by code, so a missing chapter is not blamed on the Worker', () => {
  assert.equal(friendlyError({ code: 'CHAPTER_EXTERNAL', status: 422 }).title, 'Hosted on another site');
  const gone = friendlyError({ code: 'CHAPTER_UNAVAILABLE', status: 404, message: 'This chapter was not found.' });
  assert.equal(gone.title, 'This chapter is not available');
  assert.match(gone.text, /not found/);
  assert.equal(friendlyError({ code: 'NOT_FOUND', status: 404 }).title, 'Reader not available yet');
  assert.equal(friendlyError({ code: 'REQUEST_FAILED', status: 404 }).title, 'Reader not available yet');
  assert.equal(friendlyError({ code: 'RATE_LIMITED', status: 429 }).title, 'Slow down a moment');
  assert.equal(friendlyError(new Error('boom')).title, 'Could not open this chapter');
});

test('new reader settings have safe defaults and reject bad values', () => {
  assert.equal(DEFAULT_SETTINGS.readerShowStatusBar, true);
  assert.equal(DEFAULT_SETTINGS.readerVolumeKeys, false);
  assert.equal(DEFAULT_SETTINGS.readerAutoSpeed, '3');
  assert.equal(normalizeSettingValue('readerShowClock', 1), true);
  assert.equal(normalizeSettingValue('readerOrientation', 'landscape'), 'landscape');
  assert.throws(() => normalizeSettingValue('readerOrientation', 'upside-down'));
  assert.throws(() => normalizeSettingValue('readerAutoSpeed', '9'));
});
