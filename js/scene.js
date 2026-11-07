// The live 3D tracker: a layered womb and baby with age-based motion, inside a dial of
// 266 beads, one per day. Everything is driven by the day's entry in data/pregnancy.json.
import * as THREE from '../vendor/three.min.js';
import { TOTAL_DAYS, dayLayers, earlyCenter } from './growth.js';

const VERT = /* glsl */`
  uniform float uTime, uScale, uSway, uBob, uHeadAmp, uHandAmp, uBreath, uKick, uHiccup, uBump, uFixRoot;
  uniform vec2 uRoot, uHead, uNeck, uChest, uFoot, uHand;
  varying vec2 vUv;
  float g(vec2 a, vec2 b, float r) { vec2 d = a - b; return exp(-dot(d, d) / (r * r)); }
  vec2 rot(vec2 p, vec2 c, float a) { float s = sin(a), k = cos(a); p -= c; return vec2(p.x * k - p.y * s, p.x * s + p.y * k) + c; }
  void main() {
    vUv = uv;
    vec2 p = uv;
    // Nothing moves at the cord root, so the cord stays joined to the placenta.
    float free = mix(1.0, smoothstep(0.05, 0.30, distance(uv, uRoot)), uFixRoot);
    p = rot(p, uChest, sin(uTime * 0.7) * uSway * free);
    p.y += sin(uTime * 1.1 + 1.0) * uBob * free;
    p = rot(p, uNeck, sin(uTime * 0.9 + 0.6) * uHeadAmp * g(uv, uHead, 0.20));
    vec2 limb = uHand - uChest;
    p += normalize(limb + vec2(0.001)) * sin(uTime * 1.7) * uHandAmp * g(uv, uHand, 0.09);
    vec2 leg = normalize(uFoot - uChest + vec2(0.001));
    p += leg * uKick * g(uv, uFoot, 0.13);
    p += (uv - uChest) * uBreath * (0.5 + 0.5 * sin(uTime * 1.3)) * 6.0 * g(uv, uChest, 0.16);
    p.y += uHiccup * g(uv, uChest, 0.24);
    // The wall gives a little where a foot pushes (womb layer only).
    p += leg * uBump * g(uv, uFoot + leg * 0.12, 0.22);
    p = uRoot + (p - uRoot) * uScale;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p - 0.5, 0.0, 1.0);
  }`;

const FRAG = /* glsl */`
  uniform sampler2D uMap;
  uniform float uOpacity, uHeart;
  uniform vec2 uChest, uLight;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(uMap, vUv);
    if (c.a < 0.004) discard;
    // Soft moving highlight gives the flat art a sense of volume.
    float l = exp(-dot(vUv - uLight, vUv - uLight) / 0.18);
    c.rgb += vec3(0.07, 0.05, 0.05) * l * c.a;
    vec2 d = vUv - uChest;
    c.rgb += vec3(0.75, 0.05, 0.16) * uHeart * exp(-dot(d, d) / 0.0016) * c.a;
    gl_FragColor = c * uOpacity;
  }`;

const toV = ([x, y]) => new THREE.Vector2(x, 1 - y);

function rigFor(day) {
  const l = dayLayers(day);
  if (l.rig) return { root: toV(l.rig.root), head: toV(l.rig.head), neck: toV(l.rig.neck), chest: toV(l.rig.chest), foot: toV(l.rig.foot), hand: toV(l.rig.hand), fixRoot: 1 };
  const c = toV(earlyCenter(day));
  return { root: c.clone(), head: c.clone(), neck: c.clone(), chest: c.clone(), foot: c.clone(), hand: c.clone(), fixRoot: 0 };
}

function layerMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: {
      uMap: { value: null }, uOpacity: { value: 0 }, uTime: { value: 0 }, uScale: { value: 1 },
      uSway: { value: 0 }, uBob: { value: 0 }, uHeadAmp: { value: 0 }, uHandAmp: { value: 0 }, uBreath: { value: 0 },
      uKick: { value: 0 }, uHiccup: { value: 0 }, uBump: { value: 0 }, uHeart: { value: 0 }, uFixRoot: { value: 1 },
      uRoot: { value: new THREE.Vector2(.5, .5) }, uHead: { value: new THREE.Vector2(.5, .5) }, uNeck: { value: new THREE.Vector2(.5, .5) },
      uChest: { value: new THREE.Vector2(.5, .5) }, uFoot: { value: new THREE.Vector2(.5, .5) }, uHand: { value: new THREE.Vector2(.5, .5) },
      uLight: { value: new THREE.Vector2(.4, .7) },
    },
  });
}

function setRig(mat, rig) {
  const u = mat.uniforms;
  u.uRoot.value.copy(rig.root); u.uHead.value.copy(rig.head); u.uNeck.value.copy(rig.neck);
  u.uChest.value.copy(rig.chest); u.uFoot.value.copy(rig.foot); u.uHand.value.copy(rig.hand);
  u.uFixRoot.value = rig.fixRoot;
}

