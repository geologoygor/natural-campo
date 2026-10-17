/* ============================================================
   MAPAS DE CAMPO — Natural Engenharia (v1.21.0, 17/10/2026)
   Substitui o Avenza: cada obra traz os seus mapas (da pasta da obra no Drive)
   guardados no celular, e o funcionário navega neles com o GPS, sem internet.
   Lê: PDF georreferenciado (GeoPDF ISO 32000 — QGIS/GDAL/ArcGIS — e OGC LGIDict),
       GeoTIFF, KML/KMZ (inclusive imagem sobreposta do Google Earth) e GPX.
   Faz: ponto azul com precisão, bússola, seguir, "você está fora do mapa",
        pinos, ir até (distância e rumo), trilha gravada, medir distância/área,
        ir para coordenada. Pinos e trilhas sobem para o Drive da obra em KML.
   Regra do app: tudo funciona offline; nada trava o trabalho, só avisa.
   ============================================================ */
(function(){
'use strict';
/* S e LS do app são const (não ficam em window): acessar pelo nome, com proteção */
const utmFmt = () => !APP() || APP().fmt === 'utm';
const APP = () => (typeof S !== 'undefined' ? S : null);
const LSapp = () => (typeof LS !== 'undefined' ? LS : null);
const LIB = {
  pdf: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdfw: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  tif: 'https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js'
};
const LIMITE_AUTO = 40 * 1024 * 1024;   // mapa até 40 MB baixa sozinho ao abrir a obra; maior pede um toque
const PARTE = 5 * 1024 * 1024;           // o robô entrega o arquivo em partes de 5 MB (sinal fraco não perde tudo)
const EXT_OK = /\.(pdf|tif|tiff|kml|kmz|gpx|zip)$/i;

/* ---------------- utilidades ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = (m, ms) => (window.toast ? window.toast(m, ms) : alert(m));
const br = (x, d = 0) => Number(x).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
function fmtDist(m) { if (m == null || !isFinite(m)) return '—'; return m < 1000 ? br(Math.round(m)) + ' m' : br(m / 1000, m < 10000 ? 2 : 1) + ' km'; }
/* Unidades escolhidas pelo usuário (ficam no celular). Comprimento das MEDIÇÕES e toda ÁREA seguem a escolha;
   distância de navegação e escala do mapa continuam automáticas. */
const U_AREA = { auto: ['Automático (m² / ha)', 0], m2: ['m²', 1], ha: ['hectares (ha)', 1e4], km2: ['km²', 1e6], alqp: ['alqueire paulista (2,42 ha)', 24200], alqm: ['alqueire mineiro/goiano (4,84 ha)', 48400], alqn: ['alqueire do norte (2,7225 ha)', 27225] };
const U_COMP = { auto: ['Automático (m / km)', 0], m: ['metros (m)', 1], km: ['quilômetros (km)', 1000] };
const SUF_A = { m2: ' m²', ha: ' ha', km2: ' km²', alqp: ' alq. paulista', alqm: ' alq. mineiro', alqn: ' alq. do norte' };
function uArea() { try { return (typeof LS !== 'undefined' && LS.get('uArea', 'auto')) || 'auto'; } catch (e) { return 'auto'; } }
function uComp() { try { return (typeof LS !== 'undefined' && LS.get('uComp', 'auto')) || 'auto'; } catch (e) { return 'auto'; } }
function fmtAreaEm(m2, u) { if (m2 == null || !isFinite(m2)) return '—'; if (u === 'auto') return m2 < 10000 ? br(Math.round(m2)) + ' m²' : br(m2 / 10000, 2) + ' ha';
  const v = m2 / U_AREA[u][1]; return (u === 'm2' ? br(Math.round(v)) : br(v, v < 10 ? 4 : v < 1000 ? 2 : 1)) + SUF_A[u]; }
function fmtArea(m2) { return fmtAreaEm(m2, uArea()); }
function fmtAreaTodas(m2) { return ['m2', 'ha', 'km2', 'alqp', 'alqm'].map(u => fmtAreaEm(m2, u)).join(' = '); }
function fmtCompM(m) { const u = uComp(); if (m == null || !isFinite(m)) return '—'; if (u === 'm') return br(m, m < 100 ? 1 : 0) + ' m'; if (u === 'km') return br(m / 1000, 3) + ' km'; return fmtDist(m); }
async function escolherUnidades() {
  const r = await escolha('Unidades das medições', `Área: <b>${esc(U_AREA[uArea()][0])}</b> · Comprimento: <b>${esc(U_COMP[uComp()][0])}</b>`,
    [...Object.entries(U_AREA).map(([k, v]) => ({ t: 'Área em ' + v[0].replace(/^Automático.*/, 'automático (m² / ha)'), v: 'a:' + k, cls: uArea() === k ? 'green' : 'sec' })),
     ...Object.entries(U_COMP).map(([k, v]) => ({ t: 'Comprimento em ' + v[0].replace(/^Automático.*/, 'automático (m / km)'), v: 'c:' + k, cls: uComp() === k ? 'green' : 'sec' }))]);
  if (!r) return; const [t, k] = r.split(':'); try { LS.set(t === 'a' ? 'uArea' : 'uComp', k); } catch (e) {} toast('Unidade: ' + (t === 'a' ? U_AREA[k][0] : U_COMP[k][0])); if (V.aberto) { pedir(); if (V.medir) { pintarMedTop(); } } if (OB_ATUAL) pintarMarcas(OB_ATUAL); }
function fmtTam(b) { return b > 1048576 ? br(b / 1048576, 1) + ' MB' : br(Math.max(1, Math.round(b / 1024))) + ' KB'; }
function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function carregarScript(src) {
  return new Promise((ok, er) => { if (document.querySelector(`script[data-src="${src}"]`)) return ok();
    const s = document.createElement('script'); s.src = src; s.dataset.src = src; s.onload = ok;
    s.onerror = () => { s.remove(); er(new Error('sem a biblioteca de leitura de mapas — abra o app uma vez com internet')); }; document.head.appendChild(s); });
}
async function pdfjs() {
  if (!window.pdfjsLib) await carregarScript(LIB.pdf);
  if (!pdfjs.worker) { // worker de outro domínio não abre direto: vira Blob local (vem do cache do celular sem internet)
    const t = await fetch(LIB.pdfw).then(r => { if (!r.ok) throw new Error('worker'); return r.text(); });
    pdfjs.worker = URL.createObjectURL(new Blob([t], { type: 'text/javascript' }));
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjs.worker; }
  return window.pdfjsLib;
}
async function geotiff() { if (!window.GeoTIFF) await carregarScript(LIB.tif); return window.GeoTIFF; }
async function inflar(u8, fmt) { // FlateDecode / zip; se o fim vier sujo, fica com o que já abriu
  const ds = new DecompressionStream(fmt); const w = ds.writable.getWriter(); w.write(u8).catch(() => {}); w.close().catch(() => {});
  const rd = ds.readable.getReader(); const parts = []; let n = 0;
  try { for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); n += value.length; } } catch (e) { if (!n) throw e; }
  const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
}

/* ---------------- COMPARTILHAR sem sair do app ----------------
   Só usa a janela "Compartilhar" do próprio celular (abre POR CIMA do app e volta para ele ao terminar ou cancelar).
   Nunca abre link, nunca navega para fora. Arquivo que o celular não aceita mandar direto (KML no Android)
   vira escolha dentro do app: mandar como TEXTO (coordenadas + link do Google Maps de cada ponto, abre em qualquer celular)
   ou SALVAR o arquivo no celular (no iPhone não oferece: o download do iPhone pode prender a tela). */
const EH_IOS_M = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const MIME = { pdf: 'application/pdf', tif: 'image/tiff', kml: 'application/vnd.google-earth.kml+xml', kmz: 'application/vnd.google-earth.kmz', gpx: 'application/gpx+xml' };
const slug = window.slug || (x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 60));
const hoje = window.hoje || (() => new Date().toISOString().slice(0, 10));
const linkMaps = (lat, lon) => `https://maps.google.com/?q=${lat.toFixed(6)},${lon.toFixed(6)}`;
const ESC = { aberto: null };
function escolha(titulo, texto, opcoes) { // modal dentro do app; o voltar do celular fecha (MAPAS.voltar)
  return new Promise(ok => { fecharEscolha(); const d = document.createElement('div'); d.id = 'mpEsc';
    d.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(10,20,35,.55);display:flex;align-items:flex-end;justify-content:center';
    d.innerHTML = `<div style="background:#fff;border-radius:16px 16px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom));width:100%;max-width:560px;max-height:88vh;overflow-y:auto"><h3 style="margin:0 0 6px;color:var(--navy)">${esc(titulo)}</h3>${texto ? `<div class="nota" style="margin-bottom:10px">${texto}</div>` : ''}${opcoes.map((o, i) => `<button class="big ${o.cls || ''}" data-i="${i}" style="margin-top:8px">${esc(o.t)}</button>`).join('')}<button class="big ghost" data-i="-1" style="margin-top:8px">Cancelar</button></div>`;
    d.onclick = e => { const b = e.target.closest('button'); if (b) fim(+b.dataset.i); else if (e.target === d) fim(-1); };
    const fim = i => { fecharEscolha(); ok(i >= 0 ? opcoes[i].v : null); }; ESC.aberto = fim; document.body.appendChild(d); try { history.pushState({ t: 'esc' }, ''); } catch (e) {} }); }
function fecharEscolha() { const d = $('#mpEsc'); if (d) d.remove(); const f = ESC.aberto; ESC.aberto = null; return !!f; }
let COMP_OCUPADO = false;
async function compartilharArquivo({ blob, nome, mime, titulo, textoAlt }) {
  if (COMP_OCUPADO) return; COMP_OCUPADO = true;
  try {
    const f = new File([blob], nome, { type: mime || blob.type || 'application/octet-stream' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: titulo || nome }); return; }
    const op = [];
    if (textoAlt && navigator.share) op.push({ t: 'Mandar como texto (coordenadas e links)', v: 'texto', cls: 'green' });
    if (textoAlt && !navigator.share) op.push({ t: 'Copiar o texto (coordenadas e links)', v: 'copiar', cls: 'green' });
    if (!EH_IOS_M) op.push({ t: 'Salvar o arquivo no celular', v: 'salvar', cls: 'sec' });
    if (!op.length) { toast('Este celular não deixa compartilhar esse arquivo.'); return; }
    const r = await escolha('Compartilhar', `Este celular não manda o arquivo <b>${esc(nome)}</b> direto.${textoAlt ? ' O texto leva cada ponto com coordenada e link do Google Maps — abre em qualquer celular, sem app.' : ''}${!EH_IOS_M ? ' Ou salve o arquivo e anexe no WhatsApp como documento.' : ''}`, op);
    if (r === 'texto') await navigator.share({ title: titulo || nome, text: textoAlt });
    else if (r === 'copiar') { try { await navigator.clipboard.writeText(textoAlt); toast('Texto copiado. Cole no WhatsApp.'); } catch (e) { toast('Não consegui copiar.'); } }
    else if (r === 'salvar') { const u = URL.createObjectURL(f); const a = document.createElement('a'); a.href = u; a.download = nome; a.style.display = 'none'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 8000); toast('Salvo em Downloads. No WhatsApp: anexar › Documento.', 4500); }
  } catch (e) { if (e && e.name !== 'AbortError') toast('Não deu para compartilhar: ' + (e.message || e), 4000); }
  finally { COMP_OCUPADO = false; } }
async function compartilharTexto(titulo, texto) { if (COMP_OCUPADO) return; COMP_OCUPADO = true;
  try { if (navigator.share) await navigator.share({ title: titulo, text: texto }); else { await navigator.clipboard.writeText(texto); toast('Copiado. Cole no WhatsApp.'); } }
  catch (e) { if (e && e.name !== 'AbortError') toast('Não deu para compartilhar: ' + (e.message || e)); } finally { COMP_OCUPADO = false; } }
function textoDeFeicoes(titulo, fs) { // resumo legível de KML/GPX/marcações
  const L = [titulo]; let n = 0; const cen = c => [c.reduce((a, p) => a + p[0], 0) / c.length, c.reduce((a, p) => a + p[1], 0) / c.length];
  for (const f of fs) { if (n++ >= 60) { L.push(`… e mais ${fs.length - 60} itens (mande o arquivo para ver tudo)`); break; }
    const c = f.c || f.pts || [[f.lat, f.lon]];
    if (f.tipo === 'ponto' || f.tipo === 'pino' || c.length === 1) { const p = c[0]; L.push(`• ${f.nome || 'Ponto'}: ${p[0].toFixed(6)}, ${p[1].toFixed(6)} — ${linkMaps(p[0], p[1])}`); }
    else if (f.tipo === 'area' || f.fechado) { const m = cen(c); L.push(`▭ ${f.nome || 'Área'}: ${fmtArea(areaLL(c))} · centro ${linkMaps(m[0], m[1])}`); }
    else { const a = c[0], b = c[c.length - 1]; L.push(`〰 ${f.nome || 'Linha'}: ${fmtDist(compLL(c))} · início ${linkMaps(a[0], a[1])} · fim ${linkMaps(b[0], b[1])}`); } }
  L.push('(SIRGAS 2000 / WGS 84 · enviado pelo app de campo da Natural Engenharia)'); return L.join('\n'); }
async function compartilharMapa(m) { // um mapa guardado no celular (da lista ou aberto)
  let txt = null; const tipo = m.tipo;
  if (tipo === 'kml' || tipo === 'kmz' || tipo === 'gpx') { try { const v = await vetorDe(tipo, new Uint8Array(await m.blob.arrayBuffer())); txt = textoDeFeicoes(`${m.nome.replace(/\.[^.]+$/, '')}${V.ob ? ' — ' + V.ob.nome : OB_ATUAL ? ' — ' + OB_ATUAL.nome : ''}`, v.feicoes); } catch (e) {} }
  else if (m.bboxLL) { const b = m.bboxLL, la = (b[0] + b[2]) / 2, lo = (b[1] + b[3]) / 2; txt = `${m.nome}\nCentro do mapa: ${linkMaps(la, lo)}`; }
  await compartilharArquivo({ blob: m.blob, nome: m.nome, mime: MIME[tipo], titulo: m.nome, textoAlt: txt }); }
/* ---------------- 🛰 PARA GPS: KML/marcações → GPX (Garmin e qualquer GPS) ou CSV (planilha) ---------------- */
const semAcento = x => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '').trim();
const nomeGPS = (x, i) => (semAcento(x) || ('PT' + String(i + 1).padStart(3, '0'))).slice(0, 30); /* Garmin: até ~30 caracteres, sem acento */
function feicoesUniformes(itens) { // marcações do app e feições de KML/GPX no mesmo formato
  return itens.map(m => m.tipo === 'pino' ? { tipo: 'ponto', nome: m.nome, desc: [attrTexto(m), m.nota].filter(Boolean).join(' · '), c: [[m.lat, m.lon, m.alt]], pino: m }
    : m.tipo === 'trilha' ? { tipo: 'linha', nome: m.nome, c: m.pts, trilha: true }
    : m.tipo === 'medida' ? { tipo: m.fechado ? 'area' : 'linha', nome: m.nome, c: m.pts } : m); }
function gpxDe(titulo, itens) {
  const x = v => semAcento(v).replace(/&/g, '&amp;').replace(/</g, '&lt;'); const fs = feicoesUniformes(itens); let i = 0;
  const wpt = fs.filter(f => f.tipo === 'ponto').map(f => { const p = f.c[0]; return `<wpt lat="${p[0].toFixed(8)}" lon="${p[1].toFixed(8)}">${p[2] != null && isFinite(p[2]) ? `<ele>${(+p[2]).toFixed(1)}</ele>` : ''}<name>${x(nomeGPS(f.nome, i++))}</name>${f.desc ? `<desc>${x(String(f.desc).replace(/<[^>]+>/g, ' ').slice(0, 200))}</desc>` : ''}<sym>Flag, Blue</sym></wpt>`; }).join('\n');
  const trk = fs.filter(f => f.tipo !== 'ponto' && f.c.length > 1).map(f => { const c = f.tipo === 'area' ? f.c.concat([f.c[0]]) : f.c;
    return `<trk><name>${x(nomeGPS(f.nome, i++))}</name><trkseg>${c.map(p => `<trkpt lat="${p[0].toFixed(8)}" lon="${p[1].toFixed(8)}">${p[2] != null && isFinite(p[2]) ? `<ele>${(+p[2]).toFixed(1)}</ele>` : ''}${f.trilha && p[3] ? `<time>${new Date(p[3]).toISOString()}</time>` : ''}</trkpt>`).join('')}</trkseg></trk>`; }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="App de campo - Natural Engenharia" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${x(titulo)}</name><time>${new Date().toISOString()}</time></metadata>\n${wpt}\n${trk}\n</gpx>\n`; }
function csvDe(itens) { const fs = feicoesUniformes(itens); const L = ['nome;tipo;vertice;latitude;longitude;utm_zona;utm_E;utm_N;datum;categoria;litologia;amostra;dir_mergulho;mergulho;observacao']; const n = v => String(v).replace('.', ',');
  for (const f of fs) f.c.forEach((p, k) => { const u = window.toUTM ? toUTM(p[0], p[1]) : null;
    L.push([`"${String(f.nome || '').replace(/"/g, "'")}"`, f.tipo, f.c.length > 1 ? k + 1 : '', n(p[0].toFixed(8)), n(p[1].toFixed(8)), u ? u.zone + u.hemi : '', u ? u.e : '', u ? u.n : '', 'SIRGAS 2000', ...(f.pino ? [f.pino.cat ? nomeCat(f.pino.cat) : '', (f.pino.attr || {}).lito || '', (f.pino.attr || {}).amostra || '', (f.pino.attr || {}).dirMerg ?? '', (f.pino.attr || {}).merg ?? '', `"${String(f.pino.nota || '').replace(/"/g, "'").replace(/\n/g, ' ')}"`] : ['', '', '', '', '', ''])].join(';')); });
  return '﻿' + L.join('\r\n') + '\r\n'; } /* BOM + ponto e vírgula: abre certo no Excel em português */
async function paraGPS(titulo, itens) {
  if (!itens || !itens.length) return toast('Nada para converter.');
  const fs = feicoesUniformes(itens), np = fs.filter(f => f.tipo === 'ponto').length, nl = fs.length - np;
  const r = await escolha('🛰 Para GPS', `${np} ponto(s) e ${nl} linha(s)/área(s). <b>GPX</b> abre no Garmin (BaseCamp, Explore, eTrex/GPSMAP pelo cabo), Avenza, OsmAnd e outros. <b>CSV</b> é planilha com lat/lon e UTM.`,
    [{ t: 'GPX (Garmin e outros GPS)', v: 'gpx', cls: 'green' }, { t: 'CSV (planilha com coordenadas)', v: 'csv', cls: 'sec' }]);
  if (!r) return; const base = slug(titulo || 'pontos') + '_' + hoje();
  if (r === 'gpx') await compartilharArquivo({ blob: new Blob([gpxDe(titulo, itens)], { type: MIME.gpx }), nome: base + '.gpx', mime: MIME.gpx, titulo: titulo + ' (GPX)', textoAlt: textoDeFeicoes(titulo, itens) });
  else await compartilharArquivo({ blob: new Blob([csvDe(itens)], { type: 'text/csv' }), nome: base + '.csv', mime: 'text/csv', titulo: titulo + ' (CSV)', textoAlt: textoDeFeicoes(titulo, itens) }); }
async function mapaParaGPS(m) { try { const v = await vetorDe(m.tipo, new Uint8Array(await m.blob.arrayBuffer())); await paraGPS(m.nome.replace(/\.[^.]+$/, ''), v.feicoes); } catch (e) { toast('Não consegui ler este arquivo: ' + (e.message || e)); } }

async function compartilharMarcas(ob, itens, titulo) { if (!itens.length) return toast('Nada para compartilhar ainda.');
  const nome = `${slug(titulo || 'marcacoes')}_${hoje()}.kml`;
  await compartilharArquivo({ blob: new Blob([kmlDe(itens, ob)], { type: MIME.kml }), nome, mime: MIME.kml, titulo: titulo, textoAlt: textoDeFeicoes(`${titulo} — ${ob.nome}`, itens) }); }

/* ---------------- banco no celular (mapas e marcações) ---------------- */
const MDB = {
  db: null,
  open() { if (this.db) return Promise.resolve(); return new Promise((ok, er) => { const r = indexedDB.open('natural_mapas', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('mapas', { keyPath: 'id' }).createIndex('obra', 'obraId'); d.createObjectStore('marcas', { keyPath: 'id' }).createIndex('obra', 'obraId'); };
    r.onsuccess = () => { this.db = r.result; ok(); }; r.onerror = () => er(r.error); }); },
  async req(st, mode, fn) { await this.open(); return new Promise((ok, er) => { const t = this.db.transaction(st, mode); const q = fn(t.objectStore(st)); t.oncomplete = () => ok(q && q.result); t.onerror = () => er(t.error); t.onabort = () => er(t.error); }); },
  put(st, o) { return this.req(st, 'readwrite', s => s.put(o)); },
  del(st, id) { return this.req(st, 'readwrite', s => s.delete(id)); },
  get(st, id) { return this.req(st, 'readonly', s => s.get(id)); },
  async obra(st, obraId) { return (await this.req(st, 'readonly', s => s.index('obra').getAll(obraId))) || []; },
  async todos(st) { return (await this.req(st, 'readonly', s => s.getAll())) || []; },
};

/* ---------------- geodésia: UTM com zona fixa (ida e volta), distância, rumo ---------------- */
const GA = 6378137, GF = 1 / 298.257223563, K0 = 0.9996, GN = GF / (2 - GF);
const GAA = GA / (1 + GN) * (1 + GN * GN / 4 + GN ** 4 / 64);
const AL = [GN / 2 - 2 * GN * GN / 3 + 5 * GN ** 3 / 16, 13 * GN * GN / 48 - 3 * GN ** 3 / 5, 61 * GN ** 3 / 240];
const BE = [GN / 2 - 2 * GN * GN / 3 + 37 * GN ** 3 / 96, GN * GN / 48 + GN ** 3 / 15, 17 * GN ** 3 / 480];
const DE = [2 * GN - 2 * GN * GN / 3 - 2 * GN ** 3, 7 * GN * GN / 3 - 8 * GN ** 3 / 5, 56 * GN ** 3 / 15];
const RAD = Math.PI / 180;
function zonaDe(lon) { return Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1)); }
function utmF(lat, lon, z, sul) {
  const lon0 = ((z - 1) * 6 - 180 + 3) * RAD, phi = lat * RAD, lam = lon * RAD, c = 2 * Math.sqrt(GN) / (1 + GN);
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - c * Math.atanh(c * Math.sin(phi)));
  const xi = Math.atan(t / Math.cos(lam - lon0)), eta = Math.atanh(Math.sin(lam - lon0) / Math.sqrt(1 + t * t));
  let E = eta, N = xi; for (let j = 1; j <= 3; j++) { E += AL[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); N += AL[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); }
  return [500000 + K0 * GAA * E, K0 * GAA * N + (sul ? 1e7 : 0)];
}
function utmI(E, N, z, sul) {
  const xi = (N - (sul ? 1e7 : 0)) / (K0 * GAA), eta = (E - 500000) / (K0 * GAA);
  let xp = xi, ep = eta; for (let j = 1; j <= 3; j++) { xp -= BE[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); ep -= BE[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); }
  const chi = Math.asin(Math.sin(xp) / Math.cosh(ep)); let phi = chi; for (let j = 1; j <= 3; j++) phi += DE[j - 1] * Math.sin(2 * j * chi);
  const lon0 = ((z - 1) * 6 - 180 + 3) * RAD; return [phi / RAD, (lon0 + Math.atan(Math.sinh(ep) / Math.cos(xp))) / RAD];
}
/* UTM inverso para qualquer elipsoide (SAD 69 usa o UGGI-67) */
function utmIe(E, N, z, sul, a, f) { const n = f / (2 - f), A_ = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64);
  const be = [n / 2 - 2 * n * n / 3 + 37 * n ** 3 / 96, n * n / 48 + n ** 3 / 15, 17 * n ** 3 / 480], de = [2 * n - 2 * n * n / 3 - 2 * n ** 3, 7 * n * n / 3 - 8 * n ** 3 / 5, 56 * n ** 3 / 15];
  const xi = (N - (sul ? 1e7 : 0)) / (K0 * A_), eta = (E - 500000) / (K0 * A_); let xp = xi, ep = eta;
  for (let j = 1; j <= 3; j++) { xp -= be[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); ep -= be[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); }
  const chi = Math.asin(Math.sin(xp) / Math.cosh(ep)); let phi = chi; for (let j = 1; j <= 3; j++) phi += de[j - 1] * Math.sin(2 * j * chi);
  return [phi / RAD, (((z - 1) * 6 - 180 + 3) * RAD + Math.atan(Math.sinh(ep) / Math.cos(xp))) / RAD]; }
