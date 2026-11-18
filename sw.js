/* Spherizone DCS simulator — service worker
   Network first: when online every page and script is fetched fresh, so users always get the newest
   published version. A copy is kept in the cache so the simulator also works offline.               */
const CACHE = 'szdcs-151';
const CORE = ['./', 'index.html', 'catalyst.html', 'mzcr.html', 'flash.html', 'gpr.html', 'finishing.html', 'extrusion.html',
  'utilities.html', 'trends.html', 'alarms.html', 'quality.html', 'instructor.html', 'manual.html',
  'assets/dcs.css', 'assets/model.js', 'assets/core.js', 'assets/ui.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'forms/checklists.html', 'forms/logsheet.html', 'forms/forms.css'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE).catch(() => { })).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  if (r.url.includes('version.json')) return;                       // always straight from the network
  e.respondWith(
    fetch(r).then((res) => {
      if (res && res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(r, cp)); }
      return res;
    }).catch(() => caches.match(r, { ignoreSearch: true }).then((m) => m || caches.match('index.html')))
  );
});
