const CACHE_NAME = 'vocab-app-v2';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/words7a.js',
  './js/words7b.js',
  './js/words8a.js',
  './js/words8b.js',
  './js/words9.js',
  './js/words-zk-af.js',
  './js/words-zk-go.js',
  './js/words-zk-pz.js',
  './js/words-zhongkao.js',
  './js/storage.js',
  './js/ebbinghaus.js',
  './js/app.js',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});