/* SAD 69 → SIRGAS 2000: translação geocêntrica do IBGE (R.PR 1/2005): ΔX −67,35 m · ΔY +3,88 m · ΔZ −38,22 m */
function sad69ParaSirgas(lat, lon) { const a1 = 6378160, f1 = 1 / 298.25, a2 = 6378137, f2 = 1 / 298.257222101;
  const e1 = f1 * (2 - f1), e2 = f2 * (2 - f2), p = lat * RAD, l = lon * RAD, Nn = a1 / Math.sqrt(1 - e1 * Math.sin(p) ** 2);
  const X = Nn * Math.cos(p) * Math.cos(l) - 67.35, Y = Nn * Math.cos(p) * Math.sin(l) + 3.88, Z = Nn * (1 - e1) * Math.sin(p) - 38.22;
  const r = Math.hypot(X, Y); let p2 = Math.atan2(Z, r * (1 - e2)); for (let i = 0; i < 6; i++) { const N2 = a2 / Math.sqrt(1 - e2 * Math.sin(p2) ** 2); p2 = Math.atan2(Z + e2 * N2 * Math.sin(p2), r); }
  return [p2 / RAD, Math.atan2(Y, X) / RAD]; }
/* Lê coordenada em qualquer formato comum. Devolve {lat, lon, nome, fmt} (datum da entrada) ou {erro}. zonaPadrao/sulPadrao: do mapa aberto. */
function lerCoordTexto(linha, zonaPadrao, sulPadrao) {
  let t = String(linha || '').replace(/[′’´`]/g, "'").replace(/[″”“]|''/g, '"').replace(/[º˚]/g, '°').trim(); if (!t) return null;
  let nome = ''; /* nome antes da coordenada: "A4-V1: …", "Porteira - …", "P3 = …" (rótulo de eixo como E=, N=, Lat: não é nome) */
  const mn = /^(.{1,40}?)\s*(?::|=|\s[-–]\s|\t)\s*(?=[-+]?\d|[NSLOEW]\s*\d)/.exec(t);
  if (mn && /[A-Za-zÀ-ú]/.test(mn[1]) && !/^\s*(lat(itude)?|lon(gitude)?|utm|e|n|x|y|este|norte|zona|fuso)\s*$/i.test(mn[1]) && !/\d\s*[°']/.test(mn[1])) { nome = mn[1].trim(); t = t.slice(mn[0].length); }
  t = t.replace(/(^|[^\d.,])(\d{1,3}(?:\.\d{3}){1,2})(,\d+)?(?![\d.])/g, (m0, a, n, d) => { const v = +n.replace(/\./g, ''); return v >= 100000 ? a + v + (d || '') : m0; });
  /* Brasil: lat entre −34 e +6, lon entre −74 e −28 — serve para saber a ordem quando não há letra */
  const ordemBR = (a, b) => (a >= -75 && a <= -28 && b >= -35 && b <= 7 && !(b >= -75 && b <= -28));
  const hemi = h => h ? (/[SWO]/i.test(h) ? -1 : 1) : 0, ehLat = h => /[NS]/i.test(h || ''), num = x => parseFloat(String(x).replace(',', '.'));
  // graus, minutos, segundos (com ou sem segundos)
  const rG = /([NSLOEW])?\s*(\d{1,3})\s*[°d\s]\s*(\d{1,2}(?:[.,]\d+)?)\s*['m]?\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*(?:"|s)?)?\s*([NSLOEW])?/gi;
  const gs = []; let m; const tg = t.replace(/(\d)\s*°/g, '$1°');
  if (/°|'|"/.test(tg)) { while ((m = rG.exec(tg)) && gs.length < 2) { if (!/°/.test(m[0]) && !/'/.test(m[0])) continue; const h = (m[1] || m[5] || '').toUpperCase(); const v = (+m[2] + num(m[3]) / 60 + (m[4] ? num(m[4]) / 3600 : 0)); gs.push({ v, h }); }
    if (gs.length === 2) { let [a, b] = gs; if ((ehLat(b.h) && !ehLat(a.h)) || (!a.h && !b.h && a.v > 28 && b.v < 7)) [a, b] = [b, a];
      let lat = a.v * (hemi(a.h) || (sulPadrao ? -1 : 1)), lon = b.v * (hemi(b.h) || -1); /* sem letra: longitude oeste (Brasil) */
      return { lat, lon, nome, fmt: gs.some(g => /\d/.test('')) ? 'GMS' : 'graus-minutos-segundos' }; } }
  const rGM = /(\d{1,3})\s+(\d{1,2}(?:[.,]\d+)?)\s*([NSLOEW])/gi; const gm = []; while ((m = rGM.exec(t)) && gm.length < 2) gm.push({ v: +m[1] + num(m[2]) / 60, h: m[3].toUpperCase() });
  if (gm.length === 2) { let [a, b] = gm; if (ehLat(b.h) && !ehLat(a.h)) [a, b] = [b, a]; return { lat: a.v * hemi(a.h), lon: b.v * hemi(b.h), nome, fmt: 'graus-minutos' }; }
  // UTM: dois números grandes (E ~6 dígitos, N 6–7 dígitos), zona opcional
  const nums = (t.match(/[-+]?\d+(?:[.,]\d+)?/g) || []).map(num);
  const grandes = nums.filter(x => Math.abs(x) >= 1000);
  if (grandes.length >= 2) { const mz = /(?:zona|fuso)\s*:?\s*(\d{1,2})\s*([NS])?/i.exec(t) || /(?:^|[\s(;])(\d{1,2})\s*([NS])(?![a-z]|\s*[:=])/i.exec(t);
    let z = mz && +mz[1] >= 1 && +mz[1] <= 60 ? +mz[1] : zonaPadrao, sul = mz && mz[2] ? /S/i.test(mz[2]) : sulPadrao; if (!z || z < 1 || z > 60) return { erro: 'faltou a zona UTM' };
    let E = grandes[0], N = grandes[1]; const iN = t.search(/N\s*[:=]\s*\d|N\s+\d{6,7}/i), iE = t.search(/E\s*[:=]\s*\d|E\s+\d{6}/i);
    if (iN >= 0 && iE >= 0 && iN < iE) { N = grandes[0]; E = grandes[1]; } else if (E > 1000000 || (E > 900000 && N < 900000)) { [E, N] = [N, E]; }
    if (E < 100000 || E > 900000) return { erro: 'E fora do intervalo UTM (100.000 a 900.000)' };
    return { utm: { E, N, z, sul }, nome, fmt: 'UTM' }; }
  // graus decimais (com ou sem letras)
  const dec = (t.match(/[-+]?\d+(?:[.,]\d+)?\s*[NSLOEW]?/gi) || []).map(x => ({ v: num(x), h: (x.match(/[NSLOEW]/i) || [''])[0].toUpperCase() })).filter(x => isFinite(x.v));
  if (dec.length >= 2) { let [a, b] = dec; if ((ehLat(b.h) && !ehLat(a.h)) || (Math.abs(a.v) > 90 && Math.abs(b.v) <= 90) || (!a.h && !b.h && ordemBR(a.v, b.v))) [a, b] = [b, a];
    const lat = a.h ? Math.abs(a.v) * hemi(a.h) : a.v, lon = b.h ? Math.abs(b.v) * hemi(b.h) : b.v; return { lat, lon, nome, fmt: 'graus decimais' }; }
  return { erro: 'não reconheci o formato' }; }
function dist(a, b) { const R = 6371008.8, dφ = (b[0] - a[0]) * RAD, dλ = (b[1] - a[1]) * RAD; const h = Math.sin(dφ / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dλ / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); }
function rumo(a, b) { const φ1 = a[0] * RAD, φ2 = b[0] * RAD, dλ = (b[1] - a[1]) * RAD; return (Math.atan2(Math.sin(dλ) * Math.cos(φ2), Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ)) / RAD + 360) % 360; }
function cardeal(g) { return ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(g / 45) % 8]; }
function areaLL(pts) { if (pts.length < 3) return 0; const z = zonaDe(pts[0][1]), s = pts[0][0] < 0; const p = pts.map(q => utmF(q[0], q[1], z, s)); let a = 0; for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; a += p[i][0] * p[j][1] - p[j][0] * p[i][1]; } return Math.abs(a / 2); }
function compLL(pts, fechar) { let d = 0; for (let i = 1; i < pts.length; i++) d += dist(pts[i - 1], pts[i]); if (fechar && pts.length > 2) d += dist(pts[pts.length - 1], pts[0]); return d; }
/* EPSG que a empresa usa (SIRGAS 2000 / WGS 84 / SAD 69) → UTM ou geográfica */
function epsgInfo(c) {
  c = +c; if (c === 4326 || c === 4674 || c === 4989) return { geo: true };
  if (c === 4618 || c === 4291) return { geo: true, sad: true };
  if (c >= 31965 && c <= 31976) return { z: c - 31965 + 11, sul: false };
  if (c >= 31977 && c <= 31985) return { z: c - 31977 + 17, sul: true };
  if (c >= 32601 && c <= 32660) return { z: c - 32600, sul: false };
  if (c >= 32701 && c <= 32760) return { z: c - 32700, sul: true };
  if (c >= 29168 && c <= 29172) return { z: c - 29168 + 18, sul: false, sad: true };
  if (c >= 29187 && c <= 29195) return { z: c - 29187 + 17, sul: true, sad: true };
  if (c >= 29177 && c <= 29185) return { z: c - 29177 + 17, sul: true, sad: true };
  return null;
}

/* ---------------- georreferência: (lat,lon) ↔ pixel do mapa por ajuste afim em UTM ---------------- */
function ajusteAfim(P) { // P: [[E,N,x,y]] → x = aE+bN+c ; y = dE+eN+f (mínimos quadrados, centrado)
  const mE = P.reduce((s, p) => s + p[0], 0) / P.length, mN = P.reduce((s, p) => s + p[1], 0) / P.length;
  let s11 = 0, s12 = 0, s22 = 0, sx1 = 0, sx2 = 0, sy1 = 0, sy2 = 0, mx = 0, my = 0;
  for (const p of P) { mx += p[2]; my += p[3]; } mx /= P.length; my /= P.length;
  for (const p of P) { const e = p[0] - mE, n = p[1] - mN, x = p[2] - mx, y = p[3] - my; s11 += e * e; s12 += e * n; s22 += n * n; sx1 += x * e; sx2 += x * n; sy1 += y * e; sy2 += y * n; }
  const det = s11 * s22 - s12 * s12; if (!det) return null;
  const a = (sx1 * s22 - sx2 * s12) / det, b = (sx2 * s11 - sx1 * s12) / det, d = (sy1 * s22 - sy2 * s12) / det, e = (sy2 * s11 - sy1 * s12) / det;
  return [a, b, mx - a * mE - b * mN, d, e, my - d * mE - e * mN];
}
function criarGeo(pares, moldura, aviso) { // pares: [[lat,lon,x,y]] (≥3) ; moldura: [[x,y]] em pixel do mapa
  if (!pares || pares.length < 3) return null;
  const la = pares.reduce((s, p) => s + p[0], 0) / pares.length, lo = pares.reduce((s, p) => s + p[1], 0) / pares.length;
  if (!isFinite(la) || !isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  const z = zonaDe(lo), sul = la < 0; const A = ajusteAfim(pares.map(p => { const u = utmF(p[0], p[1], z, sul); return [u[0], u[1], p[2], p[3]]; }));
  if (!A) return null; const det = A[0] * A[4] - A[1] * A[3];
  const G = { z, sul, A, det, pxm: Math.sqrt(Math.abs(det)), moldura: moldura && moldura.length > 2 ? moldura : null, aviso: aviso || '' };
  G.ll2px = (lat, lon) => { const u = utmF(lat, lon, z, sul); return [A[0] * u[0] + A[1] * u[1] + A[2], A[3] * u[0] + A[4] * u[1] + A[5]]; };
  G.px2ll = (x, y) => { const X = x - A[2], Y = y - A[5]; return utmI((A[4] * X - A[1] * Y) / det, (-A[3] * X + A[0] * Y) / det, z, sul); };
  // erro do ajuste em metros (fica no "sobre o mapa")
  G.residuo = Math.max(0, ...pares.map(p => { const q = G.ll2px(p[0], p[1]); return Math.hypot(q[0] - p[2], q[1] - p[3]) / G.pxm; }));
  return G;
}
function dentro(pt, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
function distPoli(pt, poly) { let m = Infinity; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[j], b = poly[i], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); m = Math.min(m, Math.hypot(pt[0] - a[0] - t * dx, pt[1] - a[1] - t * dy)); } return m; }

/* ---------------- leitor de PDF georreferenciado (sem biblioteca: lê o dicionário do próprio arquivo) ---------------- */
function PdfCru(u8) {
  this.u8 = u8; this.s = new TextDecoder('latin1').decode(u8); this.pos = {}; this.os = {};
  const re = /(\d+)\s+(\d+)\s+obj\b/g; let m; this.lista = [];
  while ((m = re.exec(this.s))) { this.pos[+m[1]] = m.index + m[0].length; this.lista.push([m.index, +m[1]]); }
}
PdfCru.prototype.ws = function (i) { const s = this.s; for (;;) { const c = s.charCodeAt(i); if (c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 0) i++; else if (c === 37) { while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++; } else return i; } };
PdfCru.prototype.valor = function (s, i) { // devolve [valor, posição]; referência vira {r:n}
  const ws = j => { for (;;) { const c = s.charCodeAt(j); if (c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 0) j++; else if (c === 37) { while (j < s.length && s[j] !== '\n' && s[j] !== '\r') j++; } else return j; } };
  i = ws(i); const c = s[i];
  if (c === '<' && s[i + 1] === '<') { const d = {}; i += 2; for (;;) { i = ws(i); if (s[i] === '>' && s[i + 1] === '>') return [d, i + 2]; if (i >= s.length) return [d, i]; const k = this.valor(s, i); i = k[1]; const v = this.valor(s, i); i = v[1]; if (k[0] && k[0].n) d[k[0].n] = v[0]; } }
  if (c === '[') { const a = []; i++; for (;;) { i = ws(i); if (s[i] === ']') return [a, i + 1]; if (i >= s.length) return [a, i]; const v = this.valor(s, i); a.push(v[0]); i = v[1]; } }
  if (c === '(') { let d = 1, o = ''; i++; while (i < s.length && d) { const ch = s[i]; if (ch === '\\') { o += s[i + 1]; i += 2; continue; } if (ch === '(') d++; else if (ch === ')') { d--; if (!d) break; } o += ch; i++; } return [{ s: o }, i + 1]; }
  if (c === '<') { const j = s.indexOf('>', i); const hx = s.slice(i + 1, j).replace(/\s/g, ''); let o = ''; for (let k = 0; k < hx.length; k += 2) o += String.fromCharCode(parseInt(hx.substr(k, 2).padEnd(2, '0'), 16)); return [{ s: o }, j + 1]; }
  if (c === '/') { let j = i + 1; while (j < s.length && !/[\s\/\[\]<>(){}%]/.test(s[j])) j++; return [{ n: s.slice(i + 1, j) }, j]; }
  const rr = /([+-]?\d+)\s+(\d+)\s+R(?![A-Za-z])/y; rr.lastIndex = i; let m = rr.exec(s); if (m) return [{ r: +m[1] }, rr.lastIndex];
  const rn = /[+-]?(\d+\.?\d*|\.\d+)/y; rn.lastIndex = i; m = rn.exec(s); if (m) return [parseFloat(m[0]), rn.lastIndex];
  const rk = /[A-Za-z]+/y; rk.lastIndex = i; m = rk.exec(s); if (m) { const k = m[0]; return [k === 'true' ? true : k === 'false' ? false : k === 'null' ? null : { kw: k }, rk.lastIndex]; }
  return [null, i + 1];
};
PdfCru.prototype.obj = function (n) {
  if (this.pos[n] != null) return this.valor(this.s, this.pos[n])[0];
  const o = this.os[n]; if (o) return this.valor(o.txt, o.off)[0]; return null;
};
PdfCru.prototype.res = function (v) { let k = 0; while (v && v.r != null && k++ < 8) v = this.obj(v.r); return v; };
PdfCru.prototype.abrirObjStm = async function () { // PDF 1.5+: dicionários escondidos em object streams comprimidos
  const re = /\/Type\s*\/ObjStm/g; let m; const feitos = new Set();
  while ((m = re.exec(this.s))) {
    const ini = this.donoRaw(m.index); if (ini == null || feitos.has(ini.n)) continue; feitos.add(ini.n);
    try { const d = this.valor(this.s, ini.p); const dic = d[0]; let i = this.s.indexOf('stream', d[1]); if (i < 0) continue; i += 6; if (this.s[i] === '\r') i++; if (this.s[i] === '\n') i++;
      let len = typeof dic.Length === 'number' ? dic.Length : null; if (len == null) { const e = this.s.indexOf('endstream', i); len = e - i; }
      let dados = this.u8.subarray(i, i + len); const f = dic.Filter && (dic.Filter.n || (dic.Filter[0] && dic.Filter[0].n));
      if (f === 'FlateDecode') dados = await inflar(dados, 'deflate'); else if (f) continue;
      const txt = new TextDecoder('latin1').decode(dados); const N = dic.N | 0, first = dic.First | 0; const cab = txt.slice(0, first).trim().split(/\s+/).map(Number);
      for (let k = 0; k < N; k++) { const num = cab[2 * k], off = cab[2 * k + 1]; if (this.pos[num] == null) this.os[num] = { txt, off: first + off }; }
    } catch (e) {}
  }
};
PdfCru.prototype.donoRaw = function (idx) { // objeto (cru) que contém a posição idx
  let lo = 0, hi = this.lista.length - 1, r = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (this.lista[mid][0] <= idx) { r = mid; lo = mid + 1; } else hi = mid - 1; }
  if (r < 0) return null; const n = this.lista[r][1]; return { n, p: this.pos[n] };
};
PdfCru.prototype.donos = function (chave) { // números dos objetos onde aparece a chave (crus e comprimidos)
  const out = new Set(); let i = -1; while ((i = this.s.indexOf(chave, i + 1)) >= 0) { const d = this.donoRaw(i); if (d) out.add(d.n); }
  const porTxt = new Map(); for (const [n, o] of Object.entries(this.os)) { if (!porTxt.has(o.txt)) porTxt.set(o.txt, []); porTxt.get(o.txt).push([o.off, +n]); }
  for (const [txt, arr] of porTxt) { if (txt.indexOf(chave) < 0) continue; arr.sort((a, b) => a[0] - b[0]); let j = -1; while ((j = txt.indexOf(chave, j + 1)) >= 0) { let dono = null; for (const a of arr) { if (a[0] <= j) dono = a[1]; else break; } if (dono != null) out.add(dono); } }
  return [...out];
};
const nm = v => v && (v.n || v.s || '');
function numArr(v) { return Array.isArray(v) ? v.map(Number) : null; }
/* Lê a georreferência do PDF. Devolve {paginaRef, tipo, pares:[[lat,lon,xPDF,yPDF]], moldura:[[xPDF,yPDF]], aviso, bboxLL} */
async function lerGeoPDF(u8) {
  const P = new PdfCru(u8); await P.abrirObjStm();
  let melhor = null; const porPagina = {};
  // 1) ISO 32000 (QGIS, GDAL, ArcGIS, Avenza): página → /VP [ << /BBox /Measure << /Subtype /GEO /GPTS /LPTS >> >> ]
  for (const n of P.donos('/VP')) {
    const pg = P.obj(n); if (!pg || typeof pg !== 'object') continue; const vps = P.res(pg.VP); if (!Array.isArray(vps)) continue;
    const ehPagina = nm(pg.Type) === 'Page' || pg.MediaBox || pg.Contents || pg.Parent;
    for (let vp of vps) { vp = P.res(vp); if (!vp || !vp.BBox) continue; const me = P.res(vp.Measure); if (!me || nm(me.Subtype) !== 'GEO') continue;
      const bb = numArr(P.res(vp.BBox)), gp = numArr(P.res(me.GPTS)); if (!bb || !gp || gp.length < 6) continue;
      let lp = numArr(P.res(me.LPTS)) || numArr(P.res(me.Bounds)) || [0, 0, 0, 1, 1, 1, 1, 0];
      const x1 = Math.min(bb[0], bb[2]), x2 = Math.max(bb[0], bb[2]), y1 = Math.min(bb[1], bb[3]), y2 = Math.max(bb[1], bb[3]); const area = (x2 - x1) * (y2 - y1);
      let latPrim = true; for (let k = 0; k < gp.length; k += 2) if (Math.abs(gp[k]) > 90) latPrim = false;
      const pares = []; for (let k = 0; k + 1 < gp.length && k + 1 < lp.length; k += 2) { const lat = latPrim ? gp[k] : gp[k + 1], lon = latPrim ? gp[k + 1] : gp[k]; pares.push([lat, lon, x1 + lp[k] * (x2 - x1), y1 + lp[k + 1] * (y2 - y1)]); }
      const bd = numArr(P.res(me.Bounds)); const moldura = bd && bd.length >= 6 ? bd.reduce((a, v, k) => (k % 2 ? a[a.length - 1].push(y1 + v * (y2 - y1)) : a.push([x1 + v * (x2 - x1)]), a), []) : [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
      const gcs = P.res(me.GCS); const wkt = gcs ? nm(P.res(gcs.WKT)) + ' ' + (gcs.EPSG || '') : '';
      const aviso = /SAD.?69|South_American_1969|4618|291\d\d/i.test(wkt) ? 'Mapa em SAD 69: o ponto azul pode ficar uns 60 m deslocado.' : '';
      if (pares.length >= 3 && ehPagina && (!porPagina[n] || area > porPagina[n].area)) porPagina[n] = { paginaRef: n, tipo: 'ISO 32000', pares, moldura, aviso, area };
      if (pares.length >= 3 && (!melhor || area > melhor.area)) melhor = { paginaRef: ehPagina ? n : null, tipo: 'ISO 32000', pares, moldura, aviso, area };
    }
  }
  // 2) OGC GeoPDF (LGIDict) — ArcGIS antigo e TerraGo
  if (!melhor) for (const n of P.donos('/LGIDict')) {
    const dono = P.obj(n); if (!dono) continue; let lg = P.res(dono.LGIDict); if (!lg) continue; if (!Array.isArray(lg)) lg = [lg];
    const ehPagina = nm(dono.Type) === 'Page' || dono.MediaBox || dono.Contents;
    for (let L of lg) { L = P.res(L); if (!L) continue; const pr = P.res(L.Projection) || {}; const tipo = nm(pr.ProjectionType).toUpperCase();
      let z = +(P.res(pr.Zone) || 0), sul = /S/i.test(nm(pr.Hemisphere)); const datum = nm(P.res(pr.Datum)); const sad = /SAI|SAD|S69/i.test(datum);
      const conv = (X, Y) => { if (tipo === 'UT' && z) return utmI(X, Y, z, sul); if (tipo === 'GEOGRAPHIC') return (Math.abs(X) <= 90 && Math.abs(Y) > 90) ? [X, Y] : [Y, X]; return null; };
      let reg = P.res(L.Registration); const nl = numArr(P.res(L.Neatline)); let pares = [];
      if (Array.isArray(reg)) for (let r of reg) { r = numArr(P.res(r)); if (r && r.length >= 4) { const ll = conv(r[2], r[3]); if (ll) pares.push([ll[0], ll[1], r[0], r[1]]); } }
      const ctm = numArr(P.res(L.CTM));
      if (pares.length < 3 && ctm && ctm.length === 6) { const cant = nl && nl.length >= 6 ? [[nl[0], nl[1]], [nl[2], nl[3]], [nl[4], nl[5]]] : [[0, 0], [600, 0], [0, 800]];
        pares = cant.map(([x, y]) => { const ll = conv(ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]); return ll ? [ll[0], ll[1], x, y] : null; }).filter(Boolean); }
      if (pares.length < 3) continue; const moldura = nl && nl.length >= 6 ? nl.reduce((a, v, k) => (k % 2 ? a[a.length - 1].push(v) : a.push([v]), a), []) : null;
      melhor = { paginaRef: ehPagina ? n : null, tipo: 'OGC', pares, moldura, aviso: sad ? 'Mapa em SAD 69: o ponto azul pode ficar uns 60 m deslocado.' : '' }; break;
    }
  }
  if (!melhor) return null; melhor.bboxLL = bboxDe(melhor.pares.map(p => [p[0], p[1]])); melhor.porPagina = porPagina; return melhor;
}
function bboxDe(ll) { const la = ll.map(p => p[0]), lo = ll.map(p => p[1]); return [Math.min(...la), Math.min(...lo), Math.max(...la), Math.max(...lo)]; }

/* ---------------- KML / KMZ / GPX ---------------- */
async function unzip(u8) { // leitor de .zip mínimo (KMZ)
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let e = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('KMZ corrompido'); const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = {};
  for (let k = 0; k < n; k++) { if (dv.getUint32(p, true) !== 0x02014b50) break; const met = dv.getUint16(p + 10, true), cs = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const nome = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
    const ini = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true); const dados = u8.subarray(ini, ini + cs);
    out[nome] = () => met === 0 ? Promise.resolve(dados) : inflar(dados, 'deflate-raw'); }
  return out;
}
/* ---------------- SHAPEFILE (.zip com .shp + .dbf + .prj) ---------------- */
function lerSHP(shpU8, dbfU8, prjTxt, cpg) {
  const dv = new DataView(shpU8.buffer, shpU8.byteOffset, shpU8.byteLength); if (dv.getInt32(0) !== 9994) throw new Error('arquivo .shp inválido');
  // registros da tabela (.dbf)
  let linhas = [], campos = [];
  if (dbfU8) { const d = new DataView(dbfU8.buffer, dbfU8.byteOffset, dbfU8.byteLength); const nr = d.getUint32(4, true), hl = d.getUint16(8, true), rl = d.getUint16(10, true);
    const dec = new TextDecoder(/utf/i.test(cpg || '') ? 'utf-8' : 'windows-1252');
    for (let o = 32; o < hl - 1 && dbfU8[o] !== 0x0D; o += 32) { let nome = ''; for (let k = 0; k < 11 && dbfU8[o + k]; k++) nome += String.fromCharCode(dbfU8[o + k]); campos.push({ nome, tipo: String.fromCharCode(dbfU8[o + 11]), len: dbfU8[o + 16] }); }
    for (let r = 0; r < nr; r++) { let o = hl + r * rl; if (dbfU8[o] === 0x2A) { linhas.push(null); continue; } o++; const reg = {}; for (const c of campos) { reg[c.nome] = dec.decode(dbfU8.subarray(o, o + c.len)).trim(); o += c.len; } linhas.push(reg); } }
  const cNome = campos.find(c => /^(nome|name|denomina|label|rotulo|r[oó]tulo|id|ident|codigo|c[oó]d)/i.test(c.nome) && c.tipo === 'C') || campos.find(c => c.tipo === 'C');
  // projeção (.prj)
  const prj = String(prjTxt || ''); let conv, aviso = '';
  const sad = /SAD.?69|South_American_1969/i.test(prj); const mz = /zone[_ ]?(\d{1,2})\s*([NS])/i.exec(prj) || /UTM[_ ]?(\d{1,2})([NS])/i.exec(prj);
  if (mz) { const z = +mz[1], sul = /S/i.test(mz[2]); conv = (x, y) => { const ll = sad ? utmIe(x, y, z, sul, 6378160, 1 / 298.25) : utmI(x, y, z, sul); return sad ? sad69ParaSirgas(ll[0], ll[1]) : ll; }; }
  else if (/PROJCS/i.test(prj)) throw new Error('projeção do shapefile não reconhecida (use UTM ou geográficas)');
  else conv = (x, y) => { if (Math.abs(x) <= 180 && Math.abs(y) <= 90) return sad ? sad69ParaSirgas(y, x) : [y, x]; aviso = 'sem .prj: considerei UTM 20N SIRGAS 2000'; return utmI(x, y, 20, false); };
  const feicoes = []; let o = 100, i = 0;
  while (o + 8 <= shpU8.byteLength) { const len = dv.getInt32(o + 4) * 2; const c = o + 8; o = c + len; const tipo = dv.getInt32(c, true); const reg = linhas[i++]; if (reg === null) continue;
    const nome = reg && cNome ? reg[cNome.nome] : ''; const desc = reg ? campos.filter(k => k !== cNome && reg[k.nome]).slice(0, 8).map(k => `${k.nome}: ${reg[k.nome]}`).join(' · ') : '';
    const base = tipo % 10; if (tipo === 0) continue;
    if (base === 1) { feicoes.push({ tipo: 'ponto', nome, desc, c: [conv(dv.getFloat64(c + 4, true), dv.getFloat64(c + 12, true))] }); continue; }
    if (base === 8) { const n = dv.getInt32(c + 36, true); for (let k = 0; k < n; k++) feicoes.push({ tipo: 'ponto', nome, desc, c: [conv(dv.getFloat64(c + 40 + k * 16, true), dv.getFloat64(c + 48 + k * 16, true))] }); continue; }
    if (base === 3 || base === 5) { const np = dv.getInt32(c + 36, true), nPts = dv.getInt32(c + 40, true), pi = c + 44, pt = pi + np * 4;
      for (let k = 0; k < np; k++) { const a = dv.getInt32(pi + k * 4, true), b = k + 1 < np ? dv.getInt32(pi + (k + 1) * 4, true) : nPts; const cc = [];
        for (let j = a; j < b; j++) cc.push(conv(dv.getFloat64(pt + j * 16, true), dv.getFloat64(pt + j * 16 + 8, true)));
        if (cc.length > 1) feicoes.push({ tipo: base === 5 ? 'area' : 'linha', nome: nome + (np > 1 ? ` (${k + 1})` : ''), desc, c: cc }); } } }
  return { feicoes, sobre: [], fmt: 'Shapefile', aviso }; }
function corKML(t, preench) { t = String(t || '').trim(); if (!/^[0-9a-f]{8}$/i.test(t)) return null; const a = parseInt(t.slice(0, 2), 16) / 255;
  const al = preench ? Math.min(.14, a) : Math.max(.6, a); /* contorno forte; preenchimento quase transparente para não esconder a imagem do mapa */
  return `rgba(${parseInt(t.slice(6, 8), 16)},${parseInt(t.slice(4, 6), 16)},${parseInt(t.slice(2, 4), 16)},${al.toFixed(2)})`; }
function coordsKML(t) { return String(t || '').trim().split(/\s+/).map(c => c.split(',').map(Number)).filter(c => c.length >= 2 && isFinite(c[0]) && isFinite(c[1])).map(c => [c[1], c[0]]); }
async function lerKML(txt, arquivos) {
  const doc = new DOMParser().parseFromString(txt, 'application/xml'); const tag = (el, n) => [...el.getElementsByTagName(n)];
  const filho = (el, n) => { const x = el.getElementsByTagName(n)[0]; return x ? x.textContent.trim() : ''; };
  const estilos = {}; for (const s of tag(doc, 'Style')) { const id = s.getAttribute('id'); if (!id) continue; const ls = s.getElementsByTagName('LineStyle')[0], ps = s.getElementsByTagName('PolyStyle')[0]; estilos[id] = { linha: ls && corKML(filho(ls, 'color')), area: ps && (filho(ps, 'fill') === '0' ? 'rgba(0,0,0,0)' : corKML(filho(ps, 'color'), true)) }; }
  for (const m of tag(doc, 'StyleMap')) { const id = m.getAttribute('id'); const p = tag(m, 'Pair').find(x => filho(x, 'key') === 'normal'); if (id && p) estilos[id] = estilos[filho(p, 'styleUrl').replace('#', '')] || null; }
  const feicoes = [];
  for (const pm of tag(doc, 'Placemark')) { const nome = filho(pm, 'name'); const desc = (pm.getElementsByTagName('description')[0] || {}).textContent || '';
    const st = estilos[filho(pm, 'styleUrl').replace('#', '')] || {}; const inl = pm.getElementsByTagName('Style')[0]; let cor = st.linha, corA = st.area;
    if (inl) { const ls = inl.getElementsByTagName('LineStyle')[0], ps = inl.getElementsByTagName('PolyStyle')[0]; if (ls) cor = corKML(filho(ls, 'color')) || cor; if (ps) corA = (filho(ps, 'fill') === '0' ? 'rgba(0,0,0,0)' : corKML(filho(ps, 'color'), true)) || corA; }
    for (const g of tag(pm, 'Point')) feicoes.push({ tipo: 'ponto', nome, desc, c: coordsKML(filho(g, 'coordinates')) });
    for (const g of tag(pm, 'LineString')) feicoes.push({ tipo: 'linha', nome, desc, c: coordsKML(filho(g, 'coordinates')), cor });
    for (const g of tag(pm, 'Polygon')) { const ob = g.getElementsByTagName('outerBoundaryIs')[0] || g; feicoes.push({ tipo: 'area', nome, desc, c: coordsKML(filho(ob, 'coordinates')), cor, corA }); }
    for (const g of tag(pm, 'gx:Track')) feicoes.push({ tipo: 'linha', nome, desc, c: tag(g, 'gx:coord').map(x => x.textContent.trim().split(/\s+/).map(Number)).map(v => [v[1], v[0]]), cor });
  }
  const sobre = [];
  for (const go of tag(doc, 'GroundOverlay')) { const href = filho(go.getElementsByTagName('Icon')[0] || go, 'href'); let cantos = null;
    const q = go.getElementsByTagName('gx:LatLonQuad')[0];
    if (q) { const c = coordsKML(filho(q, 'coordinates')); if (c.length === 4) cantos = [c[3], c[2], c[1], c[0]]; } // LL,LR,UR,UL → UL,UR,LR,LL
    else { const b = go.getElementsByTagName('LatLonBox')[0]; if (b) { const N = +filho(b, 'north'), S = +filho(b, 'south'), E = +filho(b, 'east'), W = +filho(b, 'west'), r = +(filho(b, 'rotation') || 0) * RAD;
      const cl = (N + S) / 2, co = (E + W) / 2, k = Math.cos(cl * RAD); const rot = (la, lo) => { const x = (lo - co) * k, y = la - cl; return [cl + x * Math.sin(r) + y * Math.cos(r), co + (x * Math.cos(r) - y * Math.sin(r)) / k]; };
      cantos = [rot(N, W), rot(N, E), rot(S, E), rot(S, W)]; } }
    if (!cantos || !href) continue; const chave = Object.keys(arquivos || {}).find(k => k === href || k.endsWith('/' + href) || href.endsWith(k));
    if (chave) sobre.push({ nome: filho(go, 'name'), cantos, arq: chave, mime: /\.png$/i.test(chave) ? 'image/png' : 'image/jpeg' });
  }
  return { feicoes: feicoes.filter(f => f.c.length), sobre };
}
function lerGPX(txt) {
  const doc = new DOMParser().parseFromString(txt, 'application/xml'); const tag = (el, n) => [...el.getElementsByTagName(n)]; const pt = e => [+e.getAttribute('lat'), +e.getAttribute('lon')];
  const nomeDe = e => { const n = [...e.children].find(c => c.tagName === 'name'); return n ? n.textContent.trim() : ''; };
  const f = []; for (const w of tag(doc, 'wpt')) f.push({ tipo: 'ponto', nome: nomeDe(w), c: [pt(w)] });
  for (const t of tag(doc, 'trk')) for (const s of tag(t, 'trkseg')) f.push({ tipo: 'linha', nome: nomeDe(t), c: tag(s, 'trkpt').map(pt) });
  for (const r of tag(doc, 'rte')) f.push({ tipo: 'linha', nome: nomeDe(r), c: tag(r, 'rtept').map(pt) });
  return { feicoes: f.filter(x => x.c.length), sobre: [] };
}

/* ---------------- tipo do arquivo e análise rápida (para a lista) ---------------- */
function tipoDe(nome, u8) {
  const h = String.fromCharCode(...u8.subarray(0, 5)); if (h.startsWith('%PDF')) return 'pdf';
  if ((u8[0] === 0x49 && u8[1] === 0x49) || (u8[0] === 0x4d && u8[1] === 0x4d)) return 'tif';
  if (u8[0] === 0x50 && u8[1] === 0x4b) return 'kmz';
  const t = new TextDecoder().decode(u8.subarray(0, 600)); if (/<gpx/i.test(t)) return 'gpx'; if (/<kml/i.test(t)) return 'kml';
  const m = /\.(pdf|tif|tiff|kml|kmz|gpx)$/i.exec(nome || ''); return m ? m[1].toLowerCase().replace('tiff', 'tif') : null;
}
async function vetorDe(tipo, u8) { // KML/KMZ/GPX → {feicoes, sobre, arquivos}
  if (tipo === 'gpx') return lerGPX(new TextDecoder().decode(u8));
  if (tipo === 'kml') return lerKML(new TextDecoder().decode(u8), {});
  const z = await unzip(u8); const k = Object.keys(z).find(n => /\.kml$/i.test(n));
  if (!k) { const sh = Object.keys(z).find(n => /\.shp$/i.test(n)); if (!sh) throw new Error('o .zip não tem KML nem shapefile (.shp)'); const base = sh.replace(/\.shp$/i, ''), ach = ext => Object.keys(z).find(n => n.toLowerCase() === (base + ext).toLowerCase());
    const dec = new TextDecoder(); return lerSHP(await z[sh](), ach('.dbf') ? await z[ach('.dbf')]() : null, ach('.prj') ? dec.decode(await z[ach('.prj')]()) : '', ach('.cpg') ? dec.decode(await z[ach('.cpg')]()) : ''); }
  const r = await lerKML(new TextDecoder().decode(await z[k]()), z); r.arquivos = z; return r;
}
async function analisar(nome, blob) { // o que a lista precisa saber sem abrir o mapa
  const u8 = new Uint8Array(await blob.arrayBuffer()); const tipo = tipoDe(nome, u8); const r = { tipo, geo: false, bboxLL: null, resumo: '' };
  try {
    if (tipo === 'pdf') { const g = await lerGeoPDF(u8); if (g) { r.geo = true; r.bboxLL = g.bboxLL; r.resumo = 'PDF georreferenciado'; r.aviso = g.aviso; } else r.resumo = 'PDF sem georreferência (só para ver)'; }
    else if (tipo === 'tif') { const G = await geotiff(); const t = await G.fromArrayBuffer(u8.buffer); const im = await t.getImage(); const gg = geoTif(im); if (gg) { r.geo = true; r.bboxLL = bboxDe(gg.pares.map(p => [p[0], p[1]])); r.resumo = 'GeoTIFF'; r.aviso = gg.aviso; } else r.resumo = 'TIFF sem georreferência'; }
    else if (tipo === 'kml' || tipo === 'kmz' || tipo === 'gpx') { const v = await vetorDe(tipo, u8); const ll = v.feicoes.flatMap(f => f.c).concat(v.sobre.flatMap(s => s.cantos)); if (ll.length) { r.geo = true; r.bboxLL = bboxDe(ll); }
      r.resumo = `${v.fmt || tipo.toUpperCase()} · ${v.feicoes.length} feiç${v.feicoes.length === 1 ? 'ão' : 'ões'}${v.sobre.length ? ' + imagem' : ''}${v.aviso ? ' · ' + v.aviso : ''}`; r.camada = !v.sobre.length; }
    else r.resumo = 'formato não reconhecido';
  } catch (e) { r.resumo = 'não consegui ler: ' + (e.message || e); }
  return r;
}
function geoTif(im) {
  const k = im.getGeoKeys() || {}; const W = im.getWidth(), H = im.getHeight(); let o, rs;
  try { o = im.getOrigin(); rs = im.getResolution(); } catch (e) { return null; }
  const info = epsgInfo(k.ProjectedCSTypeGeoKey || k.GeographicTypeGeoKey || 0); if (!info) return null;
  const cant = [[0, 0], [W, 0], [W, H], [0, H]]; const pares = cant.map(([x, y]) => { const X = o[0] + x * rs[0], Y = o[1] + y * rs[1]; const ll = info.geo ? [Y, X] : utmI(X, Y, info.z, info.sul); return [ll[0], ll[1], x, y]; });
  return { pares, moldura: cant, aviso: info.sad ? 'Mapa em SAD 69: o ponto azul pode ficar uns 60 m deslocado.' : '' };
}

/* ---------------- robô de campo: lista e baixa os mapas da pasta da obra ---------------- */
function urlRobo(q) { const c = APP() && APP().cfg; if (!c || !c.script) return null; return c.script + '?' + new URLSearchParams(Object.assign({ token: c.token, _: Date.now() }, q)); }
const BAIX = {}; // fileId → {pct, erro}
async function listarDrive(ob) {
  const u = urlRobo({ acao: 'mapas', pasta: ob.pastaId }); if (!u) throw new Error('robô não configurado');
  const j = await fetch(u).then(r => r.json()); if (!j || !j.ok) throw new Error(j && j.erro || 'robô sem resposta');
  if (!Array.isArray(j.mapas)) throw new Error('o Robô de Campo ainda não sabe listar mapas (precisa da versão nova)');
  const base = n => n.replace(/_Geo(PDF|TIFF)\.(pdf|tiff?)$/i, '').toUpperCase();
  const pdfs = new Set(j.mapas.filter(m => /_GeoPDF\.pdf$/i.test(m.nome)).map(m => base(m.nome)));
  const lista = j.mapas.filter(m => EXT_OK.test(m.nome || '') && !(/_GeoTIFF\.tiff?$/i.test(m.nome) && pdfs.has(base(m.nome)))); LSx.set('mapasDrive_' + ob.id, { em: new Date().toISOString(), lista }); return lista;
}
async function baixar(ob, it, aoProgresso) {
  BAIX[it.id] = { pct: 0 }; aoProgresso && aoProgresso();
  try {
    const partes = []; let total = 1, recebido = 0;
    for (let p = 0; p < total; p++) {
      let j = null; for (let tent = 0; tent < 3 && !j; tent++) { try { const r = await fetch(urlRobo({ acao: 'mapa', id: it.id, pasta: ob.pastaId, parte: p })); j = await r.json(); if (!j.ok) throw new Error(j.erro || 'falhou'); } catch (e) { j = null; if (tent === 2) throw e; await new Promise(ok => setTimeout(ok, 1500)); } }
      total = j.partes || 1; const bin = atob(j.b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      partes.push(u8); recebido += u8.length; BAIX[it.id].pct = Math.round(100 * (p + 1) / total); aoProgresso && aoProgresso();
    }
    const blob = new Blob(partes, { type: it.mime || 'application/octet-stream' }); const an = await analisar(it.nome, blob);
    await MDB.put('mapas', Object.assign({ id: 'd_' + it.id, obraId: ob.id, nome: it.nome, origem: 'drive', fileId: it.id, modificado: it.modificado || '', tamanho: blob.size, blob, caminho: it.caminho || '', criadoEm: new Date().toISOString() }, an));
    delete BAIX[it.id]; aoProgresso && aoProgresso(); return true;
  } catch (e) { BAIX[it.id] = { erro: String(e.message || e) }; aoProgresso && aoProgresso(); return false; }
}
const LSx = { get: (k, d) => (LSapp() ? LSapp().get(k, d) : d), set: (k, v) => { if (LSapp()) LSapp().set(k, v); } };
let sincronizando = {};
async function sincronizar(ob, opt = {}) { // ao abrir a obra com internet: lista o Drive e baixa o que falta (até 40 MB cada)
  if (!ob || !ob.pastaId || !navigator.onLine || sincronizando[ob.id]) return; sincronizando[ob.id] = true;
  try {
    let lista; try { lista = await listarDrive(ob); } catch (e) { if (!opt.silencioso) toast('Mapas: ' + e.message, 4000); return; }
    const locais = await MDB.obra('mapas', ob.id);
    for (const it of lista) { const l = locais.find(x => x.fileId === it.id); if (l && (l.modificado || '') === (it.modificado || '')) continue;
      if (!opt.tudo && (it.tamanho || 0) > LIMITE_AUTO) continue; await baixar(ob, it, () => pintarLista(ob)); }
  } finally { delete sincronizando[ob.id]; pintarLista(ob); }
}

/* ---------------- aba "Mapas" da obra ---------------- */
let OB_ATUAL = null;
function tela(ob) {
  OB_ATUAL = ob;
  return `<div class="card"><h2>Mapas da obra</h2><div class="nota">Abrem <b>sem internet</b>. Toque no mapa para navegar com o GPS: ponto azul, pinos, trilha, ir até um ponto e medir.</div>
  <div id="mpPronto"></div>
  <div id="mpLista"><div class="muted">Carregando…</div></div>
  <div class="row" style="margin-top:10px"><button class="sec" id="mpAtualizar">Buscar no Drive</button><button class="sec" id="mpImportar">Mapa do celular</button></div>
  <input type="file" id="mpArq" accept=".pdf,.tif,.tiff,.kml,.kmz,.gpx,.zip,application/zip,application/pdf,image/tiff,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,application/gpx+xml" multiple style="display:none">
  <div class="nota">Formatos: PDF georreferenciado (como o do Avenza), GeoTIFF, KML/KMZ do Google Earth, GPX e Shapefile (.zip). Mapa que chegou por WhatsApp: salve no celular e toque em "Mapa do celular".</div></div>
  <div class="card"><h2>Pinos, trilhas e medições desta obra</h2><div class="nota">Tudo que você marca é guardado na hora no celular e vai sozinho para o Drive da obra.</div><div id="mpMarcas"><div class="muted">Carregando…</div></div></div>`;
}
function ligar(ob) {
  cssUmaVez(); OB_ATUAL = ob; pintarLista(ob);
  $('#mpAtualizar').onclick = async () => { if (!navigator.onLine) return toast('Sem internet agora. Os mapas que já estão no celular continuam abrindo.'); if (!ob.pastaId) return toast('Esta obra ainda não tem pasta no Drive. Avise o escritório.', 4000);
    toast('Procurando mapas na pasta da obra…'); await sincronizar(ob, { tudo: false }); };
  $('#mpImportar').onclick = () => $('#mpArq').click();
  $('#mpArq').onchange = async e => { const fs = [...e.target.files]; e.target.value = ''; for (const f of fs) await importar(ob, f); pintarLista(ob); };
}
async function importar(ob, f) {
  if (/\.(shp|dbf|shx|prj)$/i.test(f.name)) return toast('Shapefile: mande o .zip com .shp, .dbf e .prj juntos.', 4500);
  const an = await analisar(f.name, f); if (!an.tipo) return toast(`${f.name}: formato não reconhecido`, 3500);
  await MDB.put('mapas', Object.assign({ id: uid('c_'), obraId: ob.id, nome: f.name, origem: 'celular', tamanho: f.size, blob: f, criadoEm: new Date().toISOString() }, an));
  toast(an.geo ? `${f.name}: pronto para usar ✓` : `${f.name}: guardado, mas ${an.resumo}`, 3500);
}
function posAgora() { return window.posFresca ? posFresca(120000) : null; }
function rotuloLonge(bb) { const p = posAgora(); if (!p || !bb) return ''; if (p.lat >= bb[0] && p.lat <= bb[2] && p.lon >= bb[1] && p.lon <= bb[3]) return '<span class="chip g">você está aqui dentro</span>';
  const c = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2]; return `<span class="chip">a ${fmtDist(dist([p.lat, p.lon], c))} ${cardeal(rumo([p.lat, p.lon], c))}</span>`; }
async function pintarLista(ob) {
  const el = $('#mpLista'); if (!el || !OB_ATUAL || OB_ATUAL.id !== ob.id) return;
  const ordem = m => (m.camada ? 2 : m.geo ? 0 : 1);
  const locais = (await MDB.obra('mapas', ob.id)).sort((a, b) => ordem(a) - ordem(b) || a.nome.localeCompare(b.nome));
  const dr = LSx.get('mapasDrive_' + ob.id, null); const doDrive = (dr && dr.lista) || [];
  const falta = doDrive.filter(it => !locais.some(l => l.fileId === it.id && (l.modificado || '') === (it.modificado || '')));
  let h = '';
  for (const m of locais) { const atual = !m.fileId || !doDrive.length || doDrive.some(d => d.id === m.fileId);
    h += `<div class="mpItem"><button class="obra mpAbrir" data-id="${esc(m.id)}" style="margin:0"><b>🗺 ${esc(m.nome.replace(/\.[^.]+$/, ''))}</b><small>${esc(m.resumo || '')} · ${fmtTam(m.tamanho || 0)}${m.origem === 'celular' ? ' · trazido do celular' : ''}</small>
      <div style="margin-top:6px"><span class="chip g">no celular ✓</span>${m.geo ? rotuloLonge(m.bboxLL) : '<span class="chip w">sem GPS neste mapa</span>'}${m.camada ? '<span class="chip">aparece por cima dos outros mapas</span>' : ''}${atual ? '' : '<span class="chip w">saiu do Drive</span>'}</div></button>
      <div class="mpAcoes">${m.camada || m.tipo === 'kml' || m.tipo === 'kmz' || m.tipo === 'gpx' ? `<button class="mpGps" data-id="${esc(m.id)}">🛰 Para GPS</button>` : ''}<button class="mpShare" data-id="${esc(m.id)}">⤴ Compartilhar</button><button class="mpTirar" data-id="${esc(m.id)}">✕ Tirar</button></div></div>`; }
  for (const it of falta) { const b = BAIX[it.id];
    h += `<div class="mpItem"><button class="obra mpBaixar" data-id="${esc(it.id)}" style="margin:0;border-radius:var(--r)"><b>☁ ${esc(it.nome.replace(/\.[^.]+$/, ''))}</b><small>${esc(it.caminho || 'Drive da obra')} · ${fmtTam(it.tamanho || 0)}</small>
      <div style="margin-top:6px">${b && b.pct != null ? `<span class="chip">baixando ${b.pct}%</span>` : b && b.erro ? `<span class="chip e">falhou: ${esc(b.erro)} — toque para tentar</span>` : `<span class="chip w">${navigator.onLine ? 'toque para baixar' : 'baixa quando tiver internet'}</span>`}</div></button></div>`; }
  if (!h) h = `<div class="muted" style="margin:8px 0">${ob.pastaId ? (dr ? 'Nenhum mapa na pasta desta obra no Drive.' : (navigator.onLine ? 'Procurando mapas na pasta da obra…' : 'Ainda não baixei os mapas desta obra. Abra a obra uma vez com internet (no escritório) que eles descem sozinhos.')) : 'Esta obra ainda não tem pasta no Drive.'} Se recebeu o mapa por outro meio, use "Mapa do celular".</div>`;
  pintarPronto(ob, locais, falta);
  if (dr) h += `<div class="nota">Drive conferido em ${window.fmtData ? fmtData(dr.em) : dr.em}.</div>`;
  el.innerHTML = h;
  el.querySelectorAll('.mpAbrir').forEach(b => b.onclick = () => abrir(ob, b.dataset.id));
  el.querySelectorAll('.mpGps').forEach(b => b.onclick = async () => { const m = await MDB.get('mapas', b.dataset.id); if (m) mapaParaGPS(m); });
  el.querySelectorAll('.mpShare').forEach(b => b.onclick = async () => { const m = await MDB.get('mapas', b.dataset.id); if (m) compartilharMapa(m); });
  el.querySelectorAll('.mpTirar').forEach(b => b.onclick = async () => { const m = await MDB.get('mapas', b.dataset.id); if (!m) return;
    if (m.origem === 'celular' && !confirm(`"${m.nome}" veio deste celular e não está no Drive. Tirar mesmo assim?`)) return;
    await MDB.del('mapas', m.id); toast(m.origem === 'drive' ? 'Tirado do celular. Continua no Drive da obra.' : 'Tirado do celular.'); pintarLista(ob); });
  el.querySelectorAll('.mpBaixar').forEach(b => b.onclick = async () => { if (!navigator.onLine) return toast('Sem internet agora. Baixa quando tiver sinal.'); const it = falta.find(x => x.id === b.dataset.id); if (it && !BAIX[it.id]?.pct) { await baixar(ob, it, () => pintarLista(ob)); } });
  pintarMarcas(ob);
}
async function libsNoCelular() { // leitores de PDF/GeoTIFF guardados pelo service worker para abrir sem internet
  try { const c = await caches.open('campo-libs'); const r = await Promise.all([LIB.pdf, LIB.pdfw, LIB.tif].map(u => c.match(u))); return r.every(Boolean); } catch (e) { return false; } }
async function pintarPronto(ob, locais, falta) {
  const el = $('#mpPronto'); if (!el) return; const precisaLib = locais.some(m => m.tipo === 'pdf' || m.tipo === 'tif'); const libs = !precisaLib || await libsNoCelular();
  const dr = LSx.get('mapasDrive_' + ob.id, null); const baixando = falta.some(it => BAIX[it.id] && BAIX[it.id].pct != null);
  let cls = 'g', txt;
  if (!locais.length && !falta.length) { el.innerHTML = ''; return; }
  if (!falta.length && libs && dr) txt = `✓ Pronto para o campo sem internet: ${locais.length} mapa${locais.length === 1 ? '' : 's'} no celular.`;
  else { cls = 'w'; txt = baixando ? 'Baixando os mapas… deixe o app aberto com internet.' : falta.length ? `Faltam ${falta.length} mapa${falta.length === 1 ? '' : 's'} no celular. Baixe antes de sair da internet.` : !libs ? 'Falta guardar o leitor de mapas. Abra o app com internet uma vez.' : 'Confira o Drive antes de sair da internet.'; }
  const tam = falta.reduce((a, it) => a + (it.tamanho || 0), 0);
  el.innerHTML = `<div class="${cls === 'g' ? 'mpOk' : 'mpAv'}">${esc(txt)}${falta.length && navigator.onLine && !baixando ? `<button class="green" id="mpTudo" style="width:100%;margin-top:8px">Baixar tudo desta obra (${fmtTam(tam)})</button>` : ''}</div>`;
  const b = $('#mpTudo'); if (b) b.onclick = async () => { b.disabled = true; b.textContent = 'Baixando…'; for (const it of falta) await baixar(ob, it, () => pintarLista(ob)); pintarLista(ob); };
}
async function pintarMarcas(ob) {
  const el = $('#mpMarcas'); if (!el) return; const ms = (await MDB.obra('marcas', ob.id)).sort((a, b) => a.criadoEm < b.criadoEm ? 1 : -1); const p = posAgora();
  const shBtn = m => `<button class="ghost" data-shm="${esc(m.id)}" style="padding:6px 10px;font-size:18px" aria-label="Compartilhar">⤴</button>`;
  if (!ms.length) { el.innerHTML = '<div class="muted">Nenhum ainda. Dentro do mapa: 📍 Marcar guarda o ponto onde você está; ⏺ Trilha grava o caminho. Tudo sobe para o Drive da obra em KML.</div>'; return; }
  el.innerHTML = ms.map(m => m.tipo === 'pino'
    ? `<div class="chk" style="align-items:center"><span>📍</span><span style="flex:1"><b>${esc(m.nome)}</b><br><small class="muted">${esc(window.fmtCoordCurta ? fmtCoordCurta({ lat: m.lat, lon: m.lon }, APP() ? APP().fmt : 'utm') : m.lat + ',' + m.lon)}${p ? ' · a ' + fmtDist(dist([p.lat, p.lon], [m.lat, m.lon])) : ''} · ${m.enviado ? 'na fila / no Drive ✓' : 'vai para o Drive sozinho'}</small></span>${shBtn(m)}</div>`
    : `<div class="chk" style="align-items:center"><span>${m.tipo === 'medida' ? '📏' : '〰'}</span><span style="flex:1"><b>${esc(m.nome)}</b><br><small class="muted">${fmtCompM(m.comp || compLL(m.pts))}${m.area ? ' · ' + fmtArea(m.area) : ''} · ${m.pts.length} pontos · ${m.enviado ? 'na fila / no Drive ✓' : 'vai para o Drive sozinho'}</small></span>${shBtn(m)}</div>`).join('') +
    `<div class="row" style="margin-top:8px"><button class="sec" id="mpShareTudo">⤴ Compartilhar (KML)</button><button class="sec" id="mpGpsTudo">🛰 Para GPS</button></div>`;
  el.querySelectorAll('[data-shm]').forEach(b => b.onclick = () => { const m = ms.find(x => x.id === b.dataset.shm); if (m) compartilharMarcas(ob, [m], m.nome); });
  const gt = $('#mpGpsTudo'); if (gt) gt.onclick = () => paraGPS('Marcacoes ' + ob.nome, ms.filter(m => m.tipo === 'pino' || (m.pts && m.pts.length > 1)));
  const st = $('#mpShareTudo'); if (st) st.onclick = () => compartilharMarcas(ob, ms.filter(m => m.tipo === 'pino' || (m.pts && m.pts.length > 1)), 'Marcações de campo');
}

/* ============================================================
   VISUALIZADOR (o "Avenza" do app)
   ============================================================ */
const V = { aberto: false };
function cssUmaVez() {
  if ($('#mpvCss')) return; const st = document.createElement('style'); st.id = 'mpvCss';
  st.textContent = `.mpOk{background:var(--ok-bg);color:var(--green-2);border-radius:10px;padding:10px 12px;font-weight:700;margin:8px 0}.mpAv{background:var(--warn-bg);color:var(--warn);border-radius:10px;padding:10px 12px;font-weight:700;margin:8px 0}
.mpItem{margin-bottom:12px}.mpItem .obra{width:100%;min-width:0;margin:0;border-bottom-left-radius:0;border-bottom-right-radius:0}.mpItem .obra b{overflow-wrap:anywhere}
.mpAcoes{display:flex;border:1.5px solid var(--line);border-top:0;border-radius:0 0 var(--r) var(--r);overflow:hidden;background:#F7F9FB}.mpAcoes button{flex:1;background:transparent;color:var(--navy);border-radius:0;padding:10px 4px;font-size:13px;font-weight:700}.mpAcoes button+button{border-left:1px solid var(--line)}.mpAcoes .mpTirar{color:var(--muted);flex:.7}
#mpv{position:fixed;inset:0;z-index:9000;background:#E9EDF2;display:flex;flex-direction:column;touch-action:none;user-select:none;-webkit-user-select:none}
#mpv .mt{background:var(--navy);color:#fff;padding:calc(8px + var(--sat)) 10px 8px;display:flex;gap:8px;align-items:center;flex:none}
#mpv .mt b{flex:1;min-width:0;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#mpv .mt button{background:rgba(255,255,255,.16);padding:8px 12px;font-size:14px}
#mpv .pgs{flex:none;display:flex;align-items:center;gap:10px;justify-content:center;background:#E8F1FA;padding:6px}#mpv .pgs button{padding:8px 18px;background:var(--navy)}#mpv .pgs span{font-weight:700;color:var(--navy);min-width:150px;text-align:center}
#mpv .mc{position:relative;flex:1;min-height:0;overflow:hidden}#mpv canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
#mpv .av{position:absolute;left:10px;right:10px;top:10px;background:rgba(17,62,107,.92);color:#fff;border-radius:12px;padding:9px 12px;font-size:14px;display:none}#mpv .av.on{display:block}#mpv .av.w{background:rgba(180,83,9,.94)}
#mpv .nav{position:absolute;left:10px;right:10px;top:10px;background:#fff;border-radius:14px;padding:10px 12px;box-shadow:0 4px 16px rgba(0,0,0,.2);display:none;align-items:center;gap:12px}#mpv .nav.on{display:flex}
#mpv .nav .seta{width:54px;height:54px;flex:none;border-radius:50%;background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:center;font-size:30px;transition:transform .25s}
#mpv .nav .tx{flex:1;min-width:0}#mpv .nav .tx b{display:block;font-size:22px;color:var(--navy)}#mpv .nav .tx small{color:var(--muted);font-size:13px}
#mpv .fab{position:absolute;right:10px;bottom:12px;display:flex;flex-direction:column;gap:10px}
#mpv .fab button{width:52px;height:52px;border-radius:50%;padding:0;background:#fff;color:var(--navy);font-size:22px;box-shadow:0 2px 10px rgba(0,0,0,.25)}#mpv .fab button.on{background:var(--navy);color:#fff}
#mpv .mb{background:#fff;flex:none;padding:8px 10px calc(8px + var(--sab));border-top:1px solid var(--line)}
#mpv .co{font-family:ui-monospace,Menlo,monospace;font-size:13px;color:var(--navy);text-align:center;padding:2px 0 8px}
#mpv .ac{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}#mpv .ac button{padding:10px 4px;font-size:13px;background:#E8F1FA;color:var(--navy)}#mpv .ac button.on{background:var(--err);color:#fff}#mpv .ac button.m{background:var(--green);color:#fff}
#mpv .sheet{position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:16px 16px 0 0;box-shadow:0 -6px 24px rgba(0,0,0,.2);padding:14px 14px calc(14px + var(--sab));max-height:72%;overflow-y:auto;display:none;z-index:5;touch-action:pan-y}#mpv .sheet.on{display:block}
#mpv .sheet h3{margin:0 0 8px;color:var(--navy);font-size:16px}#mpv .sheet .lin{display:flex;gap:8px;margin-top:10px}#mpv .sheet .lin button{flex:1}
#mpv .sheet .geo{font-size:12px;margin:6px 0}#mpv .sheet .chips{display:flex;flex-wrap:wrap;gap:6px}#mpv .sheet .chips button{flex:0 0 auto;background:#fff;color:var(--navy);border:1.5px solid var(--line);padding:7px 11px;font-size:13px;border-radius:999px}#mpv .sheet .thumbs{grid-template-columns:repeat(auto-fill,minmax(70px,1fr))}
#mpv .medTop{position:absolute;left:10px;right:10px;top:10px;background:rgba(255,255,255,.96);border-radius:14px;box-shadow:0 4px 16px rgba(0,0,0,.2);padding:10px 44px 10px 12px;display:none;z-index:3}
#mpv.medindo .medTop{display:block}#mpv.medindo .av,#mpv.medindo .nav{display:none!important}#mpv.medindo .fab{display:none}
#mpv .medTop .mt1{font-size:16px;color:#0C4A6E;line-height:1.45}#mpv .medTop .mt2{font-size:12px;color:var(--muted);margin-top:4px;font-family:ui-monospace,Menlo,monospace}
#mpv .medTop #medX{position:absolute;right:4px;top:4px;font-size:20px;color:var(--muted);padding:6px 10px}#mpv .medTop #medU{position:absolute;right:4px;top:42px;font-size:12px;color:#075985;background:#E0F2FE;padding:6px 8px;border-radius:8px}#mpv .medTop .mt3{font-size:12px;color:#075985;margin-top:4px}
#mpv .medBar{display:none;gap:6px}#mpv.medindo .medBar{display:grid}#mpv.medindo .ac{display:none}
#mpv .medBar .r1{display:grid;grid-template-columns:1fr 1.4fr 1fr;gap:6px}#mpv .medBar .r2{display:grid;grid-template-columns:1.6fr 1fr 1fr;gap:6px}
#mpv .medBar button{padding:10px 4px;font-size:14px;background:#E0F2FE;color:#075985}#mpv .medBar .mais{background:#0EA5E9;color:#fff;font-size:18px;font-weight:800}#mpv .medBar .ok{background:var(--green);color:#fff}
#mpv .medBar .seg{border-color:#0EA5E9}#mpv .medBar .seg button{background:#fff;color:#075985;font-size:13px;padding:10px 2px}#mpv .medBar .seg button.on{background:#0EA5E9;color:#fff}#mpv .sheet .seg{flex-wrap:wrap}#mpv .sheet .seg button{padding:9px 8px;font-size:14px;flex:1 1 auto}#mpv .sheet textarea{min-height:110px;font-size:14px}#mpv .sheet .row input{min-width:0}`;
  document.head.appendChild(st);
}
async function abrir(ob, id) {
  cssUmaVez(); const m = await MDB.get('mapas', id); if (!m) return toast('Mapa não encontrado no celular.');
  if (V.aberto) fecharVisual(true);
  const el = document.createElement('div'); el.id = 'mpv';
  el.innerHTML = `<div class="mt"><button id="mpvVolta">‹ Voltar</button><b>${esc(m.nome.replace(/\.[^.]+$/, ''))}</b><button id="mpvMais">☰</button></div>
  <div class="pgs" id="mpvPgs" style="display:none"><button id="mpvPgA" aria-label="Página anterior">◀</button><span id="mpvPgT"></span><button id="mpvPgP" aria-label="Próxima página">▶</button></div>
  <div class="mc" id="mpvC"><canvas id="mpvCv"></canvas><div class="av" id="mpvAv"></div><div class="medTop" id="mpvMedTop"></div><div class="nav" id="mpvNav"></div>
    <div class="fab"><button id="mpvBus" aria-label="Bússola">🧭</button><button id="mpvEu" aria-label="Centralizar em mim">◎</button></div>
    <div class="sheet" id="mpvSh"></div></div>
  <div class="mb"><div class="co" id="mpvCo">Procurando GPS…</div><div class="ac"><button data-a="pino">📍 Marcar</button><button data-a="trilha">⏺ Trilha</button><button data-a="medir">📏 Medir</button><button data-a="mais">☰ Mais</button></div><div class="medBar" id="mpvMedBar"></div></div>`;
  document.body.appendChild(el); try { history.pushState({ t: 'mapa' }, ''); } catch (e) {}
  Object.assign(V, { aberto: true, ob, m, el, cv: $('#mpvCv'), k: 1, tx: 0, ty: 0, ptrs: new Map(), seguir: false, alvo: null, medir: null, pop: null, detalhe: null, camadas: [], fora: null, trilha: V.trilha && V.trilha.obraId === ob.id ? V.trilha : null });
  V.ctx = V.cv.getContext('2d'); ligarVisual(); redimensionar();
  $('#mpvAv').className = 'av on'; $('#mpvAv').textContent = 'Abrindo o mapa…';
  try { await Promise.race([carregarMapa(m), new Promise((_, er) => setTimeout(() => er(new Error('demorou demais')), 30000))]); }
  catch (e) { if (/demorou/.test(e.message || '')) { try { if (pdfjs.worker) { URL.revokeObjectURL(pdfjs.worker); pdfjs.worker = null; } } catch (x) {} }
    $('#mpvAv').className = 'av on w'; $('#mpvAv').innerHTML = esc('Não consegui abrir este mapa: ' + (e.message || e) + '. ') + '<button id="mpvDeNovo" style="margin-top:8px;width:100%">Tentar de novo</button>';
    const dn = $('#mpvDeNovo'); if (dn) dn.onclick = () => abrir(ob, id); return; }
  await carregarCamadas(); V.marcas = await MDB.obra('marcas', ob.id); enquadrar(); avisos(); iniciarGPSmapa(); pedir(); pintarPaginas();
}
function pintarPaginas() { const b = $('#mpvPgs'); if (!b) return; if (!(V.paginas > 1)) { b.style.display = 'none'; return; } b.style.display = 'flex';
  $('#mpvPgT').textContent = `Página ${V.pagina} de ${V.paginas}${V.geo ? ' · com GPS' : ' · só para ver'}`;
  $('#mpvPgA').disabled = V.pagina <= 1; $('#mpvPgP').disabled = V.pagina >= V.paginas;
  $('#mpvPgA').onclick = () => irPagina(V.pagina - 1); $('#mpvPgP').onclick = () => irPagina(V.pagina + 1); }
async function irPagina(n) { if (n < 1 || n > V.paginas || V.mudandoPg) return; V.mudandoPg = true; V.pagina = n; V.detalhe = null; if (V.tarefa) try { V.tarefa.cancel(); } catch (e) {}
  $('#mpvAv').className = 'av on'; $('#mpvAv').textContent = 'Abrindo a página ' + n + '…';
  try { await carregarMapa(V.m); if (V.geo) { await carregarCamadas(); } else V.camadas = []; redimensionar(); enquadrar(); avisos(); pedir(); pintarPaginas(); }
  catch (e) { $('#mpvAv').className = 'av on w'; $('#mpvAv').textContent = 'Não consegui abrir a página: ' + (e.message || e); }
  finally { V.mudandoPg = false; } }
async function carregarMapa(m) {
  const u8 = new Uint8Array(await m.blob.arrayBuffer()); const tipo = m.tipo || tipoDe(m.nome, u8); V.tipo = tipo; const dpr = window.devicePixelRatio || 1;
  const maxLado = (navigator.deviceMemory && navigator.deviceMemory <= 3) ? 2560 : 4096, maxArea = 14e6;
  if (tipo === 'pdf') {
    const geo0 = V.geoPDF || (V.geoPDF = await lerGeoPDF(u8).catch(() => null)); const lib = await pdfjs();
    const doc = V.doc || (V.doc = await lib.getDocument({ data: u8.slice(), isEvalSupported: false }).promise); let pg = null, geo = null; V.paginas = doc.numPages;
    if (!V.pagina) { V.pagina = 1; if (geo0 && geo0.paginaRef != null) for (let i = 1; i <= doc.numPages; i++) { const p = await doc.getPage(i); if (p.ref && p.ref.num === geo0.paginaRef) { V.pagina = i; break; } } }
    pg = await doc.getPage(Math.min(V.pagina, doc.numPages)); V.page = pg; const v1 = pg.getViewport({ scale: 1 }); V.W = v1.width; V.H = v1.height;
    if (geo0) geo = (pg.ref && geo0.porPagina && geo0.porPagina[pg.ref.num]) || (doc.numPages === 1 ? geo0 : null);
    V.geo = null; V.vetPx = null;
    if (geo) { const cv = (x, y) => v1.convertToViewportPoint(x, y); V.geo = criarGeo(geo.pares.map(p => { const q = cv(p[2], p[3]); return [p[0], p[1], q[0], q[1]]; }), geo.moldura && geo.moldura.map(q => cv(q[0], q[1])), geo.aviso); }
    const s0 = Math.min(maxLado / Math.max(V.W, V.H), Math.sqrt(maxArea / (V.W * V.H)), 4 * dpr); const c = document.createElement('canvas'); c.width = Math.round(V.W * s0); c.height = Math.round(V.H * s0);
    const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); await pg.render({ canvasContext: cx, viewport: pg.getViewport({ scale: s0 }) }).promise; V.base = c; V.s0 = s0;
  } else if (tipo === 'tif') {
    const G = await geotiff(); const t = await G.fromArrayBuffer(u8.buffer); const im = await t.getImage(); V.W = im.getWidth(); V.H = im.getHeight();
    const gg = geoTif(im); if (gg) V.geo = criarGeo(gg.pares, gg.moldura, gg.aviso);
    const s0 = Math.min(1, maxLado / Math.max(V.W, V.H), Math.sqrt(maxArea / (V.W * V.H))); const w = Math.max(1, Math.round(V.W * s0)), h = Math.max(1, Math.round(V.H * s0));
    const ras = await t.readRasters({ width: w, height: h, interleave: false }); const nb = ras.length; const img = new ImageData(w, h);
    const est = b => { const a = ras[b]; if (a instanceof Uint8Array || a instanceof Uint8ClampedArray) return v => v; const amostra = []; for (let i = 0; i < a.length; i += Math.max(1, (a.length / 20000) | 0)) if (isFinite(a[i]) && a[i] !== 0) amostra.push(a[i]); amostra.sort((x, y) => x - y); const lo = amostra[(amostra.length * .02) | 0] || 0, hi = amostra[(amostra.length * .98) | 0] || 1; return v => (v - lo) / (hi - lo || 1) * 255; };
    const fs = [0, 1, 2].map(b => est(Math.min(b, nb - 1)));
    for (let i = 0; i < w * h; i++) { for (let b = 0; b < 3; b++) img.data[i * 4 + b] = fs[b](ras[Math.min(b, nb - 1)][i]); img.data[i * 4 + 3] = nb === 4 && (ras[3] instanceof Uint8Array) ? ras[3][i] : 255; }
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(img, 0, 0); V.base = c; V.s0 = s0;
  } else {
    const v = await vetorDe(tipo, u8); V.vet = v.feicoes; const so = v.sobre[0];
    if (so) { const b = new Blob([await v.arquivos[so.arq]()], { type: so.mime }); const bmp = await createImageBitmap(b); V.W = bmp.width; V.H = bmp.height;
      const s0 = Math.min(1, maxLado / Math.max(V.W, V.H)); const c = document.createElement('canvas'); c.width = Math.round(V.W * s0); c.height = Math.round(V.H * s0); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close && bmp.close(); V.base = c; V.s0 = s0;
      V.geo = criarGeo([[...so.cantos[0], 0, 0], [...so.cantos[1], V.W, 0], [...so.cantos[2], V.W, V.H], [...so.cantos[3], 0, V.H]], [[0, 0], [V.W, 0], [V.W, V.H], [0, V.H]]); }
    else { // só vetor: a "folha" é a área das feições com 20% de folga, 1 px = 1 m
      const ll = V.vet.flatMap(f => f.c); if (!ll.length) throw new Error('arquivo sem feições'); const bb = bboxDe(ll); const z = zonaDe((bb[1] + bb[3]) / 2), sul = (bb[0] + bb[2]) / 2 < 0;
      const a = utmF(bb[0], bb[1], z, sul), b = utmF(bb[2], bb[3], z, sul); const fol = Math.max(80, (b[0] - a[0]) * .2, (b[1] - a[1]) * .2); const E0 = a[0] - fol, N1 = b[1] + fol;
      V.W = b[0] - a[0] + 2 * fol; V.H = b[1] - a[1] + 2 * fol; const cant = [[0, 0], [V.W, 0], [V.W, V.H], [0, V.H]];
      V.geo = criarGeo(cant.map(([x, y]) => { const q = utmI(E0 + x, N1 - y, z, sul); return [q[0], q[1], x, y]; }), null); V.soVetor = true; }
  }
  if (V.vet && V.geo) V.vetPx = projVet(V.vet);
}
function projVet(fs) { return fs.map(f => Object.assign({}, f, { p: f.c.map(c => V.geo.ll2px(c[0], c[1])) })); }
async function carregarCamadas() { // KML/GPX da mesma obra aparecem por cima (podem ser desligados no ☰)
  V.camadas = []; if (!V.geo) return; const desl = LSx.get('mpCamDesl_' + V.ob.id, {});
  for (const c of await MDB.obra('mapas', V.ob.id)) { if (c.id === V.m.id || !c.camada) continue;
    try { const v = await vetorDe(c.tipo, new Uint8Array(await c.blob.arrayBuffer())); const soPontos = v.feicoes.length > 25 && v.feicoes.every(f => f.tipo === 'ponto'); /* muitos pontos (vértices) e camada pesada (curvas) começam desligadas: ligam no ☰ */
      V.camadas.push({ id: c.id, nome: c.nome, on: desl[c.id] === undefined ? ((c.tamanho || 0) < 600000 && !soPontos) : !desl[c.id], f: projVet(v.feicoes) }); } catch (e) {} }
}
function redimensionar() { if (!V.aberto) return; const r = $('#mpvC').getBoundingClientRect(); V.dpr = window.devicePixelRatio || 1; V.cw = r.width; V.ch = r.height; V.cv.width = Math.round(r.width * V.dpr); V.cv.height = Math.round(r.height * V.dpr); V.detalhe = null; pedir(); }
function enquadrar() { const k = Math.min(V.cw / V.W, V.ch / V.H) * .96; V.k = k; V.kmin = k * .4; V.kmax = V.tipo === 'pdf' ? Math.max(k * 80, 12) : Math.max(k * 60, 6 / (V.s0 || 1)); V.tx = (V.cw - V.W * k) / 2; V.ty = (V.ch - V.H * k) / 2; V.detalhe = null; }
const s2m = (x, y) => [(x - V.tx) / V.k, (y - V.ty) / V.k], m2s = (x, y) => [x * V.k + V.tx, y * V.k + V.ty];
function zoomEm(f, sx, sy) { const k = Math.max(V.kmin, Math.min(V.kmax, V.k * f)); const m = s2m(sx, sy); V.k = k; V.tx = sx - m[0] * k; V.ty = sy - m[1] * k; pedir(); }
let rafPedido = false, tDetalhe = null;
function pedir() { if (rafPedido || !V.aberto) return; rafPedido = true; requestAnimationFrame(() => { rafPedido = false; desenhar(); }); clearTimeout(tDetalhe); tDetalhe = setTimeout(detalhar, 260); }
async function detalhar() { // PDF: refaz a parte da tela em alta definição depois que o dedo para (texto e linha sempre nítidos)
  if (!V.aberto || V.tipo !== 'pdf' || !V.page) return; const esc0 = V.k * V.dpr; if (esc0 <= V.s0 * 1.1) { if (V.detalhe) { V.detalhe = null; pedir(); } return; }
  const chave = [V.k, V.tx, V.ty, V.cw, V.ch].join('|'); if (V.detalhe && V.detalhe.chave === chave) return;
  if (V.tarefa) { try { V.tarefa.cancel(); } catch (e) {} }
  const c = document.createElement('canvas'); c.width = V.cv.width; c.height = V.cv.height; const cx = c.getContext('2d');
  const vp = V.page.getViewport({ scale: esc0, offsetX: V.tx * V.dpr, offsetY: V.ty * V.dpr });
  const est = { k: V.k, tx: V.tx, ty: V.ty, chave }; V.tarefa = V.page.render({ canvasContext: cx, viewport: vp, background: 'rgba(0,0,0,0)' });
  try { await V.tarefa.promise; V.tarefa = null; if (!V.aberto) return; V.detalhe = Object.assign(est, { c }); pedir(); } catch (e) { /* cancelado: o dedo mexeu de novo */ }
}

/* ---------------- desenho ---------------- */
function desenhar() {
  const c = V.ctx; if (!c) return; ROT = []; c.setTransform(V.dpr, 0, 0, V.dpr, 0, 0); c.fillStyle = V.soVetor ? '#F6F7F2' : '#E9EDF2'; c.fillRect(0, 0, V.cw, V.ch);
  if (V.base) { c.imageSmoothingEnabled = V.k * V.dpr < V.s0 * 2; c.drawImage(V.base, V.tx, V.ty, V.W * V.k, V.H * V.k); c.imageSmoothingEnabled = true; }
  if (V.detalhe) { const d = V.detalhe, r = V.k / d.k; c.drawImage(d.c, V.tx - r * d.tx, V.ty - r * d.ty, d.c.width / V.dpr * r, d.c.height / V.dpr * r); }
  if (V.soVetor) grade(c);
  if (V.geo) {
    for (const cm of V.camadas) if (cm.on) feicoes(c, cm.f, '#E11D48');
    if (V.vetPx) feicoes(c, V.vetPx, '#E11D48');
    for (const m of V.marcas || []) { if (m.tipo === 'trilha') linhaLL(c, m.pts, '#7C3AED', 3.5); else if (m.tipo === 'medida') linhaLL(c, m.pts, '#0284C7', 2.5, m.fechado); }
    if (V.trilha && V.trilha.pts.length > 1) linhaLL(c, V.trilha.pts, '#DC2626', 4);
    for (const m of V.marcas || []) if (m.tipo === 'pino') pino(c, m.lat, m.lon, V.alvo && V.alvo.id === m.id ? '#DC2626' : (m.cat ? corCat(m.cat) : '#F59E0B'), m.nome + (m.fotos && m.fotos.length ? ' 📷' : ''));
    if (V.alvo && !V.alvo.id) pino(c, V.alvo.lat, V.alvo.lon, '#DC2626', V.alvo.nome);
    desenharMedida(c);
    const p = V.pos; if (p) {
      if (V.alvo) { const a = m2s(...V.geo.ll2px(p.lat, p.lon)), b = m2s(...V.geo.ll2px(V.alvo.lat, V.alvo.lon)); c.setLineDash([10, 8]); c.strokeStyle = '#DC2626'; c.lineWidth = 3; c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); c.setLineDash([]); }
      const s = m2s(...V.geo.ll2px(p.lat, p.lon)); const r = Math.max(9, (p.acc || 0) * V.geo.pxm * V.k);
      c.fillStyle = 'rgba(37,99,235,.15)'; c.strokeStyle = 'rgba(37,99,235,.5)'; c.lineWidth = 1; c.beginPath(); c.arc(s[0], s[1], r, 0, 7); c.fill(); c.stroke();
      const h = rumoTela(); if (h != null) { c.save(); c.translate(s[0], s[1]); c.rotate(h * RAD); c.fillStyle = 'rgba(37,99,235,.9)'; c.beginPath(); c.moveTo(0, -24); c.lineTo(9, -8); c.lineTo(-9, -8); c.closePath(); c.fill(); c.restore(); }
      c.fillStyle = '#2563EB'; c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.arc(s[0], s[1], 8, 0, 7); c.fill(); c.stroke();
      if (s[0] < -10 || s[1] < -10 || s[0] > V.cw + 10 || s[1] > V.ch + 10) setaBorda(c, s); }
    escala(c);
  }
}
function rumoTela() { const p = V.pos; if (V.bussola != null) return V.bussola; if (p && p.hd != null && p.vel > 0.8) return p.hd; return null; }
function feicoes(c, fs, cor) {
  for (const f of fs) { if (f.tipo === 'ponto') continue; c.beginPath(); f.p.forEach((q, i) => { const s = m2s(q[0], q[1]); i ? c.lineTo(s[0], s[1]) : c.moveTo(s[0], s[1]); }); if (f.tipo === 'area') { c.closePath(); c.fillStyle = f.corA || 'rgba(225,29,72,.08)'; c.fill(); }
    c.lineWidth = 4.5; c.strokeStyle = 'rgba(255,255,255,.85)'; c.stroke(); c.lineWidth = 2.5; c.strokeStyle = f.cor || cor; c.stroke(); }
  c.font = '600 12px system-ui,sans-serif';
  for (const f of fs) { if (f.tipo !== 'ponto') continue; const s = m2s(f.p[0][0], f.p[0][1]); if (s[0] < -40 || s[1] < -40 || s[0] > V.cw + 40 || s[1] > V.ch + 40) continue;
    c.fillStyle = cor; c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.beginPath(); c.arc(s[0], s[1], 6, 0, 7); c.fill(); c.stroke();
    if (f.nome && rotuloCabe(s, f.nome)) { c.lineWidth = 3.5; c.strokeStyle = 'rgba(255,255,255,.95)'; c.strokeText(f.nome, s[0] + 9, s[1] + 4); c.fillStyle = '#111'; c.fillText(f.nome, s[0] + 9, s[1] + 4); } }
}
let ROT = []; // caixas de rótulo já desenhadas neste quadro: rótulo que encostaria em outro não é escrito (o ponto continua)
function rotuloCabe(s, nome) { const w = nome.length * 7 + 12, b = [s[0] + 6, s[1] - 12, s[0] + 9 + w, s[1] + 6]; for (const o of ROT) if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return false; ROT.push(b); return true; }
function linhaLL(c, pts, cor, w, fechar) { if (pts.length < 2) return; c.beginPath(); pts.forEach((q, i) => { const s = m2s(...V.geo.ll2px(q[0], q[1])); i ? c.lineTo(s[0], s[1]) : c.moveTo(s[0], s[1]); }); if (fechar) { c.closePath(); c.fillStyle = 'rgba(14,165,233,.12)'; c.fill(); }
  c.lineWidth = w + 2.5; c.strokeStyle = 'rgba(255,255,255,.85)'; c.stroke(); c.lineWidth = w; c.strokeStyle = cor; c.stroke(); }
function pino(c, lat, lon, cor, nome) { const s = m2s(...V.geo.ll2px(lat, lon)); c.save(); c.translate(s[0], s[1]); c.fillStyle = cor; c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-4, -8, -11, -14, -11, -22); c.arc(0, -22, 11, Math.PI, 0); c.bezierCurveTo(11, -14, 4, -8, 0, 0); c.fill(); c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.arc(0, -22, 4, 0, 7); c.fill();
  if (nome) { c.font = '700 13px system-ui,sans-serif'; c.lineWidth = 4; c.strokeStyle = 'rgba(255,255,255,.95)'; c.strokeText(nome, 14, -18); c.fillStyle = '#111'; c.fillText(nome, 14, -18); } c.restore(); }
