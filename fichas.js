/* ============================================================
   FICHAS DE CAMPO DIGITAIS — Natural Engenharia
   Mesmos campos das fichas de papel oficiais:
   FC-SPT v1.1 (SOP-017) · FC-POÇO Perfuração (SOP-008/021/023/024)
   FC-POÇO Teste de bombeamento (SOP-008/018) · FC-POÇO Entrega (SOP-020)
   Regra: o app vira a fonte; o papel fica de reserva. Nunca trava:
   só avisa o que falta. Campo em branco é permitido; inventado, não.
   ============================================================ */
(function(){
const HOJE = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }; // data local, não UTC
const AGORA = () => { const d=new Date(); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); };
const NUM = v => { if(v===''||v==null) return NaN; return Number(String(v).replace(/\s/g,'').replace(',','.')); };
const TEMPOS_B = [1,2,3,4,5,6,7,8,9,10,12,14,16,18,20,25,30,35,40,45,50,55,60,70,80,90,100,110,120,150,210,300,420,510,600,720];

/* ---------------- Definição das fichas ---------------- */
const DEF = {
 spt: {
  codigo:'FC-SPT v1.1', titulo:'Boletim de sondagem SPT', sop:'SOP-017', norma:'NBR 6484',
  ident: d => 'SP-'+(d.furo||'__'),
  blocos: [
   { t:'1 · Furo (preencher antes do primeiro golpe)', campos:[
     {k:'furo', r:'Furo nº SP-', tipo:'text', w:1}, {k:'folha', r:'Folha', tipo:'text', w:1, ph:'1 de 1'},
     {k:'cliente', r:'Cliente / obra', tipo:'text', w:2, pre:'obra'}, {k:'local', r:'Local', tipo:'text', w:2},
     {k:'data', r:'Data', tipo:'date', pre:'hoje'}, {k:'inicio', r:'Início', tipo:'time', agora:true}, {k:'fim', r:'Fim', tipo:'time', agora:true},
     {k:'coord', r:'Coordenada do furo', tipo:'gps', w:2}, {k:'cota', r:'Cota (m)', tipo:'num'},
     {k:'revest', r:'Revestimento até (m)', tipo:'num'}, {k:'trado', r:'Trado até (m)', tipo:'num'}, {k:'lavagem', r:'Lavagem de/até (m)', tipo:'text'},
     {k:'acomp', r:'Acompanhante do cliente', tipo:'text', w:2}, {k:'equipe', r:'Sondador / ajudantes', tipo:'text', w:2, pre:'quem'},
     {k:'na_ini', r:'NA início (achou) — m', tipo:'num'}, {k:'na_ini_h', r:'às', tipo:'time', agora:true},
     {k:'na_fim', r:'NA fim do furo (sondou de novo) — m', tipo:'num'}, {k:'na_fim_h', r:'às', tipo:'time', agora:true},
     {k:'seco', r:'Não achou: seco até (m)', tipo:'num'}
   ]},
   { t:'2 · Golpes e material', nota:'golpes / cm em cada 15 cm · N = 2º + 3º · anote na hora · T = trado, L = lavagem · IDEM só se igual ao de cima',
     tabela:{k:'golpes', seq:'metro', cols:[
      {k:'de', r:'De (m)', tipo:'num', w:.6}, {k:'ate', r:'Até (m)', tipo:'num', w:.6}, {k:'am', r:'Amostra nº', tipo:'text', w:.6},
      {k:'g1', r:'1º golpes', tipo:'int', w:.55}, {k:'c1', r:'cm', tipo:'int', w:.45, pre:15},
      {k:'g2', r:'2º golpes', tipo:'int', w:.55}, {k:'c2', r:'cm', tipo:'int', w:.45, pre:15},
      {k:'g3', r:'3º golpes', tipo:'int', w:.55}, {k:'c3', r:'cm', tipo:'int', w:.45, pre:15},
      {k:'n', r:'N SPT', tipo:'calc', w:.5, calc: l => (l.g2!==''&&l.g2!=null&&l.g3!==''&&l.g3!=null) ? (NUM(l.g2)+NUM(l.g3)) : ''},
      {k:'desc', r:'Descrição do material — cor · areia/argila/silte · duro ou mole · seco ou úmido', tipo:'area', w:3},
      {k:'av', r:'Avanço', tipo:'sel', op:['','SPT','T','L'], w:.5},
      {k:'obs', r:'Obs. — perdeu água · desbarrancou', tipo:'text', w:1.4}, {k:'h', r:'Hora', tipo:'time', w:.6, agora:true}
     ]}},
   { t:'3 · Fim do furo e antes de ir embora', campos:[
     {k:'prof_final', r:'Profundidade final (m)', tipo:'num'},
     {k:'parou', r:'Parou porque', tipo:'sel', op:['','chegou aos 12 m','impenetrável (SPT)','impenetrável (lavagem)','mandaram parar','outro'], w:2},
     {k:'parou_outro', r:'Outro motivo', tipo:'text', w:2}, {k:'autorizou12', r:'Passou de 12 m? quem autorizou', tipo:'text', w:2},
     {k:'chk', r:'Antes de ir embora', tipo:'check', w:4, op:['Ficha toda preenchida (golpes, material, água)','Amostras com adesivo da Natural','Furo tapado, lugar limpo','5 fotos + áudio de 40 s','Equipamento recolhido','Deu problema? Avisou o escritório hoje']},
     {k:'sacos', r:'Amostras: nº de sacos', tipo:'int'},
     {k:'ass_sond', r:'Sondador', tipo:'ass', w:2}, {k:'ass_acomp', r:'Acompanhante do cliente', tipo:'ass', w:2}
   ]}
  ],
  nota:'Impenetrável (NBR 6484) = 30 golpes e não entrou 15 cm · 50 golpes e não entrou 30 cm · 10 golpes seguidos sem descer · lavagem: 3 vezes de 10 min descendo menos de 5 cm. Parou antes de 12 m? Avise o escritório hoje.',
  avisos: d => { const a=[]; const g=(d.golpes||[]);
    if(!d.furo) a.push('Número do furo em branco.');
    if(!d.coord) a.push('Coordenada do furo em branco.');
    if(!g.length) a.push('Nenhuma linha de golpes registrada.');
    g.forEach((l,i)=>{ if(!impenetravel(l) && (l.g2===''||l.g3===''||l.g2==null||l.g3==null)) a.push(`Linha ${i+1} (${l.de||'?'}–${l.ate||'?'} m): falta golpe do 2º ou 3º trecho — N não calcula.`); if(!l.desc) a.push(`Linha ${i+1}: descrição do material em branco.`); });
    if(!d.prof_final) a.push('Profundidade final em branco.');
    if(!d.parou) a.push('Motivo da parada em branco.');
    if(d.na_ini===''&&d.seco===''||(!d.na_ini&&!d.seco)) a.push('Nível d’água: nem "achou a" nem "seco até" preenchido.');
    if(d.prof_final && NUM(d.prof_final)<12 && d.parou!=='chegou aos 12 m') a.push('Parou antes de 12 m: avise o escritório hoje.');
    if(d.prof_final && NUM(d.prof_final)>12 && !d.autorizou12) a.push('Passou de 12 m sem dizer quem autorizou.');
    return a; }
 },
 poco_perf: {
  codigo:'FC-POÇO Perfuração', titulo:'Ficha de campo — Perfuração do poço', sop:'SOP-008 · 021 · 023 · 024',
  ident: d => d.poco || 'poço',
  blocos: [
   { t:'Poço', campos:[
     {k:'cliente', r:'Cliente / propriedade', tipo:'text', w:2, pre:'cliente'}, {k:'contrato', r:'Contrato nº', tipo:'text'}, {k:'poco', r:'Poço (nº / identificação)', tipo:'text', ph:'P-01'},
     {k:'local', r:'Local', tipo:'text', w:2}, {k:'coord', r:'Coordenada', tipo:'gps', w:2},
     {k:'metodo', r:'Método contratado', tipo:'sel', op:['','Rotativa','Rotopneumático']}, {k:'diam', r:'Diâmetro', tipo:'sel', op:['','6"/4"','8"/6"','outro']}, {k:'prof_ref', r:'Prof. de referência do contrato (m)', tipo:'num', w:2},
     {k:'ini_data', r:'Início — data', tipo:'date', pre:'hoje'}, {k:'ini_hora', r:'Início — hora', tipo:'time', agora:true}, {k:'equipe', r:'Equipe', tipo:'text', w:2, pre:'quem'}
   ]},
   { t:'Perfil — anote a cada manobra, na hora (o que viu, não o que acha)', tabela:{k:'perfil', seq:'livre', foto:'Foto da amostra (calha)', agua:'agua_a', cols:[
      {k:'de', r:'De (m)', tipo:'num', w:.7}, {k:'ate', r:'Até (m)', tipo:'num', w:.7},
      {k:'mat', r:'O que saiu: areia, argila, cascalho, rocha… (cor, textura)', tipo:'area', w:3.4, mat:'poco'},
      {k:'diam', r:'Ø perf.', tipo:'text', w:.7}, {k:'h', r:'Hora', tipo:'time', w:.7, agora:true}]}},
   { t:'Fim da perfuração', campos:[
     {k:'agua_a', r:'Água apareceu a (m)', tipo:'num'}, {k:'prof_final', r:'Profundidade final (m)', tipo:'num'}, {k:'fim_hora', r:'Hora de término', tipo:'time', agora:true}]},
   { t:'Parada e autorização (SOP-021) — metro a mais só com o sim do cliente', campos:[
     {k:'parou', r:'Parou por', tipo:'sel', op:['','Chegou na profundidade de referência','Rocha / precisa de compressor'], w:2},
     {k:'rocha_m', r:'Rocha a (m)', tipo:'num'}, {k:'rocha_h', r:'às', tipo:'time', agora:true},
     {k:'extra_rs', r:'Metro extra em rotativa (sem rocha): R$/m passado pelo Ygor', tipo:'text', w:2},
     {k:'autorizou', r:'Cliente autorizou?', tipo:'sel', op:['','Sim — ok escrito no WhatsApp','Não — protege o poço e desmobiliza'], w:2},
     {k:'aut_hora', r:'Ok no WhatsApp às', tipo:'time'}, {k:'aut_ate', r:'Autorizou até (m)', tipo:'num'}
   ], nota:'Tabela por metro — Rocha (rotopneumático): 8"/6" R$ 550,00/m · 6"/4" R$ 500,00/m · bomba à parte, dimensionada no teste.'},
   { t:'Construção', campos:[
     {k:'rev_de', r:'Revestimento de (m)', tipo:'num'}, {k:'rev_a', r:'a (m)', tipo:'num'}, {k:'rev_d', r:'Ø', tipo:'text'},
     {k:'fil_de', r:'Filtro de (m)', tipo:'num'}, {k:'fil_a', r:'a (m)', tipo:'num'},
     {k:'prefiltro', r:'Pré-filtro (tipo/volume)', tipo:'text', w:2}, {k:'desenv', r:'Desenvolvimento (como e quanto tempo)', tipo:'text', w:2},
     {k:'laje', r:'Laje (medida)', tipo:'text'}, {k:'boca', r:'Altura da boca', tipo:'text'},
     {k:'itens', r:'Pronto', tipo:'check', w:2, op:['Tampa','Cercado','Selo sanitário']}
   ]},
   { t:'Compressor (SOP-024)', tabela:{k:'compressor', seq:'livre', cols:[
      {k:'data', r:'Data', tipo:'date', w:1}, {k:'horas', r:'Horas de uso', tipo:'num', w:1}, {k:'metros', r:'Metros perfurados', tipo:'num', w:1}]}},
   { t:'Quem fez o quê (SOP-023)', campos:[
     {k:'q_perf', r:'Perfuração', tipo:'text', w:2}, {k:'q_rev', r:'Revestimento e filtro', tipo:'text', w:2},
     {k:'q_des', r:'Desenvolvimento', tipo:'text', w:2}, {k:'q_bomba', r:'Bomba e teste', tipo:'text', w:2},
     {k:'q_novo', r:'Item novo da reserva', tipo:'text', w:4}]},
   { t:'Fotos (com GPS, conferidas na tela antes de guardar o celular)', campos:[
     {k:'fotos', r:'Tiradas pelo app', tipo:'check', w:4, op:['Terreno antes','Boca do poço','Laje e tampa','Cercado','Equipamento operando']}]}
  ],
  nota:'Não desmobilize sem: camadas, minuto da estabilização e minuto da recuperação (ficha do teste). Campo em branco é permitido; campo inventado, não.',
  avisos: d => { const a=[];
    if(!(d.perfil||[]).length) a.push('Perfil sem nenhuma camada — é dado que não se recupera.');
    (d.perfil||[]).forEach((l,i)=>{ if(!l.mat) a.push(`Camada ${i+1} (${l.de||'?'}–${l.ate||'?'} m) sem descrição.`); });
    if(!d.coord) a.push('Coordenada do poço em branco.');
    if(!d.prof_final) a.push('Profundidade final em branco.');
    if(d.parou==='Rocha / precisa de compressor' && !d.autorizou) a.push('Parou em rocha e a autorização do cliente não foi registrada.');
    if(d.prof_final && d.prof_ref && NUM(d.prof_final)>NUM(d.prof_ref) && !d.autorizou) a.push('Passou da profundidade de referência sem autorização registrada.');
    return a; }
 },
 poco_teste: {
  codigo:'FC-POÇO Teste', titulo:'Ficha de campo — Teste de bombeamento', sop:'SOP-008 e SOP-018',
  ident: d => d.poco || 'poço',
  blocos: [
   { t:'Teste', campos:[
     {k:'poco', r:'Poço', tipo:'text', ph:'P-01'}, {k:'local', r:'Local', tipo:'text', w:2, pre:'cliente'}, {k:'mun', r:'Município (RR)', tipo:'text'},
     {k:'data', r:'Data', tipo:'date', pre:'hoje'}, {k:'hini', r:'Hora de início (bomba ligou)', tipo:'time', agora:true},
     {k:'ne', r:'NE (m)', tipo:'num'}, {k:'vazao', r:'Vazão (m³/h)', tipo:'num'}, {k:'crivo', r:'Crivo (m)', tipo:'num'}, {k:'recip', r:'Recipiente (L)', tipo:'num'},
     {k:'exec', r:'Executor', tipo:'text', w:2, pre:'quem'}
   ]},
   { t:'Bombeamento', nota:'Hora = hora de início + t. Anote só o que medir.', tabela:{k:'bomb', seq:'fixo', fixo:TEMPOS_B.map(t=>({t})), cols:[
      {k:'t', r:'t (min)', tipo:'fixo', w:.6}, {k:'h', r:'Hora', tipo:'calc', w:.8, calc:(l,d)=>somaHora(d.hini,l.t)},
      {k:'nd', r:'N.D. (m)', tipo:'num', w:1}, {k:'q', r:'Q (m³/h)', tipo:'num', w:1}]}},
   { t:'Recuperação (anotar até voltar ao NE)', nota:'Começa quando a bomba desliga (início + 720 min). t/t\' = (720 + t\') / t\'.', tabela:{k:'rec', seq:'fixo', fixo:TEMPOS_B.map(t=>({t})), cols:[
      {k:'t', r:'t\' (min)', tipo:'fixo', w:.6}, {k:'h', r:'Hora', tipo:'calc', w:.8, calc:(l,d)=>somaHora(d.hini,720+l.t)},
      {k:'tt', r:'t/t\'', tipo:'calc', w:.7, calc:l=>((720+l.t)/l.t).toFixed(1).replace('.',',')},
      {k:'nd', r:'N.D. (m)', tipo:'num', w:1}]}},
   { t:'Resultado', campos:[
     {k:'estab', r:'Minuto em que o nível estabilizou', tipo:'int'}, {k:'volta', r:'Minuto em que voltou ao NE', tipo:'int'}, {k:'ndf', r:'ND final (m)', tipo:'num'},
     {k:'parou', r:'Parou antes de 720 min? minuto real e motivo', tipo:'text', w:3}]}
  ],
  nota:'Bomba ligada 720 minutos completos, mesmo que estabilize antes. Parou antes (energia, bomba, cliente): registra o minuto real e avisa — não se completa a tabela. Campo em branco é permitido; campo inventado, não.',
  avisos: d => { const a=[];
    if(!d.hini) a.push('Hora de início em branco — as horas da tabela não calculam.');
    if(!d.ne) a.push('NE em branco.');
    if(!d.estab) a.push('Minuto da estabilização em branco — é dado que não se recupera (SOP-008).');
    if(!d.volta) a.push('Minuto da recuperação (voltou ao NE) em branco — é dado que não se recupera (SOP-008).');
    const nb=(d.bomb||[]).filter(l=>l.nd!==''&&l.nd!=null).length; if(nb<5) a.push(`Só ${nb} leitura(s) de ND no bombeamento.`);
    return a; }
 },
 poco_entrega: {
  codigo:'FC-POÇO Entrega', titulo:'Ficha de campo — Entrega do poço', sop:'SOP-020',
  ident: d => d.poco || 'poço',
  blocos: [
   { t:'Entrega', nota:'Preencher no local, com o poço funcionando.', campos:[
     {k:'cliente', r:'Cliente / propriedade', tipo:'text', w:2, pre:'cliente'}, {k:'poco', r:'Poço (nº / identificação)', tipo:'text'}, {k:'mun', r:'Município / localidade', tipo:'text'},
     {k:'data', r:'Data da entrega', tipo:'date', pre:'hoje'}, {k:'hora', r:'Hora', tipo:'time', agora:true}, {k:'recebe', r:'Nome de quem recebe', tipo:'text', w:2},
     {k:'quem_e', r:'Quem recebe é', tipo:'sel', op:['','O próprio cliente','Indicado pelo cliente por WhatsApp'], w:2},
     {k:'ind_data', r:'Indicado no WhatsApp em', tipo:'date'}, {k:'relacao', r:'Relação com o cliente', tipo:'text', ph:'caseiro, filho, gerente…'}
   ]},
   { t:'Recebi o poço funcionando', campos:[
     {k:'declara', r:'', tipo:'check', w:4, op:['Bomba instalada e ligada na minha frente, água saindo limpa no ponto combinado, laje, tampa e selo prontos. O perfil construtivo e a ART a Natural envia pelo WhatsApp em até 10 dias.']}]},
   { t:'Conferência do encarregado', campos:[
     {k:'h_limpeza', r:'Água limpa, sem areia — hora da limpeza', tipo:'time', agora:true}, {k:'bomba_cv', r:'Bomba do contrato (CV)', tipo:'text'},
     {k:'conf', r:'Conferido', tipo:'check', w:4, op:['Chave/quadro e cabo PP','Estabilização e recuperação anotadas na ficha do teste','Laje, tampa e selo limpos; local sem entulho','Fotos finais com GPS: longe, perto, água saindo, ponto ligado']}]},
   { t:'Pendências e pedidos fora do escopo (a Natural orça à parte — não prometer)', campos:[
     {k:'pend', r:'Ex.: cano até a casa, caixa d’água, casa de proteção, mais um ponto. Se não houver, escreva "nenhum".', tipo:'area', w:4}]},
   { t:'Assinaturas', campos:[
     {k:'ass_recebe', r:'Assinatura de quem recebe', tipo:'ass', w:2}, {k:'encarregado', r:'Encarregado da Natural (nome)', tipo:'text', w:2, pre:'quem'},
     {k:'ass_enc', r:'Assinatura do encarregado', tipo:'ass', w:2}]}
  ],
  nota:'Campo em branco é permitido; campo inventado, não. Nada de valor, desconto ou prazo de pagamento em campo — "isso é com o escritório". A cópia desta ficha vai no grupo "Divulgações Natural".',
  avisos: d => { const a=[];
    if(!d.recebe) a.push('Nome de quem recebe em branco.');
    if(!d.ass_recebe) a.push('Sem assinatura de quem recebe — o poço fica "pronto, não entregue".');
    if(d.quem_e==='Indicado pelo cliente por WhatsApp' && !d.ind_data) a.push('Indicado por WhatsApp sem a data da indicação.');
    if(!(d.declara||[]).length) a.push('Declaração "recebi o poço funcionando" não marcada.');
    if(!d.pend) a.push('Pendências em branco — se não houver, escreva "nenhum".');
    return a; }
 }
};
const FICHAS_DA_LINHA = { spt:['spt'], poco:['poco_perf','poco_teste','poco_entrega'], outorga:['poco_teste'] };

