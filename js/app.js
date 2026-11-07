// App controller: reads data/pregnancy.json, keeps the due date in localStorage,
// and shows the right content for today or any browsed day.
import { TOTAL_DAYS, dayImage, dayFromGa } from './growth.js';

const STORAGE_KEY = 'aanchol.v1';
const $ = (id) => document.getElementById(id);

// ---------- Dates (all local midnight, so day counts ignore clock changes) ----------
const GM = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const BM = ['বৈশাখ', 'জ্যৈষ্ঠ', 'আষাঢ়', 'শ্রাবণ', 'ভাদ্র', 'আশ্বিন', 'কার্তিক', 'অগ্রহায়ণ', 'পৌষ', 'মাঘ', 'ফাল্গুন', 'চৈত্র'];
const WD = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
const ORD = ['১ম', '২য়', '৩য়', '৪র্থ', '৫ম', '৬ষ্ঠ', '৭ম', '৮ম', '৯ম', '১০ম'];
const bn = (v) => String(v).replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[+d]);
const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const diff = (a, b) => Math.round((a - b) / 86400000);
const fmt = (d, withDay) => { const s = `${bn(d.getDate())} ${GM[d.getMonth()]} ${bn(d.getFullYear())}`; return withDay ? `${s}, ${WD[d.getDay()]}` : s; };
function bangla(d) {
  const y = d.getFullYear(); let start = new Date(y, 3, 14), by = y - 593;
  if (d < start) { start = new Date(y - 1, 3, 14); by = y - 594; }
  let n = diff(d, start), m = 0;
  const fy = start.getFullYear() + 1, leap = (fy % 4 === 0 && fy % 100 !== 0) || fy % 400 === 0;
  const lens = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, leap ? 30 : 29, 30];
  while (m < 11 && n >= lens[m]) { n -= lens[m]; m++; }
  return `${bn(n + 1)} ${BM[m]} ${bn(by)} বঙ্গাব্দ`;
}

// ---------- Storage: { dueDate: 'YYYY-MM-DD', anc: [bool x4], installLater: bool } ----------
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (s && parse(s.dueDate)) return s;
  } catch (e) { /* unavailable or corrupt storage just means a first visit */ }
  return null;
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); return true; }
  catch (e) { toast('এই ব্রাউজারে তারিখ সংরক্ষণ করা গেল না।'); return false; }
}

let DATA = null, store = null, tracker = null, sceneLoading = null;
const ui = { mode: 'due', viewDay: null, built: false, renderedToday: null };

// ---------- Derived values ----------
function pregnancy() {
  const t = today(), due = parse(store.dueDate);
  const left = diff(due, t);
  const ga = 280 - left;
  return { t, due, left, ga, wks: Math.floor(Math.max(0, ga) / 7), days: Math.max(0, ga) % 7,
    todayDay: Math.min(TOTAL_DAYS, Math.max(1, dayFromGa(ga))), lmp: addDays(due, -280), conc: addDays(due, -266) };
}
const lengthText = (cm) => (cm < .1 ? '১ মিলিমিটারের কম' : cm < 1 ? `${bn((cm * 10).toFixed(1))} মিলিমিটার` : `${bn(cm.toFixed(1))} সেমি`);
const weightText = (g) => (g == null || g < 1 ? '১ গ্রামের কম' : g < 10 ? `${bn(g.toFixed(1))} গ্রাম` : g < 1000 ? `${bn(Math.round(g))} গ্রাম` : `${bn((g / 1000).toFixed(2))} কেজি`);
const weekOf = (d) => DATA.weeks[Math.min(40, Math.max(2, d.gaWeek))];

// ---------- Onboarding ----------
function renderForm(prefill) {
  const isDue = ui.mode === 'due', t = today();
  $('seg-due').setAttribute('aria-pressed', isDue);
  $('seg-conc').setAttribute('aria-pressed', !isDue);
  $('date-label').textContent = isDue ? 'প্রসবের সম্ভাব্য তারিখ (EDD)' : 'গর্ভধারণের তারিখ';
  $('date-help').textContent = isDue
    ? 'আল্ট্রাসনোগ্রাম রিপোর্ট বা ডাক্তারের প্রেসক্রিপশনে EDD লেখা থাকে।'
    : 'সাধারণত শেষ মাসিক শুরুর প্রায় ২ সপ্তাহ পরে গর্ভধারণ হয়। সঠিক তারিখ না জানলে আনুমানিক তারিখ দিন।';
  const input = $('date-input');
  input.min = iso(isDue ? addDays(t, -14) : addDays(t, -280));
  input.max = iso(isDue ? addDays(t, 266) : t);
  input.value = prefill || '';
  $('date-error').hidden = true;
}
function showError(msg) { const e = $('date-error'); e.textContent = msg; e.hidden = false; }

