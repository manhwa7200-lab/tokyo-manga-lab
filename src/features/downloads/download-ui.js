// Markup for the "Add to Download" screen and the Downloads screen. Pure string builders: app.js owns state and events.
import { escapeHtml, formatDate } from '../../shared/utils.js';
import { icon } from '../../shared/icons.js';
import { safeCoverUrl } from '../../shared/covers.js';
import { chapterNumberValue } from '../chapters/chapter-view.js';
import { estimateBytes, formatBytes, groupDownloads, isSelectable, jobLabel, jobProgress, selectionSummary, shortLabel, statusFor, waitingText } from './download-plan.js';

const STATUS_TEXT = { done: 'Downloaded', downloading: 'Downloading', queued: 'Queued', failed: 'Failed. Tap to try again' };

function rowMarkup(row, jobs, selected) {
  const id = escapeHtml(row.externalId);
  const status = statusFor(row.externalId, jobs);
  const pickable = isSelectable(row.externalId, jobs);
  const picked = pickable && selected.has(row.externalId);
  const title = chapterNumberValue(row) !== null && row.title ? row.title : '';
  const detail = [`${Number(row.pages) || 0} pages`, row.publishedAt ? formatDate(row.publishedAt) : '', (row.scanlationGroups || [])[0] || ''].filter(Boolean).join(' · ');
  const chip = status ? `<span class="dl-chip" data-state="${status}">${icon(status === 'done' ? 'check' : status === 'failed' ? 'info' : 'download', 'icon-sm')}${escapeHtml(STATUS_TEXT[status])}</span>` : '';
  return `<button class="dl-row ${picked ? 'is-picked' : ''} ${pickable ? '' : 'is-locked'}" type="button" role="checkbox" aria-checked="${picked}" ${pickable ? '' : 'aria-disabled="true"'} data-action="download-toggle" data-chapter-id="${id}" data-state="${status || ''}">
    <span class="dl-check" aria-hidden="true">${icon('check')}</span>
    <span class="dl-row-copy"><strong>${escapeHtml(shortLabel(row))}${row.volumeNumber ? `<em> Vol. ${escapeHtml(row.volumeNumber)}</em>` : ''}</strong><small>${escapeHtml([title, detail].filter(Boolean).join(' · '))}</small></span>${chip}</button>`;
}

export function footerCounts({ selected, rows, quality }) {
  const summary = selectionSummary(selected, rows);
  return { ...summary, text: `${summary.count} Selected`, note: summary.count ? `${summary.pages.toLocaleString()} pages, about ${formatBytes(estimateBytes(summary.pages, quality))}${summary.large ? '. This is a big pick and will take a while.' : ''}` : 'Pick the chapters to keep on this phone.' };
}

// The whole picker. `rows` are the chapters in picker order; `jobs` is a Map of chapterId -> job.
export function renderPicker({ title, status, rows, jobs, selected, dir, jumpOpen, hasMore, queueCount, quality, loading }) {
  const counts = footerCounts({ selected, rows, quality });
  const allPicked = rows.filter(row => isSelectable(row.externalId, jobs)).every(row => selected.has(row.externalId)) && rows.some(row => isSelectable(row.externalId, jobs));
  const body = rows.length
    ? `<div class="dl-list" id="dlList" role="group" aria-label="Chapters">${rows.map(row => rowMarkup(row, jobs, selected)).join('')}${hasMore ? '<button class="button dl-more" type="button" data-action="download-load-rest">Load the remaining chapters</button>' : ''}</div>`
    : `<div class="empty-state dl-empty"><strong>${loading ? 'Loading chapters…' : 'No chapters to download'}</strong><span>${loading ? 'One moment.' : 'Chapters with no pages, or in another language, are not listed.'}</span></div>`;
  return `<header class="dl-top">
      <button class="icon-button" type="button" data-action="download-close" aria-label="Back">${icon('chevronLeft')}</button>
      <h2 id="dlTitle">Add to Download</h2>
      <button class="icon-button dl-queue-btn" type="button" data-action="download-open-queue" aria-label="Download queue${queueCount ? `, ${queueCount} waiting` : ''}">${icon('download')}${queueCount ? `<span class="dl-badge">${queueCount > 99 ? '99+' : queueCount}</span>` : ''}</button>
    </header>
    <div class="dl-sub"><span class="dl-sub-title" title="${escapeHtml(title)}">${escapeHtml(status || title)}</span>
      <span class="dl-sub-tools"><button class="dl-pill" type="button" data-action="download-jump-toggle" aria-expanded="${Boolean(jumpOpen)}">jump to</button>
      <button class="icon-button dl-sort" type="button" data-action="download-sort" aria-label="Order: ${dir === 'asc' ? 'lowest' : 'highest'} chapter first. Tap to flip" title="Flip the order"><span aria-hidden="true">${dir === 'asc' ? '↑' : '↓'}</span></button></span></div>
    ${jumpOpen ? `<form class="dl-jump" data-form="download-jump"><label class="sr-only" for="dlJump">Chapter number</label><input class="field" id="dlJump" name="chapter" type="text" inputmode="decimal" autocomplete="off" placeholder="Chapter number" maxlength="8"><button class="button-primary button-small" type="submit">Go</button></form>` : ''}
    ${body}
    <footer class="dl-bottom"><div class="dl-bottom-info"><strong id="dlCount" aria-live="polite">${escapeHtml(counts.text)}</strong><small id="dlNote">${escapeHtml(counts.note)}</small></div>
      <button class="button dl-all" type="button" data-action="download-all" ${rows.some(row => isSelectable(row.externalId, jobs)) ? '' : 'disabled'}>${icon('check', 'icon-sm')}${allPicked ? 'Select None' : 'Select All'}</button>
      <button class="button-primary dl-go" id="dlGo" type="button" data-action="download-start" ${counts.count ? '' : 'disabled'}>${icon('download', 'icon-sm')}Download</button></footer>`;
}

