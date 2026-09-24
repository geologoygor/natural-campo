/* Campo · Natural Engenharia — service worker
   Rede primeiro (pega sempre a versão nova e os SOPs atualizados);
   sem internet, usa a cópia guardada no celular. */
const V = 'campo-v1.9.4';
const FONTES = 'campo-fontes'; // não muda de versão: a fonte baixada uma vez fica
const SHELL = ['./', 'index.html', 'fichas.js', 'geofisica.js', 'manifest.webmanifest', 'logo-white.png', 'logo-color.png', 'icon-192.png', 'icon-512.png', 'campo.json', 'hidrogeo.json', 'COMO_ANDAR_CAMINHAMENTO.png', 'COMO_ABRIR_SEV.png'];
const PAPEL = ['papel_FC-SPT.pdf', 'papel_FC-POCO-teste-entrega.pdf', 'papel_FC-POCO-completa.pdf', 'papel_FC-SPT_p1.jpg', 'papel_FC-POCO-completa_p1.jpg', 'papel_FC-POCO-completa_p2.jpg', 'papel_FC-POCO-completa_p3.jpg']; // fichas de papel para imprimir sem internet
const FONTE_CSS = 'https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;700&display=swap';
// Na primeira abertura com internet guarda TUDO para trabalhar sem sinal, sem perguntar nada ao usuário.
async function guardarFontes() {
  try { const c = await caches.open(FONTES); if (await c.match(FONTE_CSS)) return;
    const r = await fetch(FONTE_CSS); if (!r.ok) return; const css = await r.clone().text(); await c.put(FONTE_CSS, r);
    const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
    await Promise.all(urls.map(u => fetch(u).then(x => x.ok && c.put(u, x)).catch(() => {}))); } catch (e) {} }
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL).catch(() => {})
  .then(() => Promise.all(PAPEL.map(p => c.add(p).catch(() => {}))))).then(guardarFontes).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== FONTES).map(k => caches.delete(k)))).then(guardarFontes).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) { // fonte do carimbo: guarda e usa sem internet
    e.respondWith(caches.open(FONTES).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok || r.type === 'opaque') c.put(e.request, r.clone()); return r; }))));
    return; }
  if (u.origin !== location.origin) return; // robô e Drive passam direto
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache' }).then(r => { // no-cache: confere com o servidor, não usa a cópia de 10 min do navegador
      if (r.ok) { const cp = r.clone(); caches.open(V).then(c => c.put(e.request, cp)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('index.html')))
  );
});