function setaBorda(c, s) { const cx = V.cw / 2, cy = V.ch / 2, ang = Math.atan2(s[1] - cy, s[0] - cx); const R = Math.min(cx, cy) - 34; const x = cx + Math.cos(ang) * R, y = cy + Math.sin(ang) * R;
  c.save(); c.translate(x, y); c.rotate(ang); c.fillStyle = '#2563EB'; c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.moveTo(18, 0); c.lineTo(-10, -13); c.lineTo(-4, 0); c.lineTo(-10, 13); c.closePath(); c.fill(); c.stroke(); c.restore(); }
function escala(c) { const mpp = 1 / (V.geo.pxm * V.k); const alvo = 110 * mpp; const p = Math.pow(10, Math.floor(Math.log10(alvo))); const nice = [1, 2, 5, 10].map(x => x * p).filter(x => x <= alvo).pop() || p; const w = nice / mpp;
  const x = 12, y = V.ch - 16; c.fillStyle = 'rgba(255,255,255,.85)'; c.fillRect(x - 6, y - 20, w + 12, 28); c.strokeStyle = '#111'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x, y); c.lineTo(x + w, y); c.lineTo(x + w, y - 6); c.stroke();
  c.fillStyle = '#111'; c.font = '600 12px system-ui,sans-serif'; c.fillText(fmtDist(nice), x + 2, y - 8); }
