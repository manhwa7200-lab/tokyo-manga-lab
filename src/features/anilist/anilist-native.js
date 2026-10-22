// Thin bridge to the Capacitor Android shell. In a normal browser these helpers fall back safely.
// The web app has no bundler, so plugins are reached through window.Capacitor.Plugins.
const cap = () => globalThis.Capacitor;

export const isNativeApp = () => Boolean(cap()?.isNativePlatform?.());

export async function openAuthPage(url) {
  const browser = cap()?.Plugins?.Browser;
  if (isNativeApp() && browser?.open) { await browser.open({ url }); return 'in-app'; }
  window.open(url, '_blank', 'noopener,noreferrer');
  return 'external';
}

export async function closeAuthPage() {
  try { await cap()?.Plugins?.Browser?.close?.(); } catch { /* the tab may already be closed */ }
}

// Calls handler(url) whenever Android opens the app through a tokyomangalab:// link, including a cold start.
export async function listenForAppLinks(handler) {
  const app = cap()?.Plugins?.App;
  if (!isNativeApp() || !app?.addListener) return false;
  await app.addListener('appUrlOpen', event => { if (event?.url) handler(event.url); });
  try { const launch = await app.getLaunchUrl?.(); if (launch?.url) handler(launch.url); } catch { /* no launch url */ }
  return true;
}
