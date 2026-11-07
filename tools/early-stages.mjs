// Days 1-20 are earlier than the first drawing in the source SVG, so they are drawn here
// in the same palette: zygote, cleavage, morula, blastocyst, implantation, embryonic disc.
// Output is one SVG per day in the coordinates of the stage-0 image (0..1000 square).
import { earlyCenter } from '../js/growth.js';

const SKIN = '#FCC6A0', LINE = '#E9917A', NUC = '#9B470D', ZONA = '#FFD9C7';

const lerp = (a, b, t) => a + (b - a) * t;
// Seeded so re-baking gives identical images.
function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

function cell(x, y, r) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${SKIN}" stroke="${LINE}" stroke-width="${Math.max(3, r * .08)}"/>` +
    `<circle cx="${x - r * .28}" cy="${y - r * .3}" r="${r * .18}" fill="#fff" opacity=".55"/>`;
}
function ball(cx, cy, R, n, seed) {
  // Sunflower packing with a little jitter reads as a clump of cells.
  const rand = rng(seed); let out = '';
  const r = R * (n <= 8 ? .46 : n <= 16 ? .34 : .26);
  for (let i = 0; i < n; i++) {
    const t = i * 2.39996, d = (R - r) * Math.sqrt((i + .5) / n);
    out += cell(cx + Math.cos(t) * d + (rand() - .5) * 6, cy + Math.sin(t) * d + (rand() - .5) * 6, r);
  }
  return out;
}
const zona = (x, y, R) => `<circle cx="${x}" cy="${y}" r="${R}" fill="none" stroke="${ZONA}" stroke-width="10" opacity=".85"/>`;

// The conceptus drifts from the top of the womb down to the wall where the placenta forms.
function pos(day) { const [x, y] = earlyCenter(Math.min(day, 7)); return day < 7 ? [x * 1000, y * 1000] : [290, 500]; }

function blastocyst(x, y, R) {
  let out = `<circle cx="${x}" cy="${y}" r="${R}" fill="${ZONA}" stroke="${LINE}" stroke-width="7"/>`;
  out += `<circle cx="${x}" cy="${y}" r="${R * .78}" fill="#E8826F" opacity=".55"/>`;
  // Rim cells, then the inner cell mass that becomes the baby.
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; out += `<circle cx="${x + Math.cos(a) * R * .9}" cy="${y + Math.sin(a) * R * .9}" r="${R * .13}" fill="${SKIN}" stroke="${LINE}" stroke-width="3"/>`; }
  return out + ball(x - R * .42, y, R * .4, 9, 7);
}

export function earlySvgBody(day) {
  const [x, y] = pos(day);
  if (day === 1) return zona(x, y, 78) + cell(x, y, 66) +
    `<circle cx="${x - 20}" cy="${y + 6}" r="15" fill="${NUC}"/><circle cx="${x + 22}" cy="${y - 4}" r="13" fill="${NUC}"/>`;
  if (day === 2) return zona(x, y, 82) + cell(x - 32, y, 40) + cell(x + 32, y, 40);
  if (day === 3) return zona(x, y, 84) + ball(x, y, 72, 8, 3);
  if (day === 4) return zona(x, y, 84) + ball(x, y, 74, 24, 4);
  if (day === 5) return zona(x, y, 90) + blastocyst(x, y, 78);
  if (day === 6) return `<path d="M${x + 50},${y - 72} A90,90 0 1 0 ${x + 72},${y + 54}" fill="none" stroke="${ZONA}" stroke-width="9" opacity=".8"/>` + blastocyst(x, y, 82);
  if (day <= 9) {
    // Burrowing into the wall: partly sunk, wall tissue rising around it.
    const t = (day - 7) / 2, bx = lerp(310, 285, t), by = 500, R = lerp(80, 74, t);
    return blastocyst(bx, by, R) + `<path d="M${bx - R - 20},${by - R} q${R * .6},${R} 0,${R * 2} q-${R * .5},-${R} 0,-${R * 2}z" fill="#FF9B8B"/>`;
  }
  if (day <= 14) {
    // Embryonic disc over a small yolk sac, attached to the forming placenta.
    const t = (day - 10) / 4, s = lerp(46, 66, t), bx = 285 + s, by = 505;
    return `<circle cx="${bx + s * .3}" cy="${by + s * .75}" r="${s * .62}" fill="${ZONA}" stroke="${LINE}" stroke-width="5"/>` +
      `<circle cx="${bx + s * .1}" cy="${by - s * .78}" r="${s * .66}" fill="#E8826F" stroke="${LINE}" stroke-width="5"/>` +
      `<ellipse cx="${bx + s * .2}" cy="${by}" rx="${s * 1.05}" ry="${s * .34}" fill="${SKIN}" stroke="${LINE}" stroke-width="5"/>` +
      `<path d="M240,${by - 14} L${bx - s * .8},${by}" stroke="#FF9B8B" stroke-width="16" stroke-linecap="round"/>`;
  }
  // Days 15-20: elongating C-shaped embryo that hands over to the stage-0 drawing on day 21.
  const t = (day - 15) / 5, s = lerp(58, 92, t), bx = 300, by = 520;
  return `<path d="M232,${by + 22} Q${bx - 24},${by + 12} ${bx + s * .1},${by + s * .1}" fill="none" stroke="#FF9B8B" stroke-width="14" stroke-linecap="round"/>` +
    `<circle cx="${bx + s * .2}" cy="${by + s * .62}" r="${s * .3}" fill="${ZONA}" stroke="${LINE}" stroke-width="4"/>` +
    `<path d="M${bx},${by - s * .65} q${s * .95},${s * .1} ${s * .72},${s * .95} q-${s * .14},${s * .42} -${s * .5},${s * .5} q${s * .24},-${s * .26} ${s * .12},-${s * .54} q-${s * .1},-${s * .32} -${s * .44},-${s * .36} q-${s * .34},-${s * .14} -${s * .3},-${s * .36} q${s * .04},-${s * .16} ${s * .4},-${s * .19}z" fill="${SKIN}" stroke="${LINE}" stroke-width="4"/>`;
}
export const earlySvg = (day, px) => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 1000 1000">${earlySvgBody(day)}</svg>`;