function somaHora(h, min){ if(!h||!/^\d{1,2}:\d{2}$/.test(h)) return ''; const [a,b]=h.split(':').map(Number); const t=a*60+b+Number(min); const d=Math.floor(t/1440); const r=((t%1440)+1440)%1440; return String(Math.floor(r/60)).padStart(2,'0')+':'+String(r%60).padStart(2,'0')+(d?` (+${d}d)`:''); }

/* ---------------- Armazenamento (no celular, salva a cada toque) ---------------- */
const K='fichas_v1';
function todas(){ try{ return JSON.parse(localStorage.getItem('nc_'+K)||'[]'); }catch(e){ return []; } }
function salvarTodas(a){ try{ localStorage.setItem('nc_'+K, JSON.stringify(a)); return true; }catch(e){ toast('Memória do celular cheia: envie a fila e apague fichas antigas.',5000); return false; } }
function pegar(id){ return todas().find(f=>f.id===id); }
function gravar(f){ const a=todas(); const i=a.findIndex(x=>x.id===f.id); f.atualizadoEm=new Date().toISOString(); if(i<0) a.push(f); else a[i]=f; salvarTodas(a); }
function remover(id){ salvarTodas(todas().filter(f=>f.id!==id)); }

let ABERTA=null; // id da ficha em edição

