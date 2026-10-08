// Mic Drop service worker: makes the app work offline.
//
// Network first: when online you always get the newest files (so an update
// can never leave you with a mix of old and new code); the cache is only used
// when the network isn't there. Anything fetched is cached for next time.

const CACHE = 'micdrop-v7';
const SHELL = [
  './',
  './index.html',
  './styles/main.css',
  './js/main.js',
  './js/state.js',
  './js/ui.js',
  './js/icons.js',
  './js/cards.js',
  './js/bout.js',
  './js/crowd.js',
  './js/sfx.js',
  './js/fire.js',
  './js/stagefx.js',
  './js/teamBattle.js',
  './js/kingOfHill.js',
  './js/music.js',
  './js/mixer.js',
  './js/synth.js',
  './js/beatstore.js',
  './js/beatlab.js',
  './js/visualizer.js',
  './js/settings.js',
  './js/guide.js',
  './js/install.js',
  './data/rhymes.json',
  './data/twists.json',
  './music/manifest.json',
  './manifest.json',
  './assets/favicon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache, so we never store stale copies.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(SHELL.map((u) => fetch(new Request(u, { cache: 'reload' }))
        .then((r) => (r.ok ? c.put(u, r) : null)).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;            // fonts etc.: let the browser handle them
  e.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then((res) => {
        if (res && res.ok && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })
        .then((hit) => hit || (request.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
