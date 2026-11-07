// Offline support. Bump VERSION whenever a shipped file changes.
const VERSION = 'santan-v2';
const stages = [0, 1, 2, 3, 4, 5, 6, 7, 8].flatMap((i) => [`assets/layers/stage-${i}-womb.webp`, `assets/layers/stage-${i}-baby.webp`]);
const fonts = ['400-bn', '400-latin', '500-bn', '500-latin', '600-bn', '600-latin', '700-bn', '700-latin'].map((f) => `assets/fonts/hind-${f}.woff2`);
const PRECACHE = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/app.js', 'js/scene.js', 'js/growth.js', 'vendor/three.min.js', 'data/pregnancy.json',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/icon-maskable-512.png', 'assets/icons/apple-touch-icon.png', 'assets/icons/favicon-48.png',
  'assets/layers/early-womb.webp', 'assets/fonts/notoserif-bn.woff2', 'assets/fonts/notoserif-latin.woff2',
  'assets/days/day-040.webp', 'assets/days/day-150.webp', 'assets/days/day-260.webp',
  ...fonts, ...stages,
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function networkFirst(request, fallback) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(fallback || request, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(fallback || request)) || Response.error();
  }
}
async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (e.request.mode === 'navigate') return e.respondWith(networkFirst(e.request, 'index.html'));
  // Code and data stay fresh when online; images and fonts never change.
  if (/\.(json|js|css|webmanifest)$/.test(url.pathname)) return e.respondWith(networkFirst(e.request));
  e.respondWith(cacheFirst(e.request));
});
