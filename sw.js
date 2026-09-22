/* Campo · Natural Engenharia — service worker
   Rede primeiro (pega sempre a versão nova e os SOPs atualizados);
   sem internet, usa a cópia guardada no celular. */
const V = 'campo-v1.4.0';
const FONTES = 'campo-fontes'; // não muda de versão: a fonte baixada uma vez fica
const SHELL = ['./', 'index.html', 'fichas.js', 'manifest.webmanifest', 'logo-white.png', 'logo-color.png', 'icon-192.png', 'icon-512.png', 'campo.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== FONTES).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) { // fonte do carimbo: guarda e usa sem internet
    e.respondWith(caches.open(FONTES).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok || r.type === 'opaque') c.put(e.request, r.clone()); return r; }))));
    return; }
  if (u.origin !== location.origin) return; // robô e Drive passam direto
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const cp = r.clone(); caches.open(V).then(c => c.put(e.request, cp)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('index.html')))
  );
});
