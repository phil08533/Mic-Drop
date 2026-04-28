// Mic Drop service worker. App-shell cache for offline play.
// Music files are NOT precached — they're network/range-fetched and the
// browser can decide what to keep.

const CACHE = 'micdrop-v1';
const SHELL = [
  './',
  './index.html',
  './styles/main.css',
  './js/main.js',
  './js/state.js',
  './js/ui.js',
  './js/cards.js',
  './js/teamBattle.js',
  './js/kingOfHill.js',
  './js/music.js',
  './js/settings.js',
  './data/burns.json',
  './data/boasts.json',
  './data/rhymes.json',
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
