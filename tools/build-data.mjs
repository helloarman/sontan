// Generates data/pregnancy.json: every day (1-266) with size, weight, stage, image and motion.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as C from './content.mjs';
import { RELATIONS, BY_WEEK, MOTHER, FATHER, FAMILY } from './baby-messages.mjs';
import { messagesForDay } from '../js/messages.js';
import { TOTAL_DAYS, gaFromDay, stageForDay, dayImage, dayLayers, wombScale, babyScale, STAGES } from '../js/growth.js';

// Monotone cubic (Fritsch-Carlson) interpolation: smooth, and never overshoots,
// so size can only grow from one day to the next.
function monotone(points) {
  const n = points.length, xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const d = xs.slice(0, -1).map((x, i) => (ys[i + 1] - ys[i]) / (xs[i + 1] - x));
  const m = [d[0]];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : 2 * d[i - 1] * d[i] / (d[i - 1] + d[i]);
  m[n - 1] = d[n - 2];
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = xs.findIndex((v, k) => x >= v && x <= xs[k + 1]);
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
const logCurve = (pts) => { const f = monotone(pts.map(([x, y]) => [x, Math.log(y)])); return (x) => Math.exp(f(x)); };

const crl = logCurve(C.LENGTH_CRL);
const chl = monotone(C.LENGTH_CHL);
const weight = logCurve(Object.entries(C.WEIGHT_WEEKS).map(([w, g]) => [w * 7, g]));

function motionAt(week) {
  const a = C.MOTION; const out = {};
  let i = a.findIndex((m, k) => week >= m.w && (k === a.length - 1 || week < a[k + 1].w));
  if (i < 0) i = 0;
  const p = a[i], q = a[Math.min(i + 1, a.length - 1)], t = q.w === p.w ? 0 : (week - p.w) / (q.w - p.w);
  for (const k of Object.keys(p)) if (k !== 'w') out[k] = +(p[k] + (q[k] - p[k]) * t).toFixed(4);
  return out;
}

const days = [];
for (let day = 1; day <= TOTAL_DAYS; day++) {
  const ga = gaFromDay(day), gaWeek = Math.floor(ga / 7), gaDay = ga % 7;
  const basis = ga < C.LENGTH_BASIS_SWITCH_GA ? 'crown-rump' : 'crown-heel';
  const len = basis === 'crown-rump' ? crl(ga) : chl(ga);
  const motion = motionAt(ga / 7);
  motion.bpm = Math.round(motion.bpm);
  const layers = dayLayers(day);
  days.push({
    day, gaDays: ga, gaWeek, gaDay,
    trimester: gaWeek < 14 ? 1 : gaWeek < 28 ? 2 : 3,
    month: Math.min(10, Math.max(1, Math.ceil((ga + 1) / 30.44))),
    stage: stageForDay(day),
    image: dayImage(day),
    layers: { womb: layers.womb, baby: layers.baby },
    scene: { womb: +wombScale(day).toFixed(4), baby: +babyScale(day).toFixed(4) },
    lengthCm: +len.toFixed(len < 1 ? 3 : 1),
    lengthBasis: basis,
    weightG: ga < 56 ? null : +weight(ga).toFixed(weight(ga) < 10 ? 1 : 0),
    motion,
    event: C.DAY_EVENTS[day] || null,
  });
}

const data = {
  meta: {
    app: 'সন্তান', version: 1, generatedBy: 'tools/build-data.mjs',
    dayDefinition: 'Day N = N days after conception. Day 266 = due date. gaDays (from last period) = day + 14.',
    disclaimer: C.DISCLAIMER, sources: C.SOURCES,
  },
  stages: STAGES.map(({ id, first, last, root, head, neck, chest, foot, hand }) => ({ id, firstDay: first, lastDay: last, firstGaWeek: Math.floor((first + 14) / 7), root, head, neck, chest, foot, hand })),
  trimesters: C.TRIMESTERS, weeks: C.WEEKS, reminders: C.REMINDERS, anc: C.ANC,
  relations: RELATIONS,
  babyMessages: { byWeek: BY_WEEK, mother: MOTHER, father: FATHER, family: FAMILY, note: C.MESSAGE_NOTE },
  dangerSigns: C.DANGER_SIGNS, food: C.FOOD, emergency: C.EMERGENCY,
  days,
};
const out = fileURLToPath(new URL('../data/pregnancy.json', import.meta.url));
writeFileSync(out, JSON.stringify(data));

// Sanity checks: fail the build rather than ship bad numbers.
for (let i = 1; i < days.length; i++) {
  const a = days[i - 1], b = days[i];
  if (b.lengthCm < a.lengthCm) throw new Error('length decreased at day ' + b.day);
  if (a.weightG != null && b.weightG < a.weightG) throw new Error('weight decreased at day ' + b.day);
}
for (let w = 2; w <= 40; w++) if (!C.WEEKS[w]) throw new Error('missing week ' + w);
if (days.length !== 266 || days[265].gaDays !== 280) throw new Error('day mapping wrong');
// Baby messages: each reader must get enough distinct messages, addressed to the right person.
const nfc = (s) => s.normalize('NFC');
// Whole words only: আমাকে and তোমাকে both contain মাকে.
const word = (w) => `(^|[\\s,।])(${w})($|[\\s,।?!])`;
const thirdPerson = new RegExp(nfc(word('মা|বাবা|মাকে|মায়ের|বাবার|বাবাকে') + '|তোমার পেট'));
for (const [w, list] of Object.entries(BY_WEEK)) {
  if (list.length < 4) throw new Error('week ' + w + ' needs 4 messages');
  for (const m of list) if (thirdPerson.test(nfc(m))) throw new Error('general message names a relation: ' + m);
}
const motherWrong = new RegExp(nfc(word('মাকে|মায়ের|বাবা|বাবার')));
for (const m of MOTHER) if (motherWrong.test(nfc(m.text))) throw new Error('mother message speaks about her: ' + m.text);
for (const m of [...FATHER, ...FAMILY]) if (nfc(m.text).includes(nfc('তোমার পেট'))) throw new Error('wrong reader: ' + m.text);
for (const m of FAMILY) if (nfc(m.text).includes(nfc('বাবা'))) throw new Error('family message assumes father: ' + m.text);
let fewest = 99;
for (const rel of [{ id: 'ma', name: 'মা' }, { id: 'baba', name: 'বাবা' }, { id: 'nani', name: 'নানি' }, { id: 'other', name: 'খালামণি' }]) {
  for (const d of days) {
    const msgs = messagesForDay(data, d, rel);
    fewest = Math.min(fewest, msgs.length);
    if (msgs.length < 5 || new Set(msgs).size !== msgs.length) throw new Error(`day ${d.day} ${rel.id}: ${msgs.length} messages`);
    if (msgs.some((m) => m.includes('{'))) throw new Error('unfilled placeholder on day ' + d.day);
  }
}
console.log('baby messages ok, at least', fewest, 'per day');
const show = (d) => { const x = days[d - 1]; return `day ${d} = ${x.gaWeek}w${x.gaDay}d stage ${x.stage} ${x.lengthCm}cm ${x.lengthBasis} ${x.weightG}g bpm ${x.motion.bpm} kick ${x.motion.kick}`; };
[1, 21, 22, 56, 125, 126, 182, 238, 266].forEach((d) => console.log(show(d)));
console.log('wrote', out);
