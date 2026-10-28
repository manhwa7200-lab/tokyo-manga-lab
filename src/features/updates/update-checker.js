import { BATCH_SIZE, FALLBACK_TITLES_PER_RUN, checkDue, chunk, newChapters, pickTitles, updateRow } from './update-plan.js';

const MIN_ATTEMPT_GAP_MS = 60 * 1000; // opening the app twice in a row does not check twice
const MAX_SEEN = 40;

// Looks for new chapters of the titles you follow.
//
//  1. One request asks the Worker for the newest chapter id of up to 50 titles at once.
//  2. A title whose newest chapter id changed gets its chapter list fetched; chapters published after the title's `since`
//     time and not seen before are new.
//  3. A title seen for the first time only records a starting point (nothing already out is reported as new).
//
// If the Worker has no batch route (an older deployment), each title's chapter list is read instead, a few per run.
// Everything outside (network, storage, notifications) is passed in, so this file is easy to test.
export function createUpdateChecker({ getFollowed, getSettings, fetchLatestIds, fetchChapters, store, onFound, now = () => Date.now(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), gapMs = 1100 }) {
  const listeners = new Set();
  let running = null;
  let lastAttempt = 0;
  let current = { running: false, lastRunAt: null, lastError: '', lastFound: 0, watched: 0 };

  const emit = () => { for (const listener of listeners) { try { listener(current); } catch { /* a bad listener must not stop a check */ } } };
  const iso = () => new Date(now()).toISOString();

  async function loadMeta() {
    const meta = await store.getMeta();
    current = { ...current, lastRunAt: meta.lastRunAt || null, lastError: meta.lastError || '', lastFound: meta.lastFound || 0, watched: meta.watched || 0 };
    return meta;
  }

  async function lookAt(title, watch, latestId, found, rate) {
    try {
      const chapters = await fetchChapters(title.externalId);
      const seen = new Set(watch?.seenIds || []);
      const fresh = watch ? newChapters(chapters, watch, seen) : [];
      const newestId = latestId || [...chapters].sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))[0]?.externalId || null;
      const at = iso();
      found.push(...fresh.map(chapter => updateRow(title, chapter, at)));
      await store.putWatch({
        id: title.contentItemId, externalId: title.externalId, latestChapterId: newestId, since: at, checkedAt: at,
        seenIds: [...fresh.map(chapter => chapter.externalId), ...seen].slice(0, MAX_SEEN)
      });
      return true;
    } catch (error) {
      if (error?.code === 'RATE_LIMITED' || error?.status === 429) rate.limited = true;
      rate.failures += 1;
      rate.lastMessage = error?.message || 'A title could not be checked.';
      return false;
    }
  }

  async function doRun({ force }) {
    const settings = getSettings() || {};
    const meta = await loadMeta();
    if (!force && settings.updatesEnabled === false) return { skipped: 'off' };
    if (!force && !checkDue(meta.lastRunAt, settings, now())) return { skipped: 'not-due' };
    if (!force && now() - lastAttempt < MIN_ATTEMPT_GAP_MS) return { skipped: 'too-soon' };
    lastAttempt = now();
    current = { ...current, running: true };
    emit();
    const found = [];
    const rate = { limited: false, failures: 0, lastMessage: '' };
    let checked = 0;
    let fatal = '';
    try {
      const titles = (await getFollowed()) || [];
      const watchRows = await store.listWatch();
      const watchById = new Map(watchRows.map(row => [row.id, row]));
      const followedIds = new Set(titles.map(title => title.contentItemId));
      for (const row of watchRows) if (!followedIds.has(row.id)) await store.removeWatch(row.id);
      const picks = pickTitles(titles, watchById);
      let batchWorks = true;
      const candidates = [];
      for (const group of chunk(picks, BATCH_SIZE)) {
        let latest = null;
        try { latest = await fetchLatestIds(group.map(title => title.externalId)); }
        catch (error) { fatal = error?.message || 'The catalogue could not be reached.'; break; }
        if (latest === null) { batchWorks = false; break; }
        for (const title of group) {
          if (!latest.has(title.externalId)) continue; // not returned: the title is not available here
          const latestId = latest.get(title.externalId);
          const watch = watchById.get(title.contentItemId);
          checked += 1;
          if (!watch) {
            await store.putWatch({ id: title.contentItemId, externalId: title.externalId, latestChapterId: latestId, since: iso(), checkedAt: iso(), seenIds: [] });
          } else if (latestId && latestId !== watch.latestChapterId) {
            candidates.push({ title, watch, latestId });
          } else {
            await store.putWatch({ ...watch, checkedAt: iso() });
          }
        }
      }
      if (!fatal && batchWorks) {
        for (const { title, watch, latestId } of candidates) {
          if (rate.limited) break;
          await sleep(gapMs);
          await lookAt(title, watch, latestId, found, rate);
        }
      } else if (!fatal) {
        // No batch route: read a few chapter lists per run, oldest-checked first.
        for (const title of picks.slice(0, FALLBACK_TITLES_PER_RUN)) {
          if (rate.limited) break;
          if (checked) await sleep(gapMs);
          const ok = await lookAt(title, watchById.get(title.contentItemId), null, found, rate);
          if (ok) checked += 1;
        }
      }
      const added = await store.addUpdates(found);
      const error = fatal || (rate.limited ? 'MangaDex is rate-limiting requests. The rest will be checked next time.' : (rate.failures && !checked ? rate.lastMessage : ''));
      const record = { ...meta, lastRunAt: fatal ? meta.lastRunAt : iso(), lastError: error, lastFound: added.length, watched: titles.length };
      await store.putMeta(record);
      current = { ...current, running: false, lastRunAt: record.lastRunAt || null, lastError: error, lastFound: added.length, watched: titles.length };
      emit();
      if (added.length && onFound) { try { await onFound(added); } catch (hookError) { console.warn('Update hook failed:', hookError); } }
      return { checked, found: added.length, added, error };
    } catch (error) {
      current = { ...current, running: false, lastError: error?.message || 'The check failed.' };
      emit();
      return { checked, found: 0, added: [], error: current.lastError };
    }
  }

  return {
    run({ force = false } = {}) {
      if (running) return running;
      running = doRun({ force }).finally(() => { running = null; current = { ...current, running: false }; emit(); });
      return running;
    },
    async refresh() { await loadMeta(); emit(); return current; },
    snapshot: () => current,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}
