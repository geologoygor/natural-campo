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
 *
 * v1.7 (24/10/2026) — FIM DA LINHA REPETIDA NO LOG. O app reenvia quando passa de 60 s sem
 * resposta, quando a tela apaga ou quando a resposta vem cortada (isso é bom: nada fica no celular).
 * O arquivo já não era criado de novo, mas a linha ia de novo para o campo_envios.jsonl.
 * Agora: arquivo que já existe devolve o MESMO sucesso (mesmo id/url, repetido: true) e só grava
 * linha se o fileId ainda não estiver no log (caso a 1ª tentativa tenha morrido antes de registrar).
 * E se a trava não for pega em 20 s, o robô NÃO grava nada sem trava: devolve erro temporário
 * (ocupado: true) e o app tenta de novo sozinho (a fila reenvia os itens com erro a cada 60 s).
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
    var f = pacoteDeCampoComoArquivo_();
    if (!f) return json_({ ok: false, erro: 'campo.json não encontrado na pasta CLAUDE' });
    return ContentService.createTextOutput(f.getBlob().getDataAsString('UTF-8')).setMimeType(ContentService.MimeType.JSON);
  }
  if (p.acao === 'log') {
    var lg = acharPorNome_(DriveApp.getFolderById(CFG.PASTA_ENTRADA), CFG.LOG);
    return ContentService.createTextOutput(lg ? lg.getBlob().getDataAsString('UTF-8') : '').setMimeType(ContentService.MimeType.TEXT);
  }
  if (p.acao === 'mapas' || p.acao === 'mapa') { try { return acaoMapas_(p); } catch (x) { return json_({ ok: false, erro: String(x && x.message || x) }); } }
  return json_({ ok: true, robo: 'campo', versao: '1.7', agora: new Date().toISOString() });
}

