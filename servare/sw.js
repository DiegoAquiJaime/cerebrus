const CACHE = 'bodega-v2';
const ASSETS = [
  './', './index.html', './app.html', './css/styles.css', './manifest.json',
  './js/api.js', './js/auth.js', './js/ui.js', './js/dashboard.js',
  './js/movimientos.js', './js/historial.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