function submitDate(ev) {
  ev.preventDefault();
  const d = parse($('date-input').value), t = today();
  if (!d) return showError('অনুগ্রহ করে একটি তারিখ বেছে নিন।');
  let due;
  if (ui.mode === 'conception') {
    if (d > t) return showError('গর্ভধারণের তারিখ ভবিষ্যতের হতে পারে না।');
    if (diff(t, d) > 280) return showError('তারিখটি গত ৪০ সপ্তাহের মধ্যে হতে হবে।');
    due = addDays(d, 266);
  } else {
    const ahead = diff(d, t);
    if (ahead > 266) return showError('এই প্রসবের তারিখ অনুযায়ী গর্ভধারণ এখনো হয়নি — তারিখটি আবার দেখুন।');
    if (ahead < -14) return showError('প্রসবের তারিখ ২ সপ্তাহের বেশি আগে পেরিয়ে গেছে।');
    due = d;
  }
  store = { ...(store || {}), dueDate: iso(due), anc: store && store.anc ? store.anc : [false, false, false, false] };
  save();
  ui.viewDay = null;
  showHome();
}

function showOnboard(fromHome) {
  $('home').hidden = true; $('onboard').hidden = false;
  $('ob-cancel').hidden = !fromHome; $('wipe').hidden = !fromHome;
  if (fromHome && store) { ui.mode = 'due'; renderForm(store.dueDate); } else renderForm();
  window.scrollTo(0, 0);
}

