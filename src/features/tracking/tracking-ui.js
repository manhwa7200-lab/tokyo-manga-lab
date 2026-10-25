// Markup for the Tracking panel on a title (AniList). Pure string builders: app.js owns state and events.
import { escapeHtml } from '../../shared/utils.js';
import { TRACK_STATUSES, rawToScore, trackStatusLabel } from './tracking.js';

const statusOptions = current => `${current ? '' : '<option value="" selected disabled>Not on your list</option>'}${TRACK_STATUSES.map(([value, label]) => `<option value="${value}" ${current === value ? 'selected' : ''}>${label}</option>`).join('')}`;

function searchBlock(track, item, coverHtml) {
  const search = track.search || {};
  const results = (search.results || []).map(media => {
    const title = media.title?.english || media.title?.romaji || media.title?.native || 'Untitled';
    const meta = [media.format ? String(media.format).replace(/_/g, ' ').toLowerCase() : '', media.startDate?.year || '', media.chapters ? `${media.chapters} chapters` : ''].filter(Boolean).join(' · ');
    return `<article class="link-candidate"><div class="link-candidate-cover">${coverHtml({ title, coverUrl: media.coverImage?.medium || null })}</div><div class="link-candidate-main"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(meta || 'AniList title')}</small><a class="link-candidate-open" href="https://anilist.co/manga/${encodeURIComponent(media.id)}" target="_blank" rel="noopener noreferrer">Preview on AniList ↗</a></div><button class="button-primary button-small" type="button" data-action="track-link" data-media-id="${escapeHtml(media.id)}">Track this</button></article>`;
  }).join('');
  const status = search.status === 'loading' ? '<p class="muted"><span class="spinner"></span> Searching AniList…</p>'
    : search.status === 'error' ? `<div class="notice warning" role="alert">${escapeHtml(search.message || 'AniList search failed.')}</div>`
    : search.status === 'done' && !results ? '<p class="muted">No AniList titles matched. Try another spelling.</p>' : '';
  return `<div class="track-find"><h4>Find this title on AniList</h4><p class="muted">Pick the right one yourself. Titles are never matched by name automatically.</p>
    <form class="link-search" data-form="track-search"><label class="sr-only" for="trackQuery">Search AniList</label><input class="field" id="trackQuery" name="q" type="search" value="${escapeHtml(search.query ?? item.title ?? '')}" maxlength="100" autocomplete="off"><button class="button-primary" type="submit">Search</button></form>
    ${status}<div class="link-candidates">${results}</div></div>`;
}

export function renderTrackingPanel({ track, item, coverHtml }) {
  if (!track.open) return '';
  let body;
  if (track.loading) body = '<p class="muted"><span class="spinner"></span> Checking AniList…</p>';
  else if (!track.connected) body = '<p>Tracking saves your status, chapters read, score and dates on AniList. It is optional.</p><p class="muted">Sign in to AniList first. Nothing is sent until you do.</p><a class="button-primary" href="#settings/account" data-action="track-go-settings">Sign in on Profile or Settings</a>';
  else if (!track.mediaId) body = searchBlock(track, item, coverHtml);
  else {
    const row = track.row || { onList: false, status: null, progress: 0, score: 0, startedAt: null, completedAt: null, totalChapters: 0, title: item.title };
    const total = Number(row.totalChapters) || 0;
    const score = rawToScore(row.score);
    const saveNote = track.note ? `<p class="track-note ${track.noteKind || ''}" role="status">${escapeHtml(track.note)}</p>` : '';
    const pending = track.pending && !track.note ? '<p class="track-note queued" role="status">Waiting to send to AniList.</p>' : '';
    const canUnlink = item.sourceId !== 'anilist';
    body = `<div class="track-card"><div class="track-head"><span class="track-logo" aria-hidden="true">AL</span><div class="track-title"><strong>${escapeHtml(row.title || item.title)}</strong><small>${row.onList ? escapeHtml(trackStatusLabel(row.status)) : 'Not on your AniList yet'}</small></div></div>
      <div class="track-grid">
        <label class="track-cell"><span>Status</span><select class="select-field" data-track-field="status" aria-label="Status on AniList">${statusOptions(row.onList ? row.status : null)}</select></label>
        <div class="track-cell"><span>Chapters</span><div class="stepper"><button class="button button-small" type="button" data-action="track-step" data-delta="-1" aria-label="One chapter less">−</button><input class="field" data-track-field="progress" type="number" inputmode="numeric" min="0" max="100000" step="1" value="${Number(row.progress) || 0}" aria-label="Chapters read"><button class="button button-small" type="button" data-action="track-step" data-delta="1" aria-label="One chapter more">+</button></div>${total ? `<small>of ${total}</small>` : ''}</div>
        <label class="track-cell"><span>Score</span><input class="field" data-track-field="score" type="number" inputmode="decimal" min="0" max="10" step="0.5" value="${score || ''}" placeholder="0–10" aria-label="Score from 0 to 10"></label>
        <label class="track-cell"><span>Start date</span><input class="field" data-track-field="startedAt" type="date" value="${escapeHtml(row.startedAt || '')}" aria-label="Start date"></label>
        <label class="track-cell"><span>Finish date</span><input class="field" data-track-field="completedAt" type="date" value="${escapeHtml(row.completedAt || '')}" aria-label="Finish date"></label>
      </div>${saveNote}${pending}
      <div class="track-actions"><a class="button button-small" href="https://anilist.co/manga/${encodeURIComponent(track.mediaId)}" target="_blank" rel="noopener noreferrer">Open on AniList ↗</a>${canUnlink ? '<button class="button button-small" type="button" data-action="track-unlink">Track a different title</button>' : ''}</div></div>`;
  }
  return `<section class="track-panel" aria-label="Tracking"><div class="section-topline"><div><h3>Tracking</h3><p>AniList · changes are sent as soon as you make them.</p></div><button class="icon-button" type="button" data-action="track-close" aria-label="Close tracking">✕</button></div>${body}</section>`;
}
