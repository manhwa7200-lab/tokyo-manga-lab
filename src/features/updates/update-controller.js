import { createUpdateChecker } from './update-checker.js';
import { alertText, autoDownloadPlan, followedTitles, groupUpdates, statusText } from './update-plan.js';

const STARTUP_DELAY_MS = 6000;
const TICK_MS = 5 * 60 * 1000; // while the app is open: look at the clock this often (a check only runs when one is due)

// Glue between the update checker and the rest of the app. Everything it touches is passed in.
//   getLibrary()   library rows ({ personalStatus, item })
//   getSettings()  current settings
//   source         the MangaDex adapter (latestChapterIds, recentChapters)
//   store          update-repository functions
//   downloads      the download manager (enqueue), or null
//   native         the optional Android plugin (TmlUpdates), or null
//   prepare()      awaited before a run (the app refreshes its library list here)
//   toast(text), onChange(), apiBase(), adult()
export function createUpdateController({ getLibrary, getSettings, source, store, downloads, native = null, prepare = async () => {}, toast = () => {}, onChange = () => {}, apiBase = () => '', adult = () => false, now = () => Date.now() }) {
  const watched = () => followedTitles(getLibrary(), getSettings()?.updatesScope);

  async function handleFound(added, { announce = true } = {}) {
    if (!added.length) return;
    const settings = getSettings() || {};
    let queued = 0;
    if (settings.autoDownloadEnabled && downloads) {
      for (const group of autoDownloadPlan(added, settings.autoDownloadMax)) {
        try {
          const result = await downloads.enqueue(group.chapters, { contentItemId: group.contentItemId, title: group.title, coverUrl: group.coverUrl });
          queued += result.added;
        } catch (error) { console.warn('Auto-download could not queue chapters:', error); }
      }
    }
    if (announce) {
      const groups = groupUpdates(added);
      const lead = groups.length === 1 ? `${groups[0].title}: ${groups[0].label}` : `${added.length} new chapters in ${groups.length} titles`;
      toast(queued ? `${lead}. Downloading ${queued}.` : lead);
    }
    onChange();
  }

  const checker = createUpdateChecker({
    getFollowed: async () => watched(),
    getSettings,
    fetchLatestIds: ids => source.latestChapterIds(ids),
    fetchChapters: externalId => source.recentChapters(externalId, { language: getSettings()?.preferredLanguage || 'en' }),
    store,
    onFound: added => handleFound(added),
    now
  });
  checker.subscribe(() => onChange({ status: true }));

  // Chapters the Android add-on found while the app was closed. They join the same list.
  async function mergeNative() {
    if (!native?.pending) return 0;
    try {
      const { items = [], watch = [] } = await native.pending();
      const rows = items.filter(row => row?.id && row?.contentItemId).map(row => ({ ...row, foundAt: row.foundAt || new Date(now()).toISOString(), read: false }));
      for (const state of watch) if (state?.id) await store.putWatch({ checkedAt: new Date(now()).toISOString(), seenIds: [], ...state });
      const added = await store.addUpdates(rows);
      if ((items.length || watch.length) && native.ack) await native.ack({ ids: items.map(row => row.id), watchIds: watch.map(state => state.id) });
      await handleFound(added, { announce: false });
      return added.length;
    } catch (error) { console.warn('Could not read the phone checker:', error); return 0; }
  }

  // Hands the watch list and the schedule to the Android add-on. A no-op in the web app.
  async function syncNative() {
    if (!native?.configure) return;
    const settings = getSettings() || {};
    try {
      const watchRows = new Map((await store.listWatch()).map(row => [row.id, row]));
      const titles = watched().map(title => ({ ...title, ...(watchRows.get(title.contentItemId) ? { latestChapterId: watchRows.get(title.contentItemId).latestChapterId, since: watchRows.get(title.contentItemId).since, seenIds: watchRows.get(title.contentItemId).seenIds || [] } : {}) }))
        .filter(title => title.since); // titles without a starting point yet are added after the first in-app check
      await native.configure({
        enabled: settings.updatesEnabled !== false && settings.updatesPhoneAlerts !== false, intervalMinutes: Number(settings.updatesInterval) || 60,
        apiBase: apiBase(), adult: Boolean(adult()), language: settings.preferredLanguage || 'en', titles
      });
    } catch (error) { console.warn('Could not hand the watch list to the phone checker:', error); }
  }

  async function run({ force = false } = {}) {
    await prepare();
    await mergeNative();
    const result = await checker.run({ force });
    if (!result.skipped) await syncNative();
    return result;
  }

  let timer = null;
  let started = false;
  function start() {
    if (started) return;
    started = true;
    setTimeout(() => { run().catch(() => {}); }, STARTUP_DELAY_MS);
    timer = setInterval(() => { run().catch(() => {}); }, TICK_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run().catch(() => {}); });
  }

  return {
    start, run, syncNative, mergeNative,
    snapshot: () => checker.snapshot(),
    subscribe: listener => checker.subscribe(listener),
    refresh: () => checker.refresh(),
    async inbox() { return groupUpdates(await store.listUpdates()); },
    async unreadCount() { return (await store.listUpdates()).filter(row => !row.read).length; },
    async statusLine() { const meta = await store.getMeta(); return statusText({ ...meta, ...checker.snapshot(), lastRunAt: checker.snapshot().lastRunAt || meta.lastRunAt }, watched().length, now()); },
    async markTitleRead(contentItemId) { const rows = (await store.listUpdates()).filter(row => row.contentItemId === contentItemId).map(row => row.id); await store.markUpdatesRead(rows); onChange(); },
    async dismissTitle(contentItemId) { const rows = (await store.listUpdates()).filter(row => row.contentItemId === contentItemId).map(row => row.id); await store.removeUpdates(rows); onChange(); },
    async clearAll() { await store.clearUpdates(); onChange(); },
    watchedCount: () => watched().length,
    alertText: async () => alertText(await (async () => groupUpdates((await store.listUpdates()).filter(row => !row.read)))())
  };
}
