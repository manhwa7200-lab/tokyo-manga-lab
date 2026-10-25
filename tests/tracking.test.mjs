import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPatch, describePatch, isDateText, mergePatch, patchToVariables, planAfterRead, progressNumber, rawToScore, scoreToRaw, toDateText, toFuzzy } from '../src/features/tracking/tracking.js';

test('chapter numbers become whole progress numbers', () => {
  assert.equal(progressNumber('12'), 12);
  assert.equal(progressNumber('12.5'), 12);
  for (const bad of [null, undefined, '', 'abc', '-3']) assert.equal(progressNumber(bad), null, String(bad));
});

test('dates convert both ways and reject nonsense', () => {
  assert.equal(toDateText({ year: 2026, month: 4, day: 4 }), '2026-04-04');
  assert.equal(toDateText({ year: 2026, month: null, day: null }), null);
  assert.deepEqual(toFuzzy('2026-04-04'), { year: 2026, month: 4, day: 4 });
  assert.deepEqual(toFuzzy(null), { year: null, month: null, day: null });
  assert.equal(isDateText('2026-02-30'), false);
  assert.equal(isDateText('26-4-4'), false);
  assert.throws(() => toFuzzy('yesterday'));
});

test('scores are 0 to 10 in the app and 0 to 100 on AniList', () => {
  assert.equal(scoreToRaw('8.5'), 85);
  assert.equal(scoreToRaw(''), 0);
  assert.equal(rawToScore(85), 8.5);
  assert.equal(rawToScore(0), 0);
  assert.throws(() => scoreToRaw('11'));
  assert.throws(() => scoreToRaw('abc'));
});

test('patches are validated and merged field by field, later wins', () => {
  assert.deepEqual(cleanPatch({ progress: 5, status: 'CURRENT' }), { progress: 5, status: 'CURRENT' });
  assert.throws(() => cleanPatch({ status: 'WATCHING' }));
  assert.throws(() => cleanPatch({ progress: 1.5 }));
  assert.throws(() => cleanPatch({ score: 101 }));
  assert.throws(() => cleanPatch({ startedAt: 'soon' }));
  assert.deepEqual(mergePatch({ progress: 5, status: 'CURRENT' }, { progress: 6, score: 80 }), { status: 'CURRENT', progress: 6, score: 80 });
  assert.deepEqual(cleanPatch({ startedAt: null }), { startedAt: null }, 'null clears a date');
});

test('only changed fields are sent to AniList', () => {
  assert.deepEqual(patchToVariables({ progress: 7 }), { progress: 7 });
  assert.deepEqual(patchToVariables({ score: 90, startedAt: '2026-01-02' }), { scoreRaw: 90, startedAt: { year: 2026, month: 1, day: 2 } });
  assert.deepEqual(patchToVariables({ completedAt: null }), { completedAt: { year: null, month: null, day: null } });
});

test('reading a chapter moves progress up, starts the title and fills the start date', () => {
  const patch = planAfterRead({ entry: null, chapterNumber: '1', totalChapters: 0, today: '2026-10-24' });
  assert.deepEqual(patch, { progress: 1, status: 'CURRENT', startedAt: '2026-10-24' });
});

test('progress never goes down and unchanged progress sends nothing', () => {
  assert.equal(planAfterRead({ entry: { status: 'CURRENT', progress: 10, startedAt: '2026-01-01' }, chapterNumber: '8' }), null);
  assert.equal(planAfterRead({ entry: { status: 'CURRENT', progress: 10, startedAt: '2026-01-01' }, chapterNumber: '10.5' }), null, '10.5 is still chapter 10');
  assert.deepEqual(planAfterRead({ entry: { status: 'CURRENT', progress: 10, startedAt: '2026-01-01' }, chapterNumber: '11' }), { progress: 11 });
});

test('extras and chapter 0 do nothing', () => {
  assert.equal(planAfterRead({ entry: null, chapterNumber: null }), null);
  assert.equal(planAfterRead({ entry: null, chapterNumber: '0' }), null);
});

test('planning, paused and dropped titles go back to reading; completed ones stay completed', () => {
  for (const status of ['PLANNING', 'PAUSED', 'DROPPED']) assert.equal(planAfterRead({ entry: { status, progress: 0, startedAt: 'x' }, chapterNumber: '2' }).status, 'CURRENT', status);
  assert.equal(planAfterRead({ entry: { status: 'COMPLETED', progress: 5, startedAt: 'x' }, chapterNumber: '6', totalChapters: 0 }).status, undefined);
});

test('reaching the last chapter completes the title and sets the finish date once', () => {
  const patch = planAfterRead({ entry: { status: 'CURRENT', progress: 9, startedAt: '2026-01-01' }, chapterNumber: '10', totalChapters: 10, today: '2026-10-24' });
  assert.deepEqual(patch, { progress: 10, status: 'COMPLETED', completedAt: '2026-10-24' });
  const again = planAfterRead({ entry: { status: 'CURRENT', progress: 9, startedAt: 's', completedAt: '2025-05-05' }, chapterNumber: '10', totalChapters: 10, today: '2026-10-24' });
  assert.equal(again.completedAt, undefined, 'an existing finish date is kept');
});

test('patch descriptions read well', () => {
  assert.equal(describePatch({ progress: 12, status: 'CURRENT' }), 'chapter 12, reading');
});