function grade(c) { if (!V.geo) return; const mpp = 1 / (V.geo.pxm * V.k); const passo = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].find(x => x / mpp > 90) || 20000; const G = V.geo;
  const cant = [s2m(0, 0), s2m(V.cw, V.ch)]; const X = x => x - G.A[2], Y = y => y - G.A[5]; const toEN = (x, y) => [(G.A[4] * X(x) - G.A[1] * Y(y)) / G.det, (-G.A[3] * X(x) + G.A[0] * Y(y)) / G.det];
  const a = toEN(cant[0][0], cant[1][1]), b = toEN(cant[1][0], cant[0][1]); c.strokeStyle = 'rgba(17,62,107,.13)'; c.lineWidth = 1; c.fillStyle = 'rgba(17,62,107,.45)'; c.font = '11px system-ui,sans-serif';
  const px = (E, N) => m2s(G.A[0] * E + G.A[1] * N + G.A[2], G.A[3] * E + G.A[4] * N + G.A[5]);
  for (let E = Math.ceil(a[0] / passo) * passo; E <= b[0]; E += passo) { const s = px(E, a[1]), t = px(E, b[1]); c.beginPath(); c.moveTo(...s); c.lineTo(...t); c.stroke(); c.fillText(br(E), s[0] + 3, V.ch - 40); }
  for (let N = Math.ceil(a[1] / passo) * passo; N <= b[1]; N += passo) { const s = px(a[0], N), t = px(b[0], N); c.beginPath(); c.moveTo(...s); c.lineTo(...t); c.stroke(); c.fillText(br(N), 4, s[1] - 3); } }

