/* Campo · Natural Engenharia — service worker (funciona offline) */
const V = 'campo-v1.0.1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'logo-white.png', 'logo-color.png', 'icon-192.png', 'icon-512.png', 'campo.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // Apps Script e Drive passam direto
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => {
    const rede = fetch(e.request).then(r => { if (r.ok) caches.open(V).then(c => c.put(e.request, r.clone())); return r; }).catch(() => hit);
    return hit || rede;
  }));
});
