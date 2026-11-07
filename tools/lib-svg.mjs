// Splits tools/source-stages.svg into per-stage womb and baby layers.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The SVG's top-level groups are not chronological: the youngest row comes last.
export const STAGE_GROUP_ORDER = [6, 7, 8, 0, 1, 2, 3, 4, 5];

export function loadStages() {
  const src = readFileSync(fileURLToPath(new URL('./source-stages.svg', import.meta.url)), 'utf8');
  const objects = src.slice(src.indexOf('<g id="OBJECTS"'));
  const pathRe = /<path\s+style="fill:(#[0-9A-Fa-f]{6});"\s+d="([^"]+)"\s*\/>/g;
  // Depth-tracking split of the 9 direct child groups of OBJECTS.
  const tagRe = /<(\/?)g\b[^>]*>/g;
  const groups = []; let depth = 0, start = -1, m;
  while ((m = tagRe.exec(objects))) {
    if (m[1]) { depth--; if (depth === 1) groups.push(objects.slice(start, m.index)); if (depth === 0) break; }
    else { depth++; if (depth === 2) start = m.index; }
  }
  if (groups.length !== 9) throw new Error('expected 9 stage groups, got ' + groups.length);
  return STAGE_GROUP_ORDER.map((g) => {
    const paths = [...groups[g].matchAll(pathRe)].map((x) => ({ fill: x[1].toUpperCase(), d: x[2].replace(/\s+/g, ' ') }));
    const sac = paths.findIndex((p) => p.fill === '#AF3F4B');
    // Placenta: the first placenta-coloured path after the sac. Later ones are the cord.
    const pl = paths.findIndex((p, i) => i > sac && p.fill === '#FF9B8B');
    if (sac < 0 || pl < 0) throw new Error('unexpected layer order in group ' + g);
    return { group: g, shell: paths.slice(0, sac + 1), placenta: paths[pl], baby: paths.filter((_, i) => i > sac && i !== pl) };
  });
}
export const toMarkup = (paths) => paths.map((p) => `<path fill="${p.fill}" d="${p.d}"/>`).join('');
