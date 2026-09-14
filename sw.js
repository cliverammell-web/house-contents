/* House contents — network-first service worker.
   Network first so a fresh upload is picked up on the next load rather than
   being masked by a cached copy. Falls back to cache after 4s or when offline. */

const VERSION = 'house-contents-v11';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];
const TIMEOUT = 4000;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => n !== VERSION).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;                       // never touch sync PUTs

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // let the worker API through untouched

  event.respondWith(
    fromNetwork(req, TIMEOUT).catch(() => fromCache(req))
  );
});

function fromNetwork(req, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(req).then(res => {
      clearTimeout(timer);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then(cache => cache.put(req, copy)).catch(() => {});
      }
      resolve(res);
    }, err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function fromCache(req) {
  return caches.open(VERSION)
    .then(cache => cache.match(req))
    .then(hit => hit || caches.match('./index.html'))
    .then(hit => hit || Response.error());
}
