// Tells the optional native Android plugin (native/android/kotlin) when downloads are running, so a progress
// notification keeps the app alive with the screen off. Without the plugin (the web app, or an APK built without it)
// this does nothing at all.
import { ACTIVE_STATES, jobLabel } from './download-plan.js';

// What the notification should say for a queue snapshot, or null when it should not be showing.
export function keepAliveState(snapshot) {
  if (!snapshot || snapshot.waiting) return null; // waiting for Wi-Fi, offline, paused or full: nothing is downloading
  const active = snapshot.jobs.filter(job => ACTIVE_STATES.includes(job.status));
  if (!active.length) return null;
  const current = active.find(job => job.status === 'downloading') || active[0];
  const others = active.length - 1;
  return {
    title: 'Downloading chapters',
    text: `${jobLabel(current)}${current.mangaTitle ? ` · ${current.mangaTitle}` : ''}${others > 0 ? ` · ${others} more waiting` : ''}`.slice(0, 120),
    done: Math.max(0, Number(current.donePages) || 0),
    total: Math.max(0, Number(current.pageCount) || 0)
  };
}

export function attachKeepAlive(downloads, plugin, { minGapMs = 2000, now = () => Date.now() } = {}) {
  if (!plugin?.start || !plugin?.stop) return () => {};
  let showing = false;
  let last = 0;
  let lastText = '';
  return downloads.subscribe(snapshot => {
    const next = keepAliveState(snapshot);
    if (!next) {
      if (showing) { showing = false; lastText = ''; Promise.resolve(plugin.stop()).catch(() => {}); }
      return;
    }
    const key = `${next.text}|${next.done}|${next.total}`;
    if (showing && (key === lastText || now() - last < minGapMs)) return;
    last = now();
    lastText = key;
    const call = showing ? plugin.update : plugin.start;
    showing = true;
    Promise.resolve(call.call(plugin, next)).catch(() => { showing = false; }); // the service could not start; downloads carry on in the app
  });
}