function novaFicha(tipo, ob){
  const def=DEF[tipo]; const d={};
  for(const b of def.blocos){ for(const c of (b.campos||[])){
      if(c.pre==='hoje') d[c.k]=HOJE(); else if(c.pre==='obra') d[c.k]=ob.nome; else if(c.pre==='cliente') d[c.k]=ob.cliente||ob.nome; else if(c.pre==='quem') d[c.k]=S.quem||''; else d[c.k]= c.tipo==='check'?[]:''; }
    if(b.tabela){ const tb=b.tabela; d[tb.k] = tb.seq==='fixo' ? tb.fixo.map(x=>Object.assign({},x)) : []; } }
  if(tipo==='spt'){ const n=todas().filter(f=>f.obraId===ob.id&&f.tipo==='spt').length+1; d.furo=String(n).padStart(2,'0'); d.golpes=[linhaVazia(def.blocos[1].tabela, {de:0,ate:1})]; }
  const f={ id:'FC'+Date.now().toString(36)+Math.random().toString(36).slice(2,5), tipo, obraId:ob.id, obraNome:ob.nome, versao:1, status:'rascunho', criadoEm:new Date().toISOString(), por:S.quem||'', dados:d };
  gravar(f); return f;
}
function linhaVazia(tb, extra){ const l={}; for(const c of tb.cols){ if(c.tipo==='fixo'||c.tipo==='calc') continue; l[c.k]= c.pre!=null? c.pre : ''; } return Object.assign(l, extra||{}); }

/* ---------------- Tela: lista de fichas da obra ---------------- */
function secaoLista(ob){
  const tipos=[...new Set((ob.linhas||[]).flatMap(l=>FICHAS_DA_LINHA[l]||[]))];
  const minhas=todas().filter(f=>f.obraId===ob.id).sort((a,b)=>a.criadoEm<b.criadoEm?1:-1);
  let h=`<div class="card"><h2>Preencher no app</h2>`;
  if(!tipos.length) h+=`<div class="muted">Esta linha de serviço ainda não tem ficha digital. Use o diário, as fotos e o registro do dia.</div>`;
  else h+=`<div class="nota">O app é a ficha oficial. A folha de papel fica no carro de reserva (celular sem bateria ou quebrado) — se usar o papel, fotografe pelo app.</div><div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px">`+tipos.map(t=>`<button class="green" data-nova="${t}" style="flex:1 1 45%">+ ${esc(DEF[t].titulo.replace('Ficha de campo — ',''))}</button>`).join('')+`</div>`;
  if(minhas.length){ h+=`<h3>Fichas desta obra</h3>`+minhas.map(f=>{ const def=DEF[f.tipo]; const av=def.avisos(f.dados).length;
      return `<button class="obra" data-abrir="${f.id}"><b>${esc(def.codigo)} · ${esc(def.ident(f.dados))}${f.versao>1?` · v${f.versao}`:''}</b><small>${esc(fmtData(f.atualizadoEm))} · ${esc(f.por||'')}</small><div style="margin-top:6px">${f.status==='encerrada'?'<span class="chip g">encerrada e na fila</span>':'<span class="chip w">em preenchimento</span>'}${f.status!=='encerrada'&&av?`<span class="chip">${av} aviso(s)</span>`:''}</div></button>`; }).join(''); }
  return h+`</div>`;
}
function ligarLista(ob){
  document.querySelectorAll('[data-nova]').forEach(b=>b.onclick=()=>{ const f=novaFicha(b.dataset.nova, ob); abrir(f.id); });
  document.querySelectorAll('[data-abrir]').forEach(b=>b.onclick=()=>abrir(b.dataset.abrir));
}

/* ---------------- Tela: editor ---------------- */
function abrir(id){ ABERTA=id; S.tab='fichas'; try{ history.pushState({t:'ficha'},''); }catch(e){} desenharEditor(); window.scrollTo(0,0); }
function fechar(){ ABERTA=null; render(); window.scrollTo(0,0); }
function aberta(){ return !!ABERTA; }

