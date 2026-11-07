// Packages only the public website into _site/ and checks every referenced file exists.
// Needs no npm packages, so the GitHub Actions workflow can run it directly.
// Paths are compared exactly: GitHub Pages is case-sensitive, Windows is not.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = join(root, '_site');
const INCLUDE = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'data', 'vendor', 'assets'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const item of INCLUDE) {
  if (!existsSync(join(root, item))) throw new Error('missing ' + item);
  cpSync(join(root, item), join(out, item), { recursive: true });
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [relative(out, p).replaceAll('\\', '/')];
  });
}
const files = new Set(walk(out));
const missing = [];
const need = (path, from) => { if (!files.has(path)) missing.push(`${path} (used by ${from})`); };

// Service worker precache list: a single missing file would stop offline mode installing.
const sandbox = { self: { addEventListener() {} }, location: {}, caches: {} };
vm.runInNewContext(readFileSync(join(out, 'sw.js'), 'utf8') + ';globalThis.__list = PRECACHE;', sandbox);
for (const p of sandbox.__list) if (p !== './') need(p, 'sw.js');
// A script missing from the list would break the installed app offline.
for (const f of files) if (f.startsWith('js/') && !sandbox.__list.includes(f)) missing.push(`${f} is not in the sw.js precache list`);

// The JSON: an image and two layers for every day.
const data = JSON.parse(readFileSync(join(out, 'data/pregnancy.json'), 'utf8'));
if (data.days.length !== 266) throw new Error('expected 266 days, got ' + data.days.length);
for (const d of data.days) { need(d.image, 'pregnancy.json'); need(d.layers.womb, 'pregnancy.json'); need(d.layers.baby, 'pregnancy.json'); }

// Manifest icons, plus local src/href in the page. A leading "/" would break under /repo-name/.
const manifest = JSON.parse(readFileSync(join(out, 'manifest.webmanifest'), 'utf8'));
for (const i of manifest.icons) need(i.src, 'manifest');
const html = readFileSync(join(out, 'index.html'), 'utf8');
for (const [, ref] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (/^https?:/.test(ref)) continue;
  if (ref.startsWith('/')) missing.push(`${ref} is root-relative (index.html)`);
  else need(ref, 'index.html');
}
const css = readFileSync(join(out, 'css/styles.css'), 'utf8');
for (const [, ref] of css.matchAll(/url\(\.\.\/([^)]+)\)/g)) need(ref, 'styles.css');

if (missing.length) {
  console.error('Build failed, missing files:\n  ' + [...new Set(missing)].join('\n  '));
  process.exit(1);
}
const bytes = [...files].reduce((n, f) => n + statSync(join(out, f)).size, 0);
console.log(`_site ready: ${files.size} files, ${(bytes / 1048576).toFixed(1)} MB, all references found.`);
