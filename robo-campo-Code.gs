/**
 * ROBÔ DE CAMPO — Natural Engenharia (Google Apps Script)
 * ---------------------------------------------------------
 * Recebe o que o app de campo manda (fotos carimbadas, áudio do diário,
 * fotos de ficha, registros do dia e ocorrências) e grava DIRETO na pasta
 * 03_CAMPO do serviço no Drive. Também serve o campo.json (lista de obras
 * abertas + SOPs), que o escritório/Claude exporta do painel.
 *
 * Como implantar (uma vez, 5 minutos, na conta geologoygor@gmail.com):
 *  1. script.google.com > Novo projeto > apague o conteúdo e cole este arquivo.
 *  2. Renomeie o projeto para "Robô de Campo - Natural Engenharia".
 *  3. Implantar > Nova implantação > tipo "App da Web":
 *       Executar como: EU  ·  Quem pode acessar: QUALQUER PESSOA
 *  4. Autorize (Drive). Copie a URL que termina em /exec e cole nos Ajustes do app.
 *  5. Para atualizar o código depois: Implantar > Gerenciar implantações > editar > Nova versão.
 *
 * Fonte da verdade continua sendo o painel. Este robô não decide nada: grava onde mandaram.
 *
 * v1.1 (22/09/2026) — MARCOS de georreferenciamento: foto com slot "marco" vai para
 * 03_CAMPO/MARCOS com o nome do código da chapa (ex.: FTBE-M-0001.jpg) e ganha um
 * FTBE-M-0001.kml com a coordenada da foto. Código: o digitado no app; se não veio,
 * o robô lê na foto (OCR do Google Drive). Sem código legível: MARCO_SEM_CODIGO_<hora>.jpg
 * e a linha do log marca "conferir". Requer o serviço avançado "Drive API" ligado.
 */

var CFG = {
  TOKEN: 'natural-campo-2026',                       // a mesma chave que está no app (não é segredo: é só filtro de lixo)
  PASTA_CLAUDE: '12UbxG4RW2h_eLgzWEzd2t4tEF7JHzmId',  // NATURAL ENGENHARIA/CLAUDE (onde o campo.json é exportado)
  NOME_CAMPO_JSON: 'campo.json',
  PASTA_ENTRADA: '1uFB62zCGjGdim2ejHyDIvFQwHhlkLXaf', // BANCO DE DADOS/00_ENTRADA_FOTOS_CAMPO (obra sem pasta cai aqui, em subpasta por obra)
  SUBPASTA_CAMPO: '03_CAMPO',                        // subpasta da pasta do serviço que recebe o material de campo
  LOG: 'campo_envios.jsonl',                         // um envio por linha, na pasta ENTRADA (o Claude importa para o painel)
  MAX_BYTES: 25 * 1024 * 1024,
  SUBPASTA_MARCOS: 'MARCOS'
};

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.token !== CFG.TOKEN) return json_({ ok: false, erro: 'chave inválida' });
  if (p.acao === 'config') {
    var f = acharPorNome_(DriveApp.getFolderById(CFG.PASTA_CLAUDE), CFG.NOME_CAMPO_JSON);
    if (!f) return json_({ ok: false, erro: 'campo.json não encontrado na pasta CLAUDE' });
    return ContentService.createTextOutput(f.getBlob().getDataAsString('UTF-8')).setMimeType(ContentService.MimeType.JSON);
  }
  if (p.acao === 'log') {
    var lg = acharPorNome_(DriveApp.getFolderById(CFG.PASTA_ENTRADA), CFG.LOG);
    return ContentService.createTextOutput(lg ? lg.getBlob().getDataAsString('UTF-8') : '').setMimeType(ContentService.MimeType.TEXT);
  }
  return json_({ ok: true, robo: 'campo', versao: '1.1', agora: new Date().toISOString() });
}

