/* Service worker di Sosta Chiara.
   BUILD viene sostituito automaticamente a ogni pubblicazione (vedi .github/workflows/pages.yml):
   così il browser vede un service worker nuovo e l'app mostra "Aggiorna". */
const BUILD = '__BUILD__';
const CACHE = 'sostachiara-' + BUILD;
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'zones.json', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  // non si attiva da solo: aspetta che l'utente tocchi "Aggiorna" (oppure che chiuda tutte le schede)
});
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;   // mappe OSM e link esterni: solo rete
  if (url.pathname.endsWith('version.json')) return;                      // sempre dalla rete
  // rete prima (dati aggiornati), copia in cache, cache se offline
  e.respondWith(fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'))));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => list.length ? list[0].focus() : self.clients.openWindow('./')));
});
