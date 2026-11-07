// Single source of truth for "what does day N look like".
// Shared by the live Three.js scene (js/scene.js) and the image baker (tools/bake-images.mjs),
// so a baked day image and the 3D view of that day always match.
//
// Day numbering: Day N = N days after conception. Day 266 = due date.
// Gestational age (counted from last period, the way doctors count) = N + 14 days.

export const TOTAL_DAYS = 266;
export const gaFromDay = (day) => day + 14;
export const dayFromGa = (ga) => ga - 14;

// rig points are fractions of the stage image: x right, y DOWN.
// root = where the cord meets the placenta (stays still); the rest drive the motion.
export const STAGES = [
  { id: 0, first: 21,  last: 55,  size: 77.0,  root: [.21, .57], head: [.40, .37], neck: [.44, .47], chest: [.50, .52], foot: [.40, .73], hand: [.50, .55] },
  { id: 1, first: 56,  last: 83,  size: 95.5,  root: [.20, .58], head: [.42, .30], neck: [.40, .45], chest: [.53, .50], foot: [.50, .76], hand: [.39, .57] },
  { id: 2, first: 84,  last: 111, size: 116.1, root: [.26, .53], head: [.53, .32], neck: [.49, .45], chest: [.59, .52], foot: [.50, .71], hand: [.42, .57] },
  { id: 3, first: 112, last: 139, size: 127.3, root: [.24, .53], head: [.51, .29], neck: [.49, .46], chest: [.57, .53], foot: [.45, .72], hand: [.42, .53] },
  { id: 4, first: 140, last: 167, size: 139.4, root: [.25, .53], head: [.52, .35], neck: [.53, .50], chest: [.60, .55], foot: [.51, .73], hand: [.58, .44] },
  { id: 5, first: 168, last: 188, size: 147.2, root: [.23, .53], head: [.45, .29], neck: [.45, .43], chest: [.52, .53], foot: [.42, .72], hand: [.58, .48] },
  { id: 6, first: 189, last: 209, size: 158.1, root: [.24, .53], head: [.45, .29], neck: [.45, .45], chest: [.50, .54], foot: [.69, .67], hand: [.68, .46] },
  { id: 7, first: 210, last: 237, size: 163.5, root: [.25, .54], head: [.44, .32], neck: [.45, .47], chest: [.51, .57], foot: [.53, .73], hand: [.44, .57] },
  // Head-down from week 36.
  { id: 8, first: 238, last: 266, size: 171.8, root: [.65, .33], head: [.55, .60], neck: [.48, .45], chest: [.45, .42], foot: [.27, .35], hand: [.42, .40] },
];
export const EARLY_LAST_DAY = 20;
export const PLACENTA_FROM_DAY = 10;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

export const stageForDay = (day) => (day <= EARLY_LAST_DAY ? -1 : STAGES.find((s) => day <= s.last).id);

// Womb size on screen (fraction of the canvas), continuous across stage changes.
const MIN_S = 0.56;
const sizeToScale = (n) => MIN_S + (1 - MIN_S) * (n - STAGES[0].size) / (STAGES[8].size - STAGES[0].size);
const ANCHORS = STAGES.map((s) => [(s.first + s.last) / 2, sizeToScale(s.size)]);

export function wombScale(day) {
  if (day <= ANCHORS[0][0]) return lerp(0.5, ANCHORS[0][1], clamp((day - 1) / (ANCHORS[0][0] - 1), 0, 1));
  if (day >= ANCHORS[8][0]) return lerp(ANCHORS[8][1], 1.02, clamp((day - ANCHORS[8][0]) / (266 - ANCHORS[8][0]), 0, 1));
  const i = ANCHORS.findIndex((a, k) => day >= a[0] && day <= ANCHORS[k + 1][0]);
  return lerp(ANCHORS[i][1], ANCHORS[i + 1][1], (day - ANCHORS[i][0]) / (ANCHORS[i + 1][0] - ANCHORS[i][0]));
}

// Baby size relative to its drawing, scaled around the cord root so the cord stays attached.
export function babyScale(day) {
  const id = stageForDay(day);
  if (id < 0) return 1;
  const s = STAGES[id];
  const t = (day - s.first) / (s.last - s.first);
  return id === 0 ? lerp(0.4, 1, smooth(t)) : lerp(0.94, 1.04, t);
}

export const pad3 = (n) => String(n).padStart(3, '0');
export const pad2 = (n) => String(n).padStart(2, '0');

export function dayLayers(day) {
  const id = stageForDay(day);
  if (id < 0) {
    return {
      stage: -1,
      womb: day >= PLACENTA_FROM_DAY ? 'assets/layers/stage-0-womb.webp' : 'assets/layers/early-womb.webp',
      baby: `assets/layers/early-${pad2(day)}.webp`,
      root: [.5, .5], rig: null,
    };
  }
  const s = STAGES[id];
  return { stage: id, womb: `assets/layers/stage-${id}-womb.webp`, baby: `assets/layers/stage-${id}-baby.webp`, root: s.root, rig: s };
}
export const dayImage = (day) => `assets/days/day-${pad3(day)}.webp`;

// Where the conceptus sits (image fractions, y down) during days 1-20.
const EARLY_START = [.64, .30], EARLY_WALL = [.29, .50];
export function earlyCenter(day) {
  if (day >= 15) return [.34, .52];
  if (day >= 7) return [.31, .50];
  const t = (day - 1) / 6;
  return [lerp(EARLY_START[0], EARLY_WALL[0], t), lerp(EARLY_START[1], EARLY_WALL[1], t)];
}