function doPost(e) {
  var d;
  try { d = JSON.parse(e.postData.contents); } catch (x) { return json_({ ok: false, erro: 'corpo inválido' }); }
  if (d.token !== CFG.TOKEN) return json_({ ok: false, erro: 'chave inválida' });
  if (d.acao !== 'enviar' || !d.b64 || !d.nome) return json_({ ok: false, erro: 'faltou arquivo' });
  var lock = LockService.getScriptLock();
  // v1.7: sem a trava não grava nada (log sem trava perde/embaralha linhas); o app reenvia sozinho
  if (!lock.tryLock(20000)) return json_({ ok: false, erro: 'robô ocupado com outro envio — o app tenta de novo sozinho', ocupado: true });
  try {
    var bytes = Utilities.base64Decode(d.b64);
    if (bytes.length > CFG.MAX_BYTES) return json_({ ok: false, erro: 'arquivo acima de 25 MB' });
    var mime = String(d.mime || 'application/octet-stream');
    if (!/^(image\/|audio\/|video\/|application\/json|application\/pdf|application\/vnd\.google-earth\.km[lz]|application\/gpx)/.test(mime)) return json_({ ok: false, erro: 'tipo não aceito: ' + mime });

    var destino = pastaDestino_(d);
    if (d.slot === 'marco' && /^image\//.test(mime)) return json_(salvarMarco_(d, bytes, mime, destino));
    var nome = nomeArquivo_(d);
    // idempotente: o app pode reenviar depois de uma falha de rede
    var jaExiste = acharPorNome_(destino.pasta, nome);
    var arq = jaExiste || destino.pasta.createFile(Utilities.newBlob(bytes, mime, nome));
    try { arq.setDescription(JSON.stringify({ app: 'campo', id: d.id, obraId: d.obraId, obra: d.obraNome, quem: d.quem, tipo: d.tipo, slot: d.slot, meta: d.meta })); } catch (x) {}

    // v1.7: reenvio do mesmo arquivo não grava linha nova; só grava se o fileId ainda não está no log
    if (!jaExiste || !jaNoLog_(arq.getId())) registrar_({ em: new Date().toISOString(), id: d.id, obraId: d.obraId, obra: d.obraNome, quem: d.quem, tipo: d.tipo, slot: d.slot, slotTitulo: d.slotTitulo, nome: nome, fileId: arq.getId(), url: arq.getUrl(), pasta: destino.rotulo, pastaId: destino.pasta.getId(), semPastaDaObra: destino.transito, meta: d.meta || null, criadoEm: d.criadoEm || null });
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
function jaNoLog_(fileId) { // v1.7: o fileId já tem linha no campo_envios.jsonl?
  var f = acharPorNome_(DriveApp.getFolderById(CFG.PASTA_ENTRADA), CFG.LOG);
  return !!f && f.getBlob().getDataAsString('UTF-8').indexOf('"fileId":"' + fileId + '"') >= 0;
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


/* v1.2 (24/09/2026) — campo.json sem computador: a tarefa na nuvem grava campo_AAAAMMDD_HHMM.json (o Drive não sobrescreve arquivo).
 * Serve o mais recente; se não houver nenhum, cai no campo.json antigo. */
function campoMaisRecente_() {
  var pasta = DriveApp.getFolderById(CFG.PASTA_CLAUDE);
  var melhor = null, melhorNome = '';
  var it = pasta.searchFiles("title contains 'campo_'");
  while (it.hasNext()) {
    var f = it.next(); var n = f.getName();
    if (/^campo_\d{8}_\d{4}\.json$/.test(n) && n > melhorNome) { melhor = f; melhorNome = n; }
  }
  return melhor || acharPorNome_(pasta, CFG.NOME_CAMPO_JSON);
}
/* v1.3 (28/09/2026) - monta o pacote do app de campo a partir das PECAS gravadas
 * pela tarefa da nuvem. Motivo: o campo_AAAAMMDD_HHMM.json inteiro tem ~350 KB e
 * nao passa pelo conector do Drive, entao a tarefa grava pecas pequenas:
 *   campo_obras_<data>_<hora>_h<hash>.json       -> { geradoEm, obras[] }
 *   campo_patrimonio_<data>_<hora>_h<hash>.json  -> { geradoEm, patrimonio[], patrimonioProx, equipe[] }
 *   campo_sop_SOP-0XX_<data>_<hora>_h<hash>.json -> { geradoEm, codigo, sop{} }
 * A base continua sendo o campo_AAAAMMDD_HHMM.json mais recente (ou o campo.json
 * antigo); as pecas so entram por cima. Devolve um objeto com
 * getBlob().getDataAsString(), igual a um arquivo do Drive, para o doGet nao mudar. */
function pacoteDeCampoComoArquivo_() {
  var pasta = DriveApp.getFolderById(CFG.PASTA_CLAUDE);
  var fBase = null, nBase = '';
  var fObras = null, nObras = '', fPatr = null, nPatr = '', fSop = {}, nSop = {};
  var it = pasta.searchFiles("title contains 'campo_'");
  while (it.hasNext()) {
    var f = it.next(); var n = f.getName(); var m;
    if (/^campo_\d{8}_\d{4}\.json$/.test(n)) { if (n > nBase) { nBase = n; fBase = f; } }
    else if (/^campo_obras_\d{8}_\d{4}_h[0-9a-f]{8}\.json$/.test(n)) { if (n > nObras) { nObras = n; fObras = f; } }
    else if (/^campo_patrimonio_\d{8}_\d{4}_h[0-9a-f]{8}\.json$/.test(n)) { if (n > nPatr) { nPatr = n; fPatr = f; } }
    else if ((m = /^campo_sop_(SOP-\d{3})_\d{8}_\d{4}_h[0-9a-f]{8}\.json$/.exec(n))) { if (!nSop[m[1]] || n > nSop[m[1]]) { nSop[m[1]] = n; fSop[m[1]] = f; } }
  }
  if (!fBase) fBase = acharPorNome_(pasta, CFG.NOME_CAMPO_JSON);

  var ler_ = function (arq) { try { return JSON.parse(arq.getBlob().getDataAsString('UTF-8')); } catch (x) { return null; } };
  var pac = fBase ? ler_(fBase) : null;
  if (!pac && !fObras && !fPatr) return null;
  if (!pac) pac = { versao: 1, obras: [], sops: {} };

  var novo = pac.geradoEm || '';
  if (fObras) { var o = ler_(fObras); if (o && o.obras) { pac.obras = o.obras; if (o.geradoEm > novo) novo = o.geradoEm; } }
  if (fPatr) { var p = ler_(fPatr); if (p) { if (p.patrimonio) pac.patrimonio = p.patrimonio; if (p.patrimonioProx) pac.patrimonioProx = p.patrimonioProx; if (p.equipe) pac.equipe = p.equipe; if (p.geradoEm > novo) novo = p.geradoEm; } }
  for (var cod in fSop) { var s = ler_(fSop[cod]); if (s && s.sop) { pac.sops = pac.sops || {}; pac.sops[cod] = s.sop; if (s.geradoEm > novo) novo = s.geradoEm; } }
  if (novo) pac.geradoEm = novo;
  pac.montadoDePecas = !!(fObras || fPatr);
  /* v1.6 (17/10/2026) — obras FIXAS do app (prospecção, reconhecimento) que não estão no painel: CLAUDE/campo_obras_fixas.json { obras:[{..., ate:'AAAA-MM-DD'}] }.
   * Entram sempre por cima da lista do painel (a tarefa agendada não apaga) e saem sozinhas depois da data 'ate'. */
  try { var ff = acharPorNome_(pasta, 'campo_obras_fixas.json'); var fx = ff ? ler_(ff) : null; var hojeS = Utilities.formatDate(new Date(), 'America/Boa_Vista', 'yyyy-MM-dd');
    if (fx && fx.obras) { pac.obras = pac.obras || []; fx.obras.forEach(function (o) { if (o.ate && o.ate < hojeS) return; if (pac.obras.some(function (x) { return x.id === o.id; })) return; pac.obras.push(o); }); } } catch (x) {}

  var texto = JSON.stringify(pac);
  return { getBlob: function () { return { getDataAsString: function () { return texto; } }; } };
}

/* ================================================================
 * v1.5 (07/10/2026) — ÁUDIO DO DIÁRIO VIRA RDO (pedido do Ygor)
 * ----------------------------------------------------------------
 * A cada 15 min, processarAudiosRdo procura no log de envios os áudios
 * (tipo 'audio') que ainda não viraram RDO, manda cada um ao Gemini,
 * que transcreve e escreve o RDO em linguagem técnica SEM inventar
 * nada que não foi dito, e grava:
 *   1. um Documento Google "RDO AAAA-MM-DD — <obra>" na mesma pasta
 *      03_CAMPO do áudio (um por obra e dia; áudio novo do mesmo dia
 *      entra como seção nova no mesmo documento);
 *   2. uma linha em CLAUDE/rdo_pendentes.jsonl, que a tarefa agendada
 *      do Claude importa para a janela de RDO do painel como rascunho.
 * Gemini sobrecarregado (503/429) é comum no plano gratuito: o robô tenta
 * o próximo modelo da lista e, se todos estiverem ocupados, deixa o áudio
 * para a próxima rodada SEM contar como erro (áudio nunca se perde).
 * Erro de verdade (arquivo sumiu, resposta inválida) conta; 3 erros = desiste.
 * Cada rodada para antes de 4 min (o Google corta em 6).
 * A chave do Gemini fica em Propriedades do script: GEMINI_API_KEY.
 * Ligar uma vez: Executar > instalarGatilhoRdo.
 * ================================================================ */
var RDO_CFG = {
  MODELOS: ['gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-flash-latest'], // o lite responde mesmo com o Gemini lotado
  PENDENTES: 'rdo_pendentes.jsonl',
  ORCAMENTO_MS: 4 * 60 * 1000
};

function instalarGatilhoRdo() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processarAudiosRdo') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processarAudiosRdo').timeBased().everyMinutes(15).create();
  Logger.log('Gatilho do RDO instalado: a cada 15 min. Chave Gemini: ' +
    (PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') ? 'OK' : 'FALTA — cole em Configurações do projeto > Propriedades do script > GEMINI_API_KEY'));
}

function processarAudiosRdo() {
  var chave = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!chave) return;
  var lock = LockService.getScriptLock(); if (!lock.tryLock(5000)) return;
  var t0 = Date.now();
  try {
    var props = PropertiesService.getScriptProperties();
    var lg = acharPorNome_(DriveApp.getFolderById(CFG.PASTA_ENTRADA), CFG.LOG); if (!lg) return;
    var linhas = lg.getBlob().getDataAsString('UTF-8').split('\n');
    for (var i = linhas.length - 1; i >= 0; i--) {
      if (Date.now() - t0 > RDO_CFG.ORCAMENTO_MS * 0.5) break; // não começa áudio novo depois de 2 min
      if (!linhas[i]) continue;
      var L; try { L = JSON.parse(linhas[i]); } catch (x) { continue; }
      if (L.tipo !== 'audio' || !L.fileId) continue;
      var chaveProp = 'rdo_' + L.fileId;
      var estado = props.getProperty(chaveProp) || '';
      if (estado.indexOf('ok') === 0) continue;
      var travou = 0;
      if (estado.indexOf('tentando:') === 0) { // a rodada anterior foi cortada pelo Google no meio da chamada ao Gemini
        var pt = estado.split('|'); travou = +pt[1] || 1;
        if (Date.now() - new Date(pt[0].slice(9)).getTime() < 60 * 60 * 1000) break; // espera 1 h antes de tentar de novo
        if (travou >= 8) { props.setProperty(chaveProp, 'erro:3:Gemini não respondeu em 8 tentativas'); continue; }
      }
      var tentativas = estado.indexOf('erro:') === 0 ? (+estado.split(':')[1] || 0) : 0;
      if (tentativas >= 3) continue;
      props.setProperty(chaveProp, 'tentando:' + new Date().toISOString() + '|' + (travou + 1));
      try {
        var r = rdoDoAudio_(L, chave, t0);
        props.setProperty(chaveProp, 'ok:' + new Date().toISOString() + ':' + r.modelo);
      } catch (err) {
        var msg = String(err && err.message || err);
        if (/OCUPADO/.test(msg)) { props.setProperty(chaveProp, 'espera:' + new Date().toISOString()); break; } // Gemini lotado: tenta na próxima rodada
        props.setProperty(chaveProp, 'erro:' + (tentativas + 1) + ':' + msg.slice(0, 200));
      }
    }
  } finally { try { lock.releaseLock(); } catch (x) {} }
}

function rdoDoAudio_(L, chave, t0) {
  var arq = DriveApp.getFileById(L.fileId);
  var blob = arq.getBlob();
  var mime = String(blob.getContentType() || '').split(';')[0] || 'audio/webm';
  var quando = L.criadoEm || L.em;
  var dia = Utilities.formatDate(new Date(quando), 'America/Boa_Vista', 'yyyy-MM-dd');
  var hora = Utilities.formatDate(new Date(quando), 'America/Boa_Vista', 'HH:mm');
  var r = geminiRdo_(blob.getBytes(), mime, { obra: L.obra, quem: L.quem, dia: dia, hora: hora }, chave, t0 || Date.now());

  var pasta = DriveApp.getFolderById(L.pastaId);
  var titulo = 'RDO ' + dia + ' — ' + limpar_(L.obra || 'obra').slice(0, 80);
  var doc = acharPorNome_(pasta, titulo);
  var d = doc ? DocumentApp.openById(doc.getId()) : DocumentApp.create(titulo);
  if (!doc) { DriveApp.getFileById(d.getId()).moveTo(pasta); }
  var b = d.getBody();
  if (!doc) {
    b.appendParagraph('RELATÓRIO DIÁRIO DE OBRA').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    b.appendParagraph('Obra: ' + (L.obra || '—') + '   ·   Data: ' + dia.split('-').reverse().join('/'));
    b.appendParagraph('Natural Engenharia · gerado do áudio do diário de campo — conferir antes de usar').setItalic(true);
  }
  b.appendParagraph('Registro das ' + hora + ' — ' + (L.quem || 'campo')).setHeading(DocumentApp.ParagraphHeading.HEADING2).setItalic(false);
  var sec = [
    ['Serviço', r.servico], ['Equipe', r.equipe], ['Atividades executadas', r.atividades],
    ['Produção / rendimento', r.rendimento], ['Condições do tempo', r.clima],
    ['Ocorrências e interferências', r.ocorrencias], ['Pendências', r.pendencias]
  ];
  sec.forEach(function (s) {
    if (!s[1] || /^(—|-|não informado\.?)$/i.test(String(s[1]).trim())) return;
    b.appendParagraph(s[0]).setBold(true).setItalic(false);
    b.appendParagraph(String(s[1])).setBold(false).setItalic(false);
  });
  var duv = (r.duvidas || []).filter(function (x) { return x && String(x).trim(); });
  if (duv.length) { b.appendParagraph('Conferir com quem gravou').setBold(true).setItalic(false); duv.forEach(function (x) { b.appendListItem(String(x)).setBold(false); }); }
  b.appendParagraph('Transcrição do áudio (como foi falado)').setBold(true).setItalic(false);
  b.appendParagraph(String(r.transcricao || '')).setBold(false).setItalic(true);
  b.appendParagraph('Áudio: ' + arq.getUrl()).setItalic(false);
  d.saveAndClose();

  var linha = {
    em: new Date().toISOString(), obraId: L.obraId || '', obra: L.obra || '', data: dia, hora: hora,
    quem: L.quem || '', audioId: L.fileId, audioUrl: arq.getUrl(), docUrl: DriveApp.getFileById(d.getId()).getUrl(),
    clima: r.clima || '', feito: r.texto_rdo || '', ocorrencias: r.ocorrencias || '', pendencias: r.pendencias || '',
    transcricao: r.transcricao || '', duvidas: duv, modelo: r.modelo
  };
  var claude = DriveApp.getFolderById(CFG.PASTA_CLAUDE);
  var pf = acharPorNome_(claude, RDO_CFG.PENDENTES);
  var txt = (pf ? pf.getBlob().getDataAsString('UTF-8') : '') + JSON.stringify(linha) + '\n';
  if (pf) pf.setContent(txt); else claude.createFile(RDO_CFG.PENDENTES, txt, MimeType.PLAIN_TEXT);
  return { modelo: r.modelo, docUrl: linha.docUrl };
}

function geminiRdo_(bytes, mime, ctx, chave, t0) {
  var prompt = [
    'Você é o redator técnico de uma empresa de engenharia e geologia (Natural Engenharia, Boa Vista/RR): poço tubular, sondagem SPT, topografia, georreferenciamento, geofísica, obra civil.',
    'O áudio é o diário de campo gravado no fim do dia por quem estava na obra "' + (ctx.obra || '') + '", em ' + ctx.dia + ' às ' + ctx.hora + ', por ' + (ctx.quem || 'alguém da equipe') + '.',
    'Tarefa 1: transcreva o áudio fielmente, em português, como foi falado. Trecho incompreensível: escreva [inaudível].',
    'Tarefa 2: escreva o RDO do dia em linguagem técnica de engenharia, clara e objetiva, melhor redigida do que a fala, SEM perder a essência.',
    'REGRAS DURAS: nunca invente número, profundidade, vazão, quantidade, horário, nome ou fato que não foi dito. Não acrescente conclusão técnica que a fala não sustenta. Termos de campo viram o termo técnico correto quando o sentido for inequívoco (ex.: "bateu pedra" -> "atingiu-se material rochoso"). Se algo ficou ambíguo, não resolva: liste em "duvidas". Campo sem informação no áudio fica "não informado".',
    'Responda SOMENTE com JSON neste formato: {"transcricao":"","servico":"","equipe":"","atividades":"","rendimento":"","clima":"","ocorrencias":"","pendencias":"","texto_rdo":"(parágrafo único, técnico, com as atividades do dia, para o campo O que foi feito do RDO)","duvidas":[""]}'
  ].join('\n');
  var b64 = Utilities.base64Encode(bytes);
  var mimes = [mime]; if (/webm/.test(mime)) mimes.push('audio/ogg');
  var ocupado = false, ultimo = '';
  for (var m = 0; m < RDO_CFG.MODELOS.length; m++) {
    for (var k = 0; k < mimes.length; k++) {
      if (Date.now() - t0 > RDO_CFG.ORCAMENTO_MS) throw new Error('OCUPADO: sem tempo nesta rodada (' + ultimo + ')');
      var corpo = { contents: [{ parts: [{ inline_data: { mime_type: mimes[k], data: b64 } }, { text: prompt }] }],
                    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } };
      var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + RDO_CFG.MODELOS[m] + ':generateContent?key=' + encodeURIComponent(chave);
      var resp; Logger.log('Gemini ' + RDO_CFG.MODELOS[m] + ' (' + mimes[k] + ', ' + Math.round(bytes.length / 1024) + ' KB)…');
      try { resp = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(corpo), muteHttpExceptions: true }); }
      catch (e) { ocupado = true; ultimo = RDO_CFG.MODELOS[m] + ' sem resposta'; break; }
      var cod = resp.getResponseCode(); Logger.log('  → ' + cod + ' em ' + Math.round((Date.now() - t0) / 1000) + ' s desde o início');
      if (cod === 200) {
        var j = JSON.parse(resp.getContentText());
        var t = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts || []).map(function (p) { return p.thought ? '' : (p.text || ''); }).join('');
        var r = JSON.parse(String(t).replace(/^\s*\x60\x60\x60json\s*|\s*\x60\x60\x60\s*$/g, ''));
        r.modelo = RDO_CFG.MODELOS[m]; return r;
      }
      ultimo = RDO_CFG.MODELOS[m] + ' ' + cod + ' ' + resp.getContentText().slice(0, 160);
      if (cod === 503 || cod === 429 || cod === 500 || cod === 504) { ocupado = true; break; } // modelo lotado: próximo modelo
      if (cod === 404) break; // modelo não existe para esta chave: próximo modelo
      // 400 com o mime do webm: tenta audio/ogg no mesmo modelo
    }
  }
  throw new Error((ocupado ? 'OCUPADO: ' : 'Gemini: ') + ultimo);
}

