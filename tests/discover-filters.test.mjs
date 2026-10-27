import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_GENRES, cardNote, cloneFilters, dateChip, emptyFilters, filterLocal, groupTags, hasFilters, pillLabels, sheetMarkup, toggleGenre } from '../src/features/discover/discover-filters.js';

test('genre picks toggle and stop at the limit', () => {
  let list = [];
  for (let i = 0; i < MAX_GENRES + 2; i += 1) list = toggleGenre(list, `g${i}`);
  assert.equal(list.length, MAX_GENRES);
  assert.deepEqual(toggleGenre(['a', 'b'], 'a'), ['b']);
});

test('filter state helpers', () => {
  assert.equal(hasFilters(emptyFilters()), false);
  assert.equal(hasFilters({ genres: [], status: 'completed', sort: '' }), true);
  const copy = cloneFilters({ genres: ['a'], status: 'x', sort: 'new' });
  copy.genres.push('b');
  assert.deepEqual(cloneFilters(emptyFilters()), emptyFilters());
});

test('button labels show the choice', () => {
  const names = new Map([['a', 'Action'], ['b', 'Romance']]);
  assert.deepEqual(pillLabels(emptyFilters(), names), { genre: 'Genre', status: 'Status', sort: 'Sort by' });
  assert.deepEqual(pillLabels({ genres: ['a', 'b'], status: 'completed', sort: 'popular' }, names), { genre: 'Action +1', status: 'Completed', sort: 'Popular' });
});

test('tags are grouped genre, theme, format, content and sorted by name', () => {
  const groups = groupTags([{ id: '1', name: 'Zed', group: 'theme' }, { id: '2', name: 'Beta', group: 'genre' }, { id: '3', name: 'Alpha', group: 'genre' }, { id: '4', name: 'X', group: 'weird' }, { id: '', name: 'bad', group: 'genre' }]);
  assert.deepEqual(groups.map(group => group.label), ['Genres', 'Themes', 'Other']);
  assert.deepEqual(groups[0].tags.map(tag => tag.name), ['Alpha', 'Beta']);
});

test('card notes: Completed, Up to Ch. N, otherwise status', () => {
  assert.deepEqual(cardNote({ publicationStatus: 'completed', lastChapter: '50' }), { text: 'Completed', tone: 'done' });
  assert.equal(cardNote({ publicationStatus: 'releasing', latestChapter: { number: '12' } }).text, 'Up to Ch. 12');
  assert.equal(cardNote({ publicationStatus: 'releasing', lastChapter: '7' }).text, 'Up to Ch. 7');
  assert.equal(cardNote({ publicationStatus: 'releasing' }).text, 'Ongoing');
  assert.equal(cardNote({ publicationStatus: 'unknown' }), null);
});

test('date chip: Today, Yesterday, then month and day', () => {
  const now = new Date(2026, 9, 24, 15, 0);
  assert.equal(dateChip(new Date(2026, 9, 24, 1, 0).toISOString(), now), 'Today');
  assert.equal(dateChip(new Date(2026, 9, 23, 23, 0).toISOString(), now), 'Yesterday');
  assert.equal(dateChip(new Date(2026, 9, 10, 12, 0).toISOString(), now), 'Oct 10');
  assert.equal(dateChip('nonsense', now), '');
  assert.equal(dateChip(null, now), '');
});

test('offline filtering by status and genre name', () => {
  const items = [{ id: 1, publicationStatus: 'releasing', tags: ['Action'] }, { id: 2, publicationStatus: 'completed', tags: ['Action', 'Romance'] }];
  const names = new Map([['a', 'Action'], ['r', 'Romance']]);
  assert.deepEqual(filterLocal(items, { genres: [], status: 'ongoing' }, names).map(i => i.id), [1]);
  assert.deepEqual(filterLocal(items, { genres: ['a', 'r'], status: '' }, names).map(i => i.id), [2]);
});

test('sheet markup shows the right chips and escapes names', () => {
  const draft = { genres: ['1'], status: 'completed', sort: '' };
  const genre = sheetMarkup('genre', draft, { state: 'ready', list: [{ id: '1', name: '<b>Evil</b>', group: 'genre' }] });
  assert.ok(!genre.includes('<b>Evil'));
  assert.match(genre, /aria-pressed="true"/);
  assert.match(sheetMarkup('genre', draft, { state: 'error', list: [], error: 'x' }), /filter-tags-retry/);
  assert.match(sheetMarkup('status', draft), /data-value="completed"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-value="completed"/);
  assert.match(sheetMarkup('sort', draft), /Popular/);
  assert.match(sheetMarkup('sort', draft), /filter-done/);
});
