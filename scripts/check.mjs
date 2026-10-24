// `npm run check`: syntax-check every JavaScript file and make sure the offline cache lists every app module.
// It walks the folders itself, so a new file can no longer be forgotten in a hand-written list.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = ['src', 'worker/src', 'scripts', 'tests'];
const extra = ['sw.js'];

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) return [];
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = [...roots.flatMap(dir => walk(path.join(root, dir))), ...extra.map(file => path.join(root, file))]
  .filter(file => /\.(m?js)$/.test(file))
  .sort();

const failures = [];
for (const file of files) {
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); }
  catch (error) { failures.push(`${path.relative(root, file)}\n${String(error.stderr || error.message).trim()}`); }
}

// Every module under src/ must be in the service worker's APP_SHELL, or the app breaks offline.
const sw = readFileSync(path.join(root, 'sw.js'), 'utf8');
const missing = walk(path.join(root, 'src')).filter(file => file.endsWith('.js'))
  .map(file => './' + path.relative(root, file).split(path.sep).join('/'))
  .filter(file => !sw.includes(`'${file}'`));
if (missing.length) failures.push(`sw.js APP_SHELL is missing: ${missing.join(', ')}`);

if (failures.length) {
  console.error(failures.join('\n\n'));
  process.exit(1);
}
console.log(`check ok: ${files.length} files parsed, offline cache lists every module`);
