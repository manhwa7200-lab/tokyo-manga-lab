// Pure helpers for tracking a title on AniList (status, chapters read, score, start and finish dates).
// No storage and no network here, so the rules can be tested directly.
export const TRACK_STATUSES = Object.freeze([
  ['CURRENT', 'Reading'], ['REPEATING', 'Re-reading'], ['PLANNING', 'Planning'], ['COMPLETED', 'Completed'], ['PAUSED', 'On hold'], ['DROPPED', 'Dropped']
]);
const STATUS_VALUES = new Set(TRACK_STATUSES.map(([value]) => value));
export const trackStatusLabel = value => TRACK_STATUSES.find(([key]) => key === value)?.[1] || 'Not on your list';
export const isTrackStatus = value => STATUS_VALUES.has(value);

export const MAX_CHAPTER_PROGRESS = 100000;

// AniList progress is a whole number of chapters. "12.5" counts as chapter 12. Extras and nonsense give null.
export function progressNumber(chapterNumber) {
  if (chapterNumber === null || chapterNumber === undefined || String(chapterNumber).trim() === '') return null;
  const value = Math.floor(Number(chapterNumber));
  return Number.isFinite(value) && value >= 0 && value <= MAX_CHAPTER_PROGRESS ? value : null;
}

// ---- dates: AniList uses {year, month, day} with nulls; the app uses "YYYY-MM-DD" text.
export function toDateText(fuzzy) {
  if (!fuzzy || !fuzzy.year || !fuzzy.month || !fuzzy.day) return null;
  const pad = n => String(n).padStart(2, '0');
  return `${String(fuzzy.year).padStart(4, '0')}-${pad(fuzzy.month)}-${pad(fuzzy.day)}`;
}

export function isDateText(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && year >= 1900;
}

export function toFuzzy(text) {
  if (text === null || text === '') return { year: null, month: null, day: null };
  if (!isDateText(text)) throw new TypeError('Dates look like 2026-10-24.');
  const [year, month, day] = text.split('-').map(Number);
  return { year, month, day };
}

export const todayText = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

// ---- score: the app shows 0-10 (halves allowed); AniList stores 0-100 as "raw" whatever format you display.
export function scoreToRaw(text) {
  if (text === null || text === undefined || String(text).trim() === '') return 0;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || value > 10) throw new RangeError('Score is a number from 0 to 10.');
  return Math.round(value * 10);
}
export const rawToScore = raw => (Number(raw) > 0 ? Math.round(Number(raw)) / 10 : 0);

// ---- patches: the fields a person changed, sent to AniList together.
// { status?, progress?, score? (raw 0-100), startedAt? ("YYYY-MM-DD" or null), completedAt? }
const PATCH_KEYS = ['status', 'progress', 'score', 'startedAt', 'completedAt'];

export function cleanPatch(patch = {}) {
  const out = {};
  if (patch.status !== undefined) { if (!isTrackStatus(patch.status)) throw new TypeError('Unknown status.'); out.status = patch.status; }
  if (patch.progress !== undefined) {
    const value = Number(patch.progress);
    if (!Number.isInteger(value) || value < 0 || value > MAX_CHAPTER_PROGRESS) throw new RangeError('Chapters read is a whole number.');
    out.progress = value;
  }
  if (patch.score !== undefined) {
    const value = Number(patch.score);
    if (!Number.isInteger(value) || value < 0 || value > 100) throw new RangeError('Score is a number from 0 to 10.');
    out.score = value;
  }
  for (const key of ['startedAt', 'completedAt']) {
    if (patch[key] === undefined) continue;
    if (patch[key] !== null && !isDateText(patch[key])) throw new TypeError('Dates look like 2026-10-24.');
    out[key] = patch[key];
  }
  return out;
}

// Later changes win field by field.
export function mergePatch(earlier = {}, later = {}) {
  const out = {};
  for (const key of PATCH_KEYS) {
    if (later[key] !== undefined) out[key] = later[key];
    else if (earlier[key] !== undefined) out[key] = earlier[key];
  }
  return out;
}

export const patchIsEmpty = patch => !PATCH_KEYS.some(key => patch?.[key] !== undefined);

// The GraphQL variables for SaveMediaListEntry. Fields that were not changed are left out so AniList keeps them.
export function patchToVariables(patch) {
  const vars = {};
  if (patch.status !== undefined) vars.status = patch.status;
  if (patch.progress !== undefined) vars.progress = patch.progress;
  if (patch.score !== undefined) vars.scoreRaw = patch.score;
  if (patch.startedAt !== undefined) vars.startedAt = toFuzzy(patch.startedAt);
  if (patch.completedAt !== undefined) vars.completedAt = toFuzzy(patch.completedAt);
  return vars;
}

// What to save when a chapter has just been read (or marked read). Returns null when nothing should change.
//  - progress only ever goes up
//  - a title that was not being read starts being read (completed titles are left alone)
//  - the start date is filled in once
//  - reaching the last known chapter completes the title
export function planAfterRead({ entry = null, chapterNumber, totalChapters = 0, today = todayText() } = {}) {
  const reached = progressNumber(chapterNumber);
  if (reached === null || reached === 0) return null;
  const currentProgress = Number(entry?.progress) || 0;
  if (reached <= currentProgress) return null;
  const patch = { progress: reached };
  const status = entry?.status || null;
  if (!status || ['PLANNING', 'PAUSED', 'DROPPED'].includes(status)) patch.status = 'CURRENT';
  if (!entry?.startedAt) patch.startedAt = today;
  const total = Number(totalChapters) || 0;
  if (total > 0 && reached >= total && status !== 'REPEATING') {
    patch.status = 'COMPLETED';
    if (!entry?.completedAt) patch.completedAt = today;
  }
  return patch;
}

// A short sentence for toasts.
export function describePatch(patch) {
  const parts = [];
  if (patch.progress !== undefined) parts.push(`chapter ${patch.progress}`);
  if (patch.status !== undefined) parts.push(trackStatusLabel(patch.status).toLowerCase());
  if (patch.score !== undefined) parts.push(`score ${rawToScore(patch.score) || 'cleared'}`);
  if (patch.startedAt !== undefined) parts.push(patch.startedAt ? `started ${patch.startedAt}` : 'start date cleared');
  if (patch.completedAt !== undefined) parts.push(patch.completedAt ? `finished ${patch.completedAt}` : 'finish date cleared');
  return parts.join(', ');
}

export const MARK_READ_MODES = Object.freeze([['always', 'Always'], ['ask', 'Ask each time'], ['never', 'Never']]);
