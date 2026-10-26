// Markup for the chapter list controls and rows on a title. Pure string builders: app.js owns state and events.
import { escapeHtml, formatDate } from '../../shared/utils.js';
import { icon } from '../../shared/icons.js';
import { DISPLAY_MODES, SORT_KEYS, chapterLabel, viewIsActive } from './chapter-view.js';

const radio = (name, value, label, checked, extra = '') => `<label class="opt-row"><input type="radio" name="${name}" value="${escapeHtml(value)}" data-chapter-view="${name}" ${checked ? 'checked' : ''} ${extra}><span>${escapeHtml(label)}</span></label>`;

// The sheet under the chapter heading: Filter, Sort and Display tabs, like the Mihon chapter options.
export function renderChapterOptions({ view, tab, scanlators }) {
  const tabs = [['filter', 'Filter'], ['sort', 'Sort'], ['display', 'Display']];
  const bar = `<div class="opt-tabs" role="tablist" aria-label="Chapter list options">${tabs.map(([id, label]) => `<button class="opt-tab" type="button" role="tab" aria-selected="${tab === id}" data-action="chapter-options-tab" data-tab="${id}">${label}</button>`).join('')}</div>`;
  let body = '';
  if (tab === 'sort') {
    const arrow = view.sortDir === 'asc' ? '↑' : '↓';
    body = SORT_KEYS.map(([key, label]) => `<button class="opt-row opt-sort ${view.sortKey === key ? 'is-on' : ''}" type="button" data-action="chapter-sort" data-sort-key="${key}" aria-pressed="${view.sortKey === key}"><span class="opt-arrow" aria-hidden="true">${view.sortKey === key ? arrow : ''}</span><span>${escapeHtml(label)}</span></button>`).join('')
      + `<p class="opt-hint">Tap the one that is selected to flip the order. ${view.sortDir === 'asc' ? 'Oldest or lowest first.' : 'Newest or highest first.'}</p>`;
  } else if (tab === 'display') {
    body = DISPLAY_MODES.map(([value, label]) => radio('display', value, label, view.display === value)).join('');
  } else {
    body = `<label class="opt-row"><input type="checkbox" data-chapter-view="unread" ${view.unread ? 'checked' : ''}><span>Unread</span></label>
      <label class="opt-row"><input type="checkbox" data-chapter-view="bookmarked" ${view.bookmarked ? 'checked' : ''}><span>Bookmarked</span></label>
      <label class="opt-row opt-select"><span>Scanlator</span><select class="select-field" data-chapter-view="scanlator" aria-label="Scanlator">
        <option value="">All groups</option>${scanlators.map(name => `<option value="${escapeHtml(name)}" ${view.scanlator === name ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}
      </select></label>`;
  }
  return `<div class="chapter-options" id="chapterOptions">${bar}<div class="opt-body">${body}</div></div>`;
}

export function renderChapterToolbar({ view, open, shown, total, loaded, canDownload = false, downloaded = 0 }) {
  const filtered = viewIsActive(view);
  const countText = filtered ? `${shown.toLocaleString()} of ${loaded.toLocaleString()} shown` : `${Math.max(total, loaded).toLocaleString()} chapters`;
  return `<div class="chapter-toolbar"><strong class="chapter-count">${escapeHtml(countText)}</strong><div class="chapter-tools">${canDownload ? `<button class="button button-small chapter-download-btn" type="button" data-action="download-open" aria-label="Download chapters for offline reading">${icon('download', 'icon-sm')}Download${downloaded ? ` · ${downloaded}` : ''}</button>` : ''}${filtered ? '<button class="button button-small" type="button" data-action="chapter-filters-clear">Clear filters</button>' : ''}<button class="icon-button ${open || filtered ? 'is-active' : ''}" type="button" data-action="chapter-options-toggle" aria-expanded="${open}" aria-controls="chapterOptions" aria-label="Filter, sort and display options" title="Filter, sort and display">${icon('sliders')}</button></div></div>`;
}

// One chapter. `read` and `bookmarked` come from the marks stored on this device.
export function renderChapterRow({ chapter, display, read, bookmarked, menuOpen, canRead, sourceUrl, progressPage, downloadStatus = null, canDownload = false }) {
  const id = escapeHtml(chapter.externalId);
  const name = chapterLabel(chapter, display);
  const detail = [chapter.language || 'Unknown language', `${Number(chapter.pages) || 0} pages`, chapter.publishedAt ? formatDate(chapter.publishedAt) : '', !read && progressPage > 0 ? `Page ${progressPage + 1}` : '', downloadStatus === 'done' ? 'Downloaded' : downloadStatus === 'queued' || downloadStatus === 'downloading' ? 'In download queue' : downloadStatus === 'failed' ? 'Download failed' : ''].filter(Boolean).join(' · ');
  const mark = `${read ? '<span class="chapter-state" title="Read">✓</span>' : '<span class="chapter-dot" title="Unread"></span>'}${bookmarked ? `<span class="chapter-flag" title="Bookmarked">${icon('bookmarkFill')}</span>` : ''}${downloadStatus === 'done' ? `<span class="chapter-flag chapter-saved" title="Downloaded">${icon('download', 'icon-sm')}</span>` : ''}`;
  const menu = menuOpen ? `<div class="chapter-menu" role="group" aria-label="Actions for ${escapeHtml(name)}">
      <button class="button button-small" type="button" data-action="chapter-mark" data-chapter-id="${id}" data-read="${read ? '0' : '1'}">${read ? 'Mark as unread' : 'Mark as read'}</button>
      <button class="button button-small" type="button" data-action="chapter-mark-previous" data-chapter-id="${id}">Mark previous as read</button>
      <button class="button button-small" type="button" data-action="chapter-bookmark" data-chapter-id="${id}" data-on="${bookmarked ? '0' : '1'}">${bookmarked ? 'Remove bookmark' : 'Bookmark'}</button>
      ${canDownload && downloadStatus === 'done' ? `<button class="button button-small" type="button" data-action="download-chapter-delete" data-chapter-id="${id}">Delete download</button>` : ''}${canDownload && (downloadStatus === null || downloadStatus === 'failed') && Number(chapter.pages) > 0 ? `<button class="button button-small" type="button" data-action="download-chapter" data-chapter-id="${id}">Download</button>` : ''}
    </div>` : '';
  return `<article class="chapter-row ${read ? 'is-read' : ''}" data-chapter="${id}"><div class="chapter-row-main"><strong>${mark}<span class="chapter-name">${escapeHtml(name)}</span></strong><small>${escapeHtml(detail)}</small>${chapter.scanlationGroups?.length ? `<small>Group: ${escapeHtml(chapter.scanlationGroups.join(', '))}</small>` : ''}</div><div class="chapter-actions">${canRead && Number(chapter.pages) > 0 ? `<button class="button-primary chapter-read" type="button" data-action="read-chapter" data-chapter-id="${id}">${read ? 'Again' : 'Read'}</button>` : ''}<button class="button chapter-more" type="button" data-action="chapter-menu" data-chapter-id="${id}" aria-expanded="${menuOpen}" aria-label="More actions for ${escapeHtml(name)}">⋯</button>${sourceUrl ? `<a class="button chapter-open" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open on MangaDex">↗</a>` : ''}</div>${menu}</article>`;
}
