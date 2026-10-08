// Mic Drop service worker. App-shell cache for offline play.
// Music files and the visualizer library are NOT precached; they're cached
// the first time they're used.

const CACHE = 'micdrop-v6';
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
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // For audio files we go network-first so the user always gets fresh tracks.
  const isAudio = /\.(mp3|ogg|m4a|wav|flac)(\?|$)/i.test(url.pathname);
  if (isAudio) {
    e.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }
  // App shell: cache-first, fall back to network, cache the result.
  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res && res.ok && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
