/* Campo · Natural Engenharia — service worker
   Rede primeiro (pega sempre a versão nova e os SOPs atualizados);
   sem internet, usa a cópia guardada no celular. */
const V = 'campo-v1.26.4';
const ESPERA_REDE = 4000; // sinal fraco: depois de 4 s abre a cópia do celular em vez de tela branca
const FONTES = 'campo-fontes'; // não muda de versão: a fonte baixada uma vez fica
const SHELL = ['./', 'index.html', 'fichas.js', 'geofisica.js', 'mapas.js', 'manifest.webmanifest', 'logo-white.png', 'logo-color.png', 'icon-192.png', 'icon-512.png', 'campo.json', 'hidrogeo.json', 'COMO_ANDAR_CAMINHAMENTO.png', 'COMO_ABRIR_SEV.png'];
const PAPEL = ['papel_FC-SPT.pdf', 'papel_FC-POCO-teste-entrega.pdf', 'papel_FC-POCO-completa.pdf', 'papel_FC-SPT_p1.jpg', 'papel_FC-POCO-completa_p1.jpg', 'papel_FC-POCO-completa_p2.jpg', 'papel_FC-POCO-completa_p3.jpg']; // fichas de papel para imprimir sem internet
const LIBS = 'campo-libs'; // leitores de PDF e GeoTIFF dos mapas (v1.21.0): baixados uma vez, ficam para usar sem internet
const LIBS_URL = ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js', 'https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js'];
async function guardarLibs() { try { const c = await caches.open(LIBS); await Promise.all(LIBS_URL.map(u => c.match(u).then(h => h || fetch(u, { mode: 'cors' }).then(r => r.ok && c.put(u, r))).catch(() => {}))); } catch (e) {} }
const FONTE_CSS = 'https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;700&display=swap';
// Na primeira abertura com internet guarda TUDO para trabalhar sem sinal, sem perguntar nada ao usuário.
async function guardarFontes() {
  try { const c = await caches.open(FONTES); if (await c.match(FONTE_CSS)) return;
    const r = await fetch(FONTE_CSS); if (!r.ok) return; const css = await r.clone().text(); await c.put(FONTE_CSS, r);
    const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
    await Promise.all(urls.map(u => fetch(u).then(x => x.ok && c.put(u, x)).catch(() => {}))); } catch (e) {} }
/* instalação SEM engolir erro: se a versão nova não baixou inteira (sinal ruim), ela não assume e a antiga
   continua valendo — antes ela assumia, apagava o cache velho e o app não abria mais sem internet */
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)
  .then(() => Promise.all(PAPEL.map(p => c.add(p).catch(() => {}))))).then(guardarFontes).then(guardarLibs).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== FONTES && k !== LIBS).map(k => caches.delete(k)))).then(guardarFontes).then(guardarLibs).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) { // fonte do carimbo: guarda e usa sem internet
    e.respondWith(caches.open(FONTES).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok || r.type === 'opaque') c.put(e.request, r.clone()); return r; }))));
    return; }
  if (LIBS_URL.includes(u.href)) { // leitor de mapas: guardado no celular, abre sem internet
    e.respondWith(caches.open(LIBS).then(c => c.match(u.href).then(hit => hit || fetch(u.href, { mode: 'cors' }).then(r => { if (r.ok) c.put(u.href, r.clone()); return r; }))));
    return; }
  if (u.origin !== location.origin) return; // robô e Drive passam direto
  const doCache = () => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'));
  const daRede = fetch(e.request.url, { cache: 'no-cache' }).then(r => { // no-cache: confere com o servidor, não usa a cópia de 10 min do navegador
      if (r.ok) { const cp = r.clone(); caches.open(V).then(c => c.put(e.request, cp)); }
      return r;
    });
  e.respondWith(new Promise(ok => {
    let feito = false; const fim = r => { if (!feito && r) { feito = true; ok(r); } };
    const t = setTimeout(() => doCache().then(hit => { if (hit) fim(hit); }), ESPERA_REDE);
    daRede.then(r => { clearTimeout(t); fim(r); }).catch(() => { clearTimeout(t); doCache().then(hit => fim(hit || Response.error())); });
  }));
});