function doPost(e) {
  var d;
  try { d = JSON.parse(e.postData.contents); } catch (x) { return json_({ ok: false, erro: 'corpo inválido' }); }
  if (d.token !== CFG.TOKEN) return json_({ ok: false, erro: 'chave inválida' });
  if (d.acao !== 'enviar' || !d.b64 || !d.nome) return json_({ ok: false, erro: 'faltou arquivo' });
  var lock = LockService.getScriptLock(); lock.tryLock(20000);
  try {
    var bytes = Utilities.base64Decode(d.b64);
    if (bytes.length > CFG.MAX_BYTES) return json_({ ok: false, erro: 'arquivo acima de 25 MB' });
    var mime = String(d.mime || 'application/octet-stream');
    if (!/^(image\/|audio\/|video\/|application\/json|application\/pdf)/.test(mime)) return json_({ ok: false, erro: 'tipo não aceito: ' + mime });

    var destino = pastaDestino_(d);
    if (d.slot === 'marco' && /^image\//.test(mime)) return json_(salvarMarco_(d, bytes, mime, destino));
    var nome = nomeArquivo_(d);
    // idempotente: o app pode reenviar depois de uma falha de rede
    var jaExiste = acharPorNome_(destino.pasta, nome);
    var arq = jaExiste || destino.pasta.createFile(Utilities.newBlob(bytes, mime, nome));
    try { arq.setDescription(JSON.stringify({ app: 'campo', id: d.id, obraId: d.obraId, obra: d.obraNome, quem: d.quem, tipo: d.tipo, slot: d.slot, meta: d.meta })); } catch (x) {}

    registrar_({ em: new Date().toISOString(), id: d.id, obraId: d.obraId, obra: d.obraNome, quem: d.quem, tipo: d.tipo, slot: d.slot, slotTitulo: d.slotTitulo, nome: nome, fileId: arq.getId(), url: arq.getUrl(), pasta: destino.rotulo, pastaId: destino.pasta.getId(), semPastaDaObra: destino.transito, meta: d.meta || null, criadoEm: d.criadoEm || null });
    return json_({ ok: true, id: arq.getId(), url: arq.getUrl(), pasta: destino.rotulo, transito: destino.transito, repetido: !!jaExiste });
  } catch (err) {
    return json_({ ok: false, erro: String(err && err.message || err) });
  } finally { try { lock.releaseLock(); } catch (x) {} }
}

/* ---------- marcos de georreferenciamento ---------- */
var PADRAO_MARCO = /([A-Z0-9]{3,5})\s*[-–—_ ]?\s*([MPV])\s*[-–—_ ]?\s*([0-9OIl]{3,5})/;
function normCodigo_(t) {
  var m = PADRAO_MARCO.exec(String(t || '').toUpperCase()); if (!m) return '';
  var num = m[3].replace(/O/g, '0').replace(/[IL]/g, '1'); if (!/^\d{3,5}$/.test(num)) return '';
  return m[1] + '-' + m[2] + '-' + num;
}
function lerCodigoNaFoto_(bytes, mime) { // OCR do Google Drive: vira Documento Google, lê o texto, apaga
  var docId = null;
  try {
    var blob = Utilities.newBlob(bytes, mime, 'ocr_marco.jpg');
    var f = Drive.Files.create({ name: 'ocr_marco_tmp', mimeType: 'application/vnd.google-apps.document', parents: [CFG.PASTA_ENTRADA] }, blob, { ocrLanguage: 'pt' });
    docId = f.id;
    var texto = DocumentApp.openById(docId).getBody().getText();
    return { codigo: normCodigo_(texto), texto: texto.replace(/\s+/g, ' ').slice(0, 200) };
  } catch (x) { return { codigo: '', texto: '', erro: String(x && x.message || x) }; }
  finally { if (docId) try { DriveApp.getFileById(docId).setTrashed(true); } catch (y) {} }
}
function nomeLivre_(pasta, base, ext) { var n = base + ext, i = 2; while (acharPorNome_(pasta, n)) { n = base + '_' + (i++) + ext; } return n; }
function kmlMarco_(codigo, d, nomeFoto) {
  var m = d.meta || {}; var esc = function (t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
  var desc = 'Obra: ' + (d.obraNome || '') + '\nFoto: ' + nomeFoto + '\nData: ' + (m.quando || '') + '\nQuem: ' + (d.quem || '') +
    '\nPrecisão: ±' + (m.acc != null ? Math.round(m.acc) : '?') + ' m (GPS do celular) · SIRGAS 2000 (≈ WGS 84)' +
    '\nATENÇÃO: posição do celular na hora da foto, não é a coordenada levantada do marco (essa vem do GNSS).';
  return '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>' + esc(codigo) + '</name>' +
    '<Placemark><name>' + esc(codigo) + '</name><description>' + esc(desc) + '</description><Point><coordinates>' + m.lon + ',' + m.lat + ',0</coordinates></Point></Placemark></Document></kml>\n';
}
function salvarMarco_(d, bytes, mime, destino) {
  var props = PropertiesService.getScriptProperties(); var ja = props.getProperty('marco_' + d.id);
  if (ja) { try { var o = JSON.parse(ja); var fj = DriveApp.getFileById(o.fileId); return { ok: true, id: o.fileId, url: fj.getUrl(), pasta: o.pasta, repetido: true, marco: o.marco }; } catch (x) {} }
  var pasta = acharSubpasta_(destino.pasta, CFG.SUBPASTA_MARCOS) || destino.pasta.createFolder(CFG.SUBPASTA_MARCOS);
  var extra = (d.meta && d.meta.extra) || {};
  var digitado = normCodigo_(extra.marco), fonte = '', ocr = null, codigo = '';
  if (digitado) { codigo = digitado; fonte = 'digitado'; }
  else { ocr = lerCodigoNaFoto_(bytes, mime); if (ocr.codigo) { codigo = ocr.codigo; fonte = 'lido na foto'; } }
  var hora = String(d.nome || '').slice(11, 17) || Utilities.formatDate(new Date(), 'America/Boa_Vista', 'HHmmss');
  var base = codigo || ('MARCO_SEM_CODIGO_' + String(d.nome || '').slice(0, 10) + '_' + hora);
  var nomeFoto = nomeLivre_(pasta, base, '.jpg');
  var arq = pasta.createFile(Utilities.newBlob(bytes, mime, nomeFoto));
  var kml = null, m = d.meta || {};
  if (m.lat != null && m.lon != null) kml = pasta.createFile(Utilities.newBlob(kmlMarco_(codigo || base, d, nomeFoto), 'application/vnd.google-earth.kml+xml', nomeFoto.replace(/\.jpg$/, '.kml')));
  var info = { codigo: codigo || null, fonte: fonte || null, conferir: !codigo, foto: nomeFoto, kml: kml ? kml.getName() : null, ocr: ocr ? (ocr.texto || ocr.erro || '') : null };
  try { arq.setDescription(JSON.stringify({ app: 'campo', id: d.id, obraId: d.obraId, obra: d.obraNome, quem: d.quem, tipo: 'marco', marco: info, meta: d.meta })); } catch (x) {}
  var rot = destino.rotulo + '/' + CFG.SUBPASTA_MARCOS;
  props.setProperty('marco_' + d.id, JSON.stringify({ fileId: arq.getId(), pasta: rot, marco: info }));
  registrar_({ em: new Date().toISOString(), id: d.id, obraId: d.obraId, obra: d.obraNome, quem: d.quem, tipo: 'marco', slot: 'marco', nome: nomeFoto, fileId: arq.getId(), url: arq.getUrl(), kmlId: kml ? kml.getId() : null, pasta: rot, pastaId: pasta.getId(), semPastaDaObra: destino.transito, marco: info, meta: d.meta || null, criadoEm: d.criadoEm || null });
  return { ok: true, id: arq.getId(), url: arq.getUrl(), pasta: rot, transito: destino.transito, marco: info };
}

/* ---------- destino ---------- */
function pastaDestino_(d) {
  if (d.pastaId) {
    try {
      var servico = DriveApp.getFolderById(d.pastaId);
      var campo = acharSubpasta_(servico, CFG.SUBPASTA_CAMPO) || servico.createFolder(CFG.SUBPASTA_CAMPO);
      return { pasta: campo, rotulo: servico.getName() + '/' + campo.getName(), transito: false };
    } catch (x) { /* pasta apagada ou sem acesso: cai na entrada */ }
  }
  var entrada = DriveApp.getFolderById(CFG.PASTA_ENTRADA);
  var nomeSub = limpar_(d.obraNome || d.obraId || 'SEM OBRA').slice(0, 80);
  var sub = acharSubpasta_(entrada, nomeSub) || entrada.createFolder(nomeSub);
  return { pasta: sub, rotulo: '00_ENTRADA_FOTOS_CAMPO/' + nomeSub, transito: true };
}
function nomeArquivo_(d) {
  var base = String(d.nome).replace(/[\\\/:*?"<>|]/g, '_');
  var quem = d.quem ? '_' + limparNome_(d.quem) : '';
  // 2026-09-22_101530_Maquina_trabalhando_Denilson_Rabelo.jpg — data, hora e assunto já vêm do app
  var m = /^(.+?)(\.[A-Za-z0-9]+)$/.exec(base);
  return m ? m[1] + quem + m[2] : base + quem;
}
function acharSubpasta_(pasta, nome) {
  var it = pasta.getFolders();
  while (it.hasNext()) { var f = it.next(); var n = f.getName(); if (n === nome || n.toUpperCase().indexOf(nome.toUpperCase()) === 0) return f; }
  return null;
}
function acharPorNome_(pasta, nome) { var it = pasta.getFilesByName(nome); return it.hasNext() ? it.next() : null; }
function limpar_(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim(); }
function limparNome_(s) { return limpar_(s).split(' ').slice(0, 2).join('_'); }

/* ---------- log de envios (uma linha por arquivo) ---------- */
function registrar_(linha) {
  var entrada = DriveApp.getFolderById(CFG.PASTA_ENTRADA);
  var f = acharPorNome_(entrada, CFG.LOG);
  var txt = f ? f.getBlob().getDataAsString('UTF-8') : '';
  txt += JSON.stringify(linha) + '\n';
  if (f) f.setContent(txt); else entrada.createFile(CFG.LOG, txt, MimeType.PLAIN_TEXT);
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ---------- teste do OCR de marco (Executar > testarMarco): também serve para autorizar Drive/Documentos ---------- */
function testarMarco() {
  Logger.log(normCodigo_('INCRA  FTBE M 0O12 marco'));
  var img = UrlFetchApp ? null : null; // sem imagem: só confere que o serviço Drive e o DocumentApp estão autorizados
  var doc = DocumentApp.create('teste_ocr_tmp'); DriveApp.getFileById(doc.getId()).setTrashed(true);
  Logger.log('Drive API: ' + (typeof Drive !== 'undefined' ? 'ligado' : 'DESLIGADO — ligue em Serviços > Drive API'));
}

/* ---------- teste manual (Executar > testar) ---------- */
function testar() {
  var r = doPost({ postData: { contents: JSON.stringify({ token: CFG.TOKEN, acao: 'enviar', id: 'teste1', obraId: 'OBteste', obraNome: 'TESTE DO ROBO DE CAMPO', quem: 'Ygor Sousa', tipo: 'registro', slot: 'registro', nome: 'teste_robo_campo.json', mime: 'application/json', meta: { app: 'teste' }, b64: Utilities.base64Encode('{"ok":true}') }) } });
  Logger.log(r.getContent());
}
