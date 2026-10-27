import { escapeHtml } from '../../shared/utils.js';

// Discover filters: pure helpers (no DOM, no network) so they can be tested on their own.
export const MAX_GENRES = 6;
export const STATUS_OPTIONS = Object.freeze([['', 'All'], ['ongoing', 'Ongoing'], ['completed', 'Completed'], ['hiatus', 'Hiatus'], ['cancelled', 'Cancelled']]);
export const SORT_OPTIONS = Object.freeze([['', 'Default'], ['popular', 'Popular'], ['new', 'New'], ['updated', 'Updated']]);
const GROUP_ORDER = ['genre', 'theme', 'format', 'content'];
const GROUP_LABELS = { genre: 'Genres', theme: 'Themes', format: 'Format', content: 'Content', other: 'Other' };

export const emptyFilters = () => ({ genres: [], status: '', sort: '' });
export const hasFilters = filters => Boolean(filters && (filters.genres?.length || filters.status || filters.sort));
export const cloneFilters = filters => ({ genres: [...(filters?.genres || [])], status: filters?.status || '', sort: filters?.sort || '' });

export function toggleGenre(list, id, max = MAX_GENRES) {
  const current = Array.isArray(list) ? list : [];
  if (current.includes(id)) return current.filter(entry => entry !== id);
  return current.length >= max ? current : [...current, id];
}

const optionLabel = (options, value) => (options.find(([key]) => key === value) || options[0])[1];

// Text on the three filter buttons: the plain name while nothing is chosen, the choice once something is.
export function pillLabels(filters, names = new Map()) {
  const genres = filters?.genres || [];
  const first = genres.length ? (names.get(genres[0]) || 'Genre') : '';
  return {
    genre: genres.length ? (genres.length > 1 ? `${first} +${genres.length - 1}` : first) : 'Genre',
    status: filters?.status ? optionLabel(STATUS_OPTIONS, filters.status) : 'Status',
    sort: filters?.sort ? optionLabel(SORT_OPTIONS, filters.sort) : 'Sort by'
  };
}

// Tags arrive as {id, name, group}; they are shown in the order genre, theme, format, content.
export function groupTags(tags) {
  const groups = new Map();
  for (const tag of Array.isArray(tags) ? tags : []) {
    if (!tag?.id || !tag?.name) continue;
    const key = GROUP_ORDER.includes(tag.group) ? tag.group : 'other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tag);
  }
  return [...GROUP_ORDER, 'other'].filter(key => groups.has(key)).map(key => ({
    key, label: GROUP_LABELS[key], tags: groups.get(key).sort((a, b) => a.name.localeCompare(b.name))
  }));
}

// "Completed" for finished titles, "Up to Ch. N" when the newest chapter is known.
export function cardNote(item) {
  const status = item?.publicationStatus;
  if (status === 'completed') return { text: 'Completed', tone: 'done' };
  const number = item?.latestChapter?.number || item?.lastChapter;
  if (number) return { text: `Up to Ch. ${number}`, tone: 'chapter' };
  if (status === 'releasing') return { text: 'Ongoing', tone: 'chapter' };
  if (status === 'hiatus') return { text: 'Hiatus', tone: 'muted' };
  return null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// The small date on a Latest card: Today, Yesterday, or "Oct 24".
export function dateChip(iso, now = new Date()) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return '';
  const day = value => Math.floor((value.getTime() - value.getTimezoneOffset() * 60000) / 86400000);
  const diff = day(now) - day(date);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

// Offline fallback: narrows cached titles by the chosen status and genre names (the tag ids only mean something online).
export function filterLocal(items, filters, genreNames = new Map()) {
  const wantedStatus = filters?.status === 'ongoing' ? 'releasing' : filters?.status;
  const wantedTags = (filters?.genres || []).map(id => String(genreNames.get(id) || '').toLowerCase()).filter(Boolean);
  return items.filter(item => {
    if (wantedStatus && item.publicationStatus !== wantedStatus) return false;
    const have = (item.tags || []).map(tag => String(tag).toLowerCase());
    return wantedTags.every(tag => have.includes(tag));
  });
}

const chip = (kind, value, label, on) => `<button class="fs-chip${on ? ' is-on' : ''}" type="button" data-action="filter-pick" data-kind="${kind}" data-value="${escapeHtml(value)}" aria-pressed="${on}">${escapeHtml(label)}</button>`;

// Body of the bottom sheet. `kind` is genre | status | sort; `draft` is the choice being edited; `tags` is {state, list, error}.
export function sheetMarkup(kind, draft, tags = { state: 'idle', list: [], error: '' }) {
  const title = kind === 'genre' ? 'Genre' : kind === 'status' ? 'Status' : 'Sort by';
  let body;
  if (kind === 'genre') {
    if (tags.state === 'loading' || tags.state === 'idle') body = '<div class="fs-note"><span class="spinner"></span><span>Loading genres…</span></div>';
    else if (tags.state === 'error') body = `<div class="fs-note" role="alert"><span>${escapeHtml(tags.error || 'The genre list could not be loaded.')}</span><button class="button button-small" type="button" data-action="filter-tags-retry">Retry</button></div>`;
    else body = groupTags(tags.list).map(group => `<section class="fs-group"><h3>${group.label}</h3><div class="fs-chips">${group.tags.map(tag => chip('genre', tag.id, tag.name, draft.genres.includes(tag.id))).join('')}</div></section>`).join('')
      + (draft.genres.length >= MAX_GENRES ? `<p class="fs-hint">You can combine up to ${MAX_GENRES} genres.</p>` : '<p class="fs-hint">Titles must match every genre you pick.</p>');
  } else {
    const options = kind === 'status' ? STATUS_OPTIONS : SORT_OPTIONS;
    const current = kind === 'status' ? draft.status : draft.sort;
    body = `<div class="fs-chips">${options.map(([value, label]) => chip(kind, value, label, current === value)).join('')}</div>${kind === 'sort' ? '<p class="fs-hint">Default is best match while searching and recently updated while browsing.</p>' : ''}`;
  }
  return `<div class="fs-head"><h2 id="fsTitle">${title}</h2><button class="fs-reset" type="button" data-action="filter-reset">Reset</button></div><div class="fs-body">${body}</div><div class="fs-foot"><button class="button-primary" type="button" data-action="filter-done">Done</button></div>`;
}