/* teste manual: Executar > testarRdo — processa já o áudio mais recente do log */
function testarRdo() {
  var chave = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!chave) { Logger.log('Falta GEMINI_API_KEY nas Propriedades do script.'); return; }
  var lg = acharPorNome_(DriveApp.getFolderById(CFG.PASTA_ENTRADA), CFG.LOG);
  var linhas = lg.getBlob().getDataAsString('UTF-8').trim().split('\n').reverse();
  for (var i = 0; i < linhas.length; i++) {
    var L; try { L = JSON.parse(linhas[i]); } catch (x) { continue; }
    if (L.tipo === 'audio') {
      var r = rdoDoAudio_(L, chave, Date.now());
      PropertiesService.getScriptProperties().setProperty('rdo_' + L.fileId, 'ok:teste:' + r.modelo);
      Logger.log('RDO gerado (' + r.modelo + '): ' + r.docUrl); return;
    }
  }
  Logger.log('Nenhum áudio no log ainda.');
}

/* v1.4 (17/10/2026) — MAPAS DA OBRA para o app de campo (substitui o Avenza).
 *   ?acao=mapas&pasta=<pastaId>              -> lista os mapas da pasta do serviço (PDF de mapa/prancha/planta, KML, KMZ, GPX, TIF)
 *   ?acao=mapa&pasta=<pastaId>&id=<fileId>&parte=N -> entrega o arquivo em partes de 5 MB (base64)
 * Segurança: só responde para pasta de obra que está no pacote do app, só arquivo de mapa e só se o arquivo estiver dentro dessa pasta. */