/* ---------------- GPS, bússola, avisos ---------------- */
function iniciarGPSmapa() {
  if (!navigator.geolocation) return; try { if (window.iniciarGPS) iniciarGPS(); } catch (e) {}
  V.watch = navigator.geolocation.watchPosition(g => { V.pos = { lat: g.coords.latitude, lon: g.coords.longitude, acc: g.coords.accuracy, alt: g.coords.altitude, hd: g.coords.heading, vel: g.coords.speed, t: Date.now() };
    if (APP()) { APP().pos = { lat: V.pos.lat, lon: V.pos.lon, acc: V.pos.acc, alt: V.pos.alt }; APP().posEm = Date.now(); }
    gravarPontoTrilha(); verificarAreas(); if (V.seguir) centrarEm(V.pos); avisos(); painelCoord(); painelNav(); pedir(); },
  e => { V.gpsErro = e; painelCoord(); }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 });
  /* reserva: se o celular entregar a posição só para o GPS do app, o mapa usa a mesma (nunca fica "procurando" com o app tendo posição) */
  V.reserva = setInterval(() => { const A = APP(); if (!V.aberto || !A || !A.pos || !A.posEm) return; if (V.pos && V.pos.t >= A.posEm) return; if (Date.now() - A.posEm > 15000) return;
    V.pos = { lat: A.pos.lat, lon: A.pos.lon, acc: A.pos.acc, alt: A.pos.alt, hd: null, vel: null, t: A.posEm }; V.gpsErro = null;
    gravarPontoTrilha(); verificarAreas(); if (V.seguir) centrarEm(V.pos); avisos(); painelCoord(); painelNav(); pedir(); }, 1000);
}
function centrarEm(p) { if (!V.geo) return; const q = V.geo.ll2px(p.lat, p.lon); V.tx = V.cw / 2 - q[0] * V.k; V.ty = V.ch / 2 - q[1] * V.k; pedir(); }
function txtCoord(lat, lon) { if (APP() && APP().fmt === 'utm' && window.toUTM) { const u = toUTM(lat, lon); return `UTM ${u.zone}${u.hemi}  E ${br(u.e)}  N ${br(u.n)}`; } return `${lat.toFixed(6).replace('.', ',')}  ${lon.toFixed(6).replace('.', ',')}`; }
function painelCoord() { const el = $('#mpvCo'); if (!el) return; const p = V.pos;
  if (!p) { el.textContent = V.gpsErro ? (window.textoErroGPS && APP() && APP().gpsErro ? textoErroGPS() : 'GPS sem resposta. Confira se a localização está ligada e permitida para o app.') : 'Procurando GPS… (a céu aberto fixa mais rápido)'; return; }
  el.textContent = `${txtCoord(p.lat, p.lon)}  ±${Math.round(p.acc)} m${p.alt != null ? '  ·  alt ' + Math.round(p.alt) + ' m' : ''}${V.trilha ? '  ·  trilha ' + fmtDist(compLL(V.trilha.pts)) + (V.trilha.pausado ? ' (pausada)' : '') : ''}${V.dentroDe && V.dentroDe.size ? '  ·  dentro: ' + [...V.dentroDe].join(', ') : ''}`; }
function avisos() { const el = $('#mpvAv'); if (!el) return; let t = '', w = false;
  if (!V.geo) { t = 'Este arquivo não tem georreferência: dá para ver e dar zoom, mas o ponto azul não aparece. Peça ao escritório o PDF georreferenciado.'; w = true; }
  else if (V.pos && V.geo.moldura) { const q = V.geo.ll2px(V.pos.lat, V.pos.lon); if (!dentro(q, V.geo.moldura)) { const d = distPoli(q, V.geo.moldura) / V.geo.pxm; const c = V.geo.moldura.reduce((a, p) => [a[0] + p[0] / V.geo.moldura.length, a[1] + p[1] / V.geo.moldura.length], [0, 0]); const cl = V.geo.px2ll(c[0], c[1]);
      t = `Você está fora deste mapa: a ${fmtDist(d)} da borda, mapa a ${cardeal(rumo([V.pos.lat, V.pos.lon], cl))}. A seta azul aponta onde você está; ◎ leva até lá.`; } }
  else if (V.geo.aviso) t = V.geo.aviso;
  if (V.alvo && $('#mpvNav').classList.contains('on')) t = ''; el.className = 'av' + (t ? ' on' : '') + (w ? ' w' : ''); el.textContent = t; }
/* ---------------- 🔔 ALERTAS (Avenza Pro: proximidade) — vibra, apita e mostra; funciona sem internet ---------------- */
let AUDIO = null;
function alertar(msg, forte) { try { navigator.vibrate && navigator.vibrate(forte ? [250, 120, 250, 120, 400] : [200, 100, 200]); } catch (e) {}
  try { AUDIO = AUDIO || new (window.AudioContext || window.webkitAudioContext)(); const o = AUDIO.createOscillator(), g = AUDIO.createGain(); o.frequency.value = forte ? 880 : 660; o.connect(g); g.connect(AUDIO.destination); g.gain.setValueAtTime(.25, AUDIO.currentTime); g.gain.exponentialRampToValueAtTime(.001, AUDIO.currentTime + .6); o.start(); o.stop(AUDIO.currentTime + .6); } catch (e) {}
  toast(msg, 4500); }
function areasAtivas() { const out = []; for (const c of V.camadas || []) if (c.on) for (const f of c.f) if (f.tipo === 'area' && f.c.length > 2) out.push({ nome: f.nome || c.nome, c: f.c });
  for (const f of V.vet || []) if (f.tipo === 'area' && f.c.length > 2) out.push({ nome: f.nome || 'Área', c: f.c });
  for (const m of V.marcas || []) if (m.tipo === 'medida' && m.fechado) out.push({ nome: m.nome, c: m.pts }); return out; }
function dentroLL(p, poli) { let c = false; for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) { const a = poli[i], b = poli[j]; if ((a[0] > p[0]) !== (b[0] > p[0]) && p[1] < (b[1] - a[1]) * (p[0] - a[0]) / (b[0] - a[0]) + a[1]) c = !c; } return c; }
function verificarAreas() { if (!V.pos) return; const agora = new Set(areasAtivas().filter(a => dentroLL([V.pos.lat, V.pos.lon], a.c)).map(a => a.nome));
  if (V.dentroDe && LSx.get('alertaAreas', true) && (V.pos.acc || 0) < 40) { for (const n of agora) if (!V.dentroDe.has(n)) alertar('🔔 Entrou: ' + n); for (const n of V.dentroDe) if (!agora.has(n)) alertar('🔔 Saiu: ' + n); }
  V.dentroDe = agora; }
function painelNav() { const el = $('#mpvNav'); if (!el) return; if (!V.alvo) { el.classList.remove('on'); return; } const p = V.pos; el.classList.add('on');
  if (!p) { el.innerHTML = `<div class="seta">⌖</div><div class="tx"><b>${esc(V.alvo.nome)}</b><small>esperando o GPS…</small></div><button class="ghost" id="mpvNavX">✕</button>`; }
  else { const d = dist([p.lat, p.lon], [V.alvo.lat, V.alvo.lon]), r = rumo([p.lat, p.lon], [V.alvo.lat, V.alvo.lon]); const h = rumoTela(); const chegou = d <= Math.max(8, (p.acc || 0));
    if (chegou && !V.alvo.avisado) { V.alvo.avisado = true; alertar('🔔 Você chegou: ' + V.alvo.nome, true); } else if (!chegou && V.alvo.avisado && d > Math.max(30, 3 * (p.acc || 0))) V.alvo.avisado = false;
    el.innerHTML = `<div class="seta" style="transform:rotate(${h != null ? r - h : r}deg);${chegou ? 'background:var(--green)' : ''}">${chegou ? '✓' : '↑'}</div><div class="tx"><b>${chegou ? 'Você chegou' : fmtDist(d)}</b><small>${esc(V.alvo.nome)} · rumo ${Math.round(r)}° ${cardeal(r)}${h == null ? ' · seta pelo norte (ligue a 🧭)' : ''}</small></div><button class="ghost" id="mpvNavX">✕</button>`; }
  $('#mpvNavX').onclick = () => { V.alvo = null; painelNav(); avisos(); pedir(); }; }
