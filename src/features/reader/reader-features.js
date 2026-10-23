// Helpers for the reader's options: auto read, neighbouring chapters, clock/battery, tips, and the bridges to
// Android (status bar, screen rotation, volume keys) and to the share sheet. Everything that needs the app's
// native layer degrades to a clear "unavailable" result in a plain browser instead of throwing.
const cap = () => (typeof window === 'undefined' ? undefined : window.Capacitor);
const plugin = name => cap()?.Plugins?.[name];
const inApp = () => Boolean(cap()?.isNativePlatform?.());

// ---- auto read ------------------------------------------------------------------------------
export const AUTO_SPEEDS = Object.freeze([
  { id: '1', label: 'Very slow', pxPerSecond: 24, secondsPerPage: 14 },
  { id: '2', label: 'Slow', pxPerSecond: 44, secondsPerPage: 9 },
  { id: '3', label: 'Medium', pxPerSecond: 72, secondsPerPage: 6 },
  { id: '4', label: 'Fast', pxPerSecond: 115, secondsPerPage: 4 },
  { id: '5', label: 'Very fast', pxPerSecond: 180, secondsPerPage: 2.5 }
]);

export function autoSpeed(id) {
  return AUTO_SPEEDS.find(speed => speed.id === String(id)) || AUTO_SPEEDS[2];
}

// ---- chapters -------------------------------------------------------------------------------
// The chapter list is newest first, so "next" is a lower index. An "extra" is a chapter without a chapter number
// (side stories, omakes, one-shots). Contexts saved by older versions have no `number` field and are never skipped.
export function isExtra(chapter) {
  return Boolean(chapter) && Object.hasOwn(chapter, 'number') && (chapter.number === null || chapter.number === '');
}

export function findNeighbor(chapters, position, direction, skipExtras = false) {
  if (!Array.isArray(chapters) || position < 0 || position >= chapters.length) return null;
  const step = direction === 'next' ? -1 : 1;
  for (let index = position + step; index >= 0 && index < chapters.length; index += step) {
    if (!skipExtras || !isExtra(chapters[index])) return chapters[index];
  }
  return null;
}

// ---- volume keys ----------------------------------------------------------------------------
// Volume down goes forward and volume up goes back, like most readers.
export function volumeAction(value) {
  const key = String(value || '').toLowerCase();
  if (key === 'down' || key === 'audiovolumedown') return 'next';
  if (key === 'up' || key === 'audiovolumeup') return 'prev';
  return null;
}

// The Android shell only intercepts the volume keys while the address contains "vol=1" (see scripts/android-customize.sh).
export function setVolumeCapture(enabled, chapterId) {
  try {
    const base = `#read/${chapterId}`;
    const next = enabled && inApp() ? `${base}?vol=1` : base;
    if (window.location.hash !== next) window.history.replaceState(window.history.state, '', next);
  } catch { /* the address is only a hint for the shell */ }
}

// ---- clock and battery ----------------------------------------------------------------------
export function formatClock(date = new Date()) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export async function getBatteryReader() {
  try {
    const battery = await navigator.getBattery?.();
    if (!battery) return null;
    return () => ({ percent: Math.round(Number(battery.level) * 100), charging: Boolean(battery.charging) });
  } catch { return null; }
}

export function formatStatusLine(now, battery) {
  const time = formatClock(now);
  if (!battery || !Number.isFinite(battery.percent)) return time;
  return `${time} · ${battery.percent}%${battery.charging ? ' ⚡' : ''}`;
}

// ---- operation tips (shown once, can be shown again from Settings) ---------------------------
const TIPS_KEY = 'tml-reader-tips-seen';
export function tipsSeen() {
  try { return localStorage.getItem(TIPS_KEY) === '1'; } catch { return false; }
}
export function markTipsSeen() {
  try { localStorage.setItem(TIPS_KEY, '1'); } catch { /* optional convenience */ }
}
export function resetTips() {
  try { localStorage.removeItem(TIPS_KEY); } catch { /* optional convenience */ }
}

// ---- Android bridges ------------------------------------------------------------------------
export async function setStatusBarVisible(visible) {
  const bar = plugin('StatusBar');
  if (!inApp() || !bar) return 'unavailable';
  try { await (visible ? bar.show() : bar.hide()); return 'ok'; } catch { return 'failed'; }
}

// mode: 'auto' | 'portrait' | 'landscape'
export async function setOrientation(mode) {
  const orientation = plugin('ScreenOrientation');
  if (!inApp() || !orientation) return 'unavailable';
  try {
    if (mode === 'portrait' || mode === 'landscape') await orientation.lock({ orientation: mode });
    else await orientation.unlock();
    return 'ok';
  } catch { return 'failed'; }
}

// Returns 'shared', 'copied' or 'failed'. Shares only the link to the chapter on MangaDex.
export async function shareLink({ title, url }) {
  if (!url) return 'failed';
  try {
    if (navigator.share) { await navigator.share({ title, url }); return 'shared'; }
  } catch (error) {
    if (error?.name === 'AbortError') return 'shared'; // the person closed the share sheet
  }
  try { await navigator.clipboard.writeText(url); return 'copied'; } catch { return 'failed'; }
}
