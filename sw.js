const PREFIX = `cantongo-shell-${new URL(self.registration.scope).pathname}-`;
const CACHE = `${PREFIX}v1`;
const FILES = ['./', './index.html', './styles.css', './app.js', './domain.js', './db.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const urls = new Set(FILES.map(file => new URL(file, self.registration.scope).href));
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(new URL('./index.html', self.registration.scope).href)) || fetch(event.request)));
  else if (urls.has(url.href)) event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request)) || fetch(event.request)));
});