async function ligarBussola() {
  if (V.bussolaOn) { V.bussolaOn = false; V.bussola = null; window.removeEventListener('deviceorientationabsolute', ouvirB, true); window.removeEventListener('deviceorientation', ouvirB, true); $('#mpvBus').classList.remove('on'); pedir(); painelNav(); return; }
  try { if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') return toast('Sem permissão para a bússola. Em Ajustes do iPhone > Safari > Movimento e orientação.', 4500); } } catch (e) {}
  V.bussolaOn = true; $('#mpvBus').classList.add('on'); window.addEventListener('deviceorientationabsolute', ouvirB, true); window.addEventListener('deviceorientation', ouvirB, true);
  toast('Bússola ligada. Segure o celular deitado; se a seta girar errado, faça um 8 no ar com o celular.', 4000);
}
function ouvirB(e) { let h = null; if (e.webkitCompassHeading != null) h = e.webkitCompassHeading; else if (e.absolute && e.alpha != null) h = 360 - e.alpha; else if (e.type === 'deviceorientationabsolute' && e.alpha != null) h = 360 - e.alpha;
  if (h == null) return; if (e.type === 'deviceorientation' && e.webkitCompassHeading == null && V.absolutoVisto) return; if (e.type === 'deviceorientationabsolute') V.absolutoVisto = true;
  const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0; h = (h + ang + 360) % 360;
  if (V.bussola == null || Math.abs(((h - V.bussola + 540) % 360) - 180) > 2) { V.bussola = h; const ag = Date.now(); if (!V.ultB || ag - V.ultB > 120) { V.ultB = ag; pedir(); painelNav(); } } }

/* ---------------- toque, pinça, toque longo ---------------- */
function ligarVisual() {
  const cv = V.cv, P = V.ptrs; let longo = null, ini = null, ultToque = 0, pinca = null, mexeu = false;
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); P.set(e.pointerId, [e.offsetX, e.offsetY]); fecharSheet();
    if (P.size === 1) { ini = [e.offsetX, e.offsetY, Date.now()]; mexeu = false; clearTimeout(longo); longo = setTimeout(() => { if (!mexeu && P.size === 1 && !V.medir) { navigator.vibrate && navigator.vibrate(25); popPonto(s2m(ini[0], ini[1])); ini = null; } }, 550); }
    if (P.size === 2) { clearTimeout(longo); const [a, b] = [...P.values()]; pinca = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: V.k, c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; mexeu = true; } });
  cv.addEventListener('pointermove', e => { if (!P.has(e.pointerId)) return; const ant = P.get(e.pointerId); const at = [e.offsetX, e.offsetY]; P.set(e.pointerId, at);
    if (P.size === 1) { if (ini && Math.hypot(at[0] - ini[0], at[1] - ini[1]) > 8) { mexeu = true; clearTimeout(longo); } if (mexeu) { V.tx += at[0] - ant[0]; V.ty += at[1] - ant[1]; desligarSeguir(); pedir(); } }
    else if (P.size === 2 && pinca) { const [a, b] = [...P.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const m = s2m(pinca.c[0], pinca.c[1]); V.k = Math.max(V.kmin, Math.min(V.kmax, pinca.k * d / pinca.d)); V.tx = c[0] - m[0] * V.k; V.ty = c[1] - m[1] * V.k; pinca.c = c; pinca.k = V.k; pinca.d = d; pedir(); } });
  const fim = e => { if (!P.has(e.pointerId)) return; P.delete(e.pointerId); clearTimeout(longo); if (P.size < 2) pinca = null;
    if (P.size === 0 && ini && !mexeu && Date.now() - ini[2] < 500) { const ag = Date.now(); if (ag - ultToque < 300) { zoomEm(2, ini[0], ini[1]); ultToque = 0; } else { ultToque = ag; const pt = ini.slice(); setTimeout(() => { if (ultToque === ag) toque(pt[0], pt[1]); }, 300); } }
    if (P.size === 1) { const [a] = [...P.values()]; ini = null; mexeu = true; P.set([...P.keys()][0], a); } };
  cv.addEventListener('pointerup', fim); cv.addEventListener('pointercancel', fim);
  cv.addEventListener('wheel', e => { e.preventDefault(); zoomEm(Math.exp(-e.deltaY * .0015), e.offsetX, e.offsetY); }, { passive: false });
  V.aoRedim = () => redimensionar(); window.addEventListener('resize', V.aoRedim);
  $('#mpvVolta').onclick = () => fecharVisual(); $('#mpvMais').onclick = () => sheetMais();
  $('#mpvEu').onclick = () => { if (!V.pos) return toast('Ainda sem GPS. Vá para céu aberto e espere alguns segundos.'); if (!V.geo) return toast('Este mapa não tem georreferência.'); V.seguir = !V.seguir; $('#mpvEu').classList.toggle('on', V.seguir);
    if (V.seguir) { if (V.k * V.geo.pxm < .15) V.k = Math.min(V.kmax, .6 / V.geo.pxm); V.detalhe = null; centrarEm(V.pos); toast('Seguindo você. Arraste o mapa para parar.'); } };
  $('#mpvBus').onclick = ligarBussola;
  V.el.querySelectorAll('.ac button').forEach(b => b.onclick = () => acao(b.dataset.a, b));
  pintarBotaoTrilha();
}
function desligarSeguir() { if (V.seguir) { V.seguir = false; $('#mpvEu').classList.remove('on'); } }
function toque(sx, sy) {
  if (!V.geo) return; const m = s2m(sx, sy);
  if (V.medir) { const e = encaixe(sx, sy); addMedida(e || { ll: V.geo.px2ll(m[0], m[1]), nome: '' }); return; }
  let melhor = null, dm = 28; for (const p of V.marcas || []) if (p.tipo === 'pino') { const s = m2s(...V.geo.ll2px(p.lat, p.lon)); const d = Math.min(Math.hypot(s[0] - sx, s[1] - sy), Math.hypot(s[0] - sx, s[1] - 22 - sy)); if (d < dm) { dm = d; melhor = { pino: p }; } }
  for (const f of [...(V.vetPx || []), ...V.camadas.filter(c => c.on).flatMap(c => c.f)]) if (f.tipo === 'ponto') { const s = m2s(f.p[0][0], f.p[0][1]); const d = Math.hypot(s[0] - sx, s[1] - sy); if (d < dm) { dm = d; melhor = { f }; } }
  if (melhor && melhor.pino) return popPino(melhor.pino); if (melhor) return popPonto(V.geo.ll2px(melhor.f.c[0][0], melhor.f.c[0][1]), melhor.f.nome, melhor.f.desc);
  if (V.sheetAberto) fecharSheet();
}

/* ---------------- painéis (folha de baixo) ---------------- */
function sheet(html) { const s = $('#mpvSh'); s.innerHTML = html; s.classList.add('on'); V.sheetAberto = true; s.onpointerdown = e => e.stopPropagation(); return s; }
function fecharSheet() { const s = $('#mpvSh'); if (s) { s.classList.remove('on'); V.sheetAberto = false; } }
function linhaDistDeMim(lat, lon) { const p = V.pos; if (!p) return ''; const d = dist([p.lat, p.lon], [lat, lon]), r = rumo([p.lat, p.lon], [lat, lon]); return `<div class="muted">a ${fmtDist(d)} de você · rumo ${Math.round(r)}° ${cardeal(r)}</div>`; }
function blocoCoord(lat, lon) { const u = window.toUTM ? toUTM(lat, lon) : null; return `<div class="geo">${u ? `UTM ${u.zone}${u.hemi} E ${br(u.e)} N ${br(u.n)} (SIRGAS 2000)<br>` : ''}Lat ${lat.toFixed(6).replace('.', ',')} · Lon ${lon.toFixed(6).replace('.', ',')}</div>`; }
function popPonto(m, nome, desc) { if (!V.geo) return; const [lat, lon] = V.geo.px2ll(m[0], m[1]);
  const s = sheet(`<h3>${esc(nome || 'Ponto no mapa')}</h3>${desc ? `<div class="nota">${esc(String(desc).replace(/<[^>]+>/g, ' ').slice(0, 300))}</div>` : ''}${blocoCoord(lat, lon)}${linhaDistDeMim(lat, lon)}
    <div class="lin"><button id="shIr">➜ Ir até aqui</button><button class="sec" id="shPino">📍 Marcar pino</button></div><div class="lin"><button class="ghost" id="shCop">Copiar</button><button class="ghost" id="shShare">Compartilhar</button><button class="ghost" id="shFe">Fechar</button></div>`);
  s.querySelector('#shIr').onclick = () => { V.alvo = { lat, lon, nome: nome || 'ponto escolhido' }; fecharSheet(); painelNav(); avisos(); pedir(); };
  s.querySelector('#shPino').onclick = async () => { const p = await novoPino(lat, lon, null, nome); fecharSheet(); popPino(p); };
  s.querySelector('#shCop').onclick = () => copiar(lat, lon); s.querySelector('#shShare').onclick = () => compartilhar(nome || 'Ponto', lat, lon); s.querySelector('#shFe').onclick = fecharSheet; }
function compartilhar(nome, lat, lon) { const u = window.toUTM ? toUTM(lat, lon) : null;
  const t = `${nome || 'Ponto'} — ${V.ob ? V.ob.nome : ''}\nLat ${lat.toFixed(6)}, Lon ${lon.toFixed(6)}${u ? `\nUTM ${u.zone}${u.hemi} E ${u.e} N ${u.n} (SIRGAS 2000)` : ''}\nhttps://maps.google.com/?q=${lat.toFixed(6)},${lon.toFixed(6)}`;
  compartilharTexto(nome || 'Ponto', t); }
function copiar(lat, lon) { const u = window.toUTM ? toUTM(lat, lon) : null; const t = (u ? `UTM ${u.zone}${u.hemi} E ${u.e} N ${u.n} (SIRGAS 2000) / ` : '') + `${lat.toFixed(6)}, ${lon.toFixed(6)}`; try { navigator.clipboard.writeText(t).then(() => toast('Coordenada copiada')); } catch (e) { prompt('Coordenada', t); } }
/* ---------------- FICHA DO PONTO (atributos do Avenza Pro + o que o geólogo usa) ----------------
   Categoria com cor, litologia, amostra, atitude (direção de mergulho/mergulho) medida com o celular deitado na rocha,
   fotos ligadas ao ponto (câmera do app → carimbo + fila → Drive da obra). Tudo salva sozinho ao mudar. */
const CATS = [['afloramento', 'Afloramento', '#8B5CF6'], ['amostra', 'Amostra', '#DC2626'], ['estrutura', 'Estrutura', '#7C2D12'], ['agua', 'Água/drenagem', '#0284C7'],
  ['acesso', 'Acesso/porteira', '#16A34A'], ['controle', 'Ponto de controle', '#111827'], ['outro', 'Outro', '#F59E0B']];
const corCat = k => (CATS.find(c => c[0] === k) || CATS[CATS.length - 1])[2];
const nomeCat = k => (CATS.find(c => c[0] === k) || CATS[CATS.length - 1])[1];
const LITO = ['Granito', 'Gnaisse', 'Granodiorito', 'Diorito', 'Basalto', 'Diabásio', 'Quartzito', 'Xisto', 'Migmatito', 'Laterita', 'Arenito', 'Siltito', 'Argilito', 'Conglomerado', 'Solo residual', 'Aluvião', 'Saprólito', 'Veio de quartzo'];
function attrTexto(p) { const a = p.attr || {}; return [p.cat ? nomeCat(p.cat) : '', a.lito ? 'Litologia: ' + a.lito : '', a.amostra ? 'Amostra: ' + a.amostra : '', a.dirMerg != null && a.merg != null ? `Atitude: ${String(Math.round(a.dirMerg)).padStart(3, '0')}/${Math.round(a.merg)} (dir. mergulho/mergulho)` : '', p.fotos && p.fotos.length ? p.fotos.length + ' foto(s)' : ''].filter(Boolean).join(' · '); }
function popPino(p) {
  p.attr = p.attr || {}; p.fotos = p.fotos || [];
  const s = sheet(`<h3>📍 Ponto</h3><label>Nome</label><input id="shNome" value="${esc(p.nome)}">
  <label>Categoria</label><div class="chips" id="shCat">${CATS.map(c => `<button data-c="${c[0]}" class="${p.cat === c[0] ? 'on' : ''}" style="${p.cat === c[0] ? `background:${c[2]};border-color:${c[2]};color:#fff` : ''}">${c[1]}</button>`).join('')}</div>
  <div class="row"><div><label>Litologia</label><input id="shLito" list="dlLito" value="${esc(p.attr.lito || '')}" placeholder="ex.: granito"></div><div><label>Amostra nº</label><input id="shAm" value="${esc(p.attr.amostra || '')}" placeholder="ex.: MUC-01"></div></div><datalist id="dlLito">${LITO.map(l => `<option value="${l}">`).join('')}</datalist>
  <label>Atitude (direção de mergulho / mergulho)</label><div class="row"><input id="shDM" inputmode="decimal" placeholder="dir. (0–360°)" value="${p.attr.dirMerg ?? ''}"><input id="shMg" inputmode="decimal" placeholder="mergulho (0–90°)" value="${p.attr.merg ?? ''}"><button class="sec" id="shClin" style="flex:0 0 auto">📐 Medir</button></div>
  <label>Observação</label><textarea id="shNota" placeholder="o que viu, condição do acesso, etc." style="min-height:60px">${esc(p.nota || '')}</textarea>
  <label>Fotos deste ponto</label><div class="thumbs" id="shFotos">${p.fotos.map(f => `<div class="th">${f.thumb ? `<img src="${f.thumb}" alt="">` : '📷'}</div>`).join('')}</div>
  <div class="lin"><button class="sec" id="shFoto">📷 Tirar foto do ponto</button><button class="sec" id="shGal">🖼 Da galeria</button></div>
  <input type="file" id="shFotoIn" accept="image/*" capture="environment" style="display:none"><input type="file" id="shGalIn" accept="image/*" multiple style="display:none">
  ${blocoCoord(p.lat, p.lon)}<div class="muted">${p.digitado ? 'plotado por coordenada · ' : p.acc ? `GPS ±${Math.round(p.acc)} m · ` : 'marcado no mapa · '}${window.fmtData ? fmtData(p.criadoEm) : ''} · ${esc(p.quem || '')}</div>${linhaDistDeMim(p.lat, p.lon)}
  <div class="lin"><button id="shIr">➜ Ir até</button><button class="sec" id="shOk">✓ Pronto</button></div><div class="lin"><button class="ghost" id="shCop">Copiar</button><button class="ghost" id="shShare">Compartilhar</button><button class="ghost" id="shDel" style="color:var(--err)">Apagar</button></div>`);
  const num = v => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : null; };
  const salvar = async () => { const antes = JSON.stringify([p.nome, p.nota, p.cat, p.attr]);
    p.nome = s.querySelector('#shNome').value.trim() || p.nome; p.nota = s.querySelector('#shNota').value.trim();
    p.attr.lito = s.querySelector('#shLito').value.trim(); p.attr.amostra = s.querySelector('#shAm').value.trim();
    const dm = num(s.querySelector('#shDM').value), mg = num(s.querySelector('#shMg').value);
    p.attr.dirMerg = dm != null && dm >= 0 && dm <= 360 ? dm : null; p.attr.merg = mg != null && mg >= 0 && mg <= 90 ? mg : null;
    if (JSON.stringify([p.nome, p.nota, p.cat, p.attr]) === antes) return; p.enviado = false; await MDB.put('marcas', p); pedir(); agendarEnvio(V.ob); };
  s.querySelectorAll('input,textarea').forEach(e => { if (e.type !== 'file') e.onchange = salvar; });
  s.querySelectorAll('#shCat button').forEach(b => b.onclick = async () => { p.cat = p.cat === b.dataset.c ? null : b.dataset.c; await salvar(); p.enviado = false; await MDB.put('marcas', p); agendarEnvio(V.ob); pedir(); popPino(p); });
  const fotoDe = async (files, fonte) => { for (const f of files) { try { let gps = null, dataOrig = null;
      if (fonte === 'galeria' && window.lerExif) { try { const ex = lerExif(await f.arrayBuffer()); gps = ex && ex.gps; dataOrig = ex && ex.data; } catch (e) {} }
      const r = await enfileirarFoto(f, { slot: 'ponto', slotTitulo: 'Ponto ' + p.nome, fonte, gpsOrig: gps, dataOrig, extra: { pino: p.id, ponto: p.nome, lat: p.lat, lon: p.lon, cat: p.cat || null }, semRender: true });
      if (r && r.id) { p.fotos.push({ id: r.id, thumb: r.thumb, em: new Date().toISOString() }); p.enviado = false; await MDB.put('marcas', p); agendarEnvio(V.ob); } } catch (e) { toast('Foto: ' + (e.message || e)); } }
    if (V.aberto && $('#mpvSh').classList.contains('on')) popPino(p); };
  s.querySelector('#shFoto').onclick = () => s.querySelector('#shFotoIn').click(); s.querySelector('#shGal').onclick = () => s.querySelector('#shGalIn').click();
  s.querySelector('#shFotoIn').onchange = e => { const fs = [...e.target.files]; e.target.value = ''; fotoDe(fs, 'camera'); };
  s.querySelector('#shGalIn').onchange = e => { const fs = [...e.target.files]; e.target.value = ''; fotoDe(fs, 'galeria'); };
  s.querySelector('#shClin').onclick = () => clinometro(async (dm, mg) => { s.querySelector('#shDM').value = Math.round(dm); s.querySelector('#shMg').value = Math.round(mg); await salvar(); });
  s.querySelector('#shOk').onclick = async () => { await salvar(); fecharSheet(); toast('Ponto salvo ✓ (vai para o Drive sozinho)'); };
  s.querySelector('#shIr').onclick = async () => { await salvar(); V.alvo = { id: p.id, lat: p.lat, lon: p.lon, nome: p.nome }; fecharSheet(); painelNav(); avisos(); pedir(); };
  s.querySelector('#shCop').onclick = () => copiar(p.lat, p.lon);
  s.querySelector('#shShare').onclick = () => compartilhar(p.nome + (attrTexto(p) ? ' — ' + attrTexto(p) : ''), p.lat, p.lon);
  s.querySelector('#shDel').onclick = async () => { const r = await escolha('Apagar o ponto?', p.fotos.length ? 'As fotos já tiradas continuam guardadas e vão para o Drive.' : '', [{ t: 'Apagar o ponto', v: 1, cls: 'danger' }]); if (!r) return;
    await MDB.del('marcas', p.id); V.marcas = V.marcas.filter(x => x.id !== p.id); if (V.alvo && V.alvo.id === p.id) { V.alvo = null; painelNav(); } fecharSheet(); pedir(); toast('Ponto apagado'); }; }
/* 📐 Clinômetro: celular deitado SOBRE o plano (tela para cima). Lê a inclinação e a bússola; média de 2 s. */
function clinometro(pronto) {
  const L = []; let ouvindo = true; const ouvir = e => { if (!ouvindo || e.beta == null || e.gamma == null) return; let alfa = null;
    if (e.webkitCompassHeading != null) alfa = 360 - e.webkitCompassHeading; else if (e.absolute || e.type === 'deviceorientationabsolute') alfa = e.alpha; if (alfa == null) return;
    const a = alfa * RAD, b = e.beta * RAD, g = e.gamma * RAD; /* normal da tela no referencial Leste-Norte-Cima (W3C) */
    let zx = Math.cos(a) * Math.sin(g) + Math.sin(a) * Math.sin(b) * Math.cos(g), zy = Math.sin(a) * Math.sin(g) - Math.cos(a) * Math.sin(b) * Math.cos(g), zz = Math.cos(b) * Math.cos(g);
    if (zz < 0) { zx = -zx; zy = -zy; zz = -zz; } L.push([zx, zy, zz]); if (L.length > 60) L.shift(); };
  const liga = async () => { try { if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') { toast('Sem permissão de movimento (Ajustes do iPhone > Safari).', 4000); return false; } } } catch (e) {}
    window.addEventListener('deviceorientationabsolute', ouvir, true); window.addEventListener('deviceorientation', ouvir, true); return true; };
  const desliga = () => { ouvindo = false; window.removeEventListener('deviceorientationabsolute', ouvir, true); window.removeEventListener('deviceorientation', ouvir, true); };
  liga().then(ok => { if (!ok) return;
    escolha('📐 Medir atitude', 'Deite o celular <b>sobre a superfície da rocha</b> (tela para cima, sem ímã ou ferro perto) e toque em <b>Ler</b> sem mexer. É uma leitura aproximada — confira com a bússola de geólogo quando a medida for para relatório.', [{ t: 'Ler (2 s parado)', v: 'ler', cls: 'green' }]).then(r => {
      if (r !== 'ler') { desliga(); return; } L.length = 0; toast('Lendo… não mexa', 2200);
      setTimeout(() => { desliga(); if (L.length < 5) return toast('Este celular não mandou a bússola/inclinação. Digite a atitude.', 4500);
        const m = L.reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]).map(x => x / L.length); const n = Math.hypot(...m); const zx = m[0] / n, zy = m[1] / n, zz = m[2] / n;
        const mg = Math.acos(Math.min(1, zz)) / RAD; const dm = mg < 0.5 ? 0 : (Math.atan2(zx, zy) / RAD + 360) % 360;
        pronto(dm, mg); toast(`Atitude ${String(Math.round(dm)).padStart(3, '0')}/${Math.round(mg)} ✓ (aproximada)`, 3500); }, 2000); }); }); }
async function novoPino(lat, lon, acc, nome) {
  const n = (V.marcas || []).filter(m => m.tipo === 'pino').length + 1; const quem = (APP() && APP().quem) || '';
  const p = { id: uid('P'), obraId: V.ob.id, tipo: 'pino', nome: nome || 'P' + String(n).padStart(2, '0'), lat, lon, acc: acc || null, alt: V.pos && acc ? V.pos.alt : null, nota: '', quem, criadoEm: new Date().toISOString(), enviado: false };
  await MDB.put('marcas', p); V.marcas.push(p); pedir(); agendarEnvio(V.ob); return p;
}
async function acao(a, b) {
  if (a === 'pino') { if (!V.geo) return toast('Este mapa não tem georreferência.'); const p = V.pos; if (!p) return toast('Ainda sem GPS. Para marcar um ponto do mapa, segure o dedo nele.', 3500);
    if (p.acc > 30 && !confirm(`O GPS está com precisão de ±${Math.round(p.acc)} m. Marcar assim mesmo? (Esperar alguns segundos a céu aberto melhora.)`)) return;
    const pn = await novoPino(p.lat, p.lon, p.acc); popPino(pn); }
  if (a === 'trilha') { if (V.trilha) await menuTrilha(); else iniciarTrilha(); }
  if (a === 'medir') iniciarMedir();
  if (a === 'mais') sheetMais();
}
/* ================= MEDIR (no estilo do Avenza, melhorado) =================
   Mira no centro: arraste o mapa até o ponto e toque em "＋ Ponto". Também vale tocar direto no mapa.
   Linha · Área · Círculo · Rumo e distância. Ao vivo: segmento até a mira (distância e rumo), total, área, perímetro.
   Melhorias: a mira ENCAIXA em vértices/pinos/pontos das camadas e no 1º ponto (fecha a área); "📍 Aqui" põe o ponto do GPS;
   comprimento de cada segmento escrito no mapa; sair (voltar/✕) NUNCA perde a medição: salva e vai para o Drive sozinha. */
const MED_COR = '#0EA5E9';
function iniciarMedir() { if (!V.geo) return toast('Este mapa não tem georreferência.'); fecharSheetForca(); V.medir = []; V.medModo = LSx.get('medModo', 'linha'); V.el.classList.add('medindo'); desligarSeguir(); pintarMedBar(); pedir(); }
function miraTela() { return [V.cw / 2, V.ch / 2]; }
function encaixe(sx, sy) { // ponto conhecido perto da mira/toque (até 22 px): {ll, nome}
  const ult = V.medir && V.medir.length ? V.medir[V.medir.length - 1] : null;
  let melhor = null, dm = 22; const tenta = (lat, lon, nome) => { if (ult && dist(ult, [lat, lon]) < 0.5 && !/fecha/.test(nome)) return; const q = m2s(...V.geo.ll2px(lat, lon)); const d = Math.hypot(q[0] - sx, q[1] - sy); if (d < dm) { dm = d; melhor = { ll: [lat, lon], nome }; } };
  if (V.medir && V.medir.length >= 3 && V.medModo !== 'circulo') tenta(V.medir[0][0], V.medir[0][1], '1º ponto — fecha a área');
  for (const m of V.marcas || []) if (m.tipo === 'pino') tenta(m.lat, m.lon, m.nome);
  const fs = [...(V.vetPx || []), ...V.camadas.filter(c => c.on).flatMap(c => c.f)];
  for (const f of fs) { const n = f.c.length; if (n > 400) continue; for (let k = 0; k < n; k++) tenta(f.c[k][0], f.c[k][1], f.tipo === 'ponto' ? (f.nome || 'ponto') : `${f.nome || 'vértice'} · v${k + 1}`); }
  return melhor; }
function alvoMira() { const [sx, sy] = miraTela(); const e = encaixe(sx, sy); if (e) return e; const m = s2m(sx, sy); return { ll: V.geo.px2ll(m[0], m[1]), nome: '' }; }
function ptsMedida(comMira) { // vértices da medição (com a mira como vértice provisório)
  const pts = V.medir.slice(); if (comMira && V.medModo !== 'circulo') { const a = alvoMira(); const ult = pts[pts.length - 1]; if (!ult || dist(ult, a.ll) > 0.05) pts.push(a.ll); } return pts; }