// A pair of meshes so a texture change can cross-fade instead of popping.
class Layer {
  constructor(parent, z, order, segments) {
    const geo = new THREE.PlaneGeometry(1, 1, segments, segments);
    this.meshes = [0, 1].map(() => { const m = new THREE.Mesh(geo, layerMaterial()); m.position.z = z; m.renderOrder = order; m.frustumCulled = false; parent.add(m); return m; });
    this.active = 0; this.path = null; this.request = 0;
  }
  each(fn) { this.meshes.forEach((m) => fn(m.material.uniforms, m.material)); }
  swap(path, rig, load) {
    if (path === this.path) { setRig(this.meshes[this.active].material, rig); return Promise.resolve(); }
    this.path = path;
    const req = ++this.request;
    return load(path).then((tex) => {
      if (req !== this.request) return;
      this.active ^= 1;
      const m = this.meshes[this.active].material;
      m.uniforms.uMap.value = tex; setRig(m, rig);
    });
  }
  fade(dt) {
    this.meshes.forEach((m, i) => {
      const u = m.material.uniforms.uOpacity, target = i === this.active && m.material.uniforms.uMap.value ? 1 : 0;
      u.value += (target - u.value) * Math.min(1, dt * 7);
      m.visible = u.value > 0.003;
    });
  }
}

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.5, 'rgba(255,240,240,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createTrackerScene(canvas, { onPickDay, onReady, onScrub } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch (e) { return null; }
  if (!renderer.getContext()) return null;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.z = 4.2;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xf2c46d, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(1, 2, 3); scene.add(sun);

  const world = new THREE.Group(); scene.add(world);

  const disc = new THREE.Mesh(new THREE.CircleGeometry(.9, 96), new THREE.MeshBasicMaterial({ color: 0xFBEFF1, toneMapped: false }));
  disc.position.set(0, .1, -.16); world.add(disc);

  const body = new THREE.Group(); body.position.y = .1; world.add(body);
  const womb = new Layer(body, 0, 2, 32);
  const baby = new Layer(body, .05, 4, 96);

  // Particles drifting in the amniotic fluid.
  const COUNT = 46, pPos = new Float32Array(COUNT * 3), seeds = [];
  for (let i = 0; i < COUNT; i++) { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()); seeds.push({ a, r, s: .08 + Math.random() * .2 }); }
  const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pts = new THREE.Points(pGeo, new THREE.PointsMaterial({ map: dotTexture(), size: .022, transparent: true, opacity: .6, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd9d0 }));
  pts.renderOrder = 3; pts.frustumCulled = false; body.add(pts);

  // The dial: one bead per day. It turns so the selected day sits at the front.
  const R = 1.0;
  const tilt = new THREE.Group(); tilt.position.y = -.5; tilt.rotation.x = .33; world.add(tilt);
  const dial = new THREE.Group(); tilt.add(dial);
  const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 10), new THREE.MeshStandardMaterial({ roughness: .4, metalness: .05 }), TOTAL_DAYS);
  beads.frustumCulled = false; dial.add(beads);
  const angleOf = (d) => (d - 1) / TOTAL_DAYS * Math.PI * 2;
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const beadPos = [];
  const beadScale = (d) => (((d + 14) % 7 === 0) ? .0125 : .0078);
  for (let d = 1; d <= TOTAL_DAYS; d++) {
    const a = angleOf(d), p = new THREE.Vector3(Math.sin(a) * R, 0, Math.cos(a) * R);
    beadPos.push(p);
    dummy.position.copy(p); dummy.scale.setScalar(beadScale(d)); dummy.updateMatrix();
    beads.setMatrixAt(d - 1, dummy.matrix); beads.setColorAt(d - 1, col.set(0xffffff));
  }
  const halo = new THREE.Mesh(new THREE.SphereGeometry(.03, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf2c46d, emissiveIntensity: .55, roughness: .3 }));
  dial.add(halo);
  const todayMark = new THREE.Mesh(new THREE.SphereGeometry(.019, 18, 12), new THREE.MeshStandardMaterial({ color: 0xE8476F, emissive: 0xC23B5B, emissiveIntensity: .5, roughness: .35 }));
  dial.add(todayMark);

  const COLORS = { past: 0xF2C46D, future: 0x6FA892, week: 0xFBF5EC };
  function paintBeads(today) {
    for (let d = 1; d <= TOTAL_DAYS; d++) {
      col.set(d <= today ? COLORS.past : ((d + 14) % 7 === 0 ? COLORS.week : COLORS.future));
      beads.setColorAt(d - 1, col);
    }
    beads.instanceColor.needsUpdate = true;
  }

  const loader = new THREE.TextureLoader(), cache = new Map();
  function loadTexture(path) {
    if (!cache.has(path)) {
      cache.set(path, new Promise((res, rej) => loader.load(path, (t) => {
        t.premultiplyAlpha = true; t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
        t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        res(t);
      }, undefined, (e) => { cache.delete(path); rej(e); })));
    }
    return cache.get(path);
  }

  const state = {
    day: 0, today: 1, motion: null, targetWomb: .6, targetBaby: 1, womb: .6, babyS: 1,
    dial: 0, targetDial: 0, tiltX: 0, tiltY: 0, pointerX: 0, pointerY: 0,
    kickEnv: 0, kickBoost: 0, nextKick: 3, hicT: 99, hicLeft: 0, nextHic: 20, hic: 0, center: toV([.5, .5]),
    time: 0, last: 0, running: false, visible: true, inView: true, ready: false,
  };

  function setDay(d, today) {
    const first = state.day === 0;
    state.day = d.day; state.motion = d.motion; state.today = today;
    state.targetWomb = d.scene.womb * 1.5; state.targetBaby = d.scene.baby;
    if (first) { state.womb = state.targetWomb; state.babyS = state.targetBaby; }
    paintBeads(today);
    halo.position.copy(beadPos[d.day - 1]);
    todayMark.position.copy(beadPos[today - 1]);
    todayMark.position.y += .045;
    // Shortest way round the dial, so day 266 to day 1 does not spin back the long way.
    let t = -angleOf(d.day);
    while (t - state.targetDial > Math.PI) t -= Math.PI * 2;
    while (t - state.targetDial < -Math.PI) t += Math.PI * 2;
    state.targetDial = t;
    if (first) state.dial = t;

    const rig = rigFor(d.day);
    state.center.copy(rig.chest);
    const done = Promise.all([womb.swap(d.layers.womb, rig, loadTexture), baby.swap(d.layers.baby, rig, loadTexture)]);
    if (!state.ready) done.then(() => { state.ready = true; onReady && onReady(); }).catch(() => {});
    else done.catch(() => {});
    preload(d.day);
  }

  function preload(day) {
    [day - 7, day + 7].forEach((n) => {
      if (n < 1 || n > TOTAL_DAYS) return;
      const l = dayLayers(n); loadTexture(l.womb).catch(() => {}); loadTexture(l.baby).catch(() => {});
    });
  }

  function kick(strength) { state.kickEnv = 1; state.kickBoost = strength || 0; }

  function update(dt) {
    const m = state.motion; if (!m) return;
    const still = reduced.matches;
    if (!still) state.time += dt;
    const t = state.time;
    state.womb += (state.targetWomb - state.womb) * Math.min(1, dt * 5);
    state.babyS += (state.targetBaby - state.babyS) * Math.min(1, dt * 5);
    state.dial += (state.targetDial - state.dial) * Math.min(1, dt * 6);
    dial.rotation.y = state.dial;

    // Kicks arrive on the age-based rhythm from the JSON, with some randomness.
    if (!still && m.kick > 0 && t > state.nextKick) { kick(); state.nextKick = t + m.kickEvery * (.7 + Math.random() * .6); }
    state.kickEnv = Math.max(0, state.kickEnv - dt * 1.7);
    const env = state.kickEnv > .78 ? (1 - state.kickEnv) / .22 : state.kickEnv / .78;
    const kickAmp = Math.max(m.kick, state.kickBoost) * env;
    if (state.kickEnv === 0) state.kickBoost = 0;

    // Hiccups: a short run of small jerks.
    if (!still && m.hiccup > 0 && t > state.nextHic) { state.hicLeft = 5; state.hicT = t; state.nextHic = t + 60 / m.hiccup * (.7 + Math.random() * .6); }
    if (state.hicLeft > 0 && t >= state.hicT) { state.hic = 1; state.hicLeft--; state.hicT = t + 1.2; }
    state.hic = Math.max(0, state.hic - dt * 7);

    let beat = 0;
    if (m.bpm > 0 && m.heart > 0 && !still) { const ph = (t * m.bpm / 60) % 1; beat = (Math.exp(-ph * 14) + .6 * Math.exp(-Math.pow(ph - .28, 2) * 240)) * m.heart; }

    const earlyPulse = state.day <= 20 ? .004 * (state.day < 7 ? 1 : .4) : 0;
    const quiet = state.day >= 7 && state.day <= 20 ? .15 : 1;
    const lx = .5 + state.tiltY * .9, ly = .68 - state.tiltX * .9;

    baby.each((u) => {
      u.uTime.value = t; u.uScale.value = state.babyS;
      u.uSway.value = still ? 0 : m.sway * quiet; u.uBob.value = still ? 0 : m.bob * quiet;
      u.uHeadAmp.value = still ? 0 : m.head; u.uHandAmp.value = still ? 0 : m.hand;
      u.uBreath.value = still ? 0 : (m.breath + earlyPulse) * .3;
      u.uKick.value = kickAmp; u.uHiccup.value = state.hic * .007;
      u.uHeart.value = beat; u.uLight.value.set(lx, ly);
    });
    womb.each((u) => {
      u.uTime.value = t; u.uBump.value = kickAmp * .35; u.uLight.value.set(lx, ly);
    });
    womb.meshes.concat(baby.meshes).forEach((mesh) => mesh.scale.setScalar(state.womb));
    womb.fade(dt); baby.fade(dt);

    // Fluid particles stay inside the sac as the womb grows.
    const rad = state.womb * .3;
    seeds.forEach((s, i) => {
      const a = s.a + t * s.s * .25;
      pPos[i * 3] = Math.cos(a) * s.r * rad + Math.sin(t * s.s + i) * .012;
      pPos[i * 3 + 1] = Math.sin(a) * s.r * rad * 1.2 + (((t * s.s * .1 + i * .13) % 1) - .5) * .05;
      pPos[i * 3 + 2] = .08;
    });
    pGeo.attributes.position.needsUpdate = true;
    pts.material.size = .012 + state.womb * .012;

    // Idle sway plus tilt towards the pointer.
    const idleX = still ? 0 : Math.sin(t * .4) * .03, idleY = still ? 0 : Math.sin(t * .27) * .07;
    state.tiltX += (state.pointerY * .14 + idleX - state.tiltX) * Math.min(1, dt * 4);
    state.tiltY += (state.pointerX * .24 + idleY - state.tiltY) * Math.min(1, dt * 4);
    body.rotation.set(state.tiltX, state.tiltY, 0);
    disc.rotation.set(state.tiltX * .4, state.tiltY * .4, 0);
  }

  function frame(now) {
    if (!state.running) return;
    const dt = Math.min(.05, (now - state.last) / 1000 || 0); state.last = now;
    update(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  function syncRunning() {
    const want = state.visible && state.inView;
    if (want && !state.running) { state.running = true; state.last = performance.now(); requestAnimationFrame(frame); }
    else if (!want) state.running = false;
  }
  const onVis = () => { state.visible = !document.hidden; syncRunning(); };
  document.addEventListener('visibilitychange', onVis);
  const io = new IntersectionObserver((e) => { state.inView = e[0].isIntersecting; syncRunning(); });
  io.observe(canvas);

  function resize() {
    const r = canvas.getBoundingClientRect(); if (!r.width) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  // Input: drag sideways to move through days, tap a bead to pick it, tap the baby for a kick.
  const PX_PER_DAY = 7;
  const drag = { on: false, x: 0, y: 0, moved: false, lastDay: 0, id: 0 };
  const v = new THREE.Vector3();
  function nearestBead(cx, cy) {
    const r = canvas.getBoundingClientRect();
    let best = 0, bestD = 22 * 22;
    world.updateMatrixWorld(true);
    for (let d = 1; d <= TOTAL_DAYS; d++) {
      v.copy(beadPos[d - 1]); dial.localToWorld(v);
      if (v.z < 0) continue; // back half of the dial is hidden behind the womb
      v.project(camera);
      const sx = (v.x + 1) / 2 * r.width + r.left, sy = (1 - v.y) / 2 * r.height + r.top;
      const dd = (sx - cx) ** 2 + (sy - cy) ** 2;
      if (dd < bestD) { bestD = dd; best = d; }
    }
    return best;
  }
  canvas.addEventListener('pointerdown', (e) => {
    drag.on = true; drag.x = e.clientX; drag.y = e.clientY; drag.moved = false; drag.lastDay = state.day; drag.id = e.pointerId;
  });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    state.pointerX = ((e.clientX - r.left) / r.width - .5) * 2;
    state.pointerY = ((e.clientY - r.top) / r.height - .5) * 2;
    if (!drag.on) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(e.clientY - drag.y)) {
      drag.moved = true;
      try { canvas.setPointerCapture(drag.id); } catch (err) { /* pointer already gone */ }
    }
    if (drag.moved) {
      const d = Math.max(1, Math.min(TOTAL_DAYS, drag.lastDay - Math.round(dx / PX_PER_DAY)));
      if (d !== state.day) onScrub && onScrub(d);
    }
  });
  const end = (e) => {
    if (!drag.on) return;
    drag.on = false;
    if (drag.moved || e.type === 'pointercancel') return;
    const d = nearestBead(e.clientX, e.clientY);
    if (d) { onPickDay && onPickDay(d); return; }
    kick(Math.max(.03, state.motion ? state.motion.kick : .03));
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { state.pointerX = 0; state.pointerY = 0; });

  syncRunning();
  return { setDay, kick };
}