// ---- Downloads screen -------------------------------------------------------------------------------------------
function thumb(coverUrl) {
  const safe = safeCoverUrl(coverUrl);
  return safe ? `<img class="dl-thumb" src="${escapeHtml(safe)}" alt="" loading="lazy" referrerpolicy="no-referrer" decoding="async">` : `<div class="dl-thumb dl-thumb-empty">${icon('download')}</div>`;
}

function queueRow(job) {
  const id = escapeHtml(job.id);
  const progress = jobProgress(job);
  const failed = job.status === 'failed';
  const detail = failed ? (job.lastError || 'Download failed.') : job.status === 'downloading' ? `${job.donePages || 0} of ${job.pageCount || '…'} pages` : 'Waiting in the queue';
  return `<div class="dl-job" data-state="${job.status}"><div class="dl-job-copy"><strong>${escapeHtml(job.mangaTitle || 'Untitled')}</strong><span>${escapeHtml(jobLabel(job))}</span><small ${failed ? 'class="is-error"' : ''}>${escapeHtml(detail)}</small>
      <div class="dl-bar" role="progressbar" aria-label="Download progress for ${escapeHtml(jobLabel(job))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div></div>
    <div class="dl-job-actions">${failed ? `<button class="button button-small" type="button" data-action="download-retry" data-chapter-id="${id}">Retry</button>` : ''}<button class="button button-small" type="button" data-action="download-cancel" data-chapter-id="${id}" aria-label="Remove ${escapeHtml(jobLabel(job))} from the queue">${failed ? 'Remove' : 'Cancel'}</button></div></div>`;
}

export function renderDownloadsBody({ snapshot, limitBytes, openGroups = new Set(), online = true }) {
  const { jobs, usage, paused, waiting } = snapshot;
  const active = jobs.filter(job => job.status !== 'done');
  const groups = groupDownloads(jobs);
  const meter = limitBytes ? `<div class="dl-bar dl-usage-bar" role="img" aria-label="${Math.round(Math.min(100, usage.bytes / limitBytes * 100))} percent of the storage limit used"><span style="width:${Math.min(100, usage.bytes / limitBytes * 100)}%"></span></div>` : '';
  const summary = `<div class="dl-summary"><div><strong>${formatBytes(usage.bytes)}</strong><small>${usage.chapters} chapter${usage.chapters === 1 ? '' : 's'} saved${limitBytes ? ` · limit ${formatBytes(limitBytes)}` : ' · no limit'}</small></div>${meter}</div>`;
  const note = waitingText(waiting);
  const hasRunning = active.some(job => job.status === 'queued' || job.status === 'downloading');
  const queueControls = `<div class="dl-queue-tools">${hasRunning && !paused ? '<button class="button button-small" type="button" data-action="download-pause">Pause</button>' : ''}${paused ? '<button class="button-primary button-small" type="button" data-action="download-resume">Resume</button>' : ''}${active.some(job => job.status === 'failed') ? '<button class="button button-small" type="button" data-action="download-retry-all">Retry failed</button>' : ''}</div>`;
  const queue = active.length
    ? `<h2 class="group-title">Queue</h2>${note ? `<p class="notice ${waiting === 'paused' ? '' : 'warning'}" role="status">${escapeHtml(note)}</p>` : ''}${queueControls}<div class="dl-jobs">${active.map(queueRow).join('')}</div>`
    : '';
  const saved = groups.length
    ? `<h2 class="group-title">Saved on this device</h2><div class="dl-groups">${groups.map(group => `<details class="dl-group" data-group="${escapeHtml(group.key)}" ${openGroups.has(group.key) ? 'open' : ''}><summary>${thumb(group.coverUrl)}<span class="dl-group-copy"><strong>${escapeHtml(group.title)}</strong><small>${group.chapters.length} chapter${group.chapters.length === 1 ? '' : 's'} · ${formatBytes(group.bytes)}</small></span>${icon('chevronRight', 'icon-sm')}</summary>
        <div class="dl-chapters">${group.chapters.map(job => `<div class="dl-chapter"><button class="dl-chapter-open" type="button" data-action="download-read" data-chapter-id="${escapeHtml(job.id)}"><strong>${escapeHtml(jobLabel(job))}</strong><small>${job.pageCount} pages · ${formatBytes(job.bytes)} · ${job.quality === 'data' ? 'Original' : 'Data saver'}</small></button><button class="icon-button" type="button" data-action="download-delete" data-chapter-id="${escapeHtml(job.id)}" aria-label="Delete ${escapeHtml(jobLabel(job))}">${icon('trash')}</button></div>`).join('')}</div>
        <div class="dl-group-foot"><button class="button button-small button-danger" type="button" data-action="download-delete-title" data-key="${escapeHtml(group.key)}">Delete all of this title</button></div></details>`).join('')}</div><div class="dl-delete-all"><button class="button button-danger" type="button" data-action="download-delete-all">Delete all downloads</button></div>`
    : (active.length ? '' : `<div class="empty-state"><strong>Nothing downloaded yet</strong><span>Open a title, tap the download button above its chapters, and pick what to keep for offline reading.</span></div>`);
  return `${summary}${online ? '' : '<p class="notice" role="status">You are offline. Saved chapters still open.</p>'}${queue}${saved}`;
}