function circuloPts(c, r, n = 72) { const out = []; for (let i = 0; i < n; i++) out.push(destino(c, i * 360 / n, r)); return out; }
function destino(p, rumoG, d) { const R = 6371008.8, δ = d / R, θ = rumoG * RAD, φ1 = p[0] * RAD, λ1 = p[1] * RAD;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)); const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)); return [φ2 / RAD, λ2 / RAD]; }
function resumoMedida() { const md = V.medModo, pts = V.medir, a = alvoMira(); const L = [];
  if (md === 'circulo') { if (!pts.length) return { linhas: ['Mire o CENTRO e toque em ＋ Ponto'], a };
    const r = dist(pts[0], pts[1] || a.ll); L.push(`Raio <b>${fmtCompM(r)}</b>`, `Área <b>${fmtArea(Math.PI * r * r)}</b>`, `Perímetro <b>${fmtCompM(2 * Math.PI * r)}</b>`); return { linhas: L, a }; }
  if (!pts.length) return { linhas: ['Mire o 1º ponto e toque em ＋ Ponto'], a };
  const ult = pts[pts.length - 1], seg = dist(ult, a.ll), rm = rumo(ult, a.ll);
  L.push(`Segmento <b>${fmtCompM(seg)}</b> · rumo ${Math.round(rm)}° ${cardeal(rm)}`);
  const pv = ptsMedida(true);
  if (md === 'area') { if (pv.length >= 3) L.push(`Área <b>${fmtArea(areaLL(pv))}</b>`, `Perímetro <b>${fmtCompM(compLL(pv, true))}</b>`); else L.push('Área: faltam ' + (3 - pv.length) + ' ponto(s)'); }
  else L.push(`Total <b>${fmtCompM(compLL(pv))}</b> · ${pts.length} ponto(s)`);
  return { linhas: L, a }; }
function pintarMedTop() { const el = $('#mpvMedTop'); if (!el || !V.medir) return; const r = resumoMedida(); const u = window.toUTM ? toUTM(r.a.ll[0], r.a.ll[1]) : null;
  const pv = V.medModo === 'circulo' ? null : ptsMedida(true); const aTot = V.medModo === 'circulo' ? (V.medir.length ? Math.PI * dist(V.medir[0], V.medir[1] || r.a.ll) ** 2 : 0) : (V.medModo === 'area' && pv.length >= 3 ? areaLL(pv) : 0);
  el.innerHTML = `<button class="ghost" id="medX" aria-label="Sair da medição">✕</button><button class="ghost" id="medU" aria-label="Unidades">⇄ un.</button><div class="mt1">${r.linhas.join('<br>')}</div>${aTot ? `<div class="mt3">${fmtAreaTodas(aTot)}</div>` : ''}<div class="mt2">${r.a.nome ? '🧲 ' + esc(r.a.nome) + ' · ' : ''}mira: ${u ? `${u.zone}${u.hemi} E ${br(u.e)} N ${br(u.n)}` : r.a.ll.map(x => x.toFixed(6)).join(', ')}</div>`;
  $('#medX').onclick = () => sairMedir(true); $('#medU').onclick = escolherUnidades; }
function pintarMedBar() { const b = $('#mpvMedBar'); if (!b) return; const md = V.medModo, n = V.medir ? V.medir.length : 0;
  b.innerHTML = `<div class="r1"><button id="medDesf" ${n ? '' : 'disabled'}>↶ Desfazer</button><button class="mais" id="medAdd">＋ Ponto</button><button id="medGps" ${V.pos ? '' : 'disabled'}>📍 Aqui</button></div>
  <div class="r2"><div class="seg">${[['linha', 'Linha'], ['area', 'Área'], ['circulo', 'Círculo']].map(([k, t]) => `<button data-mm="${k}" class="${md === k ? 'on' : ''}">${t}</button>`).join('')}</div><button id="medRumo" ${md === 'circulo' ? 'disabled' : ''}>🧭 Rumo e dist.</button><button class="ok" id="medOk">✓ Salvar</button></div>`;
  $('#medDesf').onclick = () => { V.medir.pop(); pintarMedBar(); pedir(); };
  $('#medAdd').onclick = () => addMedida(alvoMira());
  $('#medGps').onclick = () => { if (!V.pos) return toast('Ainda sem GPS.'); if (V.pos.acc > 20) toast(`GPS com ±${Math.round(V.pos.acc)} m — o ponto pode estar deslocado.`, 3000); addMedida({ ll: [V.pos.lat, V.pos.lon], nome: 'GPS' }); };
  b.querySelectorAll('[data-mm]').forEach(x => x.onclick = () => { V.medModo = x.dataset.mm; LSx.set('medModo', V.medModo); if (V.medModo === 'circulo' && V.medir.length > 2) V.medir = V.medir.slice(0, 1); pintarMedBar(); pedir(); });
  $('#medRumo').onclick = sheetRumo; $('#medOk').onclick = () => sairMedir(false, true); }
function addMedida(a) { if (!V.medir) return; navigator.vibrate && navigator.vibrate(15);
  if (V.medModo === 'circulo') { if (V.medir.length >= 2) V.medir = V.medir.slice(0, 1); if (V.medir.length && dist(V.medir[0], a.ll) < 0.5) return toast('Afaste a mira do centro para marcar o raio.'); V.medir.push(a.ll); if (V.medir.length === 2) toast('Raio marcado. Toque em ✓ Salvar ou mexa de novo.'); pintarMedBar(); pedir(); return; }
  if (V.medir.length >= 3 && dist(a.ll, V.medir[0]) < 0.05) { V.medModo = 'area'; toast('Área fechada ✓'); pintarMedBar(); pedir(); return; }
  const ult = V.medir[V.medir.length - 1]; if (ult && dist(ult, a.ll) < 0.05) return toast('Mesmo ponto do anterior.');
  V.medir.push(a.ll); pintarMedBar(); pedir(); }
function sheetRumo() { const ini = V.medir.length ? V.medir[V.medir.length - 1] : alvoMira().ll;
  const s = sheet(`<h3>🧭 Rumo e distância</h3><div class="nota">A partir ${V.medir.length ? 'do último ponto' : 'da mira'}. Rumo em graus a partir do Norte (0 a 360), sentido horário — ex.: 90 = Leste.</div><div class="row"><input id="rgR" placeholder="Rumo (°)" inputmode="decimal"><input id="rgD" placeholder="Distância (m)" inputmode="decimal"></div><div class="lin"><button class="green" id="rgOk">＋ Adicionar ponto</button><button class="ghost" id="rgX">Voltar</button></div>`);
  s.querySelector('#rgOk').onclick = () => { const r = parseFloat(String(s.querySelector('#rgR').value).replace(',', '.')), d = parseFloat(String(s.querySelector('#rgD').value).replace(/\./g, '').replace(',', '.'));
    if (!isFinite(r) || r < 0 || r > 360 || !isFinite(d) || d <= 0) return toast('Rumo de 0 a 360 e distância em metros.');
    if (!V.medir.length) V.medir.push(ini); V.medir.push(destino(ini, r, d)); fecharSheetForca(); pintarMedBar(); pedir(); toast(`Ponto a ${fmtDist(d)} no rumo ${r}° ✓`); };
  s.querySelector('#rgX').onclick = fecharSheetForca; }
async function sairMedir(perguntar, salvarDireto) { const pts = V.medir || []; const md = V.medModo;
  const valida = md === 'circulo' ? pts.length >= 2 : pts.length >= 2;
  if (perguntar && valida) { const r = await escolha('Sair da medição', 'A medição tem ' + pts.length + ' ponto(s).', [{ t: 'Salvar e sair', v: 's', cls: 'green' }, { t: 'Descartar', v: 'd', cls: 'sec' }]); if (!r) return; if (r === 'd') { fimMedir(); return; } }
  if (valida) { const n = (V.marcas || []).filter(m => m.tipo === 'medida').length + 1; let reg;
    if (md === 'circulo') { const r = dist(pts[0], pts[1]); reg = { nome: 'Círculo ' + n, pts: circuloPts(pts[0], r), fechado: true, raio: r, centro: pts[0], comp: 2 * Math.PI * r, perim: 2 * Math.PI * r, area: Math.PI * r * r }; }
    else { const f = md === 'area' && pts.length >= 3; reg = { nome: (f ? 'Área ' : 'Medição ') + n, pts: pts.map(q => [q[0], q[1]]), fechado: f, comp: compLL(pts), perim: f ? compLL(pts, true) : null, area: f ? areaLL(pts) : null }; }
    const reg2 = Object.assign({ id: uid('M'), obraId: V.ob.id, tipo: 'medida', modo: md, quem: (APP() && APP().quem) || '', criadoEm: new Date().toISOString(), enviado: false }, reg);
    await MDB.put('marcas', reg2); V.marcas.push(reg2); agendarEnvio(V.ob);
    toast(`${reg2.nome} salva: ${reg2.area ? fmtArea(reg2.area) + ' · ' : ''}${fmtCompM(reg2.fechado ? reg2.perim : reg2.comp)}. Vai para o Drive sozinha.`, 3500); }
  else if (salvarDireto) { toast(md === 'circulo' ? 'Marque o centro e o raio.' : 'Marque pelo menos 2 pontos.'); return; }
  fimMedir(); }
function fimMedir() { V.medir = null; V.el && V.el.classList.remove('medindo'); const t = $('#mpvMedTop'); if (t) t.innerHTML = ''; pedir(); }
function desenharMedida(c) { if (!V.medir || !V.geo) return; const md = V.medModo, a = alvoMira();
  if (md === 'circulo') { if (V.medir.length) { const r = dist(V.medir[0], V.medir[1] || a.ll); linhaLL(c, circuloPts(V.medir[0], r), MED_COR, 3, true); linhaLL(c, [V.medir[0], V.medir[1] || a.ll], MED_COR, 2); } }
  else { const pv = ptsMedida(true); if (pv.length > 1) { linhaLL(c, pv, MED_COR, 3, md === 'area' && pv.length > 2);
      for (let i = 1; i < pv.length; i++) { const p = m2s(...V.geo.ll2px(pv[i - 1][0], pv[i - 1][1])), q = m2s(...V.geo.ll2px(pv[i][0], pv[i][1])); if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 70) continue;
        const tx = fmtCompM(dist(pv[i - 1], pv[i])); c.font = '700 12px system-ui,sans-serif'; const w = c.measureText(tx).width + 10, mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; c.fillStyle = 'rgba(255,255,255,.92)'; c.fillRect(mx - w / 2, my - 10, w, 20); c.fillStyle = '#075985'; c.fillText(tx, mx - w / 2 + 5, my + 4); } } }
  for (const p of V.medir) { const s = m2s(...V.geo.ll2px(p[0], p[1])); c.fillStyle = '#fff'; c.strokeStyle = MED_COR; c.lineWidth = 3; c.beginPath(); c.arc(s[0], s[1], 6, 0, 7); c.fill(); c.stroke(); }
  // mira
  const [mx, my] = miraTela(); const enc = !!a.nome && a.nome !== 'GPS'; c.save(); c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 5; const cruz = () => { c.beginPath(); c.moveTo(mx - 22, my); c.lineTo(mx - 6, my); c.moveTo(mx + 6, my); c.lineTo(mx + 22, my); c.moveTo(mx, my - 22); c.lineTo(mx, my - 6); c.moveTo(mx, my + 6); c.lineTo(mx, my + 22); c.stroke(); };
  cruz(); c.strokeStyle = enc ? '#16A34A' : '#DC2626'; c.lineWidth = 2.5; cruz(); if (enc) { const q = m2s(...V.geo.ll2px(a.ll[0], a.ll[1])); c.beginPath(); c.arc(q[0], q[1], 13, 0, 7); c.stroke(); } c.restore();
  pintarMedTop(); }
async function sheetMais() {
  const outros = (await MDB.obra('mapas', V.ob.id)).filter(m => m.id !== V.m.id && !m.camada);
  const pinos = (V.marcas || []).filter(m => m.tipo === 'pino'), trilhas = (V.marcas || []).filter(m => m.tipo === 'trilha'); const pend = (V.marcas || []).filter(m => !m.enviado).length;
  const s = sheet(`<div class="lin" style="margin:0 0 8px"><button class="sec" id="shMapa">⤴ Compartilhar este mapa</button><button class="sec" id="shMarcas">⤴ Pinos e trilhas</button></div><div class="lin" style="margin:0 0 8px"><button class="sec" id="gpsMarcas">🛰 Pinos/trilhas para GPS</button>${V.camadas.length || V.vet ? '<button class="sec" id="gpsCamadas">🛰 Camadas para GPS</button>' : ''}</div><div class="lin" style="margin:0 0 8px"><button class="sec" id="bAbrir">🔎 Buscar no mapa</button><label class="chk" style="flex:1;margin:0;text-transform:none;letter-spacing:0;font-size:13px;color:var(--ink);font-weight:400;border:0;padding:4px 0"><input type="checkbox" id="alAreas" ${LSx.get('alertaAreas', true) ? 'checked' : ''}><span>🔔 Avisar ao entrar/sair das áreas</span></label></div><button class="sec" id="unAbrir" style="width:100%;margin-bottom:8px">📐 Unidades: ${esc(U_AREA[uArea()][0].split(' (')[0])} · ${esc(U_COMP[uComp()][0].split(' (')[0])}</button><button class="big" id="ccAbrir">📌 Plotar coordenada / ir até um ponto</button><div class="nota">UTM, graus decimais, graus-minutos-segundos ou colar o texto (memorial, WhatsApp, Google Earth). SIRGAS 2000, WGS 84 ou SAD 69.</div>
  ${V.camadas.length ? `<h3 style="margin-top:14px">Camadas por cima</h3>${V.camadas.map(c => `<label class="chk" style="text-transform:none;letter-spacing:0;font-size:15px;color:var(--ink);margin:0;font-weight:400"><input type="checkbox" data-cam="${esc(c.id)}" ${c.on ? 'checked' : ''}><span>${esc(c.nome)}</span></label>`).join('')}` : ''}
  <h3 style="margin-top:14px">Pinos (${pinos.length})</h3>${pinos.length ? pinos.map(p => `<div class="chk" style="align-items:center"><span style="flex:1"><b>${esc(p.nome)}</b>${V.pos ? `<br><small class="muted">a ${fmtDist(dist([V.pos.lat, V.pos.lon], [p.lat, p.lon]))}</small>` : ''}</span><button class="sec" data-ir="${esc(p.id)}" style="padding:8px 12px">➜ Ir</button></div>`).join('') : '<div class="muted">Nenhum. 📍 Marcar guarda onde você está; segurar o dedo no mapa marca outro ponto.</div>'}
  ${trilhas.length ? `<h3 style="margin-top:14px">Trilhas (${trilhas.length})</h3>${trilhas.map(t => `<div class="muted">〰 ${esc(t.nome)} · ${fmtDist(compLL(t.pts))}</div>`).join('')}` : ''}
  <div class="lin"><button class="${pend ? 'green' : 'sec'}" id="shEnv" ${pend ? '' : 'disabled'}>${pend ? `Mandar ${pend} marcação(ões) ao Drive` : 'Tudo já foi para o Drive ✓'}</button></div>
  ${outros.length ? `<h3 style="margin-top:14px">Trocar de mapa</h3>${outros.map(m => `<button class="obra" data-mapa="${esc(m.id)}" style="margin-bottom:6px"><b>🗺 ${esc(m.nome.replace(/\.[^.]+$/, ''))}</b><small>${esc(m.resumo || '')}</small></button>`).join('')}` : ''}
  ${V.geo ? `<div class="nota" style="margin-top:12px">Sobre este mapa: UTM ${V.geo.z}${V.geo.sul ? 'S' : 'N'} · ajuste da georreferência ${V.geo.residuo < 1 ? 'menor que 1 m' : '±' + br(V.geo.residuo, 1) + ' m'}${V.geo.aviso ? ' · ' + esc(V.geo.aviso) : ''}</div>` : ''}`);
  s.querySelector('#ccAbrir').onclick = () => sheetCoord();
  s.querySelector('#bAbrir').onclick = () => sheetBusca('');
  s.querySelector('#unAbrir').onclick = escolherUnidades;
  s.querySelector('#alAreas').onchange = e => { LSx.set('alertaAreas', e.target.checked); toast(e.target.checked ? 'Vai avisar (vibra e apita) ao entrar ou sair das áreas.' : 'Aviso de áreas desligado.'); };
  s.querySelector('#shMapa').onclick = () => compartilharMapa(V.m);
  s.querySelector('#gpsMarcas').onclick = () => paraGPS('Marcacoes ' + V.ob.nome, (V.marcas || []).filter(m => m.tipo === 'pino' || (m.pts && m.pts.length > 1)));
  const gc = s.querySelector('#gpsCamadas'); if (gc) gc.onclick = () => paraGPS(V.m.nome.replace(/\.[^.]+$/, '') + ' camadas', (V.vet || []).concat(...V.camadas.filter(c => c.on).map(c => c.f)));
  s.querySelector('#shMarcas').onclick = () => compartilharMarcas(V.ob, (V.marcas || []).filter(m => m.tipo === 'pino' || (m.pts && m.pts.length > 1)), 'Marcações de campo');
  s.querySelectorAll('[data-cam]').forEach(i => i.onchange = () => { const c = V.camadas.find(x => x.id === i.dataset.cam); c.on = i.checked; const d = LSx.get('mpCamDesl_' + V.ob.id, {}); d[c.id] = c.on ? 0 : 1; LSx.set('mpCamDesl_' + V.ob.id, d); pedir(); });
  s.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => { const p = pinos.find(x => x.id === b.dataset.ir); V.alvo = { id: p.id, lat: p.lat, lon: p.lon, nome: p.nome }; fecharSheet(); painelNav(); avisos(); pedir(); });
  s.querySelectorAll('[data-mapa]').forEach(b => b.onclick = () => abrir(V.ob, b.dataset.mapa));
  s.querySelector('#shEnv').onclick = async () => { await enviarMarcas(V.ob); fecharSheet(); };
}

