// Bakes everything image-based. Run after build-data.mjs:
//   assets/layers/early-NN.webp   baby layer for days 1-20
//   assets/days/day-NNN.webp      one composed image for each of the 266 days
//   assets/icons/*                home-screen icons
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { openPage, svgToWebp } from './lib-browser.mjs';
import { earlySvg } from './early-stages.mjs';
import { TOTAL_DAYS, EARLY_LAST_DAY, dayLayers, dayImage, wombScale, babyScale, stageForDay } from '../js/growth.js';

const root = fileURLToPath(new URL('../', import.meta.url));
if (!existsSync(root + 'assets/layers/stage-0-womb.webp')) execFileSync('node', [fileURLToPath(new URL('./bake-layers.mjs', import.meta.url))], { stdio: 'inherit' });
['assets/days', 'assets/icons'].forEach((d) => mkdirSync(root + d, { recursive: true }));
const { browser, page } = await openPage();

const b64 = (p) => readFileSync(root + p).toString('base64');
for (let d = 1; d <= EARLY_LAST_DAY; d++) {
  const name = `assets/layers/early-${String(d).padStart(2, '0')}.webp`;
  writeFileSync(root + name, Buffer.from(await svgToWebp(page, earlySvg(d, 512), 512, 0.9), 'base64'));
}

// Loads each layer once in the page, then composes a canvas per day.
await page.evaluate(() => { window.__img = {}; });
async function ensure(path) {
  await page.evaluate(async (path, data) => {
    if (window.__img[path]) return;
    const i = new Image(); i.src = 'data:image/webp;base64,' + data; await i.decode(); window.__img[path] = i;
  }, path, b64(path));
}
const compose = (womb, baby, ws, bs, root_, px, type, q, bg) => page.evaluate((womb, baby, ws, bs, root_, px, type, q, bg) => {
  const c = document.createElement('canvas'); c.width = c.height = px;
  const x = c.getContext('2d');
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, px, px); }
  x.imageSmoothingQuality = 'high';
  const side = px * ws, o = (px - side) / 2;
  x.drawImage(window.__img[womb], o, o, side, side);
  const bw = side * bs, bx = o + side * root_[0] * (1 - bs), by = o + side * root_[1] * (1 - bs);
  x.drawImage(window.__img[baby], bx, by, bw, bw);
  return c.toDataURL(type, q).split(',')[1];
}, womb, baby, ws, bs, root_, px, type, q, bg);

let total = 0;
for (let day = 1; day <= TOTAL_DAYS; day++) {
  const l = dayLayers(day);
  await ensure(l.womb); await ensure(l.baby);
  const buf = Buffer.from(await compose(l.womb, l.baby, wombScale(day), babyScale(day), l.root, 480, 'image/webp', 0.86, null), 'base64');
  writeFileSync(root + dayImage(day), buf); total += buf.length;
}
console.log('days baked:', TOTAL_DAYS, (total / 1048576).toFixed(1) + ' MB');

// Icons: the week-20 baby on the brand colour. Maskable has extra safe-zone padding.
const ICON = 150;
const l = dayLayers(ICON);
await ensure(l.womb); await ensure(l.baby);
async function icon(name, px, scale, bg) {
  const data = await page.evaluate((womb, baby, px, scale, bg) => {
    const c = document.createElement('canvas'); c.width = c.height = px;
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
    x.fillStyle = bg; x.fillRect(0, 0, px, px);
    const s = px * scale, o = (px - s) / 2;
    x.drawImage(window.__img[womb], o, o, s, s); x.drawImage(window.__img[baby], o, o, s, s);
    return c.toDataURL('image/png').split(',')[1];
  }, l.womb, l.baby, px, scale, bg);
  writeFileSync(root + 'assets/icons/' + name, Buffer.from(data, 'base64'));
}
const BG = '#FBF5EC';
await icon('icon-192.png', 192, .92, BG);
await icon('icon-512.png', 512, .92, BG);
await icon('icon-maskable-512.png', 512, .66, BG);
await icon('apple-touch-icon.png', 180, .86, BG);
await icon('favicon-48.png', 48, .96, BG);
await browser.close();
console.log('stage check', [1, 20, 21, 55, 56, 266].map((d) => d + ':' + stageForDay(d)).join(' '));
