// Copies the static web app into ./www so Capacitor can bundle it into the APK.
// Only files the app actually needs are copied (no tests, docs, worker or CI files).
import { cp, rm, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'www');
const entries = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'src', 'assets'];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const entry of entries) {
  const from = path.join(root, entry);
  try { await access(from); } catch { throw new Error(`Missing required web file: ${entry}`); }
  await cp(from, path.join(out, entry), { recursive: true });
}
console.log(`www/ ready (${entries.join(', ')})`);
