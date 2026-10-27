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
  return `<div class="dl-job" data-state="${job.status}"><div class="dl-job-copy"><span>${escapeHtml(jobLabel(job))}</span><small ${failed ? 'class="is-error"' : ''}>${escapeHtml(detail)}</small>
      <div class="dl-bar" role="progressbar" aria-label="Download progress for ${escapeHtml(jobLabel(job))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div></div>
    <div class="dl-job-actions">${failed ? `<button class="button button-small" type="button" data-action="download-retry" data-chapter-id="${id}">Retry</button>` : ''}<button class="button button-small" type="button" data-action="download-cancel" data-chapter-id="${id}" aria-label="Remove ${escapeHtml(jobLabel(job))} from the queue">${failed ? 'Remove' : 'Cancel'}</button></div></div>`;
}

// Every title that has anything saved or waiting, one row each (queued and finished chapters together).
export function titleRows(jobs) {
  const groups = new Map();
  for (const job of jobs || []) {
    const key = job.contentItemId || `title:${job.mangaTitle}`;
    if (!groups.has(key)) groups.set(key, { key, contentItemId: job.contentItemId || null, title: job.mangaTitle || 'Untitled', coverUrl: job.coverUrl || '', jobs: [], bytes: 0 });
    const group = groups.get(key);
    group.jobs.push(job);
    group.bytes += Number(job.bytes) || 0;
  }
  return [...groups.values()].map(group => {
    const done = group.jobs.filter(job => job.status === 'done');
    const active = group.jobs.filter(job => job.status === 'queued' || job.status === 'downloading');
    const failed = group.jobs.filter(job => job.status === 'failed');
    return { ...group, done, active, failed, saved: groupDownloads(done)[0]?.chapters || [] };
  }).sort((a, b) => (b.active.length > 0) - (a.active.length > 0) || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
}

// "Paused", "Downloading", "Waiting for Wi-Fi" ... for a title that has chapters in the queue.
export function activeStatus(row, snapshot) {
  if (row.failed.length && !row.active.length) return 'Failed';
  if (snapshot.paused) return 'Paused';
  if (snapshot.waiting === 'wifi') return 'Waiting for Wi-Fi';
  if (snapshot.waiting === 'offline') return 'Waiting for a connection';
  if (snapshot.waiting === 'storage') return 'Storage limit reached';
  return row.active.some(job => job.status === 'downloading') ? 'Downloading' : 'Queued';
}

function titleRowMarkup(row, snapshot, readInfo, open) {
  const total = row.done.length + row.active.length + row.failed.length;
  const busy = row.active.length > 0 || row.failed.length > 0;
  const percent = total ? Math.round(row.done.length / total * 100) : 0;
  const lines = busy
    ? `<span class="dl-line"><span>${escapeHtml(activeStatus(row, snapshot))}</span><span class="dl-count">${row.done.length}/${total}</span></span><span class="dl-bar" role="progressbar" aria-label="Chapters finished for ${escapeHtml(row.title)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></span>`
    : `<span class="dl-line"><span>${escapeHtml(readInfo.get(row.contentItemId) || 'Not started')}</span></span><span class="dl-line"><span>Used ${escapeHtml(formatBytes(row.bytes))}</span></span>`;
  const chapters = row.saved.map(job => `<div class="dl-chapter"><button class="dl-chapter-open" type="button" data-action="download-read" data-chapter-id="${escapeHtml(job.id)}"><strong>${escapeHtml(jobLabel(job))}</strong><small>${job.pageCount} pages · ${formatBytes(job.bytes)} · ${job.quality === 'data' ? 'Original' : 'Data saver'}</small></button><button class="icon-button" type="button" data-action="download-delete" data-chapter-id="${escapeHtml(job.id)}" aria-label="Delete ${escapeHtml(jobLabel(job))}">${icon('trash')}</button></div>`).join('');
  const queue = [...row.active, ...row.failed].map(queueRow).join('');
  return `<details class="dl-group" data-group="${escapeHtml(row.key)}" ${open ? 'open' : ''}><summary>${thumb(row.coverUrl)}<span class="dl-group-copy"><strong>${escapeHtml(row.title)}</strong>${lines}</span>${icon('chevronRight', 'icon-sm')}</summary>
    ${queue ? `<div class="dl-jobs-inline">${queue}</div>` : ''}${chapters ? `<div class="dl-chapters">${chapters}</div>` : ''}
    ${row.done.length ? `<div class="dl-group-foot"><button class="button button-small button-danger" type="button" data-action="download-delete-title" data-key="${escapeHtml(row.key)}">Delete saved chapters of this title</button></div>` : ''}</details>`;
}

export function renderDownloadsBody({ snapshot, limitBytes, openGroups = new Set(), online = true, readInfo = new Map(), manageOpen = false }) {
  const { jobs, usage, paused, waiting } = snapshot;
  const rows = titleRows(jobs);
  const meter = limitBytes ? `<div class="dl-bar dl-usage-bar" role="img" aria-label="${Math.round(Math.min(100, usage.bytes / limitBytes * 100))} percent of the storage limit used"><span style="width:${Math.min(100, usage.bytes / limitBytes * 100)}%"></span></div>` : '';
  const summary = `<div class="dl-summary"><div><strong>${formatBytes(usage.bytes)}</strong><small>${usage.chapters} chapter${usage.chapters === 1 ? '' : 's'} saved${limitBytes ? ` · limit ${formatBytes(limitBytes)}` : ' · no limit'}</small></div>${meter}</div>`;
  const note = waitingText(waiting);
  const hasRunning = jobs.some(job => job.status === 'queued' || job.status === 'downloading');
  const manage = manageOpen ? `<div class="dl-manage" role="group" aria-label="Manage downloads">${hasRunning && !paused ? '<button class="button button-small" type="button" data-action="download-pause">Pause all</button>' : ''}${paused ? '<button class="button-primary button-small" type="button" data-action="download-resume">Resume</button>' : ''}${jobs.some(job => job.status === 'failed') ? '<button class="button button-small" type="button" data-action="download-retry-all">Retry failed</button>' : ''}${jobs.length ? '<button class="button button-small button-danger" type="button" data-action="download-delete-all">Delete all downloads</button>' : '<span class="muted">Nothing to manage yet.</span>'}</div>` : '';
  const list = rows.length
    ? `<div class="dl-groups">${rows.map(row => titleRowMarkup(row, snapshot, readInfo, openGroups.has(row.key))).join('')}</div>`
    : `<div class="empty-state"><strong>Nothing downloaded yet</strong><span>Open a title, tap the download button above its chapters, and pick what to keep for offline reading.</span></div>`;
  return `${summary}${online ? '' : '<p class="notice" role="status">You are offline. Saved chapters still open.</p>'}${note && hasRunning ? `<p class="notice ${waiting === 'paused' ? '' : 'warning'}" role="status">${escapeHtml(note)}</p>` : ''}${manage}${list}`;
}