var MAPAS_CFG = { PARTE: 5 * 1024 * 1024, EXT: /\.(pdf|kml|kmz|gpx|tif|tiff)$/i,
  PDF_MAPA: /(mapa|map[-_ ]|prancha|planta|croqui|localiza|acesso|situa[cç]|geo|levantamento|poligonal|imagem|ortofoto|caminhamento|perfil)/i,
  PULAR: /^(03_CAMPO|FOTOS?|6\.FOTOS|ZZ_|LIXO)/i, PROFUNDIDADE: 5 };
function pastasDeObra_() {
  var c = CacheService.getScriptCache(); var ja = c.get('mapas_pastas'); if (ja) return JSON.parse(ja);
  var ids = []; try { var pac = JSON.parse(pacoteDeCampoComoArquivo_().getBlob().getDataAsString('UTF-8')); (pac.obras || []).forEach(function (o) { if (o.pastaId) ids.push(o.pastaId); }); } catch (x) {}
  try { c.put('mapas_pastas', JSON.stringify(ids), 3600); } catch (x) {}
  return ids;
}
function ehMapa_(nome, caminho) { if (!MAPAS_CFG.EXT.test(nome) || /^ZZ_/i.test(nome)) return false; if (!/\.pdf$/i.test(nome)) return true; return MAPAS_CFG.PDF_MAPA.test(nome) || /MAPA|PRANCHA|PLANTA|GEO|DWG|PDF/i.test(caminho); }
function listarMapas_(pastaId) {
  var c = CacheService.getScriptCache(); var ja = c.get('mapas_l_' + pastaId); if (ja) return JSON.parse(ja);
  var out = []; var fila = [{ f: DriveApp.getFolderById(pastaId), cam: '', n: 0 }];
  while (fila.length && out.length < 200) {
    var it = fila.shift();
    var fs = it.f.searchFiles("trashed = false and (title contains '.pdf' or title contains '.kml' or title contains '.kmz' or title contains '.gpx' or title contains '.tif' or title contains '.PDF' or title contains '.KML' or title contains '.KMZ' or title contains '.TIF')");
    while (fs.hasNext()) { var f = fs.next(); var nm = f.getName(); if (!ehMapa_(nm, it.cam)) continue;
      out.push({ id: f.getId(), nome: nm, mime: f.getMimeType(), tamanho: f.getSize(), modificado: f.getLastUpdated().toISOString(), caminho: it.cam || 'pasta da obra' }); }
    if (it.n < MAPAS_CFG.PROFUNDIDADE) { var sub = it.f.getFolders(); while (sub.hasNext()) { var s = sub.next(); if (MAPAS_CFG.PULAR.test(s.getName())) continue; fila.push({ f: s, cam: (it.cam ? it.cam + '/' : '') + s.getName(), n: it.n + 1 }); } }
  }
  try { c.put('mapas_l_' + pastaId, JSON.stringify(out), 1200); } catch (x) {}
  return out;
}
function dentroDaPasta_(arq, pastaId) {
  var vistos = {}; var fila = []; var ps = arq.getParents(); while (ps.hasNext()) fila.push(ps.next());
  for (var k = 0; k < 40 && fila.length; k++) { var p = fila.shift(); var id = p.getId(); if (id === pastaId) return true; if (vistos[id]) continue; vistos[id] = 1; var pp = p.getParents(); while (pp.hasNext()) fila.push(pp.next()); }
  return false;
}
function acaoMapas_(p) {
  if (!p.pasta) return json_({ ok: false, erro: 'faltou a pasta' });
  if (pastasDeObra_().indexOf(p.pasta) < 0) { CacheService.getScriptCache().remove('mapas_pastas'); if (pastasDeObra_().indexOf(p.pasta) < 0) return json_({ ok: false, erro: 'pasta não é de obra aberta' }); }
  if (p.acao === 'mapas') return json_({ ok: true, mapas: listarMapas_(p.pasta) });
  var arq = DriveApp.getFileById(p.id); var nome = arq.getName();
  if (!MAPAS_CFG.EXT.test(nome) || !dentroDaPasta_(arq, p.pasta)) return json_({ ok: false, erro: 'arquivo fora da pasta da obra' });
  var tam = arq.getSize(), partes = Math.max(1, Math.ceil(tam / MAPAS_CFG.PARTE)), n = Math.max(0, parseInt(p.parte || '0', 10) || 0);
  if (n >= partes) return json_({ ok: false, erro: 'parte inexistente' });
  var ini = n * MAPAS_CFG.PARTE, fim = Math.min(tam, ini + MAPAS_CFG.PARTE) - 1, bytes;
  if (partes === 1) bytes = arq.getBlob().getBytes();
  else { var r = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + p.id + '?alt=media', { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), Range: 'bytes=' + ini + '-' + fim }, muteHttpExceptions: true });
    if (r.getResponseCode() !== 206 && r.getResponseCode() !== 200) return json_({ ok: false, erro: 'Drive ' + r.getResponseCode() }); bytes = r.getContent(); }
  return json_({ ok: true, nome: nome, mime: arq.getMimeType(), tamanho: tam, parte: n, partes: partes, b64: Utilities.base64Encode(bytes) });
}
/* teste manual: Executar > testarMapas — lista os mapas da primeira obra com pasta */
function testarMapas() { var ids = pastasDeObra_(); Logger.log(ids.length + ' pastas de obra'); for (var i = 0; i < ids.length; i++) { var l = listarMapas_(ids[i]); if (l.length) { Logger.log(ids[i] + ': ' + JSON.stringify(l).slice(0, 1500)); return; } } Logger.log('nenhum mapa nas pastas'); }