// ---------- Home ----------
function buildOnce() {
  if (ui.built) return;
  ui.built = true;
  const frag = document.createDocumentFragment();
  for (let d = 1; d <= TOTAL_DAYS; d++) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'thumb'; b.dataset.day = d;
    b.setAttribute('aria-label', `দিন ${bn(d)}`);
    b.innerHTML = `<img loading="lazy" decoding="async" width="72" height="72" alt="" src="${dayImage(d)}"><span>দিন ${bn(d)}</span>`;
    frag.appendChild(b);
  }
  $('strip').appendChild(frag);
  $('strip').addEventListener('click', (e) => { const b = e.target.closest('.thumb'); if (b) goDay(+b.dataset.day); });

  const wf = document.createDocumentFragment();
  for (let w = 2; w <= 40; w++) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'wk'; b.dataset.week = w; b.textContent = bn(w);
    b.setAttribute('aria-label', `সপ্তাহ ${bn(w)}`);
    wf.appendChild(b);
  }
  $('weeks').appendChild(wf);
  $('weeks').addEventListener('click', (e) => { const b = e.target.closest('.wk'); if (b) goDay(Math.max(1, dayFromGa(+b.dataset.week * 7))); });

  $('danger-list').innerHTML = DATA.dangerSigns.map((s) => `<li>${s}</li>`).join('');
  $('calls').innerHTML = DATA.emergency.map((c) => `<a class="call${c.primary ? ' primary' : ''}" href="tel:${c.tel}"><b>${c.label}</b><span>${c.note}</span></a>`).join('');
  $('food').textContent = DATA.food;
  $('disclaimer').textContent = DATA.meta.disclaimer;
  $('sources').innerHTML = DATA.meta.sources.map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${s.title}</a><br>${s.usedFor}</li>`).join('');
  $('anc').innerHTML = DATA.anc.map((v, i) => `<button type="button" class="anc-row" data-i="${i}" aria-pressed="false"><span class="anc-box"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="anc-text"><span class="anc-title">${v.title}</span><span class="anc-when">${v.when}</span></span><span class="anc-tag"></span></button>`).join('');
  $('anc').addEventListener('click', (e) => {
    const b = e.target.closest('.anc-row'); if (!b) return;
    const i = +b.dataset.i; store.anc = (store.anc || []).slice(); store.anc[i] = !store.anc[i];
    save(); renderAnc(pregnancy());
  });
}

function renderAnc(p) {
  const st = store.anc || [];
  const nextIdx = DATA.anc.findIndex((v, i) => !st[i] && p.wks <= v.to);
  document.querySelectorAll('.anc-row').forEach((row, i) => {
    const v = DATA.anc[i], done = !!st[i], tag = row.querySelector('.anc-tag');
    row.setAttribute('aria-pressed', done);
    let text, cls;
    if (done) { text = 'সম্পন্ন'; cls = 't-done'; }
    else if (p.wks > v.to) { text = 'সময় পেরিয়েছে'; cls = 't-late'; }
    else if (i === nextIdx) { text = p.wks >= v.from ? 'এখনই' : 'পরবর্তী'; cls = 't-now'; }
    else { text = 'আসন্ন'; cls = 't-soon'; }
    tag.textContent = text; tag.className = `anc-tag ${cls}`;
  });
}

function renderToday(p) {
  const nowTri = DATA.trimesters[p.wks < 14 ? 0 : p.wks < 28 ? 1 : 2];
  const month = Math.min(10, Math.max(1, Math.ceil((p.ga + 1) / 30.44)));
  const pct = Math.max(0, Math.min(100, p.ga / 280 * 100));
  const lw = Math.floor(Math.max(0, p.left) / 7), ld = Math.max(0, p.left) % 7;
  $('today-line').textContent = `${fmt(p.t)} · ${bangla(p.t)}`;
  $('age-line').textContent = `${bn(p.wks)} সপ্তাহ ${bn(p.days)} দিন`;
  $('month-line').textContent = `${ORD[month - 1]} মাস চলছে · ${nowTri.name}`;
  const alert = $('alert');
  alert.hidden = p.left >= 0;
  if (p.left < 0) alert.textContent = 'প্রসবের সম্ভাব্য তারিখ পেরিয়ে গেছে। দেরি না করে আপনার ডাক্তারের সঙ্গে যোগাযোগ করুন।';
  $('pct-text').textContent = `${bn(Math.round(pct))}%`;
  $('pct-bar').style.width = `${pct.toFixed(1)}%`;
  $('due-text').textContent = fmt(p.due, true);
  $('due-bangla').textContent = bangla(p.due);
  $('due-line').textContent = p.left > 0 ? `প্রসবের আর ${bn(p.left)} দিন বাকি` : p.left === 0 ? 'আজই প্রসবের সম্ভাব্য তারিখ' : `প্রসবের তারিখ ${bn(-p.left)} দিন পেরিয়েছে`;
  $('conc-text').textContent = fmt(p.conc);
  $('lmp-text').textContent = fmt(p.lmp);
  $('trim-text').textContent = nowTri.name;
  $('left-text').textContent = p.left > 0 ? `${bn(lw)} সপ্তাহ ${bn(ld)} দিন` : 'পূর্ণ মেয়াদ';
  const rem = DATA.reminders.filter((r) => p.wks >= r.from && p.wks <= r.to);
  $('reminders-card').hidden = !rem.length;
  $('reminders').innerHTML = rem.map((r) => `<span class="chip">${r.text}</span>`).join('');
  renderAnc(p);
  // The strip and week chips mark today separately from the selected day.
  document.querySelectorAll('.thumb.is-today, .wk.is-today').forEach((b) => b.classList.remove('is-today'));
  const th = $('strip').children[p.todayDay - 1]; th.classList.add('is-today');
  const wk = $('weeks').children[Math.max(2, Math.min(40, p.wks)) - 2]; if (wk) wk.classList.add('is-today');
  ui.renderedToday = iso(p.t);
}

function centerIn(container, el, smooth) {
  const left = el.offsetLeft - container.offsetLeft - (container.clientWidth - el.offsetWidth) / 2;
  container.scrollTo({ left, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
}

let lastTri = null;
function renderDay(day, { smooth = true } = {}) {
  const p = pregnancy(), d = DATA.days[day - 1], w = weekOf(d);
  ui.viewDay = day;
  const isToday = day === p.todayDay;
  // Before day 1 or past the due date, today is clamped to a day whose own date differs.
  const viewDate = isToday ? p.t : addDays(p.conc, day);
  $('view-tag').textContent = isToday ? 'আজকের দিন' : day < p.todayDay ? 'পেছনের দিন' : 'সামনের দিন';
  $('view-week').textContent = `সপ্তাহ ${bn(d.gaWeek)} · দিন ${bn(d.gaDay)}`;
  $('view-date').textContent = fmt(viewDate);
  $('prev-day').disabled = day <= 1;
  $('next-day').disabled = day >= TOTAL_DAYS;
  const range = $('day-range');
  range.value = day;
  range.style.setProperty('--fill', `${(day - 1) / (TOTAL_DAYS - 1) * 100}%`);
  range.setAttribute('aria-valuetext', `দিন ${bn(day)}, সপ্তাহ ${bn(d.gaWeek)}`);
  $('day-count').textContent = `দিন ${bn(day)}`;
  $('poster').src = d.image;
  $('poster').alt = `দিন ${bn(day)}: সপ্তাহ ${bn(d.gaWeek)}-এ গর্ভে শিশুর চিত্র`;
  $('fruit').textContent = w.compare;
  $('len-label').textContent = `দৈর্ঘ্য · ${d.lengthBasis === 'crown-rump' ? 'মাথা থেকে নিতম্ব' : 'মাথা থেকে পা'}`;
  $('len-text').textContent = lengthText(d.lengthCm);
  $('wt-text').textContent = weightText(d.weightG);
  $('basis-note').hidden = d.gaWeek !== 20;
  $('event').hidden = !d.event;
  $('event-text').textContent = d.event || '';
  $('highlight').textContent = w.highlight;
  $('looks').textContent = w.looks;
  $('moves').textContent = w.moves;
  $('back-today').hidden = isToday;

  const prev = $('strip').querySelector('[aria-current="true"]');
  if (prev) prev.removeAttribute('aria-current');
  const th = $('strip').children[day - 1]; th.setAttribute('aria-current', 'true'); centerIn($('strip'), th, smooth);
  const prevW = $('weeks').querySelector('[aria-current="true"]');
  if (prevW) prevW.removeAttribute('aria-current');
  const wkBtn = $('weeks').children[Math.max(2, d.gaWeek) - 2];
  if (wkBtn) { wkBtn.setAttribute('aria-current', 'true'); centerIn($('weeks'), wkBtn, smooth); }

  if (d.trimester !== lastTri) {
    lastTri = d.trimester;
    const T = DATA.trimesters[d.trimester - 1];
    $('mother-tag').textContent = T.tag;
    $('body-chips').innerHTML = T.body.map((t) => `<span class="chip">${t}</span>`).join('');
    $('tips').innerHTML = T.tips.map((t, i) => `<div class="tip"><span class="tip-n">${bn(i + 1)}</span><span>${t}</span></div>`).join('');
  }
  if (tracker) tracker.setDay(d, p.todayDay);
}
function goDay(day) { renderDay(Math.max(1, Math.min(TOTAL_DAYS, day))); }

function showHome() {
  $('onboard').hidden = true; $('home').hidden = false;
  buildOnce();
  const p = pregnancy();
  renderToday(p);
  renderDay(ui.viewDay || p.todayDay, { smooth: false });
  startScene();
  refreshInstallCard();
  cacheNearbyImages(p.todayDay);
}

// Three.js loads only once the home screen is showing, so onboarding stays instant.
function startScene() {
  if (tracker || sceneLoading) return;
  const stage = document.querySelector('.stage');
  const failed = () => { stage.classList.add('no-webgl'); $('stage-hint').hidden = true; };
  sceneLoading = import('./scene.js').then(({ createTrackerScene }) => {
    tracker = createTrackerScene($('tracker'), {
      onPickDay: goDay,
      onScrub: (d) => renderDay(d, { smooth: false }),
      onReady: () => stage.classList.add('is-live'),
    });
    if (!tracker) return failed();
    tracker.setDay(DATA.days[ui.viewDay - 1], pregnancy().todayDay);
  }).catch((e) => { console.error(e); failed(); });
}

// ---------- Home-screen install ----------
let installPrompt = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function refreshInstallCard() {
  $('install-card').hidden = isStandalone() || !store || store.installLater === true;
}
function installSteps() {
  if (isIOS()) return ['Safari-তে এই পেজটি খুলুন।', 'নিচের শেয়ার বোতামে চাপ দিন (তীর চিহ্নসহ বাক্স)।', '“Add to Home Screen” বেছে নিন।', 'ওপরে “Add” চাপুন।'];
  if (!window.isSecureContext) return ['হোম স্ক্রিনে অ্যাপ হিসেবে যোগ করতে সাইটটি HTTPS-এ চালু থাকা দরকার।', 'এখনকার ঠিকানা নিরাপদ নয়। তবে ব্রাউজারের মেনু থেকে “Add to Home screen” দিয়ে শর্টকাট যোগ করতে পারেন।'];
  return ['ব্রাউজারের মেনু (⋮) খুলুন।', '“Add to Home screen” বা “Install app” বেছে নিন।', '“Add” বা “Install” চাপুন।'];
}
async function onInstallClick() {
  if (installPrompt) {
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    installPrompt = null;
    if (outcome === 'accepted') { $('install-card').hidden = true; toast('‘সন্তান’ অ্যাপ হোম স্ক্রিনে যোগ হচ্ছে।'); }
    return;
  }
  $('install-steps').innerHTML = installSteps().map((s) => `<li>${s}</li>`).join('');
  $('install-dialog').showModal();
}

let toastTimer;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3500); }

// ---------- Offline ----------
function registerSW() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('service worker', e));
}
// Fetching through the service worker stores this week's images for offline use.
function cacheNearbyImages(day) {
  const run = () => { for (let d = Math.max(1, day - 7); d <= Math.min(TOTAL_DAYS, day + 7); d++) fetch(dayImage(d)).catch(() => {}); };
  ('requestIdleCallback' in window) ? requestIdleCallback(run) : setTimeout(run, 1500);
}

// ---------- Wiring ----------
function wire() {
  $('date-form').addEventListener('submit', submitDate);
  $('seg-due').addEventListener('click', () => { ui.mode = 'due'; renderForm(); });
  $('seg-conc').addEventListener('click', () => { ui.mode = 'conception'; renderForm(); });
  $('date-input').addEventListener('input', () => { $('date-error').hidden = true; });
  $('change-date').addEventListener('click', () => showOnboard(true));
  $('ob-cancel').addEventListener('click', showHome);
  $('wipe').addEventListener('click', () => {
    if (!confirm('তারিখ ও চেকআপের টিক এই ফোন থেকে মুছে যাবে। মুছে ফেলবেন?')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* nothing stored */ }
    store = null; ui.viewDay = null; ui.mode = 'due';
    showOnboard(false);
  });
  $('prev-day').addEventListener('click', () => goDay(ui.viewDay - 1));
  $('next-day').addEventListener('click', () => goDay(ui.viewDay + 1));
  $('day-range').addEventListener('input', (e) => renderDay(+e.target.value, { smooth: false }));
  $('back-today').addEventListener('click', () => goDay(pregnancy().todayDay));
  $('install-btn').addEventListener('click', onInstallClick);
  $('install-later').addEventListener('click', () => { store.installLater = true; save(); refreshInstallCard(); });
  $('install-close').addEventListener('click', () => $('install-dialog').close());
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
  window.addEventListener('appinstalled', () => { $('install-card').hidden = true; installPrompt = null; });
  // An app left open overnight should move on to the new day by itself.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !store || $('home').hidden || ui.renderedToday === iso(today())) return;
    const wasToday = $('back-today').hidden;
    const p = pregnancy(); renderToday(p);
    renderDay(wasToday ? p.todayDay : ui.viewDay, { smooth: false });
  });
}

async function main() {
  try {
    const res = await fetch('data/pregnancy.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    DATA = await res.json();
  } catch (e) {
    console.error(e);
    $('loading').hidden = true;
    const f = $('fatal'); f.hidden = false;
    f.textContent = location.protocol === 'file:'
      ? 'ফাইলটি সরাসরি খুললে অ্যাপ চলবে না। Laragon-এর মতো একটি ওয়েব সার্ভার দিয়ে খুলুন (যেমন http://localhost/HTML/pregnancytrack/)।'
      : 'তথ্য লোড করা গেল না। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।';
    return;
  }
  $('loading').hidden = true;
  store = load();
  wire();
  registerSW();
  if (store) showHome(); else showOnboard(false);
}
main();
