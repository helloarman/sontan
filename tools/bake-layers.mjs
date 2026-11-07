// Step 1 of image baking: stage layers (womb + baby) with a shared square crop.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadStages, toMarkup } from './lib-svg.mjs';
import { openPage, svgToWebp } from './lib-browser.mjs';

const out = fileURLToPath(new URL('../assets/layers/', import.meta.url));
mkdirSync(out, { recursive: true });
const { browser, page } = await openPage();
const stages = loadStages();
const meta = [];
for (let i = 0; i < stages.length; i++) {
  const s = stages[i];
  const bbox = await page.evaluate((m) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 500 500'); svg.style.cssText = 'position:absolute;width:500px;height:500px';
    svg.innerHTML = m; document.body.appendChild(svg);
    const b = svg.getBBox(); svg.remove();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }, toMarkup([...s.shell, s.placenta, ...s.baby]));
  const side = Math.max(bbox.w, bbox.h) * 1.04;
  const crop = { x: bbox.x + bbox.w / 2 - side / 2, y: bbox.y + bbox.h / 2 - side / 2, side };
  const wrap = (m, px) => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="${crop.x} ${crop.y} ${side} ${side}">${m}</svg>`;
  const write = async (name, m, px = 1024) => writeFileSync(out + name, Buffer.from(await svgToWebp(page, wrap(m, px), px, 0.92), 'base64'));
  await write(`stage-${i}-womb.webp`, toMarkup([...s.shell, s.placenta]));
  await write(`stage-${i}-baby.webp`, toMarkup(s.baby));
  if (i === 0) await write('early-womb.webp', toMarkup(s.shell));
  meta.push({ stage: i, nativeSize: +side.toFixed(2) });
  console.log('stage', i, 'group', s.group, 'side', side.toFixed(1));
}
writeFileSync(fileURLToPath(new URL('./stage-sizes.json', import.meta.url)), JSON.stringify(meta, null, 1));
await browser.close();