/* ---------------- plotar coordenada (qualquer formato) ---------------- */
function sheetCoord() {
  const z0 = V.geo ? V.geo.z : 20, s0 = V.geo ? V.geo.sul : false; const fm = LSx.get('ccFmt', 'utm'), dt = LSx.get('ccDatum', 'sirgas');
  const B = (k, t) => `<button data-f="${k}" class="${fm === k ? 'on' : ''}">${t}</button>`, inp = (id, ph, im) => `<input id="${id}" placeholder="${ph}" inputmode="${im || 'decimal'}" autocomplete="off">`;
  const campos = {
    utm: `<div class="row"><label style="margin:0">Zona</label><label style="margin:0">Hemisfério</label></div><div class="row"><input id="cZ" value="${z0}" inputmode="numeric"><div class="seg" id="cH"><button data-h="N" class="${s0 ? '' : 'on'}">N</button><button data-h="S" class="${s0 ? 'on' : ''}">S</button></div></div><div class="row" style="margin-top:8px">${inp('cE', 'E (ex.: 707601)')}${inp('cN', 'N (ex.: 286304)')}</div>`,
    dec: `<div class="row">${inp('cLa', 'Lat (ex.: 2,588889)', 'text')}${inp('cLo', 'Lon (ex.: -61,132778)', 'text')}</div><div class="nota">Sul e Oeste com sinal de menos, ou escreva a letra: 2,5888 N · 61,1327 O.</div>`,
    gms: ['Lat', 'Lon'].map((q, i) => `<label>${q === 'Lat' ? 'Latitude' : 'Longitude'}</label><div class="row" style="gap:6px">${inp('c' + q + 'G', 'graus °', 'numeric')}${inp('c' + q + 'M', "min '", 'numeric')}${inp('c' + q + 'S', 'seg "')}<div class="seg" data-q="${q}" style="flex:0 0 auto">${i === 0 ? `<button data-h="N" class="${s0 ? '' : 'on'}">N</button><button data-h="S" class="${s0 ? 'on' : ''}">S</button>` : `<button data-h="O" class="on">O</button><button data-h="L">L</button>`}</div></div>`).join(''),
    gm: ['Lat', 'Lon'].map((q, i) => `<label>${q === 'Lat' ? 'Latitude' : 'Longitude'}</label><div class="row" style="gap:6px">${inp('c' + q + 'G', 'graus °', 'numeric')}${inp('c' + q + 'M', "min,decimal '")}<div class="seg" data-q="${q}" style="flex:0 0 auto">${i === 0 ? `<button data-h="N" class="${s0 ? '' : 'on'}">N</button><button data-h="S" class="${s0 ? 'on' : ''}">S</button>` : `<button data-h="O" class="on">O</button><button data-h="L">L</button>`}</div></div>`).join(''),
    txt: `<textarea id="cTx" placeholder="Cole aqui. Um ponto por linha, pode ter nome antes. Exemplos:\nA4-V1: 02°35'20&quot;N 61°09'01&quot;W\n2.588889, -61.150278\n20N 705655 286302\nE=705654,92 N=286301,95"></textarea><div class="nota">Aceita UTM (com ou sem zona), graus decimais, graus-minutos-segundos e graus-minutos. Vários pontos de uma vez: um por linha.</div>` };
  const s = sheet(`<h3>📌 Plotar coordenada</h3><div class="seg" id="cF" style="flex-wrap:wrap">${B('utm', 'UTM')}${B('dec', 'Graus dec.')}${B('gms', 'G° M\' S"')}${B('gm', "G° M,m'")}${B('txt', 'Colar texto')}</div>
    <div id="cCampos" style="margin-top:8px">${campos[fm]}</div>
    <label>Datum da coordenada</label><div class="seg" id="cD"><button data-d="sirgas" class="${dt === 'sirgas' ? 'on' : ''}">SIRGAS 2000 / WGS 84</button><button data-d="sad" class="${dt === 'sad' ? 'on' : ''}">SAD 69</button></div>
    ${fm === 'txt' ? '' : `<label>Nome do ponto (opcional)</label><input id="cNome" placeholder="ex.: afloramento, porteira, A4-V1" autocomplete="off">`}
    <div class="geo" id="cPrev" style="margin-top:10px;font-size:13px">Preencha a coordenada.</div>
    <div class="lin"><button class="green" id="cPlot">📍 Plotar no mapa</button><button id="cIr">➜ Ir até</button></div><div class="lin"><button class="ghost" id="cVolta">‹ Voltar</button></div>`);
  s.querySelectorAll('#cF button').forEach(b => b.onclick = () => { LSx.set('ccFmt', b.dataset.f); sheetCoord(); });
  s.querySelectorAll('#cD button').forEach(b => b.onclick = () => { LSx.set('ccDatum', b.dataset.d); s.querySelectorAll('#cD button').forEach(x => x.classList.toggle('on', x === b)); prev(); });
  s.querySelectorAll('.seg[data-q] button, #cH button').forEach(b => b.onclick = () => { b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); prev(); });
  s.querySelector('#cVolta').onclick = () => sheetMais();
  const v = id => { const e = s.querySelector('#' + id); return e ? String(e.value).trim() : ''; }, nn = x => parseFloat(String(x).replace(/\s/g, '').replace(',', '.'));
  const hOn = sel => { const b = s.querySelector(sel + ' button.on'); return b ? b.dataset.h : ''; };
  function ler() { // → lista de {lat, lon (SIRGAS), nome, orig} ou {erro}
    const sad = LSx.get('ccDatum', 'sirgas') === 'sad', f = LSx.get('ccFmt', 'utm'); const out = [];
    const fecha = (lat, lon, nome, orig) => { if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return { erro: 'coordenada fora do mundo: confira os números' }; if (sad) [lat, lon] = sad69ParaSirgas(lat, lon); return { lat, lon, nome, orig }; };
    const deUtm = (E, N, z, sul, nome, orig) => { if (!isFinite(E) || !isFinite(N)) return { erro: 'preencha E e N' }; if (E < 100000 || E > 900000) return { erro: 'E fora do intervalo UTM (100.000 a 900.000) — será que E e N estão trocados?' };
      const ll = sad ? utmIe(E, N, z, sul, 6378160, 1 / 298.25) : utmI(E, N, z, sul); return fecha(ll[0], ll[1], nome, orig); };
    if (f === 'utm') { const z = parseInt(v('cZ'), 10); if (!(z >= 1 && z <= 60)) return [{ erro: 'zona UTM de 1 a 60 (Roraima: 20 ou 21)' }]; out.push(deUtm(nn(v('cE').replace(/\./g, '')), nn(v('cN').replace(/\./g, '')), z, hOn('#cH') === 'S', v('cNome'), `UTM ${z}${hOn('#cH')} E ${v('cE')} N ${v('cN')}`)); }
    else if (f === 'dec') { const r = lerCoordTexto(v('cLa') + ' ; ' + v('cLo'), z0, s0); out.push(r && !r.erro && !r.utm ? fecha(r.lat, r.lon, v('cNome'), `${v('cLa')} ${v('cLo')}`) : { erro: 'preencha lat e lon' }); }
    else if (f === 'gms' || f === 'gm') { const g = q => { const G = nn(v('c' + q + 'G')), M = nn(v('c' + q + 'M') || 0), S = f === 'gms' ? nn(v('c' + q + 'S') || 0) : 0; if (!isFinite(G) || M >= 60 || S >= 60) return NaN; const h = hOn(`.seg[data-q="${q}"]`); return (G + M / 60 + S / 3600) * (/[SO]/.test(h) ? -1 : 1); };
      out.push(fecha(g('Lat'), g('Lon'), v('cNome'), f.toUpperCase())); }
    else { const linhas = v('cTx').split(/\n+/).filter(x => x.trim()); if (!linhas.length) return [{ erro: 'cole pelo menos uma coordenada' }];
      linhas.forEach((l, i) => { const r = lerCoordTexto(l, z0, s0); if (!r || r.erro) { out.push({ erro: `linha ${i + 1}: ${r ? r.erro : 'vazia'}` }); return; }
        out.push(r.utm ? deUtm(r.utm.E, r.utm.N, r.utm.z, r.utm.sul, r.nome, l.trim()) : fecha(r.lat, r.lon, r.nome, l.trim())); }); }
    return out; }
  function prev() { const el = s.querySelector('#cPrev'); const r = ler(); const ok = r.filter(x => !x.erro), er = r.filter(x => x.erro);
    if (!ok.length) { el.innerHTML = er.length && (v('cE') || v('cN') || v('cLa') || v('cLaG') || v('cTx')) ? '⚠ ' + esc(er[0].erro) : 'Preencha a coordenada.'; return; }
    el.innerHTML = ok.slice(0, 4).map(p => { const u = window.toUTM ? toUTM(p.lat, p.lon) : null; const dentroMapa = V.geo && V.geo.moldura ? dentro(V.geo.ll2px(p.lat, p.lon), V.geo.moldura) : true;
      return `${p.nome ? '<b>' + esc(p.nome) + '</b> · ' : ''}${p.lat.toFixed(6).replace('.', ',')}, ${p.lon.toFixed(6).replace('.', ',')}${u ? ` · UTM ${u.zone}${u.hemi} E ${br(u.e)} N ${br(u.n)}` : ''}${V.pos ? ` · a ${fmtDist(dist([V.pos.lat, V.pos.lon], [p.lat, p.lon]))} de você` : ''}${dentroMapa ? '' : ' · <b>fora deste mapa</b>'}`; }).join('<br>') +
      (ok.length > 4 ? `<br>… e mais ${ok.length - 4}` : '') + (er.length ? `<br>⚠ ${er.length} linha(s) não lida(s): ${esc(er[0].erro)}` : '') + (LSx.get('ccDatum', 'sirgas') === 'sad' ? '<br><small>Convertido de SAD 69 para SIRGAS 2000.</small>' : ''); }
  s.querySelectorAll('input,textarea').forEach(e => e.oninput = prev); prev();
  s.querySelector('#cPlot').onclick = async () => { const ok = ler().filter(x => !x.erro); if (!ok.length) return toast('Confira a coordenada.');
    for (const p of ok) { const pn = await novoPino(p.lat, p.lon, null, p.nome || undefined); pn.nota = 'digitado: ' + (p.orig || '') + (LSx.get('ccDatum', 'sirgas') === 'sad' ? ' (SAD 69 convertido)' : ''); pn.digitado = true; await MDB.put('marcas', pn); }
    fecharSheetForca(); const p = ok[0]; if (V.geo) { const q = V.geo.ll2px(p.lat, p.lon); V.tx = V.cw / 2 - q[0] * V.k; V.ty = V.ch / 2 - q[1] * V.k; } pedir(); toast(ok.length === 1 ? 'Ponto plotado ✓ (toque nele para ir até)' : `${ok.length} pontos plotados ✓`); };
  s.querySelector('#cIr').onclick = () => { const ok = ler().filter(x => !x.erro); if (!ok.length) return toast('Confira a coordenada.'); const p = ok[0];
    V.alvo = { lat: p.lat, lon: p.lon, nome: p.nome || 'coordenada digitada' }; fecharSheetForca(); if (V.geo) { const q = V.geo.ll2px(p.lat, p.lon); V.tx = V.cw / 2 - q[0] * V.k; V.ty = V.ch / 2 - q[1] * V.k; } painelNav(); avisos(); pedir(); };
}
/* ---------------- 🔎 BUSCAR NO MAPA (lista de feições do Avenza) ---------------- */
function itensBusca() { const out = []; const cen = c => [c.reduce((a, p) => a + p[0], 0) / c.length, c.reduce((a, p) => a + p[1], 0) / c.length];
  for (const m of V.marcas || []) { if (m.tipo === 'pino') out.push({ ic: '📍', nome: m.nome, sub: attrTexto(m) || 'ponto', ll: [m.lat, m.lon], pino: m });
    else if (m.pts && m.pts.length) out.push({ ic: m.tipo === 'trilha' ? '〰' : '📏', nome: m.nome, sub: m.area ? fmtArea(m.area) : fmtDist(m.comp || compLL(m.pts)), ll: cen(m.pts) }); }
  const camadas = [...(V.vet ? [{ nome: V.m.nome, f: V.vet }] : []), ...(V.camadas || []).map(c => ({ nome: c.nome, f: c.f }))];
  for (const cm of camadas) for (const f of cm.f) { if (!f.c || !f.c.length) continue; out.push({ ic: f.tipo === 'ponto' ? '•' : f.tipo === 'area' ? '▭' : '〰', nome: f.nome || '(sem nome)', sub: cm.nome.replace(/\.[^.]+$/, '') + (f.tipo === 'area' ? ' · ' + fmtArea(areaLL(f.c)) : ''), ll: f.tipo === 'ponto' ? f.c[0] : cen(f.c), desc: f.desc }); }
  return out; }
function sheetBusca(q) { const todos = itensBusca(); const norm = x => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); const qq = norm(q || '');
  const lista = todos.filter(i => !qq || norm(i.nome + ' ' + i.sub).includes(qq)).map(i => Object.assign(i, { d: V.pos ? dist([V.pos.lat, V.pos.lon], i.ll) : null })).sort((a, b) => (a.d ?? 0) - (b.d ?? 0)).slice(0, 80);
  const s = sheet(`<h3>🔎 Buscar no mapa</h3><input id="bq" placeholder="nome do ponto, vértice, área…" value="${esc(q || '')}" autocomplete="off"><div class="nota">${todos.length} itens neste mapa e nas camadas ligadas${V.pos ? ' · do mais perto para o mais longe' : ''}.</div>
    ${lista.map((i, k) => `<div class="chk" style="align-items:center;padding:7px 0"><span style="width:20px;text-align:center">${i.ic}</span><span style="flex:1;font-size:14px" data-ver="${k}"><b>${esc(i.nome)}</b><br><small class="muted">${esc(i.sub)}${i.d != null ? ' · a ' + fmtDist(i.d) : ''}</small></span><button class="sec" data-ir="${k}" style="padding:7px 10px">➜</button></div>`).join('') || '<div class="muted">Nada encontrado.</div>'}
    <div class="lin"><button class="ghost" id="bX">‹ Voltar</button></div>`);
  const inp = s.querySelector('#bq'); inp.oninput = () => { clearTimeout(sheetBusca.t); sheetBusca.t = setTimeout(() => { sheetBusca(inp.value); const n = $('#bq'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); };
  const centrar = ll => { const q = V.geo.ll2px(ll[0], ll[1]); if (V.k * V.geo.pxm < .3) V.k = Math.min(V.kmax, .6 / V.geo.pxm); V.tx = V.cw / 2 - q[0] * V.k; V.ty = V.ch / 2 - q[1] * V.k; V.detalhe = null; desligarSeguir(); pedir(); };
  s.querySelectorAll('[data-ver]').forEach(e => e.onclick = () => { const i = lista[+e.dataset.ver]; centrar(i.ll); if (i.pino) popPino(i.pino); else popPonto(V.geo.ll2px(i.ll[0], i.ll[1]), i.nome, i.desc); });
  s.querySelectorAll('[data-ir]').forEach(e => e.onclick = () => { const i = lista[+e.dataset.ir]; V.alvo = { lat: i.ll[0], lon: i.ll[1], nome: i.nome }; fecharSheetForca(); centrar(i.ll); painelNav(); avisos(); });
  s.querySelector('#bX').onclick = () => sheetMais(); }
function fecharSheetForca() { const s = $('#mpvSh'); if (s) { s.classList.remove('on'); V.sheetAberto = false; } }

/* ---------------- trilha ---------------- */
async function iniciarTrilha() {
  if (!V.geo) return toast('Este mapa não tem georreferência.');
  V.trilha = { id: uid('T'), retomadoEm: Date.now(), obraId: V.ob.id, tipo: 'trilha', nome: 'Trilha ' + (window.fmtData ? fmtData(new Date()) : new Date().toLocaleString('pt-BR')), pts: [], quem: (APP() && APP().quem) || '', criadoEm: new Date().toISOString(), enviado: false, inicio: Date.now() };
  await MDB.put('marcas', V.trilha); try { V.wake = await navigator.wakeLock.request('screen'); } catch (e) {}
  pintarBotaoTrilha(); gravarPontoTrilha(); toast('Gravando a trilha. Deixe o app aberto: a tela fica acesa sozinha.', 4000);
}
function statsTrilha(t) { const pts = t.pts; let sobe = 0, desce = 0, ultAlt = null; for (const q of pts) { if (q[2] == null) continue; if (ultAlt != null) { const d = q[2] - ultAlt; if (Math.abs(d) >= 2) { if (d > 0) sobe += d; else desce -= d; ultAlt = q[2]; } } else ultAlt = q[2]; }
  const ms = (t.ativoMs || 0) + (t.pausado ? 0 : Date.now() - (t.retomadoEm || t.inicio || Date.now())); const d = compLL(pts); const h = ms / 3.6e6;
  const hh = Math.floor(ms / 3.6e6), mm = Math.floor(ms / 6e4) % 60, ss = Math.floor(ms / 1000) % 60;
  return { d, ms, tempo: `${hh ? hh + 'h' : ''}${String(mm).padStart(hh ? 2 : 1, '0')}min${hh ? '' : String(ss).padStart(2, '0') + 's'}`, vel: h > 0.0003 ? d / 1000 / h : 0, sobe, desce }; }
async function menuTrilha() { const t = V.trilha; const st = statsTrilha(t);
  const r = await escolha(t.pausado ? '⏸ Trilha pausada' : '⏺ Gravando trilha', `<b>${fmtDist(st.d)}</b> · ${st.tempo} · ${br(st.vel, 1)} km/h · ⬆ ${Math.round(st.sobe)} m ⬇ ${Math.round(st.desce)} m · ${t.pts.length} pontos`,
    [t.pausado ? { t: '▶ Retomar', v: 'ret', cls: 'green' } : { t: '⏸ Pausar', v: 'pau', cls: 'sec' }, { t: '⏹ Parar e salvar', v: 'fim', cls: 'green' }]);
  if (r === 'pau') { t.ativoMs = (t.ativoMs || 0) + Date.now() - (t.retomadoEm || t.inicio); t.pausado = true; await MDB.put('marcas', t); pintarBotaoTrilha(); toast('Trilha pausada. Toque de novo para retomar.'); }
  else if (r === 'ret') { t.pausado = false; t.retomadoEm = Date.now(); await MDB.put('marcas', t); pintarBotaoTrilha(); gravarPontoTrilha(); toast('Trilha retomada.'); }
  else if (r === 'fim') { if (t.pausado) { t.pausado = false; t.retomadoEm = Date.now(); } const s2 = statsTrilha(t); t.stats = { dist: s2.d, ms: s2.ms, vel: s2.vel, sobe: s2.sobe, desce: s2.desce }; await pararTrilha(); } }
async function gravarPontoTrilha() { const t = V.trilha, p = V.pos; if (!t || !p || p.acc > 35 || t.pausado) return; const ult = t.pts[t.pts.length - 1];
  if (ult && dist(ult, [p.lat, p.lon]) < Math.max(3, p.acc / 3)) return; t.pts.push([p.lat, p.lon, p.alt == null ? null : Math.round(p.alt * 10) / 10, Date.now()]);
  if (t.pts.length % 5 === 1) MDB.put('marcas', t).catch(() => {}); if (Date.now() - (t.ultParcial || t.inicio || 0) > 600000) enviarTrilhaParcial(t); pintarBotaoTrilha(); }
async function pararTrilha() { const t = V.trilha; V.trilha = null; try { V.wake && V.wake.release(); } catch (e) {} V.wake = null;
  if (t.pts.length < 2) { await MDB.del('marcas', t.id); toast('Trilha muito curta: não guardei.'); }
  else { await MDB.put('marcas', t); V.marcas = await MDB.obra('marcas', V.ob.id); toast(`Trilha guardada: ${fmtDist(compLL(t.pts))}. Vai para o Drive da obra.`, 3500); enviarMarcas(V.ob, true); }
  pintarBotaoTrilha(); pedir(); }
function pintarBotaoTrilha() { const b = V.el && V.el.querySelector('[data-a="trilha"]'); if (!b) return; b.classList.toggle('on', !!V.trilha); b.textContent = V.trilha ? `${V.trilha.pausado ? '⏸' : '⏺'} ${fmtDist(compLL(V.trilha.pts))}` : '⏺ Trilha'; painelCoord(); }

/* ---------------- envio ao Drive (KML na pasta da obra, pela fila do app) ----------------
   v1.22.3: tudo que se marca, edita ou mede vai SOZINHO para a fila (15 s depois da última mudança);
   com internet sobe na hora, sem internet fica guardado e sobe quando pegar sinal. */
const AGENDA = {};
function agendarEnvio(ob) { if (!ob) return; clearTimeout(AGENDA[ob.id]); AGENDA[ob.id] = setTimeout(() => enviarMarcas(ob, true), 15000); }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') for (const id in AGENDA) { clearTimeout(AGENDA[id]); const ob = (APP() && APP().pacote && APP().pacote.obras || []).find(o => o.id === id); if (ob) enviarMarcas(ob, true); } });
function kmlDe(itens, ob) {
  const x = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const pm = itens.map(m => m.tipo === 'medida'
    ? `<Placemark><name>${x(m.nome)}</name><description>${x(`${m.fechado ? 'perímetro ' + fmtCompM(m.perim) + ' · área ' + fmtAreaTodas(m.area) : fmtCompM(m.comp)}${m.raio ? ' · raio ' + fmtCompM(m.raio) : ''} · ${m.quem || ''} · ${m.criadoEm}`)}</description><styleUrl>#medida</styleUrl><ExtendedData><Data name="comprimento_m"><value>${(m.fechado ? m.perim : m.comp || 0).toFixed(2)}</value></Data>${m.area ? `<Data name="area_m2"><value>${m.area.toFixed(1)}</value></Data><Data name="area_ha"><value>${(m.area / 1e4).toFixed(4)}</value></Data>` : ''}</ExtendedData>${m.fechado ? `<Polygon><outerBoundaryIs><LinearRing><coordinates>${m.pts.concat([m.pts[0]]).map(p => `${p[1].toFixed(7)},${p[0].toFixed(7)}`).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon>` : `<LineString><coordinates>${m.pts.map(p => `${p[1].toFixed(7)},${p[0].toFixed(7)}`).join(' ')}</coordinates></LineString>`}</Placemark>`
    : m.tipo === 'pino'
    ? `<Placemark><name>${x(m.nome)}</name><description>${x([attrTexto(m), m.nota, m.acc ? 'GPS ±' + Math.round(m.acc) + ' m' : m.digitado ? 'plotado por coordenada' : 'marcado no mapa', m.quem, m.criadoEm].filter(Boolean).join(' · '))}</description><styleUrl>#pino</styleUrl><ExtendedData>${[['categoria', m.cat ? nomeCat(m.cat) : ''], ['litologia', (m.attr || {}).lito], ['amostra', (m.attr || {}).amostra], ['dir_mergulho', (m.attr || {}).dirMerg], ['mergulho', (m.attr || {}).merg], ['fotos', (m.fotos || []).length || ''], ['obs', m.nota]].filter(d => d[1] != null && d[1] !== '').map(d => `<Data name="${d[0]}"><value>${x(d[1])}</value></Data>`).join('')}</ExtendedData><Point><coordinates>${m.lon.toFixed(7)},${m.lat.toFixed(7)}${m.alt != null ? ',' + m.alt : ''}</coordinates></Point></Placemark>`
    : `<Placemark><name>${x(m.nome)}</name><description>${x(`${fmtDist(compLL(m.pts))}${m.stats ? ` · ${Math.round(m.stats.ms / 6e4)} min · ${br(m.stats.vel, 1)} km/h · subida ${Math.round(m.stats.sobe)} m · descida ${Math.round(m.stats.desce)} m` : ''} · ${m.quem || ''}`)}</description><styleUrl>#trilha</styleUrl><LineString><tessellate>1</tessellate><coordinates>${m.pts.map(p => `${p[1].toFixed(7)},${p[0].toFixed(7)}${p[2] != null ? ',' + p[2] : ''}`).join(' ')}</coordinates></LineString></Placemark>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${x(ob.nome)} — marcações de campo</name><Style id="pino"><IconStyle><color>ff0b9ef5</color></IconStyle></Style><Style id="trilha"><LineStyle><color>ffed3a7c</color><width>3</width></LineStyle></Style><Style id="medida"><LineStyle><color>ffc78402</color><width>2</width></LineStyle><PolyStyle><color>33c78402</color></PolyStyle></Style>\n${pm}\n</Document></kml>`;
}
async function enviarMarcas(ob, quieto) {
  const pend = (await MDB.obra('marcas', ob.id)).filter(m => !m.enviado && (m.tipo === 'pino' || (m.pts && m.pts.length > 1)) && !(V.trilha && V.trilha.id === m.id)); if (!pend.length) return;
  if (typeof window.enfileirarArquivo !== 'function') return;
  if (enviarMarcas.ocupado) { agendarEnvio(ob); return; } enviarMarcas.ocupado = true; const nome = `${window.hoje ? hoje() : new Date().toISOString().slice(0, 10)}_marcacoes_mapa_${window.slug ? slug((APP() && APP().quem) || 'campo') : 'campo'}.kml`;
  try { await enfileirarArquivo(new Blob([kmlDe(pend, ob)], { type: 'application/vnd.google-earth.kml+xml' }), 'mapa', nome, { pinos: pend.filter(m => m.tipo === 'pino').length, trilhas: pend.filter(m => m.tipo === 'trilha').length }, { obra: ob, quieto: true });
    for (const m of pend) { m.enviado = true; await MDB.put('marcas', m); } if (V.aberto) V.marcas = await MDB.obra('marcas', ob.id); if (!quieto) toast('Marcações na fila para o Drive da obra ✓'); } catch (e) { if (!quieto) toast('Não consegui pôr na fila: ' + (e.message || e)); }
  finally { enviarMarcas.ocupado = false; }
}
/* trilha em gravação: cópia parcial na fila a cada 10 min (celular que apaga no meio do caminho não perde o trajeto) */
async function enviarTrilhaParcial(t) { if (!t || t.pts.length < 2 || typeof window.enfileirarArquivo !== 'function' || !V.ob) return; t.ultParcial = Date.now();
  const nome = `${hoje()}_trilha_parcial_${slug((APP() && APP().quem) || 'campo')}.kml`;
  try { await enfileirarArquivo(new Blob([kmlDe([Object.assign({}, t, { nome: t.nome + ' (parcial, ainda gravando)' })], V.ob)], { type: 'application/vnd.google-earth.kml+xml' }), 'mapa', nome, { trilhaParcial: t.id, pontos: t.pts.length }, { obra: V.ob, quieto: true }); } catch (e) {} }

/* ---------------- fechar ---------------- */
function fecharVisual(trocando) {
  if (!V.aberto) return false; const ob = V.ob;
  if (V.trilha && !trocando) { if (!confirm('A trilha está sendo gravada. Fechar o mapa para a gravação. Fechar assim mesmo?')) { try { history.pushState({ t: 'mapa' }, ''); } catch (e) {} return true; } pararTrilha(); }
  if (V.medir && !trocando) sairMedir(false);
  try { navigator.geolocation.clearWatch(V.watch); } catch (e) {} clearInterval(V.reserva); if (V.tarefa) try { V.tarefa.cancel(); } catch (e) {}
  if (V.bussolaOn) { window.removeEventListener('deviceorientationabsolute', ouvirB, true); window.removeEventListener('deviceorientation', ouvirB, true); }
  window.removeEventListener('resize', V.aoRedim); if (V.doc) try { V.doc.destroy(); } catch (e) {}
  V.el && V.el.remove(); const tr = V.trilha, wk = V.wake; Object.keys(V).forEach(k => delete V[k]); V.aberto = false; if (trocando && tr) { V.trilha = tr; V.wake = wk; }
  if (!trocando && ob) { enviarMarcas(ob, true); if (OB_ATUAL && OB_ATUAL.id === ob.id) pintarLista(ob); }
  return true;
}
function voltar() { // botão voltar do celular: fecha a escolha, o painel, depois o mapa; nunca sai do app
  if (ESC.aberto) { const f = ESC.aberto; f(-1); try { history.pushState({ t: V.aberto ? 'mapa' : 'app' }, ''); } catch (e) {} return true; }
  if (!V.aberto) return false; const s = $('#mpvSh'); if (s && s.classList.contains('on')) { s.classList.remove('on'); V.sheetAberto = false; pedir(); try { history.pushState({ t: 'mapa' }, ''); } catch (e) {} return true; }
  if (V.medir) { sairMedir(false); try { history.pushState({ t: 'mapa' }, ''); } catch (e) {} return true; } /* voltar na medição: salva e sai, nunca perde */
  fecharVisual(); return true;
}

/* ---------------- para o resto do app ---------------- */
async function contar(obraId) { try { return (await MDB.obra('mapas', obraId)).filter(m => !m.camada).length; } catch (e) { return 0; } }
async function sincronizarTudo(forcar) { // abre o app com internet → mapas de todas as obras descem sem ninguém pedir
  if (!navigator.onLine || sincronizarTudo.rodando) return; const ult = LSx.get('mapasTudoEm', 0); if (!forcar && Date.now() - ult < 3 * 3600e3) return;
  sincronizarTudo.rodando = true; try { await baixarTodas(); LSx.set('mapasTudoEm', Date.now()); } finally { sincronizarTudo.rodando = false; } }
setTimeout(() => sincronizarTudo(false), 20000);
async function baixarTodas() { const obs = (APP() && APP().pacote && APP().pacote.obras) || []; let n = 0; for (const ob of obs) { if (!ob.pastaId) continue; await sincronizar(ob, { silencioso: true }); n++; } return n; }
window.MAPAS = { tela, ligar, abrir, voltar, aberto: () => !!V.aberto, auto: ob => sincronizar(ob, { silencioso: true }), baixarTodas, sincronizarTudo, contar,
  _dbg: { med: () => [V.medModo, V.medir], ll2s: (la, lo) => m2s(...V.geo.ll2px(la, lo)), pan: (sx, sy) => { V.tx += V.cw / 2 - sx; V.ty += V.ch / 2 - sy; pedir(); } },
  _t: { lerCoordTexto, sad69ParaSirgas, utmIe, lerGeoPDF, criarGeo, utmF, utmI, lerKML, lerGPX, analisar, unzip, dist, rumo, areaLL, epsgInfo } };
})();