function campoHTML(c, v, ro){
  const id='f_'+c.k; const dis=ro?'disabled':''; const lab=c.r?`<label for="${id}">${esc(c.r)}</label>`:'';
  const span=`grid-column:span ${Math.min(c.w||1,4)}`;
  if(c.tipo==='check') return `<div style="${span}">${lab}${c.op.map((o,i)=>`<label class="chk" style="text-transform:none;letter-spacing:0;font-weight:400;font-size:15px;color:var(--ink);margin:0"><input type="checkbox" data-ck="${c.k}" value="${esc(o)}" ${(v||[]).includes(o)?'checked':''} ${dis}><span>${esc(o)}</span></label>`).join('')}</div>`;
  if(c.tipo==='ass') return `<div style="${span}">${lab}<div class="ass" data-ass="${c.k}">${v?`<img src="${v}" alt="assinatura">`:'<span class="muted">Toque para assinar</span>'}</div></div>`;
  if(c.tipo==='sel') return `<div style="${span}">${lab}<select id="${id}" data-f="${c.k}" ${dis}>${c.op.map(o=>`<option ${o===v?'selected':''}>${esc(o)}</option>`).join('')}</select></div>`;
  if(c.tipo==='area') return `<div style="${span}">${lab}<textarea id="${id}" data-f="${c.k}" ${dis} placeholder="${esc(c.ph||'')}">${esc(v||'')}</textarea></div>`;
  if(c.tipo==='gps') return `<div style="${span}">${lab}<div class="row"><input id="${id}" data-f="${c.k}" value="${esc(v||'')}" ${dis} placeholder="toque em GPS"><button class="sec" data-gps="${c.k}" style="flex:0 0 auto" ${dis}>GPS</button></div></div>`;
  const tp = c.tipo==='num'?'inputmode="decimal"':c.tipo==='int'?'inputmode="numeric"':'';
  const type = c.tipo==='date'?'date':c.tipo==='time'?'time':'text';
  return `<div style="${span}">${lab}<div class="row"><input id="${id}" type="${type}" ${tp} data-f="${c.k}" value="${esc(v==null?'':v)}" placeholder="${esc(c.ph||'')}" ${dis}>${c.agora&&!ro?`<button class="sec" data-agora="${c.k}" style="flex:0 0 auto;padding:10px">agora</button>`:''}</div></div>`;
}
function tabelaHTML(tb, d, ro){
  const linhas=d[tb.k]||[];
  let h=`<div class="linhas">`;
  linhas.forEach((l,i)=>{
    const vazia = tb.seq==='fixo' && tb.cols.filter(c=>!['fixo','calc'].includes(c.tipo)).every(c=>l[c.k]===''||l[c.k]==null);
    h+=`<div class="linha ${vazia?'vz':''}" data-li="${i}"><div class="lh">${tb.seq==='fixo'?`<b>${esc(tb.cols[0].r)} = ${l.t}</b>`:`<b>Linha ${i+1}</b>`}${tb.cols.filter(c=>c.tipo==='calc').map(c=>`<span class="chip">${esc(c.r)}: <b data-calc="${tb.k}.${i}.${c.k}">${esc(String(c.calc(l,d)))}</b></span>`).join('')}${(!ro&&tb.seq!=='fixo')?`<button class="ghost" data-del="${tb.k}.${i}" style="margin-left:auto;color:var(--err)">apagar</button>`:''}</div><div class="grid">`;
    for(const c of tb.cols){ if(c.tipo==='fixo'||c.tipo==='calc') continue;
      const id=`t_${tb.k}_${i}_${c.k}`; const tp=c.tipo==='num'?'inputmode="decimal"':c.tipo==='int'?'inputmode="numeric"':''; const span=`grid-column:span ${c.tipo==='area'?4:(c.w>=1.3?2:1)}`;
      let inp;
      if(c.tipo==='sel') inp=`<select id="${id}" data-t="${tb.k}.${i}.${c.k}" ${ro?'disabled':''}>${c.op.map(o=>`<option ${o===l[c.k]?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
      else if(c.tipo==='area' && c.mat && !ro){ const sel=l._sel||{tipos:[],cor:'',umid:''}; const lista=c.mat==='poco'?MAT_POCO:MAT.tipos;
        inp=`<div class="chips mt" data-gmat="${tb.k}.${i}.${c.k}" data-grupo="tipos">${lista.map(t=>`<button class="${sel.tipos.includes(t[0])?'on':''}" data-v="${esc(t[0])}">${esc(t[0])}</button>`).join('')}</div>
          <div class="sub2">Cor</div><div class="chips mt" data-gmat="${tb.k}.${i}.${c.k}" data-grupo="cor">${MAT.cores.map(x=>`<button class="${sel.cor===x[0]?'on':''}" data-v="${x[0]}">${flex(x[0],'m',!!x[1])}</button>`).join('')}</div>
          <textarea id="${id}" data-t="${tb.k}.${i}.${c.k}" style="min-height:54px;margin-top:6px" placeholder="os botões escrevem aqui; pode corrigir">${esc(l[c.k]||'')}</textarea>
          <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px">${i>0?`<button class="ghost" data-gidem="${tb.k}.${i}.${c.k}" style="flex:0 0 auto">Igual ao de cima</button>`:''}${tb.agua?`<button class="ghost" data-gagua="${tb.k}.${i}" style="flex:0 0 auto">💧 Água apareceu aqui</button>`:''}${tb.foto?`<button class="sec" data-gfoto="${tb.k}.${i}" style="flex:0 0 auto">📷 ${esc(tb.foto)}</button><span class="mini">${fotosDaLinha(ABERTA,tb.k,i).length||''}${fotosDaLinha(ABERTA,tb.k,i).length?' foto(s)':''}</span>`:''}</div>`; }
      else if(c.tipo==='area') inp=`<textarea id="${id}" data-t="${tb.k}.${i}.${c.k}" ${ro?'disabled':''} style="min-height:60px">${esc(l[c.k]||'')}</textarea>`;
      else inp=`<div class="row"><input id="${id}" type="${c.tipo==='time'?'time':c.tipo==='date'?'date':'text'}" ${tp} data-t="${tb.k}.${i}.${c.k}" value="${esc(l[c.k]==null?'':l[c.k])}" ${ro?'disabled':''}>${c.agora&&!ro?`<button class="sec" data-tagora="${tb.k}.${i}.${c.k}" style="flex:0 0 auto;padding:8px">agora</button>`:''}</div>`;
      h+=`<div style="${span}"><label for="${id}">${esc(c.r)}</label>${inp}</div>`; }
    h+=`</div></div>`; });
  if(!ro && tb.seq!=='fixo') h+=`<button class="big sec" data-add="${tb.k}">+ ${tb.seq==='metro'?'próximo metro':'nova linha'}</button>`;
  if(tb.seq==='fixo') h+=`<button class="ghost" data-mostra="${tb.k}">mostrar/ocultar linhas vazias</button>`;
  return h+`</div>`;
}
function leituraDaVez(d){ // qual linha da tabela é a leitura de agora
  if(!d.hini||!/^\d{1,2}:\d{2}$/.test(d.hini)) return null;
  const [a,b]=d.hini.split(':').map(Number); const agora=new Date(); const ini=new Date(); ini.setHours(a,b,0,0); if(ini>agora) ini.setDate(ini.getDate()-1);
  const min=(agora-ini)/60000;
  if(min<=720+0.5){ const i=TEMPOS_B.findIndex(t=>t>=min-0.5); if(i>=0) return {tab:'bomb', i, t:TEMPOS_B[i], hora:somaHora(d.hini,TEMPOS_B[i]), min}; }
  const i=TEMPOS_B.findIndex(t=>720+t>=min-0.5); if(i>=0) return {tab:'rec', i, t:TEMPOS_B[i], hora:somaHora(d.hini,720+TEMPOS_B[i]), min};
  return {fim:true, min}; }
function cartaoLeitura(d){
  if(!d.hini) return `<div class="card spt" id="prox" style="border-left:5px solid var(--green)"><h2>Leitura da vez</h2><div class="nota">Quando a bomba ligar, toque aqui:</div><button class="big green" data-agora="hini">Bomba ligou agora</button></div>`;
  const L=leituraDaVez(d); if(!L||L.fim) return `<div class="card" id="prox"><h2>Teste encerrado</h2><div class="nota">Passou de 720 + 720 min.</div></div>`;
  const nome=L.tab==='bomb'?`Bombeamento · t = ${L.t} min`:`Recuperação · t' = ${L.t} min`; const v=(d[L.tab][L.i]||{}).nd||'';
  return `<div class="card spt" id="prox" style="border-left:5px solid var(--green)"><h2>Leitura da vez</h2><div class="mini">${esc(nome)} · às <b>${esc(L.hora)}</b> · agora ${Math.floor(L.min)} min de teste</div>
   <div class="gols" style="grid-template-columns:2fr 1fr;margin-top:8px"><div class="gol"><div class="t">N.D. (m)</div><input class="g" inputmode="decimal" id="ldv" value="${esc(v)}" placeholder="nível"></div>
   <div class="gol"><div class="t">&nbsp;</div><button class="green" id="ldvOk" style="height:58px;width:100%">Anotar</button></div></div>
   <div class="row" style="margin-top:8px;flex-wrap:wrap;gap:6px"><button class="sec" data-marca="estab" style="flex:1 1 45%">Nível estabilizou agora</button><button class="sec" data-marca="volta" style="flex:1 1 45%">Voltou ao NE agora</button></div>
   <div class="mini" style="margin-top:6px">A tabela completa continua lá embaixo, para corrigir qualquer leitura.</div></div>`; }
function ligarProx(f){
  const lo=$('#ldvOk'); if(lo) lo.onclick=()=>{ const L=leituraDaVez(f.dados); const v=$('#ldv').value.trim(); if(!L||L.fim||!v) return toast('Digite o nível');
    f.dados[L.tab][L.i].nd=v; gravar(f); toast(`Anotado: ${L.tab==='bomb'?'t':'t\''} = ${L.t} min → ${v} m`); renderProx(f); atualizarTabelaTeste(f); };
  document.querySelectorAll('[data-marca]').forEach(b=>b.onclick=()=>{ const L=leituraDaVez(f.dados); if(!L) return; const k=b.dataset.marca; f.dados[k]=String(Math.round(L.tab==='rec'&&k==='volta'?L.min-720:L.min)); gravar(f); const e=$('#f_'+k); if(e) e.value=f.dados[k]; renderProx(f); toast(k==='estab'?`Estabilizou no minuto ${f.dados[k]}`:`Voltou ao NE no minuto ${f.dados[k]} da recuperação`); });
  const hb=document.querySelector('#prox [data-agora="hini"]'); if(hb) hb.onclick=()=>{ f.dados.hini=AGORA(); const e=$('#f_hini'); if(e) e.value=f.dados.hini; gravar(f); renderProx(f); desenharTabelasHora(f); };
}
function renderProx(f){ const p=$('#prox'); if(!p) return; const tmp=document.createElement('div'); tmp.innerHTML=cartaoLeitura(f.dados); p.replaceWith(tmp.firstElementChild); ligarProx(f); }
function atualizarTabelaTeste(f){ for(const k of ['bomb','rec']) (f.dados[k]||[]).forEach((l,i)=>{ const el=$(`#t_${k}_${i}_nd`); if(el && document.activeElement!==el) el.value=l.nd==null?'':l.nd; }); }
function desenharTabelasHora(f){ atualizarCalc(f); }
function proximaLeitura(d){
  if(!d.hini||!/^\d{1,2}:\d{2}$/.test(d.hini)) return '';
  const [a,b]=d.hini.split(':').map(Number); const agora=new Date(); const ini=new Date(); ini.setHours(a,b,0,0); if(ini>agora) ini.setDate(ini.getDate()-1);
  const min=(agora-ini)/60000;
  const pb=TEMPOS_B.find(t=>t>=min-0.5); if(pb!=null) return `Bombeamento: próxima leitura t = ${pb} min às ${somaHora(d.hini,pb)} (agora: ${Math.floor(min)} min)`;
  const pr=TEMPOS_B.find(t=>720+t>=min-0.5); if(pr!=null) return `Recuperação: próxima leitura t' = ${pr} min às ${somaHora(d.hini,720+pr)}`;
  return 'Teste encerrado (720 + 720 min).';
}
function desenharEditor(){
  const f=pegar(ABERTA); if(!f){ fechar(); return; }
  if(f.tipo==='spt' && f.status!=='encerrada') return desenharSPT(f);
  if(f.status!=='encerrada' && S.pos){ let mudou=false; for(const b of DEF[f.tipo].blocos) for(const c of (b.campos||[])) if(c.tipo==='gps' && !f.dados[c.k]){ f.dados[c.k]=textoCoordFicha(S.pos); mudou=true; } if(mudou) gravar(f); }
  if(f.status!=='encerrada') injetarCssSPT();
  const def=DEF[f.tipo]; const d=f.dados; const ro=f.status==='encerrada';
  $('#hTit').textContent=def.codigo+' · '+def.ident(d); $('#hSub').textContent=f.obraNome; $('#hBtn').classList.remove('hide'); $('#hBtn').textContent='Fichas';
  let h=`<div class="card" style="border-left:5px solid var(--green)"><h2>${esc(def.titulo)}</h2><div class="muted">${esc(def.sop)}${def.norma?' · '+esc(def.norma):''} · salva sozinha a cada toque${f.versao>1?` · versão ${f.versao}`:''}</div>${ro?'<div class="banner" style="background:var(--ok-bg);color:var(--green-2);margin:10px 0 0">Ficha encerrada: o PDF e os dados estão na fila de envio. Para corrigir, reabra — sai uma versão nova.</div>':''}</div>`;
  if(f.tipo==='poco_teste' && !ro) h+=cartaoLeitura(d);
  def.blocos.forEach((b,bi)=>{
    h+=`<div class="card"><h2>${esc(b.t)}</h2>${b.nota?`<div class="nota">${esc(b.nota)}</div>`:''}`;
    if(b.campos) h+=`<div class="grid">`+b.campos.map(c=>campoHTML(c,d[c.k],ro)).join('')+`</div>`;
    if(b.tabela) h+=tabelaHTML(b.tabela,d,ro);
    h+=`</div>`; });
  if(def.nota) h+=`<div class="card nota">${esc(def.nota)}</div>`;
  const av=def.avisos(d);
  h+=`<div class="card" id="avisosBox"><h2>O que ainda falta</h2>${av.length?av.map(x=>`<div class="erro">${esc(x)}</div>`).join(''):'<div class="muted">Nada pendente.</div>'}<div class="nota">Nenhum aviso impede encerrar. Não mediu? Deixe em branco e escreva o porquê. Nunca invente.</div></div>`;
  if(!ro) h+=`<button class="big green" id="encerrar">Encerrar ficha e enviar</button><button class="big ghost" id="excluir" style="margin-top:8px;color:var(--err)">Excluir esta ficha</button>`;
  else h+=`<button class="big sec" id="reabrir">Reabrir para corrigir (gera versão ${f.versao+1})</button><button class="big ghost" id="pdfver" style="margin-top:8px">Baixar o PDF</button>`;
  $('#main').innerHTML=h; ligarEditor(f);
}
function ligarEditor(f){
  const def=DEF[f.tipo];
  const salvar=()=>{ gravar(f); atualizarCalc(f); };
  document.querySelectorAll('[data-f]').forEach(el=>{ el.oninput=el.onchange=()=>{ f.dados[el.dataset.f]=el.value; salvar(); }; });
  document.querySelectorAll('[data-ck]').forEach(el=>{ el.onchange=()=>{ const k=el.dataset.ck; const s=new Set(f.dados[k]||[]); el.checked?s.add(el.value):s.delete(el.value); f.dados[k]=[...s]; salvar(); }; });
  document.querySelectorAll('[data-t]').forEach(el=>{ el.oninput=el.onchange=()=>{ const [k,i,c]=el.dataset.t.split('.'); f.dados[k][+i][c]=el.value; salvar(); }; });
  document.querySelectorAll('[data-agora]').forEach(b=>b.onclick=()=>{ const k=b.dataset.agora; f.dados[k]=AGORA(); $('#f_'+k).value=f.dados[k]; salvar(); });
  document.querySelectorAll('[data-tagora]').forEach(b=>b.onclick=()=>{ const [k,i,c]=b.dataset.tagora.split('.'); f.dados[k][+i][c]=AGORA(); $(`#t_${k}_${i}_${c}`).value=f.dados[k][+i][c]; salvar(); });
  document.querySelectorAll('[data-gps]').forEach(b=>b.onclick=()=>{ iniciarGPS(); if(!S.pos){ toast('Procurando GPS… tente de novo em alguns segundos (céu aberto ajuda).'); return; } const v=textoCoordFicha(S.pos); f.dados[b.dataset.gps]=v; $('#f_'+b.dataset.gps).value=v; salvar(); toast('Coordenada preenchida'); });
  document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{ const tb=def.blocos.find(x=>x.tabela&&x.tabela.k===b.dataset.add).tabela; const arr=f.dados[tb.k]; let extra={};
      if(tb.seq==='metro'){ const u=arr[arr.length-1]; const de=u&&u.ate!==''&&!isNaN(NUM(u.ate))?NUM(u.ate):0; extra={de:String(de).replace('.',','), ate:String(de+1).replace('.',',')}; }
      else if(arr.length && arr[arr.length-1].ate!==undefined){ extra={de:arr[arr.length-1].ate||''}; }
      arr.push(linhaVazia(tb,extra)); gravar(f); desenharEditor(); const ult=document.querySelector(`[data-li="${arr.length-1}"]`); if(ult) ult.scrollIntoView({block:'center'}); });
  document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{ const [k,i]=b.dataset.del.split('.'); if(b.dataset.c!=='1'){ b.dataset.c='1'; b.textContent='toque de novo para apagar'; return; } f.dados[k].splice(+i,1); gravar(f); desenharEditor(); });
  document.querySelectorAll('[data-mostra]').forEach(b=>b.onclick=()=>{ document.querySelectorAll('.linha.vz').forEach(x=>x.classList.toggle('oc')); });
  document.querySelectorAll('[data-ass]').forEach(el=>el.onclick=()=>{ if(f.status==='encerrada') return; assinar(el.dataset.ass, url=>{ f.dados[el.dataset.ass]=url; gravar(f); desenharEditor(); }); });
  document.querySelectorAll('[data-gmat]').forEach(box=>box.querySelectorAll('button').forEach(b=>b.onclick=()=>{ const [k,i,c]=box.dataset.gmat.split('.'); const l=f.dados[k][+i]; const s=l._sel||(l._sel={tipos:[],cor:'',umid:''}); const gr=box.dataset.grupo, v=b.dataset.v;
    if(gr==='tipos') s.tipos = s.tipos.includes(v)? s.tipos.filter(x=>x!==v) : [...s.tipos, v]; else s[gr] = s[gr]===v?'':v;
    l[c]=montarDesc(s); if(l.h!==undefined && !l.h) l.h=AGORA(); gravar(f); desenharEditor(); }));
  document.querySelectorAll('[data-gidem]').forEach(b=>b.onclick=()=>{ const [k,i,c]=b.dataset.gidem.split('.'); const a=f.dados[k][+i-1], l=f.dados[k][+i]; l[c]=a[c]||''; l._sel=a._sel?JSON.parse(JSON.stringify(a._sel)):undefined; gravar(f); desenharEditor(); toast('Copiado da linha de cima — só use se for igual'); });
  document.querySelectorAll('[data-gagua]').forEach(b=>b.onclick=()=>{ const [k,i]=b.dataset.gagua.split('.'); const tb=def.blocos.find(x=>x.tabela&&x.tabela.k===k).tabela; const l=f.dados[k][+i]; f.dados[tb.agua]=l.de||l.ate||''; gravar(f); desenharEditor(); toast(`"Água apareceu a" = ${f.dados[tb.agua]||'?'} m. Confira lá embaixo.`); });
  document.querySelectorAll('[data-gfoto]').forEach(b=>b.onclick=()=>{ const [k,i]=b.dataset.gfoto.split('.'); const tb=def.blocos.find(x=>x.tabela&&x.tabela.k===k).tabela; const l=f.dados[k][+i];
    CAM.extra={ fichaId:f.id, ficha:def.ident(f.dados), tabela:k, linha:+i, trecho:`${l.de||'?'} a ${l.ate||'?'} m` }; abrirCamera('amostra', `${tb.foto.replace(/^Foto d[ao] /,'').replace(/^./,x=>x.toUpperCase())} · ${def.ident(f.dados)} · ${l.de||'?'} a ${l.ate||'?'} m`); });
  const enc=$('#encerrar'); if(enc) enc.onclick=()=>encerrar(f);
  const exc=$('#excluir'); if(exc) exc.onclick=()=>{ if(exc.dataset.c!=='1'){ exc.dataset.c='1'; exc.textContent='Toque de novo para excluir de vez'; return; } remover(f.id); fechar(); };
  const rea=$('#reabrir'); if(rea) rea.onclick=()=>{ f.status='rascunho'; f.versao=(f.versao||1)+1; gravar(f); desenharEditor(); toast('Reaberta: versão '+f.versao); };
  const pv=$('#pdfver'); if(pv) pv.onclick=async()=>{ const b=await gerarPDF(f); baixarBlob(b, `${def.codigo.replace(/\s+/g,'-')}_${slug(def.ident(f.dados))}_v${f.versao||1}.pdf`); }; // baixa, não navega: o app não sai da tela
  ligarProx(f);
  if(f.tipo==='poco_teste' && f.status!=='encerrada'){ clearInterval(window.__proxT); window.__proxT=setInterval(()=>{ const p=$('#prox'); if(!p||!aberta()){ clearInterval(window.__proxT); return; } if(document.activeElement && document.activeElement.id==='ldv') return; renderProx(f); },20000); }
}
function atualizarCalc(f){
  const def=DEF[f.tipo]; const d=f.dados;
  def.blocos.filter(b=>b.tabela).forEach(b=>{ const tb=b.tabela; (d[tb.k]||[]).forEach((l,i)=>tb.cols.filter(c=>c.tipo==='calc').forEach(c=>{ const el=document.querySelector(`[data-calc="${tb.k}.${i}.${c.k}"]`); if(el) el.textContent=String(c.calc(l,d)); })); });
  const box=$('#avisosBox'); if(box){ const av=def.avisos(d); box.innerHTML=`<h2>O que ainda falta</h2>${av.length?av.map(x=>`<div class="erro">${esc(x)}</div>`).join(''):'<div class="muted">Nada pendente.</div>'}<div class="nota">Nenhum aviso impede encerrar. Não mediu? Deixe em branco e escreva o porquê. Nunca invente.</div>`; }
  if(f.tipo==='poco_teste' && $('#prox') && !(document.activeElement&&document.activeElement.id==='ldv')) renderProx(f);
}

