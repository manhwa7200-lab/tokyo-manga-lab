// Saves a backup file. In a browser it downloads the file. In the Android app WebView, a download link does nothing,
// so the file is written to the app's cache folder and handed to the Android share sheet (Save to Drive, Files, email...).
const cap = () => (typeof window === 'undefined' ? undefined : window.Capacitor);
const plugin = name => cap()?.Plugins?.[name];
const inApp = () => Boolean(cap()?.isNativePlatform?.());

export function backupFileName(date = new Date()) {
  return `tokyo-manga-lab-backup-${date.toISOString().slice(0, 10)}.json`;
}

export function nativeShareAvailable() {
  return inApp() && Boolean(plugin('Filesystem')) && Boolean(plugin('Share'));
}

async function shareNative(fileName, text) {
  const Filesystem = plugin('Filesystem');
  const Share = plugin('Share');
  const written = await Filesystem.writeFile({ path: fileName, data: text, directory: 'CACHE', encoding: 'utf8' });
  await Share.share({ title: 'Tokyo Manga Lab backup', url: written.uri, dialogTitle: 'Save your backup' });
}

function downloadInBrowser(fileName, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// Returns 'shared' (Android share sheet opened), 'downloaded' (browser download started) or throws a readable error.
export async function saveBackupFile(backup, { fileName = backupFileName() } = {}) {
  const text = JSON.stringify(backup, null, 2);
  if (inApp()) {
    if (!nativeShareAvailable()) throw new Error('This build of the app cannot save files yet. Update the app and try again.');
    try { await shareNative(fileName, text); return 'shared'; }
    catch (error) {
      if (/cancel/i.test(String(error?.message || error))) return 'shared'; // the person closed the share sheet
      throw new Error('Could not open the share sheet to save the backup.');
    }
  }
  downloadInBrowser(fileName, text);
  return 'downloaded';
}
