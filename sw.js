const CACHE_NAME = 'vocab-app-v7';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/words-zk-af.js',
  './js/words-zk-go.js',
  './js/words-zk-pz.js',
  './js/words-zk-phrases.js',
  './js/words-zhongkao.js',
  './js/words-jbyq.js',
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
    fetch(event.request).then((response) => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      return response;
    }).catch(() => caches.match(event.request))
  );
});