/* ---------------- Assinatura com o dedo ---------------- */
function assinar(k, pronto){
  const ov=document.createElement('div'); ov.className='assov';
  ov.innerHTML=`<div class="assbox"><div class="row" style="margin-bottom:8px"><b style="flex:1">Assine com o dedo</b><button class="ghost" id="assLimpa">limpar</button></div><canvas id="assCv"></canvas><div class="nota">Assinatura, nome, data, hora e coordenada ficam registrados na ficha.</div><div class="row" style="margin-top:10px"><button class="sec" id="assCancela">Cancelar</button><button class="green" id="assOk">Confirmar</button></div></div>`;
  document.body.appendChild(ov);
  const cv=ov.querySelector('#assCv'); const w=Math.min(window.innerWidth-40,640); cv.width=w*2; cv.height=w*0.45*2; cv.style.width=w+'px'; cv.style.height=(w*0.45)+'px';
  const c=cv.getContext('2d'); c.lineWidth=5; c.lineCap='round'; c.lineJoin='round'; c.strokeStyle='#1A1A2E'; let des=false, usou=false;
  const pt=e=>{ const r=cv.getBoundingClientRect(); const t=e.touches?e.touches[0]:e; return [(t.clientX-r.left)*2,(t.clientY-r.top)*2]; };
  const ini=e=>{ e.preventDefault(); des=true; usou=true; c.beginPath(); c.moveTo(...pt(e)); }, mov=e=>{ if(!des) return; e.preventDefault(); c.lineTo(...pt(e)); c.stroke(); }, fim=()=>{ des=false; };
  cv.addEventListener('pointerdown',ini); cv.addEventListener('pointermove',mov); window.addEventListener('pointerup',fim);
  cv.style.touchAction='none';
  ov.querySelector('#assLimpa').onclick=()=>{ c.clearRect(0,0,cv.width,cv.height); usou=false; };
  ov.querySelector('#assCancela').onclick=()=>ov.remove();
  ov.querySelector('#assOk').onclick=()=>{ if(!usou){ toast('Assine antes de confirmar'); return; }
    // recorta e reduz
    const oc=document.createElement('canvas'); oc.width=600; oc.height=Math.round(600*cv.height/cv.width); const o=oc.getContext('2d'); o.fillStyle='#fff'; o.fillRect(0,0,oc.width,oc.height); o.drawImage(cv,0,0,oc.width,oc.height);
    const carimbo=`${fmtData(new Date())} · ${S.pos?fmtCoordCurta(S.pos,S.fmt):'sem GPS'}`; o.fillStyle='#5B6570'; o.font='16px system-ui,Arial'; o.fillText(carimbo,8,oc.height-8);
    ov.remove(); pronto(oc.toDataURL('image/jpeg',0.8)); };
}

