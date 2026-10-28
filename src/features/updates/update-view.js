import { escapeHtml } from '../../shared/utils.js';
import { timeAgo } from './update-plan.js';

// The "New chapters" section on Home. `groups` comes from groupUpdates(); `renderCover(row)` draws a title's cover.
export function updatesSectionMarkup(groups, { renderCover, icon, now = Date.now() }) {
  if (!groups.length) return '';
  const unread = groups.reduce((sum, group) => sum + group.unread, 0);
  const rows = groups.slice(0, 8).map(group => {
    const id = escapeHtml(group.contentItemId);
    const title = escapeHtml(group.title);
    return `<article class="update-row${group.unread ? ' is-unread' : ''}"><button class="update-open" type="button" data-action="update-open" data-id="${id}" aria-label="Open ${title}">${renderCover({ title: group.title, coverUrl: group.coverUrl })}<span class="update-copy"><strong>${title}</strong><span>${escapeHtml(group.label)}</span><small>${escapeHtml(timeAgo(group.newestAt, now))}</small></span>${group.unread ? '<span class="update-dot" aria-label="New"></span>' : ''}</button><button class="icon-button update-dismiss" type="button" data-action="update-dismiss" data-id="${id}" aria-label="Dismiss ${title}" title="Dismiss">${icon('close')}</button></article>`;
  }).join('');
  const more = groups.length > 8 ? `<p class="update-more">${groups.length - 8} more titles. Open Settings > Notifications to clear the list.</p>` : '';
  return `<div class="section-head"><div><h2>New chapters</h2>${unread ? `<p>${unread} unread</p>` : ''}</div><button class="button button-small" type="button" data-action="updates-clear">Clear</button></div><div class="update-list">${rows}</div>${more}`;
}
