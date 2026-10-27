// Glue between the download queue and the screen: the "Add to Download" picker, the chapter-row actions on a title,
// and the Downloads screen. app.js hands over the few things it owns (the open title, the toast, navigation).
import { DOWNLOAD_QUALITIES, isSelectable, jumpTarget, pickerOrder, storageLimitBytes, toggleAll, toggleSelection } from './download-plan.js';
import { footerCounts, renderDownloadsBody, renderPicker } from './download-ui.js';

export function createDownloadController({ loadReadInfo = async () => new Map(), downloads, dialog, getSettings, getConnection, toast, getDetails, loadRestChapters, redrawDetails, goToDownloads, readDownloaded, groupKeyToIds }) {
  const pick = { open: false, history: false, dir: 'desc', selected: new Set(), jumpOpen: false };
  const openGroups = new Set();
  let readInfo = new Map();
  let manageOpen = false;
  let screenTimer = 0;
  let lastScreenRender = 0;

  const jobsMap = () => new Map(downloads.snapshot().jobs.map(job => [job.id, job]));
  const quality = () => (DOWNLOAD_QUALITIES.includes(getSettings()?.downloadQuality) ? getSettings().downloadQuality : 'data-saver');
  const reduceMotion = () => Boolean(getSettings()?.reducedMotion) || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function rows() { return pickerOrder(getDetails().chapters, pick.dir); }
  function queueCount() { return downloads.snapshot().usage.active; }

  // ---- picker ---------------------------------------------------------------------------------------------------
  function draw({ keepScroll = true } = {}) {
    if (!pick.open) return;
    const details = getDetails();
    const list = dialog.querySelector('#dlList');
    const top = keepScroll && list ? list.scrollTop : 0;
    dialog.innerHTML = renderPicker({
      title: details.item?.title || 'Chapters', status: details.item?.title || '', rows: rows(), jobs: jobsMap(), selected: pick.selected, dir: pick.dir,
      jumpOpen: pick.jumpOpen, hasMore: details.hasMore, queueCount: queueCount(), quality: quality(), loading: details.loading
    });
    const next = dialog.querySelector('#dlList');
    if (next && top) next.scrollTop = top;
    if (pick.jumpOpen) dialog.querySelector('#dlJump')?.focus();
  }

  function updateFooter() {
    const list = rows();
    const counts = footerCounts({ selected: pick.selected, rows: list, quality: quality() });
    dialog.querySelector('#dlCount').textContent = counts.text;
    dialog.querySelector('#dlNote').textContent = counts.note;
    dialog.querySelector('#dlGo').disabled = counts.count === 0;
    const all = dialog.querySelector('.dl-all');
    const selectable = list.filter(row => isSelectable(row.externalId, jobsMap()));
    const allPicked = selectable.length > 0 && selectable.every(row => pick.selected.has(row.externalId));
    all.lastChild.textContent = allPicked ? 'Select None' : 'Select All';
  }

  function openPicker() {
    if (pick.open) return;
    pick.open = true;
    pick.selected = new Set();
    pick.jumpOpen = false;
    pick.dir = getSettings()?.chapterSortDir === 'asc' ? 'asc' : 'desc';
    window.history.pushState({ tmlDownload: true }, '');
    pick.history = true;
    draw({ keepScroll: false });
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal(); else dialog.setAttribute('open', '');
    dialog.querySelector('#dlList')?.scrollTo?.(0, 0);
  }

  // Hides the picker. `popped` is true when the phone's Back already removed our history entry.
  function hide({ popped = false } = {}) {
    const hadEntry = pick.history;
    pick.open = false;
    pick.history = false;
    pick.selected = new Set();
    if (typeof dialog.close === 'function') { if (dialog.open) dialog.close(); } else dialog.removeAttribute('open');
    dialog.innerHTML = '';
    if (hadEntry && !popped) { pick.swallow = true; window.history.back(); } // remove the entry we pushed; the popstate it causes is ours
  }

  function closePicker() { if (pick.open) hide(); }

  // Returns true when the popstate belonged to the picker, so the title sheet behind it stays open.
  function handlePopState() {
    if (pick.open) { hide({ popped: true }); return true; }
    if (pick.swallow) { pick.swallow = false; return true; }
    return false;
  }

  async function startDownload() {
    const chosen = rows().filter(row => pick.selected.has(row.externalId) && isSelectable(row.externalId, jobsMap()));
    if (!chosen.length) return;
    hide();
    await enqueueChapters(chosen);
  }

  async function enqueueChapters(chapters) {
    const { item } = getDetails();
    try { navigator.storage?.persist?.(); } catch { /* best effort: asks the phone not to clear saved chapters */ }
    const result = await downloads.enqueue(chapters, { contentItemId: item?.id || null, title: item?.title || 'Untitled', coverUrl: item?.coverUrl || '' });
    const settings = getSettings() || {};
    const connection = getConnection() || {};
    const note = connection.online === false ? ' Waiting for a connection.' : settings.downloadWifiOnly !== false && connection.metered ? ' Waiting for Wi-Fi.' : '';
    toast(result.added ? `${result.added} chapter${result.added === 1 ? '' : 's'} added to the download queue.${note}` : 'Those chapters are already in the queue.');
    redrawDetails();
    return result;
  }

  function jump(value) {
    const id = jumpTarget(rows(), value);
    if (!id) { toast('No chapter with that number.'); return; }
    const row = [...dialog.querySelectorAll('.dl-row')].find(node => node.dataset.chapterId === id);
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
    row.classList.add('is-flash');
    window.setTimeout(() => row.classList.remove('is-flash'), 1400);
  }

  // ---- actions --------------------------------------------------------------------------------------------------
  async function handleAction(action, target) {
    switch (action) {
      case 'download-open': openPicker(); return true;
      case 'download-close': closePicker(); return true;
      case 'download-open-queue': closePicker(); window.setTimeout(goToDownloads, 40); return true;
      case 'download-toggle': {
        const id = target.dataset.chapterId;
        if (!isSelectable(id, jobsMap())) {
          if (downloads.statusOf(id) === 'done') toast('Already downloaded.');
          return true;
        }
        pick.selected = toggleSelection(pick.selected, id);
        const picked = pick.selected.has(id);
        target.classList.toggle('is-picked', picked);
        target.setAttribute('aria-checked', String(picked));
        updateFooter();
        return true;
      }
      case 'download-all': pick.selected = toggleAll(pick.selected, rows(), jobsMap()); draw(); return true;
      case 'download-sort': pick.dir = pick.dir === 'asc' ? 'desc' : 'asc'; draw({ keepScroll: false }); return true;
      case 'download-jump-toggle': pick.jumpOpen = !pick.jumpOpen; draw(); return true;
      case 'download-load-rest': await loadRestChapters(); draw(); return true;
      case 'download-start': await startDownload(); return true;
      case 'download-chapter': {
        const chapter = getDetails().chapters.find(row => row.externalId === target.dataset.chapterId);
        if (chapter) await enqueueChapters([chapter]);
        return true;
      }
      case 'download-chapter-delete': await downloads.remove(target.dataset.chapterId); toast('Download deleted.'); redrawDetails(); return true;
      // Downloads screen
      case 'download-read': readDownloaded(target.dataset.chapterId); return true;
      case 'download-delete': await downloads.remove(target.dataset.chapterId); toast('Download deleted.'); refreshScreen(true); return true;
      case 'download-cancel': await downloads.remove(target.dataset.chapterId); refreshScreen(true); return true;
      case 'download-delete-title': {
        const ids = groupKeyToIds(target.dataset.key);
        if (ids.length && window.confirm(`Delete ${ids.length} downloaded chapter${ids.length === 1 ? '' : 's'} of this title from this phone?`)) { await downloads.removeMany(ids); toast('Downloads deleted.'); refreshScreen(true); }
        return true;
      }
      case 'download-delete-all':
        if (window.confirm('Delete every downloaded chapter from this phone? Your library and reading progress are kept.')) { await downloads.removeAll(); toast('All downloads deleted.'); refreshScreen(true); }
        return true;
      case 'download-manage-toggle': manageOpen = !manageOpen; refreshScreen(true); return true;
      case 'download-pause': downloads.pause(); return true;
      case 'download-resume': downloads.resume(); return true;
      case 'download-retry': await downloads.retry(target.dataset.chapterId); return true;
      case 'download-retry-all': await downloads.retryFailed(); return true;
      default: return false;
    }
  }

  function handleSubmit(form) {
    if (form.dataset.form !== 'download-jump') return false;
    jump(new FormData(form).get('chapter'));
    return true;
  }

  // ---- Downloads screen -----------------------------------------------------------------------------------------
  function screenMarkup() {
    return renderDownloadsBody({ snapshot: downloads.snapshot(), limitBytes: storageLimitBytes(getSettings()?.downloadStorageLimitMb), openGroups, online: getConnection()?.online !== false, readInfo, manageOpen });
  }

  function refreshScreen(now = false) {
    const body = document.getElementById('downloadsBody');
    if (!body) return;
    const wait = now ? 0 : Math.max(0, 700 - (Date.now() - lastScreenRender));
    window.clearTimeout(screenTimer);
    screenTimer = window.setTimeout(() => {
      const host = document.getElementById('downloadsBody');
      if (!host) return;
      lastScreenRender = Date.now();
      host.innerHTML = screenMarkup();
    }, wait);
  }

  // "Read to Ch. N" under each title comes from Recent.
  async function refreshReadInfo() {
    try { readInfo = await loadReadInfo(); } catch { readInfo = new Map(); }
    refreshScreen(true);
  }

  document.addEventListener('toggle', event => {
    const group = event.target?.closest?.('details.dl-group');
    if (!group) return;
    if (group.open) openGroups.add(group.dataset.group); else openGroups.delete(group.dataset.group);
  }, true);

  downloads.subscribe(() => { refreshScreen(); if (pick.open) dialog.querySelector('.dl-queue-btn') && updateQueueBadge(); });

  function updateQueueBadge() {
    const button = dialog.querySelector('.dl-queue-btn');
    if (!button) return;
    const count = queueCount();
    button.querySelector('.dl-badge')?.remove();
    if (count) button.insertAdjacentHTML('beforeend', `<span class="dl-badge">${count > 99 ? '99+' : count}</span>`);
  }

  return { refreshReadInfo, openPicker, closePicker, handleAction, handleSubmit, handlePopState, isOpen: () => pick.open, screenMarkup, refreshScreen, usageText: () => { const { usage } = downloads.snapshot(); return usage.chapters ? `${usage.chapters} chapter${usage.chapters === 1 ? '' : 's'}` : 'Nothing saved'; } };
}