/* ---------------- PDF no layout da ficha ---------------- */
async function gerarPDF(f){
  const def=DEF[f.tipo]; const d=f.dados;
  const W=1240, H=1754, M=60; const paginas=[]; let cv, c, y;
  const logo=await new Promise(ok=>{ const i=new Image(); i.onload=()=>ok(i); i.onerror=()=>ok(null); i.src='logo-color.png'; });
  const fonte=(px,b)=>`${b?'700':'400'} ${px}px Arial, Helvetica, sans-serif`;
  const novaPag=()=>{ cv=document.createElement('canvas'); cv.width=W; cv.height=H; c=cv.getContext('2d'); c.fillStyle='#fff'; c.fillRect(0,0,W,H); paginas.push(cv);
    // cabeçalho
    if(logo){ const lw=300, lh=lw*logo.height/logo.width; c.drawImage(logo,M,M-10,lw,lh); }
    c.fillStyle='#113E6B'; c.font=fonte(30,true); c.textAlign='right'; c.fillText(def.titulo.toUpperCase(),W-M,M+20);
    c.fillStyle='#19A878'; c.font=fonte(20,true); c.fillText(`${def.codigo} · ${def.sop} · ${def.ident(d)}${f.versao>1?' · v'+f.versao:''}`,W-M,M+50);
    c.textAlign='left'; c.fillStyle='#19A878'; c.fillRect(M,M+70,W-2*M,3);
    c.fillStyle='#5B6570'; c.font=fonte(17); c.fillText(`Obra: ${f.obraNome}`,M,M+100);
    c.fillText(`Preenchida no app de campo por ${f.por||'—'} · encerrada em ${fmtData(new Date())} · ficha ${f.id}`,M,M+124);
    y=M+150; };
  const rodape=()=>{ paginas.forEach((p,i)=>{ const x=p.getContext('2d'); x.fillStyle='#D9DEE5'; x.fillRect(M,H-90,W-2*M,1); x.fillStyle='#8A94A0'; x.font=fonte(15); x.textAlign='center';
      x.fillText('NATURAL ENGENHARIA · R. Lírio do Vale, 24 – Andar 01, Sala F08 – Aparecida, Boa Vista/RR · (95) 98109-5431 · naturalengenhariarr@gmail.com',W/2,H-62);
      x.fillText(`Campo em branco é permitido; campo inventado, não. · Página ${i+1} de ${paginas.length}`,W/2,H-40); x.textAlign='left'; }); };
  const garante=h=>{ if(y+h>H-110){ novaPag(); } };
  const quebra=(txt,larg,px,b)=>{ c.font=fonte(px,b); const ps=String(txt).split(/\s+/); const ls=[]; let l=''; for(const p of ps){ const t=l?l+' '+p:p; if(c.measureText(t).width>larg && l){ ls.push(l); l=p; } else l=t; } if(l) ls.push(l); return ls.length?ls:['']; };
  const titulo=t=>{ garante(60); c.fillStyle='#19A878'; c.fillRect(M,y+6,6,30); c.fillStyle='#113E6B'; c.font=fonte(22,true); c.fillText(t,M+16,y+30); y+=48; };
  const valor=(cp,v)=>{ if(cp.tipo==='date' && /^\d{4}-\d{2}-\d{2}$/.test(v||'')) return v.split('-').reverse().join('/'); if(cp.tipo==='check') return (cp.op.map(o=>((v||[]).includes(o)?'☑ ':'☐ ')+o)).join('   '); return v==null||v===''?'—':String(v); };
  novaPag();
  for(const b of def.blocos){
    titulo(b.t);
    if(b.nota){ const ls=quebra(b.nota,W-2*M,15); garante(ls.length*20); c.fillStyle='#5B6570'; c.font=fonte(15); ls.forEach(l=>{ c.fillText(l,M,y+14); y+=20; }); y+=6; }
    if(b.campos){ // grade de 4 colunas
      const col=(W-2*M)/4; let x=0, alt=0; const linha=[];
      const flush=()=>{ y+=alt+10; x=0; alt=0; };
      for(const cp of b.campos){ const span=Math.min(cp.w||1,4); if(x+span>4) flush();
        const X=M+x*col, larg=span*col-14;
        if(cp.tipo==='ass'){ garante(170); const img=d[cp.k]; c.fillStyle='#5B6570'; c.font=fonte(14,true); c.fillText(cp.r.toUpperCase(),X,y+14);
          c.strokeStyle='#D9DEE5'; c.strokeRect(X,y+22,larg,120);
          if(img){ const im=await new Promise(ok=>{ const i=new Image(); i.onload=()=>ok(i); i.onerror=()=>ok(null); i.src=img; }); if(im){ const r=Math.min(larg/im.width,120/im.height); c.drawImage(im,X+(larg-im.width*r)/2,y+22,im.width*r,im.height*r); } }
          else { c.fillStyle='#B91C1C'; c.font=fonte(15); c.fillText('sem assinatura',X+10,y+90); }
          alt=Math.max(alt,150); x+=span; continue; }
        const ls=quebra(valor(cp,d[cp.k]),larg,18); const h=24+ls.length*23; garante(h);
        c.fillStyle='#5B6570'; c.font=fonte(14,true); if(cp.r) quebra(cp.r.toUpperCase(),larg,14,true).slice(0,1).forEach(l=>c.fillText(l,X,y+14));
        c.fillStyle='#1B2430'; c.font=fonte(18); ls.forEach((l,i)=>c.fillText(l,X,y+38+i*23));
        c.fillStyle='#EDEFF2'; c.fillRect(X,y+h+2,larg,1);
        alt=Math.max(alt,h); x+=span; }
      flush(); }
    if(b.tabela){ const tb=b.tabela; const cols=tb.cols; const tot=cols.reduce((s,cc)=>s+cc.w,0); const larg=W-2*M; const ws=cols.map(cc=>cc.w/tot*larg);
      let linhas=d[tb.k]||[]; if(tb.seq==='fixo') linhas=linhas.filter(l=>cols.some(cc=>!['fixo','calc'].includes(cc.tipo)&&l[cc.k]!==''&&l[cc.k]!=null));
      const cab=()=>{ garante(44); c.fillStyle='#113E6B'; c.fillRect(M,y,larg,40); c.fillStyle='#fff'; let X=M; cols.forEach((cc,i)=>{ const ls=quebra(cc.r,ws[i]-8,12,true).slice(0,2); c.font=fonte(12,true); ls.forEach((l,j)=>c.fillText(l,X+4,y+16+j*14)); X+=ws[i]; }); y+=40; };
      cab();
      if(!linhas.length){ c.fillStyle='#5B6570'; c.font=fonte(16); c.fillText('nenhuma leitura registrada',M+8,y+26); y+=38; }
      linhas.forEach((l,li)=>{ const vals=cols.map(cc=> cc.tipo==='fixo'? String(l.t) : cc.tipo==='calc'? String(cc.calc(l,d)) : cc.tipo==='date'&&/^\d{4}-\d{2}-\d{2}$/.test(l[cc.k]||'')? l[cc.k].split('-').reverse().join('/') : (l[cc.k]==null?'':String(l[cc.k])));
        const qs=vals.map((v,i)=>quebra(v,ws[i]-8,15)); const h=Math.max(...qs.map(q=>q.length))*19+12;
        if(y+h>H-110){ novaPag(); cab(); }
        if(li%2){ c.fillStyle='#F3F5F8'; c.fillRect(M,y,larg,h); }
        let X=M; qs.forEach((q,i)=>{ c.fillStyle= cols[i].tipo==='calc'?'#137F5B':'#1B2430'; c.font=fonte(15, cols[i].k==='n'); q.forEach((t,j)=>c.fillText(t,X+4,y+19+j*19)); X+=ws[i]; });
        c.fillStyle='#D9DEE5'; c.fillRect(M,y+h,larg,1); y+=h; });
      y+=16; }
  }
  if(def.nota){ const ls=quebra(def.nota,W-2*M-20,15); garante(ls.length*20+24); c.fillStyle='#E7F6ED'; c.fillRect(M,y,W-2*M,ls.length*20+18); c.fillStyle='#137F5B'; c.font=fonte(15); ls.forEach((l,i)=>c.fillText(l,M+10,y+22+i*20)); y+=ls.length*20+30; }
  const av=def.avisos(d); if(av.length){ titulo('Avisos no encerramento (campo em branco é permitido)'); av.forEach(a=>{ const ls=quebra('• '+a,W-2*M,15); garante(ls.length*20); c.fillStyle='#B45309'; c.font=fonte(15); ls.forEach(l=>{ c.fillText(l,M,y+14); y+=20; }); }); }
  rodape();
  const jpgs=[]; for(const p of paginas){ const b=await new Promise(ok=>p.toBlob(ok,'image/jpeg',0.85)); jpgs.push(new Uint8Array(await b.arrayBuffer())); }
  return montarPDF(jpgs, W, H);
}
function montarPDF(jpgs, W, H){
  // PDF mínimo: uma página A4 por imagem JPEG
  const enc=new TextEncoder(); const partes=[]; const off=[]; let tam=0;
  const add=x=>{ const b= typeof x==='string'? enc.encode(x) : x; partes.push(b); tam+=b.length; };
  const obj=(n,corpo)=>{ off[n]=tam; add(`${n} 0 obj\n`); corpo(); add(`\nendobj\n`); };
  add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const n=jpgs.length; const pw=595.28, ph=841.89; const kids=[]; for(let i=0;i<n;i++) kids.push(`${3+i*3} 0 R`);
  obj(1,()=>add('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2,()=>add(`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${n} >>`));
  jpgs.forEach((j,i)=>{ const p=3+i*3, im=p+1, ct=p+2; const cont=`q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    obj(p,()=>add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${ct} 0 R >>`));
    obj(im,()=>{ add(`<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.length} >>\nstream\n`); add(j); add('\nendstream'); });
    obj(ct,()=>add(`<< /Length ${cont.length} >>\nstream\n${cont}\nendstream`)); });
  const total=3+n*3; const xref=tam; let x=`xref\n0 ${total}\n0000000000 65535 f \n`; for(let i=1;i<total;i++) x+=String(off[i]).padStart(10,'0')+' 00000 n \n';
  add(x); add(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(partes,{type:'application/pdf'});
}

/* ---------------- Encerrar: PDF + dados na fila ---------------- */
/* ============================================================
   BOLETIM SPT — MODO CAMPO (feito para quem está com a mão suja)
   Mesmos dados da FC-SPT v1.1 (o PDF e o leitor ficha_app.py não mudam).
   Um cartão por metro, números grandes, material em botões,
   hora e início automáticos, foto da amostra opcional.
   ============================================================ */
const MAT_POCO=[['Solo','m'],['Argila','f'],['Silte','m'],['Areia','f'],['Cascalho','m'],['Laterita','f'],['Rocha alterada','f'],['Granito','m'],['Gnaisse','m'],['Diabásio','m'],['Arenito','m'],['Quartzo','m']];
const MAT={ tipos:[['Argila','f'],['Silte','m'],['Areia','f'],['Pedregulho','m'],['Aterro','m'],['Rocha alterada','f']],
  adj:{ 'Argila':'argilos', 'Silte':'siltos', 'Areia':'arenos', 'Pedregulho':null, 'Aterro':null, 'Rocha alterada':null, 'Cascalho':'cascalhent', 'Laterita':'laterític' },
  cores:[['vermelh',1],['amarel',1],['marrom',0],['cinza',0],['branc',1],['pret',1],['variegad',1]],
  umid:[['sec',1],['úmid',1],['molhad',1]],
  obs:['Achou água aqui','Perdeu água','Desbarrancou','Pedra / matacão'] };
function flex(raiz, g, varia){ return varia ? raiz+(g==='f'?'a':'o') : raiz; }
function montarDesc(sel){ // sel: {tipos:[], cor:'', umid:''}
  if(!sel.tipos.length) return '';
  const [p,...sec]=sel.tipos; const g=([...MAT.tipos,...MAT_POCO].find(t=>t[0]===p)||[p,'f'])[1];
  let s=p; for(const x of sec){ const a=MAT.adj[x]; s+= a? ' '+flex(a,g,true) : ' com '+x.toLowerCase(); }
  if(sel.cor){ const c=MAT.cores.find(x=>x[0]===sel.cor); s+=', '+(c?flex(c[0],g,!!c[1]):sel.cor); }
  if(sel.umid){ const u=MAT.umid.find(x=>x[0]===sel.umid); s+=', '+(u?flex(u[0],g,!!u[1]):sel.umid); }
  return s; }
function fotosDaLinha(fid,tk,i){ return (S.fila||[]).filter(x=>x.tipo==='foto' && !x.meta?.original && x.meta?.extra?.fichaId===fid && x.meta?.extra?.tabela===tk && x.meta?.extra?.linha===i); }
function fotosDoMetro(f,i){ return (S.fila||[]).filter(x=>x.tipo==='foto' && !x.meta?.original && x.meta?.extra?.fichaId===f.id && x.meta?.extra?.linha===i); }
function trechoTxt(l){ const de=NUM(l.de); if(isNaN(de)) return `${l.de||'?'} a ${l.ate||'?'} m`; return `${String(de.toFixed(2)).replace('.',',')} a ${String((de+0.45).toFixed(2)).replace('.',',')} m`; }
function impenetravel(l){ for(const [g,c] of [['g1','c1'],['g2','c2'],['g3','c3']]){ const G=NUM(l[g]), C=NUM(l[c]); if(!isNaN(G)&&!isNaN(C)&&G>=30&&C<15) return true; } return false; }
function injetarCssSPT(){ if(document.getElementById('cssSPT')) return; const st=document.createElement('style'); st.id='cssSPT'; st.textContent=`
.spt .mcard{border:2px solid var(--line);border-radius:14px;padding:12px;margin-bottom:12px;background:#fff}
.spt .mcard.ok{border-color:var(--green)}
.spt .mhead{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.spt .mhead b{font-size:19px;color:var(--navy)}
.spt .mhead .prof{font-size:15px;color:var(--ink)}
.spt .mhead .nbox{margin-left:auto;background:var(--navy);color:#fff;border-radius:10px;padding:4px 12px;font:700 20px system-ui}
.spt .gols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.spt .gol{min-width:0}
.spt .gol input.g{width:100%;min-width:0}
.spt .row input,.spt .grid input{min-width:0}
.spt .grid>div{min-width:0}
.spt .gol{border:1.5px solid var(--line);border-radius:12px;padding:8px;text-align:center;background:#FAFBFC}
.spt .gol .t{font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.spt .gol input.g{font:700 30px system-ui;text-align:center;height:58px;padding:0;margin:4px 0}
.spt .gol .cm{display:flex;align-items:center;justify-content:center;gap:4px;font-size:12px;color:var(--muted)}
.spt .gol .cm input{width:44px;height:34px;padding:2px;text-align:center;font-size:15px}
.spt .sub{font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin:12px 0 6px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chips button{min-height:40px;padding:6px 12px;border-radius:20px;border:1.5px solid var(--line);background:#fff;color:var(--ink);font-size:15px;font-weight:500;flex:0 0 auto}
.chips button.on{background:var(--navy);border-color:var(--navy);color:#fff}
.linha .row input,.linha input,.linha select{min-width:0}
.linha .grid>div{min-width:0}
.mini{font-size:13px;color:var(--muted)}
.sub2{font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin:8px 0 4px}
.spt .chips{display:flex;flex-wrap:wrap;gap:6px}
.spt .chips button{min-height:40px;padding:6px 12px;border-radius:20px;border:1.5px solid var(--line);background:#fff;color:var(--ink);font-size:15px;font-weight:500}
.spt .chips button.on{background:var(--navy);border-color:var(--navy);color:#fff}
.spt .av button{flex:1;min-height:46px;font-size:16px}
.spt .foto{display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap}
.spt .foto img{width:54px;height:54px;object-fit:cover;border-radius:8px;border:1px solid var(--line)}
.spt .alerta{background:#FFF4E5;border:1.5px solid #F0A030;color:#7A4A00;border-radius:10px;padding:8px 10px;margin-top:8px;font-size:14px}
.spt .big1 input{font-size:22px;font-weight:700;height:54px}
.spt .agua button.opt{flex:1;min-height:52px;font-size:15px}
.spt details summary{cursor:pointer;font-weight:600;color:var(--navy);padding:6px 0}
.spt .mini{font-size:13px;color:var(--muted)}
`; document.head.appendChild(st); }

function desenharSPT(f){
  injetarCssSPT(); const y=window.scrollY;
  const def=DEF.spt; const d=f.dados; const tb=def.blocos[1].tabela; const g=d.golpes||(d.golpes=[]);
  d.folha=`1 de ${Math.max(1,Math.ceil(g.length/12))}`;
  g.forEach((l,i)=>{ if(l.am===''||l.am==null) l.am=String(i+1); }); // amostra nº = nº do metro (pode trocar)
  if(!d.coord && S.pos){ d.coord=textoCoordFicha(S.pos); gravar(f); }
  $('#hTit').textContent=def.codigo+' · '+def.ident(d); $('#hSub').textContent=f.obraNome; $('#hBtn').classList.remove('hide'); $('#hBtn').textContent='Fichas';
  const inp=(k,ph,modo)=>`<input id="f_${k}" data-f="${k}" value="${esc(d[k]==null?'':d[k])}" placeholder="${esc(ph||'')}" ${modo==='num'?'inputmode="decimal"':''}>`;
  let h=`<div class="spt">`;
  h+=`<div class="card" style="border-left:5px solid var(--green)"><h2>Boletim SPT · furo SP-${esc(d.furo||'__')}</h2><div class="mini">SOP-017 · NBR 6484 · salva sozinho a cada toque · pode fechar o app que não perde</div></div>`;

  // 1 · Antes de começar
  h+=`<div class="card"><h2>1 · Antes do primeiro golpe</h2>
   <div class="grid"><div class="big1"><label for="f_furo">Furo nº SP-</label>${inp('furo','01','num')}</div>
   <div style="grid-column:span 3"><label for="f_local">Onde é o furo</label>${inp('local','ex.: cabeceira da pista, lado norte')}</div></div>
   <label>Coordenada do furo</label><div class="row"><input id="f_coord" data-f="coord" value="${esc(d.coord||'')}" placeholder="procurando GPS…"><button class="sec" data-gps="coord" style="flex:0 0 auto">GPS de novo</button></div>
   <div class="grid"><div style="grid-column:span 2"><label for="f_equipe">Sondador e ajudantes</label>${inp('equipe','nomes')}</div>
   <div style="grid-column:span 2"><label for="f_acomp">Quem do cliente acompanhou</label>${inp('acomp','nome (se tiver)')}</div></div>
   <details><summary>Mais dados do furo (cota, revestimento, trado, lavagem, data)</summary><div class="grid">
    <div><label for="f_cota">Cota (m)</label>${inp('cota','','num')}</div><div><label for="f_revest">Revestimento até (m)</label>${inp('revest','','num')}</div>
    <div><label for="f_trado">Trado até (m)</label>${inp('trado','','num')}</div><div><label for="f_lavagem">Lavagem de/até (m)</label>${inp('lavagem','')}</div>
    <div><label for="f_data">Data</label><input id="f_data" type="date" data-f="data" value="${esc(d.data||'')}"></div>
    <div><label for="f_inicio">Início</label><div class="row"><input id="f_inicio" type="time" data-f="inicio" value="${esc(d.inicio||'')}"><button class="sec" data-agora="inicio" style="flex:0 0 auto;padding:10px">agora</button></div></div>
    <div style="grid-column:span 2"><label for="f_cliente">Cliente / obra</label>${inp('cliente','')}</div></div>
    <div class="mini">A hora de início entra sozinha no primeiro golpe anotado.</div></details></div>`;

  // 2 · Metro a metro
  h+=`<div class="card"><h2>2 · Metro a metro</h2><div class="mini">Anote na hora. Golpes de cada 15 cm · N = 2º + 3º (o app soma) · se não entrou os 15 cm, corrija o "entrou".</div></div>`;
  g.forEach((l,i)=>{
    const nOk = l.g2!==''&&l.g2!=null&&l.g3!==''&&l.g3!=null; const N=nOk?NUM(l.g2)+NUM(l.g3):'';
    const sel=l._sel||{tipos:[],cor:'',umid:''}; const fotos=fotosDoMetro(f,i);
    h+=`<div class="mcard ${nOk&&l.desc?'ok':''}" data-li="${i}">
     <div class="mhead"><b>Metro ${i+1}</b><span class="prof">${esc(trechoTxt(l))}</span><span class="nbox">N = <span data-calc="golpes.${i}.n">${esc(String(N))}</span></span></div>
     <div class="gols">${[1,2,3].map(k=>`<div class="gol"><div class="t">${k}º 15 cm</div><input class="g" inputmode="numeric" data-t="golpes.${i}.g${k}" id="t_golpes_${i}_g${k}" value="${esc(l['g'+k]==null?'':l['g'+k])}" placeholder="golpes" aria-label="golpes do ${k}º trecho"><div class="cm">entrou <input inputmode="numeric" data-t="golpes.${i}.c${k}" id="t_golpes_${i}_c${k}" value="${esc(l['c'+k]==null?'':l['c'+k])}"> cm</div></div>`).join('')}</div>
     ${impenetravel(l)?`<div class="alerta">Pode ser <b>impenetrável</b> (30 golpes sem entrar 15 cm). Confirme e, se for, vá em "Fim do furo".</div>`:''}
     <div class="sub">O que saiu no amostrador</div>
     <div class="chips" data-mat="${i}" data-grupo="tipos">${MAT.tipos.map(t=>`<button class="${sel.tipos.includes(t[0])?'on':''}" data-v="${esc(t[0])}">${esc(t[0])}</button>`).join('')}</div>
     <div class="sub">Cor</div><div class="chips" data-mat="${i}" data-grupo="cor">${MAT.cores.map(c=>`<button class="${sel.cor===c[0]?'on':''}" data-v="${c[0]}">${flex(c[0],'m',!!c[1])}</button>`).join('')}</div>
     <div class="sub">Umidade</div><div class="chips" data-mat="${i}" data-grupo="umid">${MAT.umid.map(u=>`<button class="${sel.umid===u[0]?'on':''}" data-v="${u[0]}">${flex(u[0],'m',true)}</button>`).join('')}</div>
     <label for="t_golpes_${i}_desc" style="margin-top:10px">Descrição (os botões escrevem aqui; pode corrigir)</label>
     <textarea id="t_golpes_${i}_desc" data-t="golpes.${i}.desc" style="min-height:54px" placeholder="ex.: Argila siltosa, vermelha, úmida">${esc(l.desc||'')}</textarea>
     ${i>0?`<button class="ghost" data-idem="${i}" style="padding:4px 0">Igual ao metro de cima</button>`:''}
     <div class="sub">Avanço até o próximo ensaio</div><div class="row av">${[['T','Trado'],['L','Lavagem']].map(a=>`<button class="${l.av===a[0]?'green':'sec'}" data-av="${i}" data-v="${a[0]}">${a[1]}</button>`).join('')}</div>
     <div class="sub">Aconteceu algo?</div><div class="chips" data-obs="${i}">${MAT.obs.map(o=>`<button class="${(l.obs||'').includes(o)?'on':''}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>
     <input id="t_golpes_${i}_obs" data-t="golpes.${i}.obs" value="${esc(l.obs||'')}" placeholder="outra observação (se tiver)" style="margin-top:6px">
     <div class="foto"><button class="sec" data-fotoam="${i}">📷 Foto da amostra (se quiser)</button>${fotos.slice(-4).map(x=>x.thumb?`<img src="${x.thumb}" alt="">`:'').join('')}${fotos.length?`<span class="mini">${fotos.length} foto(s)</span>`:''}</div>
     <details style="margin-top:8px"><summary>Ajustar profundidade, amostra, hora ou apagar</summary><div class="grid">
       <div><label>De (m)</label><input inputmode="decimal" data-t="golpes.${i}.de" id="t_golpes_${i}_de" value="${esc(l.de==null?'':l.de)}"></div>
       <div><label>Até (m)</label><input inputmode="decimal" data-t="golpes.${i}.ate" id="t_golpes_${i}_ate" value="${esc(l.ate==null?'':l.ate)}"></div>
       <div><label>Amostra nº</label><input data-t="golpes.${i}.am" id="t_golpes_${i}_am" value="${esc(l.am==null?'':l.am)}"></div>
       <div><label>Hora</label><input type="time" data-t="golpes.${i}.h" id="t_golpes_${i}_h" value="${esc(l.h||'')}"></div></div>
       <button class="ghost" data-del="golpes.${i}" style="color:var(--err)">apagar este metro</button></details>
    </div>`; });
  h+=`<button class="big green" data-add="golpes" style="margin-bottom:12px">+ Próximo metro${g.length?` (${g.length+1}º)`:''}</button>`;

  // 3 · Água
  const temNA=d.na_ini!==''&&d.na_ini!=null, seco=d.seco!==''&&d.seco!=null;
  h+=`<div class="card agua"><h2>3 · Água no furo</h2><div class="mini">Sonde quando achar água e de novo no fim do furo.</div>
   <div class="grid" style="margin-top:6px"><div style="grid-column:span 2"><label for="f_na_ini">Achou água a (m)</label><div class="row">${inp('na_ini','profundidade','num')}<input id="f_na_ini_h" type="time" data-f="na_ini_h" value="${esc(d.na_ini_h||'')}" style="max-width:120px"><button class="sec" data-agora="na_ini_h" style="flex:0 0 auto;padding:10px">agora</button></div></div>
   <div style="grid-column:span 2"><label for="f_na_fim">No fim, sondou de novo: (m)</label><div class="row">${inp('na_fim','profundidade','num')}<input id="f_na_fim_h" type="time" data-f="na_fim_h" value="${esc(d.na_fim_h||'')}" style="max-width:120px"><button class="sec" data-agora="na_fim_h" style="flex:0 0 auto;padding:10px">agora</button></div></div>
   <div style="grid-column:span 2"><label for="f_seco">Não achou água: seco até (m)</label>${inp('seco','profundidade','num')}</div></div>
   ${temNA&&seco?'<div class="alerta">Marcou que achou água e também "seco até". Confira qual vale.</div>':''}</div>`;

  // 4 · Fim
  const ult=g.length?g[g.length-1]:null; let penet=0; if(ult) for(const k of [1,2,3]){ if(ult['g'+k]!==''&&ult['g'+k]!=null){ const c=NUM(ult['c'+k]); penet+= isNaN(c)?15:c; } }
  const sugFim = ult&&!isNaN(NUM(ult.de))&&penet ? String((NUM(ult.de)+penet/100).toFixed(2)).replace('.',',') : ''; // de + o que o amostrador entrou
  h+=`<div class="card"><h2>4 · Fim do furo</h2>
   <div class="grid"><div class="big1" style="grid-column:span 2"><label for="f_prof_final">Profundidade final (m)</label><div class="row">${inp('prof_final','','num')}${sugFim&&!d.prof_final?`<button class="sec" data-usarfim="${sugFim}" style="flex:0 0 auto">${sugFim} m</button>`:''}</div></div>
   <div style="grid-column:span 2"><label for="f_fim">Hora que terminou</label><div class="row"><input id="f_fim" type="time" data-f="fim" value="${esc(d.fim||'')}"><button class="sec" data-agora="fim" style="flex:0 0 auto;padding:10px">agora</button></div></div></div>
   <label>Parou porque</label><div class="chips" data-parou="1">${def.blocos[2].campos.find(c=>c.k==='parou').op.filter(Boolean).map(o=>`<button class="${d.parou===o?'on':''}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>
   ${d.parou==='outro'?`<label for="f_parou_outro">Qual motivo</label>${inp('parou_outro','')}`:''}
   ${(NUM(d.prof_final)>12)?`<label for="f_autorizou12">Passou de 12 m: quem autorizou?</label>${inp('autorizou12','nome')}`:''}
   <div class="mini" style="margin-top:8px">${esc(def.nota)}</div></div>`;
  const chk=def.blocos[2].campos.find(c=>c.k==='chk');
  h+=`<div class="card"><h2>5 · Antes de ir embora</h2><div class="grid">${campoHTML(chk,d.chk,false)}${campoHTML({k:'sacos',r:'Amostras: nº de sacos',tipo:'int'},d.sacos,false)}</div>
   <div class="grid">${campoHTML({k:'ass_sond',r:'Assinatura do sondador',tipo:'ass',w:2},d.ass_sond,false)}${campoHTML({k:'ass_acomp',r:'Assinatura de quem acompanhou (cliente)',tipo:'ass',w:2},d.ass_acomp,false)}</div></div>`;

  const av=def.avisos(d);
  h+=`<div class="card" id="avisosBox"><h2>O que ainda falta</h2>${av.length?av.map(x=>`<div class="erro">${esc(x)}</div>`).join(''):'<div class="muted">Nada pendente.</div>'}<div class="nota">Nenhum aviso impede encerrar. Não mediu? Deixe em branco. Nunca invente.</div></div>`;
  h+=`<button class="big green" id="encerrar">Encerrar boletim e enviar</button><button class="big ghost" id="excluir" style="margin-top:8px;color:var(--err)">Excluir este boletim</button></div>`;
  $('#main').innerHTML=h; ligarEditor(f); ligarSPT(f); window.scrollTo(0,y);
}
function ligarSPT(f){
  const d=f.dados; const g=d.golpes;
  const refazer=()=>{ gravar(f); desenharSPT(f); };
  // hora de início e hora do metro entram sozinhas
  document.querySelectorAll('.spt input.g').forEach(el=>el.addEventListener('input',()=>{ const [,i,c]=el.dataset.t.split('.'); const l=g[+i];
    if(!d.inicio && el.value!==''){ d.inicio=AGORA(); const x=$('#f_inicio'); if(x) x.value=d.inicio; }
    if(c==='g3' && el.value!=='' && !l.h){ l.h=AGORA(); const x=$(`#t_golpes_${i}_h`); if(x) x.value=l.h; }
    gravar(f); const card=el.closest('.mcard'); if(card) card.classList.toggle('ok', l.g2!==''&&l.g3!==''&&!!l.desc); }));
  // material em botões -> descrição
  document.querySelectorAll('[data-mat]').forEach(box=>box.querySelectorAll('button').forEach(b=>b.onclick=()=>{ const i=+box.dataset.mat, gr=box.dataset.grupo, v=b.dataset.v; const l=g[i]; const s=l._sel||(l._sel={tipos:[],cor:'',umid:''});
    if(gr==='tipos'){ s.tipos = s.tipos.includes(v) ? s.tipos.filter(x=>x!==v) : [...s.tipos, v]; } else s[gr] = s[gr]===v ? '' : v;
    l.desc=montarDesc(s); refazer(); }));
  document.querySelectorAll('[data-idem]').forEach(b=>b.onclick=()=>{ const i=+b.dataset.idem; const a=g[i-1]; g[i].desc=a.desc||''; g[i]._sel=a._sel?JSON.parse(JSON.stringify(a._sel)):undefined; refazer(); toast('Copiado do metro de cima — só use se for igual'); });
  document.querySelectorAll('[data-av]').forEach(b=>b.onclick=()=>{ const l=g[+b.dataset.av]; l.av = l.av===b.dataset.v ? '' : b.dataset.v; refazer(); });
  document.querySelectorAll('[data-obs]').forEach(box=>box.querySelectorAll('button').forEach(b=>b.onclick=()=>{ const l=g[+box.dataset.obs]; const v=b.dataset.v; let partes=(l.obs||'').split(/\s*·\s*/).filter(Boolean);
    partes = partes.includes(v) ? partes.filter(x=>x!==v) : [...partes, v]; l.obs=partes.join(' · ');
    if(v==='Achou água aqui' && partes.includes(v) && (d.na_ini===''||d.na_ini==null)){ d.na_ini=l.de||''; d.na_ini_h=AGORA(); toast('Anotado em "Água no furo". Confira a profundidade.'); }
    refazer(); }));
  document.querySelectorAll('[data-parou] button').forEach(b=>b.onclick=()=>{ d.parou = d.parou===b.dataset.v ? '' : b.dataset.v; refazer(); });
  document.querySelectorAll('[data-usarfim]').forEach(b=>b.onclick=()=>{ d.prof_final=b.dataset.usarfim; refazer(); });
  document.querySelectorAll('[data-fotoam]').forEach(b=>b.onclick=()=>{ const i=+b.dataset.fotoam; const l=g[i];
    CAM.extra={ fichaId:f.id, ficha:'SP-'+(d.furo||''), linha:i, metro:trechoTxt(l), amostra:l.am||String(i+1) };
    abrirCamera('amostra', `Amostra SP-${d.furo||''} · ${trechoTxt(l)}`); });
  // recalcular folha e avisos depois de qualquer mudança
  const box=$('#main'); box.addEventListener('input',()=>{ d.folha=`1 de ${Math.max(1,Math.ceil(g.length/12))}`; },{passive:true});
}

async function encerrar(f){
  const def=DEF[f.tipo]; const av=def.avisos(f.dados);
  if(av.length && $('#encerrar').dataset.c!=='1'){ $('#encerrar').dataset.c='1'; $('#encerrar').textContent=`Encerrar mesmo assim (${av.length} aviso${av.length>1?'s':''})`; $('#avisosBox').scrollIntoView({block:'center'}); toast('Confira o que falta. Encerrar não é bloqueado.'); return; }
  $('#encerrar').disabled=true; $('#encerrar').textContent='Gerando PDF…';
  try{
    const ob=(S.pacote?.obras||[]).find(o=>o.id===f.obraId) || {id:f.obraId,nome:f.obraNome};
    const prevObra=S.obraId; S.obraId=ob.id;
    const base=`${HOJE()}_${def.codigo.replace(/\s+/g,'-')}_${slug(def.ident(f.dados))}${f.versao>1?'_v'+f.versao:''}`;
    if(f.tipo==='spt'){ (f.dados.golpes||[]).forEach((l,i)=>{ l.fotos=fotosDoMetro(f,i).map(x=>x.nome); }); gravar(f); }
    const pdf=await gerarPDF(f);
    await enfileirarArquivo(pdf,'ficha',base+'.pdf',{fichaId:f.id,tipo:f.tipo,versao:f.versao,avisos:av});
    const dados=new Blob([JSON.stringify({app:'campo',fichaId:f.id,tipo:f.tipo,codigo:def.codigo,sop:def.sop,versao:f.versao,obraId:f.obraId,obra:f.obraNome,por:f.por,criadoEm:f.criadoEm,encerradoEm:new Date().toISOString(),avisos:av,dados:Object.fromEntries(Object.entries(f.dados).map(([k,v])=>[k, (typeof v==='string'&&v.startsWith('data:image'))?'[assinatura no PDF]':v]))},null,1)],{type:'application/json'});
    await enfileirarArquivo(dados,'ficha',base+'.json',{fichaId:f.id,tipo:f.tipo,versao:f.versao});
    S.obraId=prevObra;
    f.status='encerrada'; f.encerradaEm=new Date().toISOString(); gravar(f);
    toast('Ficha encerrada: PDF e dados na fila de envio',3500); desenharEditor();
  }catch(e){ toast('Não consegui gerar o PDF: '+e.message,5000); $('#encerrar').disabled=false; $('#encerrar').textContent='Encerrar ficha e enviar'; }
}

window.FICHAS = { secaoLista, ligarLista, abrir, fechar, aberta, desenharEditor, gerarPDF, DEF, _novaFicha:novaFicha, _pegar:pegar };
})();
