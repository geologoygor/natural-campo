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

/* ============================================================
   GEOFÍSICA — procedimento padrão da Natural (set/2026)
   Caminhamento polo-polo: linha de 200 m, a = 20 m, remotos B em −100 m e N em +300 m → 55 leituras.
   SEV Schlumberger: AB/2 de 1,5 a 250 m, com duas embreagens → 24 leituras.
   K SEMPRE com a posição real dos remotos (fator exato), nunca 2·π·a.
   ============================================================ */
const GEO = { a:20, L:200, rem:100 };
function K_polopolo(A,M){ const B=-GEO.rem, N=GEO.L+GEO.rem;
  const s = 1/Math.abs(M-A) - 1/Math.abs(N-A) - 1/Math.abs(M-B) + 1/Math.abs(N-B);
  return 2*Math.PI/s; }
const LEITURAS_CAM = (()=>{ const n=Math.round(GEO.L/GEO.a), out=[]; let o=1;
  for(let k=1;k<=n;k++) for(let i=0;i+k<=n;i++){ const A=i*GEO.a, M=(i+k)*GEO.a;
    out.push({ ord:o++, n:k, A, M, K:Math.round(K_polopolo(A,M)*10)/10, sp:'', mv:'', ma:'' }); }
  return out; })();
const PROF_NIVEL = {1:14,2:24,3:32,4:40,5:46,6:52,7:57,8:62,9:66,10:70}; // prof. mediana investigada (motor da Natural)
const SEV_PARES = [[1.5,.5],[2,.5],[3,.5],[4,.5],[5,.5],[6,.5],[8,.5],[10,.5],[13,.5],[16,.5],[16,5],[20,5],[25,5],[32,5],[40,5],[50,5],[65,5],[80,5],[100,5],[100,25],[130,25],[160,25],[200,25],[250,25]];
const LEITURAS_SEV = SEV_PARES.map((x,i)=>({ ord:i+1, ab2:x[0], mn2:x[1],
  K:Math.round(Math.PI*(x[0]*x[0]-x[1]*x[1])/(2*x[1])*10)/10, emb:(x[0]===16||x[0]===100), sp:'', mv:'', ma:'' }));
const fmtN = v => String(v).replace('.',',');
/* ΔV = V − SP: o motor do escritório desconta o potencial espontâneo antes de
   dividir pela corrente (processa_caminhamento.py). Sem isso o ρa sai enviesado,
   e o viés cresce justo nas separações grandes, onde o sinal é fraco. */
const R_geo = l => { const v=NUM(l.mv), i=NUM(l.ma), sp=NUM(l.sp);
  if(isNaN(v)||isNaN(i)||i===0) return '';
  return (v-(isNaN(sp)?0:sp))/i; };
const RHO_geo = l => { const r=R_geo(l); return r===''?'':(l.K*r); };
const COL_MEDIDA = [
  {k:'sp', r:'SP (mV)', tipo:'num', w:.7}, {k:'mv', r:'mV com corrente', tipo:'num', w:.9}, {k:'ma', r:'mA', tipo:'num', w:.6},
  {k:'R', r:'R (Ω)', tipo:'calc', w:.6, calc:l=>{ const r=R_geo(l); return r===''?'':r.toFixed(3).replace('.',','); }},
  {k:'rho', r:'ρa de campo (Ω·m)', tipo:'calc', w:.8, calc:l=>{ const r=RHO_geo(l); return r===''?'':String(Math.round(r)); }}
];
const NOTA_GEO = 'Os três números são os do visor do X6xtal, nesta ordem: SP, mV com corrente, mA. O ρa que aparece aqui é só conferência de campo (K × mV/mA) — o valor final é calculado no escritório. Leitura que não deu para medir: toque em "não deu para medir", não invente número.';

function faltamGeo(d){ return (d.leituras||[]).filter(l=>!l.pulou && (l.mv===''||l.mv==null||l.ma===''||l.ma==null)).length; }
function puladasGeo(d){ return (d.leituras||[]).filter(l=>l.pulou).map(l=>l.ord); }

DEF.geof_cam = {
  codigo:'FC-GEOF Caminhamento', titulo:'Ficha de campo — Caminhamento elétrico', sop:'Procedimento padrão da Natural',
  ident: d => d.linha_id || 'linha 1',
  blocos: [
   { t:'1 · A linha (preencher antes da primeira leitura)', campos:[
     {k:'linha_id', r:'Linha nº', tipo:'text', ph:'L1'}, {k:'cliente', r:'Cliente / obra', tipo:'text', w:2, pre:'cliente'},
     {k:'local', r:'Local / comunidade', tipo:'text', w:2}, {k:'mun', r:'Município (RR)', tipo:'text'},
     {k:'data', r:'Data', tipo:'date', pre:'hoje'}, {k:'inicio', r:'Início', tipo:'time', agora:true}, {k:'fim', r:'Fim', tipo:'time', agora:true},
     {k:'exec', r:'Quem levantou', tipo:'text', w:2, pre:'quem'},
     {k:'equip', r:'Equipamento', tipo:'text', w:2, ph:'Eletrorresistivímetro X6xtal 500'},
     {k:'c_ini', r:'Coordenada da ESTACA 0', tipo:'gps', w:2}, {k:'c_fim', r:'Coordenada da ESTACA 200', tipo:'gps', w:2},
     {k:'azim', r:'Rumo da linha (graus, da estaca 0 para a 200)', tipo:'num', w:2},
     {k:'c_b', r:'Coordenada do remoto B (−100 m)', tipo:'gps', w:2}, {k:'c_n', r:'Coordenada do remoto N (+300 m)', tipo:'gps', w:2},
     {k:'contato', r:'Resistência de contato / terreno (seco, molhado…)', tipo:'text', w:2}
   ]},
   { t:'2 · Como andar com os eletrodos', img:'COMO_ANDAR_CAMINHAMENTO.png',
     nota:'B e N ficam cravados 100 m além de cada ponta e não saem do lugar. Só A e M andam. O par anda de estaca em estaca até o fim da linha; aí aumenta 20 m a distância entre os dois e volta para a estaca 0.' },
   { t:'3 · As 55 leituras', nota:'A ordem já está pronta: siga o cartão verde lá em cima. A tabela aqui embaixo serve para corrigir.',
     tabela:{ k:'leituras', seq:'fixo', fixo:LEITURAS_CAM,
       rot:(l)=>`<b>Leitura ${l.ord}</b><span class="chip">A na estaca ${l.A}</span><span class="chip">M na estaca ${l.M}</span><span class="chip">K = ${fmtN(l.K)} m</span>`,
       cols:[{k:'ord', r:'Leitura', tipo:'fixo', w:.4},{k:'n', r:'Nível', tipo:'fixo', w:.4},
             {k:'A', r:'A (estaca)', tipo:'fixo', w:.6},{k:'M', r:'M (estaca)', tipo:'fixo', w:.6},
             {k:'K', r:'K (m)', tipo:'fixo', w:.7}].concat(COL_MEDIDA) }},
   { t:'4 · Resultado no campo', campos:[
     {k:'r_min', r:'Faixa de alvo — mínimo (Ω·m)', tipo:'num', pre:100}, {k:'r_max', r:'Faixa de alvo — máximo (Ω·m)', tipo:'num', pre:600},
     {k:'z_min', r:'Janela — de (m)', tipo:'num', pre:10}, {k:'z_max', r:'Janela — até (m)', tipo:'num', pre:70}
   ]},
   { grafico:'cam', t:'5 · Pseudoseção e estaca indicada para a SEV' },
   { t:'6 · A estaca escolhida', campos:[
     {k:'estaca_final', r:'Estaca onde a SEV vai ser centrada (m)', tipo:'num', w:2},
     {k:'porque', r:'Se mudou a estaca sugerida, por quê', tipo:'area', w:4}
   ]},
   { t:'7 · Antes de sair do campo', campos:[
     {k:'obs', r:'O que tem perto da linha — cerca de arame, linha de energia, tubulação metálica, açude, estrada (com a distância)', tipo:'area', w:4},
     {k:'chuva', r:'Choveu nas últimas 24 h?', tipo:'sel', op:['','Não','Sim, fraca','Sim, forte'], w:2},
     {k:'chk', r:'Conferência', tipo:'check', w:4, op:['B e N continuam cravados no mesmo lugar','As duas pontas da linha têm coordenada','O rumo da linha foi anotado','Fotos: linha inteira, estaca 0, equipamento ligado, os dois remotos','Estacas e cabos recolhidos']}
   ]}
  ],
  nota: NOTA_GEO,
  avisos: d => { const a=[];
    if(!d.c_ini) a.push('Coordenada da estaca 0 em branco.');
    if(!d.c_fim) a.push('Coordenada da estaca 200 em branco — sem ela o mapa sai só com um ponto, sem o rumo da linha.');
    if(!d.azim) a.push('Rumo da linha em branco.');
    if(!d.c_b || !d.c_n) a.push('Coordenada de um dos remotos (B ou N) em branco.');
    const fa=faltamGeo(d); if(fa) a.push(`Faltam ${fa} das ${(d.leituras||[]).length} leituras.`);
    const pu=puladasGeo(d); if(pu.length) a.push(`Leituras marcadas como "não deu para medir": ${pu.join(', ')}.`);
    if(!d.obs) a.push('Não foi anotado o que existe perto da linha (cerca, energia, tubulação) — é isso que explica leitura estranha depois.');
    return a; }
};

DEF.geof_sev = {
  codigo:'FC-GEOF SEV', titulo:'Ficha de campo — SEV (sondagem elétrica vertical)', sop:'Procedimento padrão da Natural',
  ident: d => d.sev_id || 'SEV 1',
  blocos: [
   { t:'1 · O ponto da SEV', nota:'A SEV só é feita DEPOIS do caminhamento, no ponto que o escritório indicar.', campos:[
     {k:'sev_id', r:'SEV nº', tipo:'text', ph:'SEV-1'}, {k:'cliente', r:'Cliente / obra', tipo:'text', w:2, pre:'cliente'},
     {k:'local', r:'Local / comunidade', tipo:'text', w:2}, {k:'mun', r:'Município (RR)', tipo:'text'},
     {k:'data', r:'Data', tipo:'date', pre:'hoje'}, {k:'inicio', r:'Início', tipo:'time', agora:true}, {k:'fim', r:'Fim', tipo:'time', agora:true},
     {k:'exec', r:'Quem levantou', tipo:'text', w:2, pre:'quem'},
     {k:'equip', r:'Equipamento', tipo:'text', w:2, ph:'Eletrorresistivímetro X6xtal 500'},
     {k:'c_centro', r:'Coordenada do CENTRO', tipo:'gps', w:2}, {k:'estaca', r:'Estaca do centro (se estiver sobre a linha)', tipo:'text'},
     {k:'azim', r:'Rumo da SEV (graus)', tipo:'num'},
     {k:'contato', r:'Terreno (seco, molhado…) e resistência de contato', tipo:'text', w:2}
   ]},
   { t:'2 · Como abrir os eletrodos', img:'COMO_ABRIR_SEV.png',
     nota:'O centro e o rumo não mudam. A e B afastam-se do centro sempre a MESMA distância dos dois lados. M e N ficam pertinho do centro e só abrem nas duas embreagens.' },
   { t:'3 · As 24 leituras', nota:'Nas duas embreagens (AB/2 = 16 m e AB/2 = 100 m) mede-se a mesma abertura duas vezes, com o MN antigo e com o novo, sem mover A e B.',
     tabela:{ k:'leituras', seq:'fixo', fixo:LEITURAS_SEV,
       rot:(l)=>`<b>Leitura ${l.ord}</b><span class="chip">AB/2 = ${fmtN(l.ab2)} m</span><span class="chip">MN/2 = ${fmtN(l.mn2)} m</span><span class="chip">K = ${fmtN(l.K)} m</span>${l.emb?'<span class="chip w">embreagem</span>':''}`,
       cols:[{k:'ord', r:'Leitura', tipo:'fixo', w:.4},{k:'ab2', r:'AB/2 (m)', tipo:'fixo', w:.7},
             {k:'mn2', r:'MN/2 (m)', tipo:'fixo', w:.7},{k:'K', r:'K (m)', tipo:'fixo', w:.7}].concat(COL_MEDIDA) }},
   { grafico:'sev', t:'4 · Curva de campo e modelo de camadas' },
   { t:'5 · Leitura do geólogo', campos:[
     {k:'alvo_de', r:'Intervalo de interesse — de (m)', tipo:'num'}, {k:'alvo_ate', r:'até (m)', tipo:'num'},
     {k:'prof_rec', r:'Profundidade de perfuração recomendada (m)', tipo:'num', w:2},
     {k:'obs_int', r:'O que a curva mostrou', tipo:'area', w:4}
   ]},
   { t:'6 · Antes de sair do campo', campos:[
     {k:'obs', r:'O que tem perto da SEV — cerca, linha de energia, tubulação metálica (com a distância)', tipo:'area', w:4},
     {k:'chk', r:'Conferência', tipo:'check', w:4, op:['As duas embreagens foram medidas duas vezes','A e B abriram igual dos dois lados até o fim','Coordenada do centro registrada','Fotos: centro, uma ponta e o equipamento ligado','Cabos recolhidos']}
   ]}
  ],
  nota: NOTA_GEO,
  avisos: d => { const a=[];
    if(!d.c_centro) a.push('Coordenada do centro em branco.');
    if(!d.azim) a.push('Rumo da SEV em branco.');
    const fa=faltamGeo(d); if(fa) a.push(`Faltam ${fa} das ${(d.leituras||[]).length} leituras.`);
    const pu=puladasGeo(d); if(pu.length) a.push(`Leituras marcadas como "não deu para medir": ${pu.join(', ')}.`);
    const emb=(d.leituras||[]).filter(l=>l.emb && !l.pulou && (l.mv===''||l.mv==null));
    if(emb.length) a.push('Embreagem não medida: sem ela os trechos da curva não emendam.');
    return a; }
};

/* ----- cartão "leitura da vez" da geofísica (feito para o pião) ----- */
function ehGeo(t){ return t==='geof_cam' || t==='geof_sev'; }
function proxGeo(d){ return (d.leituras||[]).findIndex(l=>!l.pulou && (l.mv===''||l.mv==null||l.ma===''||l.ma==null)); }
/* Posição do cartão. Sem entrada = "leitura da vez" (a próxima em branco).
   Com número = está corrigindo aquela leitura. É o que permite voltar sem
   caçar a linha na tabela de 55. */
let GEO_POS = {};
function geoIndice(f){
  const p = GEO_POS[f.id];
  return (typeof p === 'number') ? p : proxGeo(f.dados);
}
function geoCorrigindo(f){ return typeof GEO_POS[f.id] === 'number'; }

/* ============================================================
   PONTOS DA LINHA — um toque por ponto, com o lugar dito na tela
   Quem marca precisa saber ONDE ficar: o texto de cada botão diz o lugar.
   Além de guardar, o cartão CALCULA o rumo pelas duas pontas (era o que
   faltava no REL 113 — sem rumo o mapa sai com um ponto só) e CONFERE as
   distâncias contra o comprimento da linha, ali, com a pessoa ainda no lugar.
   ============================================================ */
function coordDe(txt){
  txt = String(txt || '');
  const dec = txt.match(/Lat\s*(-?\d+[.,]\d+)\s*Lon\s*(-?\d+[.,]\d+)/i);
  if (dec) return { lat: NUM(dec[1]), lon: NUM(dec[2]) };
  const m = txt.match(/(\d+)\s*[°º]\s*(\d+)\s*['´′]\s*([\d.,]+)\s*["”″]?\s*([NSns])[\s,;·]*(\d+)\s*[°º]\s*(\d+)\s*['´′]\s*([\d.,]+)\s*["”″]?\s*([WOEwoe])/);
  if (!m) return null;
  const g=(a,b,c,h)=>{ const v=NUM(a)+NUM(b)/60+NUM(c)/3600; return /[SsWwOo]/.test(h)?-v:v; };
  return { lat: g(m[1],m[2],m[3],m[4]), lon: g(m[5],m[6],m[7],m[8]) };
}
function metros(a, b){
  if (!a || !b) return null;
  const R=6371000, f1=a.lat*Math.PI/180, f2=b.lat*Math.PI/180;
  const df=(b.lat-a.lat)*Math.PI/180, dl=(b.lon-a.lon)*Math.PI/180;
  const h=Math.sin(df/2)**2 + Math.cos(f1)*Math.cos(f2)*Math.sin(dl/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}
function azimute(a, b){
  if (!a || !b) return null;
  const f1=a.lat*Math.PI/180, f2=b.lat*Math.PI/180, dl=(b.lon-a.lon)*Math.PI/180;
  const y=Math.sin(dl)*Math.cos(f2), x=Math.cos(f1)*Math.sin(f2)-Math.sin(f1)*Math.cos(f2)*Math.cos(dl);
  return (Math.atan2(y,x)*180/Math.PI + 360) % 360;
}
function difAng(a, b){ let d=Math.abs(a-b)%360; return d>180 ? 360-d : d; }
function precisaoDe(txt){ const m=String(txt||'').match(/±\s*(\d+)\s*m/); return m ? +m[1] : null; }

function PONTOS_LINHA(f){
  const L = GEO.L, R = GEO.rem;
  if (f.tipo === 'geof_sev') return [
    { k:'c_centro', rot:'Centro da SEV',
      onde:'Fique EM CIMA do centro — o ponto que o caminhamento indicou. É dele que A e B abrem para os dois lados.' }
  ];
  return [
    { k:'c_b',   rot:`Remoto B (corrente)`,
      onde:`Fique no eletrodo B: ${R} m ANTES da estaca 0, no prolongamento da linha.` },
    { k:'c_ini', rot:'Estaca 0 — começo da linha',
      onde:'Fique na primeira estaca da linha, onde o caminhamento começa.' },
    { k:'c_fim', rot:`Estaca ${L} — fim da linha`,
      onde:`Fique na última estaca, a ${L} m da estaca 0.` },
    { k:'c_n',   rot:`Remoto N (potencial)`,
      onde:`Fique no eletrodo N: ${R} m DEPOIS da estaca ${L}, no prolongamento da linha.` }
  ];
}
/* Tolerância feita pela estatística do GPS, não por um número chutado.
   O erro da DISTÂNCIA entre dois pontos não é a precisão de um: é a soma em
   quadratura, sigma = raiz(a1^2 + a2^2). Com ±5 m em cada ponta isso dá 7 m, e
   95 % dos casos caem em ~14 m — uma tolerância de 15 m reclamaria de 1 em
   cada 20 linhas bem marcadas. Sob mata, a ±15 m, sigma vai a 21 m.
   Por isso: tolerância = 2,5 sigma, com piso de 20 m para o fato de que
   ninguém para exatamente em cima da estaca. E o aviso muda de tom conforme
   o GPS do momento: a mesma diferença é conclusiva com GPS bom e não é com
   GPS ruim. */
const GPS_PADRAO = 8;               // quando a ficha não guardou a precisão
function sigmaPar(a, b){
  const s1 = a == null ? GPS_PADRAO : a, s2 = b == null ? GPS_PADRAO : b;
  return Math.sqrt(s1*s1 + s2*s2);
}
function tolDist(sig){ return Math.max(20, 2.5*sig); }
function conferirDist(rot, medido, esperado, a1, a2){
  const sig = sigmaPar(a1, a2), tol = tolDist(sig), dif = Math.abs(medido - esperado);
  const porPonto = Math.round(sig/1.41);
  if (dif <= tol)
    return { ok:true, t:`${rot}: ${medido.toFixed(0)} m contra ${esperado} m — confere (GPS ±${porPonto} m por ponto).` };
  /* o tom segue QUANTAS VEZES o erro esperado, não a qualidade do GPS sozinha:
     100 m de diferença continuam conclusivos mesmo com GPS de ±15 m */
  const sigmas = dif / sig;
  if (sigmas < 4)
    return { ok:false, brando:true,
      t:`${rot}: ${medido.toFixed(0)} m contra ${esperado} m — ${sigmas.toFixed(1)} vezes o erro esperado do GPS (±${porPonto} m por ponto). Pode ser só o aparelho, mas vale conferir a estaca antes de sair.` };
  return { ok:false,
    t:`${rot}: ${medido.toFixed(0)} m contra ${esperado} m. São ${sigmas.toFixed(1)} vezes o erro esperado do GPS (±${porPonto} m por ponto) — quase certo que um dos pontos foi marcado no lugar errado.` };
}
function conferirLinha(f){
  const d=f.dados, L=GEO.L, R=GEO.rem;
  const P = { b:coordDe(d.c_b), i:coordDe(d.c_ini), fim:coordDe(d.c_fim), n:coordDe(d.c_n) };
  const A = { b:precisaoDe(d.c_b), i:precisaoDe(d.c_ini), fim:precisaoDe(d.c_fim), n:precisaoDe(d.c_n) };
  const av=[], ok=[];
  let az=null, azErr=null;
  if (P.i && P.fim){
    az = azimute(P.i, P.fim);
    const dist = metros(P.i, P.fim);
    /* incerteza do rumo: quanto o erro lateral vale em ângulo nessa base */
    const sig = sigmaPar(A.i, A.fim);
    azErr = Math.atan2(sig, Math.max(dist, 1))*180/Math.PI;
    const r = conferirDist('As duas pontas', dist, L, A.i, A.fim);
    (r.ok ? ok : av).push(r);
  }
  /* o ângulo tolerado também depende do GPS e do tamanho da base:
     num trecho de 100 m, ±7 m de erro já valem 4° — e ±21 m valem 12° */
  const tolAng = (sig, base) => Math.max(12, 2.5*Math.atan2(sig, Math.max(base,1))*180/Math.PI);
  if (P.b && P.i){
    const dist=metros(P.b,P.i);
    const r = conferirDist('O remoto B até a estaca 0', dist, R, A.b, A.i);
    (r.ok ? ok : av).push(r);
    if (az!=null){ const sig=sigmaPar(A.b,A.i), t=tolAng(sig,dist), fora=difAng(azimute(P.b,P.i),az);
      if (fora > t) av.push({ t:`O remoto B está ${fora.toFixed(0)}° fora do prolongamento da linha (o GPS aqui admite até ${t.toFixed(0)}°).` }); }
  }
  if (P.n && P.fim){
    const dist=metros(P.fim,P.n);
    const r = conferirDist(`O remoto N até a estaca ${L}`, dist, R, A.fim, A.n);
    (r.ok ? ok : av).push(r);
    if (az!=null){ const sig=sigmaPar(A.fim,A.n), t=tolAng(sig,dist), fora=difAng(azimute(P.fim,P.n),az);
      if (fora > t) av.push({ t:`O remoto N está ${fora.toFixed(0)}° fora do prolongamento da linha (o GPS aqui admite até ${t.toFixed(0)}°).` }); }
  }
  return { az, azErr, av, ok };
}
function cartaoPontos(f){
  const d=f.dados, pts=PONTOS_LINHA(f);
  const feitos=pts.filter(x=>d[x.k]).length;
  const c=conferirLinha(f);
  const linhas = pts.map(x=>{
    const tem=!!d[x.k], pr=precisaoDe(d[x.k]);
    return `<div style="padding:10px 0;border-top:1px solid var(--line)">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:19px">${tem?'✅':'⬜'}</span>
        <b style="flex:1">${esc(x.rot)}</b>
        ${tem?`<span class="mini">±${pr!=null?pr:'?'} m</span>`:''}</div>
      <div class="mini" style="margin:4px 0 8px 27px">${esc(x.onde)}</div>
      <button class="big ${tem?'ghost':'sec'}" data-pt="${x.k}" style="margin-left:27px;width:calc(100% - 27px)">${tem?'Marcar de novo (estou aqui)':'Estou aqui — marcar'}</button>
    </div>`;
  }).join('');
  const rumo = (c.az!=null)
    ? `<div class="banner" style="background:var(--ok-bg);color:var(--green-2);margin-top:10px"><b>Rumo da linha: ${c.az.toFixed(0)}° ± ${Math.max(1,Math.round(c.azErr))}°</b> — calculado pelas duas pontas, já preenchido no campo do rumo.</div>`
    : (f.tipo==='geof_cam' ? `<div class="nota" style="margin-top:10px">Marque as duas pontas e o rumo sai sozinho.</div>` : '');
  return `<div class="card" id="pontos" style="border-left:5px solid var(--navy,#14284D)">
    <h2>Pontos da linha — ${feitos} de ${pts.length}</h2>
    <div class="nota">Marque cada ponto <b>estando em cima dele</b>. O GPS pega onde o celular está, não onde você aponta.</div>
    ${linhas}
    ${rumo}
    ${c.ok.map(r=>`<div class="mini" style="color:var(--green-2)">✓ ${esc(r.t)}</div>`).join('')}
    ${c.av.map(r=>`<div class="${r.brando?'nota':'erro'}" ${r.brando?'style="color:#8A5200"':''}>${r.brando?'':'⚠ '}${esc(r.t)}</div>`).join('')}
  </div>`;
}
function ligarPontos(f){
  if(!ehGeo(f.tipo) || f.status==='encerrada') return;
  document.querySelectorAll('[data-pt]').forEach(b=>{ b.onclick=()=>{
    iniciarGPS();
    if(!S.pos){ toast('Procurando GPS… tente de novo em alguns segundos (céu aberto ajuda).',4000); return; }
    const k=b.dataset.pt;
    f.dados[k]=textoCoordFicha(S.pos);
    /* rumo sai das duas pontas, sem ninguém ter de medir bússola */
    const c=conferirLinha(f);
    if(c.az!=null && f.tipo==='geof_cam') f.dados.azim=Math.round(c.az);
    gravar(f);
    const alvo=$('#f_'+k); if(alvo) alvo.value=f.dados[k];
    const ax=$('#f_azim'); if(ax && f.dados.azim!=null) ax.value=f.dados.azim;
    toast('Ponto marcado (±'+Math.round(S.pos.acc||0)+' m)');
    const p=$('#pontos'); if(p){ const t=document.createElement('div'); t.innerHTML=cartaoPontos(f);
      p.replaceWith(t.firstElementChild); ligarPontos(f); }
    atualizarCalc(f);
    GEO_SUG[f.id]=undefined;      /* coordenada nova: refaz a sugestão do mapa */
  }; });
}
function cartaoGeo(f){
  const d=f.dados, arr=d.leituras||[];
  const corr=geoCorrigindo(f);
  let i=geoIndice(f);
  const feitas=arr.filter(l=>l.mv!==''&&l.mv!=null&&l.ma!==''&&l.ma!=null).length;
  const puladas=arr.filter(l=>l.pulou).length;
  if(i<0 && !corr){
    const av = puladas?`<div class="erro">${puladas} leitura(s) ficaram como "não deu para medir". Toque em corrigir se quiser anotar alguma.</div>`:'';
    return `<div class="card spt" id="prox" style="border-left:5px solid var(--green)">
      <h2>Acabou: ${feitas} de ${arr.length} anotadas</h2>
      <div class="nota">Confira a tabela lá embaixo e encerre a ficha.</div>${av}
      <button class="big sec" id="gVolta" style="margin-top:10px">← Corrigir uma leitura</button></div>`;
  }
  if(i<0) i=arr.length-1;
  const l=arr[i];
  const alvo = f.tipo==='geof_cam'
    ? `A na <b>estaca ${l.A}</b> &nbsp;·&nbsp; M na <b>estaca ${l.M}</b>`
    : `A e B a <b>${fmtN(l.ab2)} m</b> do centro, cada um do seu lado &nbsp;·&nbsp; MN/2 = <b>${fmtN(l.mn2)} m</b>`;
  const sub = f.tipo==='geof_cam'
    ? `nível ${l.n} · esta leitura enxerga ≈ ${PROF_NIVEL[l.n]} m`
    : (l.emb ? 'EMBREAGEM — não mexa em A e B, troque só o MN e meça de novo' : `K = ${fmtN(l.K)} m`);
  const estado = l.pulou ? '<span class="chip w">estava marcada como não medida</span>'
               : (l.mv!==''&&l.mv!=null) ? '<span class="chip">já anotada</span>' : '';
  const daVez = proxGeo(d);
  return `<div class="card spt" id="prox" style="border-left:5px solid ${corr?'#B9410F':'var(--green)'}">
   <h2>${corr?'Corrigindo a leitura':'Leitura'} ${l.ord} de ${arr.length}</h2>
   <div class="mini">${feitas} anotadas · faltam ${arr.length-feitas}${puladas?` · ${puladas} pulada(s)`:''} ${estado}</div>
   <div style="font-size:19px;line-height:1.5;margin:8px 0">${alvo}</div>
   <div class="mini" ${l.emb?'style="color:#B9410F;font-weight:700"':''}>${esc(sub)}</div>
   <div class="gols" style="grid-template-columns:1fr 1fr 1fr;margin-top:10px">
     <div class="gol"><div class="t">1 · SP</div><input class="g" inputmode="decimal" id="g_sp" value="${esc(l.sp||'')}"></div>
     <div class="gol"><div class="t">2 · voltagem</div><input class="g" inputmode="decimal" id="g_mv" value="${esc(l.mv||'')}"></div>
     <div class="gol"><div class="t">3 · corrente</div><input class="g" inputmode="decimal" id="g_ma" value="${esc(l.ma||'')}"></div>
   </div>
   <button class="big green" id="gOk" style="margin-top:10px">${corr?'Salvar a correção':'Anotar e ir para a próxima'}</button>
   <div class="row" style="gap:8px;margin-top:8px">
     <button class="sec" id="gAnt" ${i<=0?'disabled':''} style="flex:1">← anterior</button>
     <button class="sec" id="gProx" ${i>=arr.length-1?'disabled':''} style="flex:1">próxima →</button>
   </div>
   ${corr
     ? `<button class="big ghost" id="gDaVez" style="margin-top:8px">Voltar para a leitura da vez${daVez>=0?' ('+arr[daVez].ord+')':''}</button>`
     : `<button class="big sec" id="gPula" style="margin-top:8px">Não deu para medir — pular esta</button>`}
   ${l.pulou?`<button class="big ghost" id="gDespula" style="margin-top:8px">Desmarcar "não deu para medir"</button>`:''}
   <div class="mini" style="margin-top:6px">Os três números do visor do X6xtal, na ordem em que ele mostra (SP em mV · voltagem em mV · corrente em mA). Pular é melhor do que chutar.</div></div>`;
}
function renderGeo(f){ const p=$('#prox'); if(!p) return; const tmp=document.createElement('div'); tmp.innerHTML=cartaoGeo(f); p.replaceWith(tmp.firstElementChild); ligarGeo(f); }
function atualizarTabelaGeo(f){ (f.dados.leituras||[]).forEach((l,i)=>{ for(const k of ['sp','mv','ma']){ const el=$(`#t_leituras_${i}_${k}`); if(el && document.activeElement!==el) el.value=l[k]==null?'':l[k]; } }); }
function ligarGeo(f){
  if(!ehGeo(f.tipo) || f.status==='encerrada') return;
  const d=f.dados, arr=d.leituras||[];
  const irPara=(k)=>{ GEO_POS[f.id]=Math.max(0,Math.min(arr.length-1,k)); renderGeo(f); };
  const ok=$('#gOk'); if(ok) ok.onclick=()=>{ const i=geoIndice(f); if(i<0) return;
    const mv=$('#g_mv').value.trim(), ma=$('#g_ma').value.trim();
    if(!mv || !ma) return toast('Digite o mV e o mA (ou toque em "não deu para medir")');
    const l=arr[i]; l.sp=$('#g_sp').value.trim(); l.mv=mv; l.ma=ma; delete l.pulou;
    gravar(f);
    if(geoCorrigindo(f)){ delete GEO_POS[f.id]; toast(`Leitura ${l.ord} corrigida`); }
    else toast(`Leitura ${l.ord} anotada`);
    renderGeo(f); atualizarTabelaGeo(f); atualizarCalc(f); };
  const pl=$('#gPula'); if(pl) pl.onclick=()=>{ const i=geoIndice(f); if(i<0) return;
    const l=arr[i]; l.pulou=true; gravar(f); toast(`Leitura ${l.ord} marcada como não medida`); renderGeo(f); atualizarCalc(f);
    barraDesfazer(`Leitura ${l.ord} pulada.`, ()=>{ delete l.pulou; gravar(f); renderGeo(f); atualizarCalc(f); }); };
  /* voltar e avançar: corrigir sem caçar a linha na tabela de 55 */
  const ant=$('#gAnt'); if(ant) ant.onclick=()=>irPara(geoIndice(f)-1);
  const prx=$('#gProx'); if(prx) prx.onclick=()=>{ const k=geoIndice(f)+1;
    const vez=proxGeo(d);
    if(vez>=0 && k>=vez){ delete GEO_POS[f.id]; renderGeo(f); } else irPara(k); };
  const vlt=$('#gVolta'); if(vlt) vlt.onclick=()=>irPara(arr.length-1);
  const dvz=$('#gDaVez'); if(dvz) dvz.onclick=()=>{ delete GEO_POS[f.id]; renderGeo(f); };
  const dsp=$('#gDespula'); if(dsp) dsp.onclick=()=>{ const i=geoIndice(f); if(i<0) return;
    const l=arr[i]; delete l.pulou; gravar(f); toast(`Leitura ${l.ord} liberada para anotar`);
    GEO_POS[f.id]=i; renderGeo(f); atualizarCalc(f); };
}

const FICHAS_DA_LINHA = { spt:['spt'], poco:['poco_perf','poco_teste','poco_entrega'], outorga:['poco_teste'], geofisica:['geof_cam','geof_sev'] };

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
      return `<button class="obra" data-abrir="${f.id}"><b>${esc(def.codigo)} · ${esc(def.ident(f.dados))}${f.versao>1?` · v${f.versao}`:''}</b><small>${esc(fmtData(f.atualizadoEm))} · ${esc(f.por||'')}</small><div style="margin-top:6px">${f.status==='encerrada'?(f.foraDoPadrao?'<span class="chip w">encerrada FORA DO PADRÃO</span>':'<span class="chip g">encerrada e na fila</span>'):'<span class="chip w">em preenchimento</span>'}${f.status!=='encerrada'&&av?`<span class="chip">${av} aviso(s)</span>`:''}</div></button>`; }).join(''); }
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
    h+=`<div class="linha ${vazia?'vz':''}" data-li="${i}"><div class="lh">${tb.seq==='fixo'?(tb.rot?tb.rot(l,i):`<b>${esc(tb.cols[0].r)} = ${l.t}</b>`):`<b>Linha ${i+1}</b>`}${tb.cols.filter(c=>c.tipo==='calc').map(c=>`<span class="chip">${esc(c.r)}: <b data-calc="${tb.k}.${i}.${c.k}">${esc(String(c.calc(l,d)))}</b></span>`).join('')}${(!ro&&tb.seq!=='fixo')?`<button class="ghost" data-del="${tb.k}.${i}" style="margin-left:auto;color:var(--err)">apagar</button>`:''}</div><div class="grid">`;
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
  if(ehGeo(f.tipo)){
    if(!f.dados.terreno){ const t=terrenoDaObra(f); if(t){ f.dados.terreno=t; f.dados._terrenoObra=t; gravar(f); } }
    if(GEO_SUG[f.id]===undefined){ GEO_SUG[f.id]=null;
      sugestaoGeo(f).then(()=>{ if(ABERTA===f.id) desenharEditor(); }); }
  }
  if(f.tipo==='spt' && f.status!=='encerrada') return desenharSPT(f);
  if(f.status!=='encerrada' && S.pos){ let mudou=false; for(const b of DEF[f.tipo].blocos) for(const c of (b.campos||[])) if(c.tipo==='gps' && !f.dados[c.k]){ f.dados[c.k]=textoCoordFicha(S.pos); mudou=true; } if(mudou) gravar(f); }
  if(f.status!=='encerrada') injetarCssSPT();
  const def=DEF[f.tipo]; const d=f.dados; const ro=f.status==='encerrada';
  $('#hTit').textContent=def.codigo+' · '+def.ident(d); $('#hSub').textContent=f.obraNome; $('#hBtn').classList.remove('hide'); $('#hBtn').textContent='Fichas';
  let h=`<div class="card" style="border-left:5px solid var(--green)"><h2>${esc(def.titulo)}</h2><div class="muted">${esc(def.sop)}${def.norma?' · '+esc(def.norma):''} · salva sozinha a cada toque${f.versao>1?` · versão ${f.versao}`:''}</div>${ro?'<div class="banner" style="background:var(--ok-bg);color:var(--green-2);margin:10px 0 0">Ficha encerrada: o PDF e os dados estão na fila de envio. Para corrigir, reabra — sai uma versão nova.</div>':''}</div>`;
  if(f.tipo==='poco_teste' && !ro) h+=cartaoLeitura(d);
  if(ehGeo(f.tipo) && !ro) h+=cartaoPontos(f);
  if(ehGeo(f.tipo) && !ro) h+=cartaoGeo(f);
  def.blocos.forEach((b,bi)=>{
    if(b.grafico){ h+=cartaoGrafico(f,b); return; }
    h+=`<div class="card"><h2>${esc(b.t)}</h2>${b.nota?`<div class="nota">${esc(b.nota)}</div>`:''}`;
    if(b.img) h+=`<a href="${b.img}" target="_blank" rel="noopener"><img src="${b.img}" alt="${esc(b.t)}" style="width:100%;border:1px solid var(--line);border-radius:12px;margin-top:8px"></a><div class="mini">toque na figura para ver grande</div>`;
    if(b.campos) h+=`<div class="grid">`+b.campos.map(c=>campoHTML(c,d[c.k],ro)).join('')+`</div>`;
    if(b.tabela) h+=tabelaHTML(b.tabela,d,ro);
    h+=`</div>`; });
  if(def.nota) h+=`<div class="card nota">${esc(def.nota)}</div>`;
  const av=def.avisos(d);
  h+=`<div class="card" id="avisosBox"><h2>O que ainda falta</h2>${av.length?av.map(x=>`<div class="erro">${esc(x)}</div>`).join(''):'<div class="muted">Nada pendente.</div>'}<div class="nota">Nenhum aviso impede encerrar. Não mediu? Deixe em branco e escreva o porquê. Nunca invente.</div></div>`;
  if(!ro) h+=`<button class="big green" id="encerrar">Encerrar ficha e enviar</button><button class="big ghost" id="excluir" style="margin-top:8px;color:var(--err)">Excluir esta ficha</button>`;
  else h+=`<button class="big sec" id="reabrir">Reabrir para corrigir (gera versão ${f.versao+1})</button><button class="big ghost" id="pdfver" style="margin-top:8px">Ver o PDF / compartilhar</button>`;
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
  document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{ const [k,i]=b.dataset.del.split('.'); const linha=f.dados[k][+i];
    f.dados[k].splice(+i,1); gravar(f); desenharEditor();
    barraDesfazer('Apagado.', ()=>{ f.dados[k].splice(+i,0,linha); gravar(f); desenharEditor(); }); });
  document.querySelectorAll('[data-mostra]').forEach(b=>b.onclick=()=>{ document.querySelectorAll('.linha.vz').forEach(x=>x.classList.toggle('oc')); });
  document.querySelectorAll('[data-ass]').forEach(el=>el.onclick=()=>{ if(f.status==='encerrada') return; assinar(el.dataset.ass, url=>{ f.dados[el.dataset.ass]=url; gravar(f); desenharEditor(); }); });
  document.querySelectorAll('[data-gmat]').forEach(box=>box.querySelectorAll('button').forEach(b=>b.onclick=()=>{ const [k,i,c]=box.dataset.gmat.split('.'); const l=f.dados[k][+i]; const s=l._sel||(l._sel={tipos:[],cor:'',umid:''}); const gr=box.dataset.grupo, v=b.dataset.v;
    if(gr==='tipos') s.tipos = s.tipos.includes(v)? s.tipos.filter(x=>x!==v) : [...s.tipos, v]; else s[gr] = s[gr]===v?'':v;
    l[c]=montarDesc(s); if(l.h!==undefined && !l.h) l.h=AGORA(); gravar(f); desenharEditor(); }));
  document.querySelectorAll('[data-gidem]').forEach(b=>b.onclick=()=>{ const [k,i,c]=b.dataset.gidem.split('.'); const a=f.dados[k][+i-1], l=f.dados[k][+i]; l[c]=a[c]||''; l._sel=a._sel?JSON.parse(JSON.stringify(a._sel)):undefined; gravar(f); desenharEditor(); toast('Copiado da linha de cima — só use se for igual'); });
  document.querySelectorAll('[data-gagua]').forEach(b=>b.onclick=()=>{ const [k,i]=b.dataset.gagua.split('.'); const tb=def.blocos.find(x=>x.tabela&&x.tabela.k===k).tabela; const l=f.dados[k][+i]; f.dados[tb.agua]=l.de||l.ate||''; gravar(f); desenharEditor(); toast(`"Água apareceu a" = ${f.dados[tb.agua]||'?'} m. Confira lá embaixo.`); });
  document.querySelectorAll('[data-gfoto]').forEach(b=>b.onclick=()=>{ const [k,i]=b.dataset.gfoto.split('.'); const tb=def.blocos.find(x=>x.tabela&&x.tabela.k===k).tabela; const l=f.dados[k][+i];
    CAM.extra={ fichaId:f.id, ficha:def.ident(f.dados), tabela:k, linha:+i, trecho:`${l.de||'?'} a ${l.ate||'?'} m` }; abrirCamera('amostra', `${tb.foto.replace(/^Foto d[ao] /,'').replace(/^./,x=>x.toUpperCase())} · ${def.ident(f.dados)} · ${l.de||'?'} a ${l.ate||'?'} m`); });
  ligarPontos(f);
  repintarGeof(f);
  document.querySelectorAll('[data-figver]').forEach(x=>{ x.onclick=()=>verGrandeGeof(f, x.dataset.figver); });
  document.querySelectorAll('[data-terreno] [data-tv]').forEach(x=>{ x.onclick=async()=>{
    const k=x.closest('[data-terreno]').dataset.terreno, tv=x.dataset.tv;
    if(f.dados.terreno===tv) return;
    f.dados.terreno=tv; gravar(f);
    if(GEOF_CACHE[f.id+'_'+k]){   /* já tinha gráfico: refaz só a classificação */
      const off=document.createElement('canvas'); off.width=1240; off.height=1000;
      try{ const r=await desenharFiguraGeof(f, k, off);
           if(r){ GEOF_CACHE[f.id+'_'+k]=r; GEOF_PIX[f.id+'_'+k]=off; f.dados['_fig_'+k]=r;
                  if(k==='cam' && r.estaca!=null) f.dados.estaca_final=r.estaca; gravar(f); } }
      catch(e){ toast('Não consegui refazer: '+e.message,4000); }
    }
    desenharEditor();
  }; });
  document.querySelectorAll('[data-fig]').forEach(x=>{ x.onclick=async()=>{
    const k=x.dataset.fig, txt=x.textContent; x.disabled=true; x.textContent='Calculando…';
    try{
      const off=document.createElement('canvas'); off.width=1240; off.height=1000;
      const r=await desenharFiguraGeof(f, k, off);
      if(r && r.semTerreno) toast('Escolha o terreno primeiro.',4000);
      else if(!r) toast(k==='cam'?'Precisa de pelo menos 4 leituras anotadas.':'Precisa de pelo menos 6 leituras anotadas.',4000);
      else if(!r.semTerreno) { GEOF_CACHE[f.id+'_'+k]=r; GEOF_PIX[f.id+'_'+k]=off; f.dados['_fig_'+k]=r;
             if(k==='cam' && r.estaca!=null && (f.dados.estaca_final===''||f.dados.estaca_final==null)) f.dados.estaca_final=r.estaca;
             gravar(f); desenharEditor();
             const el=$('#fig_'+k); if(el) el.scrollIntoView({block:'center'}); return; }
    }catch(e){ toast('Não consegui gerar: '+e.message,5000); }
    x.disabled=false; x.textContent=txt;
  }; });
  const enc=$('#encerrar'); if(enc) enc.onclick=()=>encerrar(f);
  const exc=$('#excluir'); if(exc) exc.onclick=()=>{ const copia=JSON.parse(JSON.stringify(f)); remover(f.id); fechar();
    barraDesfazer('Ficha excluída.', ()=>{ gravar(copia); render(); toast('Ficha de volta'); }, 12000); };
  const rea=$('#reabrir'); if(rea) rea.onclick=()=>{ f.status='rascunho'; f.versao=(f.versao||1)+1; gravar(f); desenharEditor(); toast('Reaberta: versão '+f.versao); };
  const pv=$('#pdfver'); if(pv) pv.onclick=async()=>{ const b=await gerarPDF(f); verPDF({ titulo:`${def.codigo} · ${def.ident(f.dados)}`, paginas:b._paginas, nome:`${def.codigo.replace(/\s+/g,'-')}_${slug(def.ident(f.dados))}_v${f.versao||1}.pdf`, pdf:async()=>b }); }; // mostra dentro do app
  ligarProx(f); ligarGeo(f);
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


/* ============================================================
   GRÁFICO NO CELULAR — usa o motor de geofisica.js (window.GEOF)
   Lê o formato das fichas acima: d.leituras com A/M/K (caminhamento)
   e ab2/mn2/K (SEV). Roda offline. É indicação de campo: a figura do
   relatório continua saindo do motor completo, no escritório.
   ============================================================ */
let GEOF_CACHE = {}, GEOF_PIX = {}, GEOF_NUM = {};
function assinatura(d){ let n=0, v=0;
  for(const l of (d.leituras||[])){ if(l.pulou||l.mv===''||l.mv==null) continue;
    n++; v += (NUM(l.mv)||0)*0.001 + (NUM(l.ma)||0) + (NUM(l.sp)||0)*0.01; }
  return n+':'+v.toFixed(4); }
/* O terreno NUNCA é assumido. Vem, nesta ordem:
     1. da obra (o escritório decidiu, viaja no campo.json e fica em cache)
     2. do botão, no campo
   Sem nenhum dos dois o gráfico não é gerado — um padrão errado e silencioso
   é pior que nenhum padrão: em Boa Vista a lógica é invertida e o app
   marcaria argila como alvo. O mapa do ZEE só SUGERE. */
function terrenoId(d){ return d.terreno === 'sedimentar' ? 'sedimentar'
                            : d.terreno === 'cristalino' ? 'cristalino' : null; }
function terrenoDaObra(f){
  const ob = (S.pacote && S.pacote.obras || []).find(o => o.id === f.obraId);
  const t = ob && String(ob.terreno || '').toLowerCase();
  return (t === 'sedimentar' || t === 'cristalino') ? t : null;
}
let GEO_SUG = {};
async function sugestaoGeo(f){
  if (GEO_SUG[f.id] !== undefined) return GEO_SUG[f.id];
  const d = f.dados;
  const txt = String(d.c_ini || d.c_centro || '');
  let lat = null, lon = null;
  /* o campo de GPS do app grava "... · Lat 4.150194 Lon -61.434592 · ..." —
     ler isso é bem mais seguro que reinterpretar o DMS */
  const dec = txt.match(/Lat\s*(-?\d+[.,]\d+)\s*Lon\s*(-?\d+[.,]\d+)/i);
  if (dec){ lat = NUM(dec[1]); lon = NUM(dec[2]); }
  if (lat == null){
    /* coordenada digitada à mão, em graus/minutos/segundos */
    const m = txt.match(/(\d+)\s*[°º]\s*(\d+)\s*['´′]\s*([\d.,]+)\s*["”″]?\s*([NSns])[\s,;·]*(\d+)\s*[°º]\s*(\d+)\s*['´′]\s*([\d.,]+)\s*["”″]?\s*([WOEwoe])/);
    if (m){
      const g = (a,b,c,h) => { const v = NUM(a) + NUM(b)/60 + NUM(c)/3600;
        return /[SsWwOo]/.test(h) ? -v : v; };
      lat = g(m[1],m[2],m[3],m[4]); lon = g(m[5],m[6],m[7],m[8]);
    }
  }
  if (lat == null && S.pos){ lat = S.pos.lat; lon = S.pos.lon; }
  if (lat == null) { GEO_SUG[f.id] = {estado:'sem-coordenada'}; return GEO_SUG[f.id]; }
  await window.GEOF.carregarHidrogeo();
  GEO_SUG[f.id] = window.GEOF.sugerirTerreno(lat, lon);
  return GEO_SUG[f.id];
}
function faixaAlvo(d){ const T=window.GEOF.TERRENOS[terrenoId(d)||'cristalino'];
  return { rMin:(d.r_min===''||d.r_min==null)?T.alvo.rMin:NUM(d.r_min),
           rMax:(d.r_max===''||d.r_max==null)?T.alvo.rMax:NUM(d.r_max) }; }
/* acha o caminhamento que deu origem a esta SEV, para integrar as duas */
function camIrmao(f){
  const d=f.dados;
  const c=todas().filter(x=>x.tipo==='geof_cam' && x.obraId===f.obraId
            && x.dados && x.dados._fig_cam && x.dados._fig_cam.leitura);
  if(!c.length) return null;
  const est=NUM(d.estaca);
  const iguais=isFinite(est)? c.filter(x=>Math.abs(NUM(x.dados._fig_cam.leitura.estaca)-est)<1e-6) : [];
  const lista=iguais.length?iguais:c;
  lista.sort((a,b)=>a.criadoEm<b.criadoEm?1:-1);
  return lista[0];
}
function geoValidas(d){ return (d.leituras||[]).filter(l=>!l.pulou && l.mv!==''&&l.mv!=null&&l.ma!==''&&l.ma!=null&&NUM(l.ma)!==0); }
function geoResCam(d, fid){
  const sig=assinatura(d), ch=GEOF_NUM[fid+'_cam'];
  if(ch && ch.sig===sig) return ch.res;
  const L=geoValidas(d); if(L.length<4) return null;
  const res = window.GEOF.processarCaminhamento({a:GEO.a, Bx:-GEO.rem, Nx:GEO.L+GEO.rem},
    L.map(l=>({fixo:l.A, movel:l.M, sp:NUM(l.sp)||0, mv:NUM(l.mv), ma:NUM(l.ma)})));
  /* profundidade do eixo: a mediana investigada calibrada no motor da Natural
     (PROF_NIVEL), que é o que o ensaio realmente enxerga — não a pseudoprofundidade */
  for(const pt of res.pontos){ const z=PROF_NIVEL[pt.n]; if(z) pt.z=z; }
  GEOF_NUM[fid+'_cam']={sig, res};
  return res;
}
function geoLocCam(d, res){
  if(!res) return null;
  const fa=faixaAlvo(d), T=window.GEOF.TERRENOS[terrenoId(d)||'cristalino'];
  return window.GEOF.melhorEstaca(res, { rMin:fa.rMin, rMax:fa.rMax, extremo:T.extremo,
                                         zMin:NUM(d.z_min)||10, zMax:NUM(d.z_max)||70 });
}
function geoSev(d){
  const L=geoValidas(d), por={};
  for(const l of L){ const r=R_geo(l); if(r==='') continue;
    const v=Math.abs(l.K*r); if(!(v>0)) continue; (por[l.ab2]=por[l.ab2]||[]).push(v); }
  const ab=Object.keys(por).map(Number).sort((u,v)=>u-v);
  /* na embreagem há duas leituras no mesmo AB/2: média das duas */
  return { x:ab, obs:ab.map(k=>por[k].reduce((u,v)=>u+v,0)/por[k].length) };
}
async function desenharFiguraGeof(f, tipo, cv, terrenoTmp){
  const d = terrenoTmp ? Object.assign({}, f.dados, {terreno:terrenoTmp}) : f.dados;
  if (!terrenoId(d)) return { semTerreno:true };
  const logo=await new Promise(ok=>{ const i=new Image(); i.onload=()=>ok(i); i.onerror=()=>ok(null); i.src='logo-color.png'; });
  const tit=`${d.cliente||f.obraNome} · ${DEF[f.tipo].ident(d)}${d.local?' · '+d.local:''}`;
  if(tipo==='cam'){
    const res=geoResCam(d, f.id); if(!res) return null;
    const loc=geoLocCam(d,res);
    const li=window.GEOF.lerCaminhamento(res, loc, terrenoId(d));
    const linhas=[];
    if(li){
      linhas.push({ t:`Marcar o poço na ESTACA ${fmtN(li.estaca)} m da linha`, forte:true });
      if(li.faixas.length){
        const f=li.faixas.map(x=>`${fmtN(Math.round(x.de))}–${fmtN(Math.round(x.ate))} m`).join(' e ');
        linhas.push({ t: li.tipo==='poroso'
          ? `Aquífero POROSO (camada contínua) entre ${f}`
          : li.tipo==='fratura'
            ? `Fratura estimada entre ${f}`
            : `Zona favorável entre ${f} (fratura ou camada: o escritório define)`, forte:true });
        linhas.push({ t:`A zona aparece em ${Math.round(li.continuidade*100)} % da linha nessa profundidade — ${li.tipo==='poroso'?'atravessa, logo é camada':li.tipo==='fratura'?'é localizada, logo é fratura':'inconclusivo'}` });
      }
      linhas.push({ t:`Terreno: ${li.terreno}` });
    }
    window.GEOF.figuraCaminhamento(cv, { res, loc, logo, titulo:tit, rotZ:'Prof. investigada (m)',
      leitura: li ? { titulo:'LEITURA DE CAMPO — onde furar', linhas, avisos: (li.avisos||[]).concat(loc?loc.avisos:[]) } : null,
      subtitulo:'Indicação preliminar de campo · a figura do relatório sai do motor no escritório' });
    const nB=loc&&loc.melhor?loc.melhor.nota:0, nS=loc&&loc.segundo?loc.segundo.nota:0;
    return { estaca: loc&&loc.melhor?loc.melhor.x:null, nota:+nB.toFixed(3),
             vantagem: nB>0?+(100*(1-nS/nB)).toFixed(0):null,
             segunda: loc&&loc.segundo?loc.segundo.x:null, leitura: li,
             usadas:res.qc.usadas, total:res.qc.total, avisos: loc?loc.avisos:[] };
  }
  const sd=geoSev(d); if(sd.x.length<6) return null;
  const sig=assinatura(d), ch=GEOF_NUM[f.id+'_sev'];
  const z=(ch && ch.sig===sig) ? ch.z : window.GEOF.zohdy('schlumberger', sd.x, sd.obs);
  GEOF_NUM[f.id+'_sev']={sig, z};
  const alvo=(d.alvo_de!==''&&d.alvo_ate!==''&&d.alvo_de!=null&&d.alvo_ate!=null)
    ? {de:NUM(d.alvo_de), ate:NUM(d.alvo_ate)} : null;
  const li=window.GEOF.lerSEV(z.rho, z.prof, terrenoId(d), {arranjo:'schlumberger', xs:sd.x, obs:sd.obs});
  /* o bloco diz O QUE FAZER; os horizontes já vão nomeados na coluna do modelo,
     repetir a lista aqui empurrava a parte útil para fora da figura */
  const irm=camIrmao(f);
  let integ=null, linhas=[];
  if(irm){
    integ=window.GEOF.integrar(irm.dados._fig_cam.leitura, li);
    if(integ){ linhas=integ.linhas.slice(); li.avisos=li.avisos.concat(integ.avisos);
               integ.linha=irm.dados.linha_id||''; }
  }
  if(!linhas.length){
    if(li.alvos.length){ const a=li.alvos[0];
      /* base de campo = percentil 70 da equivalência, não a média nem a do
         modelo: parar raso é poço seco, passar metros é só custo */
      const base = (a.baseCampo != null) ? a.baseCampo : a.ate;
      linhas.push({ forte:true, cor:a.cor,
        t:`Alvo: ${fmtN(Math.round(a.de))}–${base==null?'fundo do ensaio':fmtN(Math.round(base))+' m'} — ${a.classe} (${Math.round(a.rho)} Ω·m)` }); }
    else linhas.push({ forte:true, t:'Nenhum horizonte caiu na faixa de alvo deste terreno.' });
    if(li.base) linhas.push({ cor:li.base.cor, t:`Embasamento (rocha sã) a partir de ${fmtN(Math.round(li.base.de))} m` });
    linhas.push({ t:'Sem caminhamento ligado a esta SEV: a posição do poço não foi conferida.' });
  }
  linhas.push({ t:`Terreno: ${li.terreno}` });
  window.GEOF.figuraSEV(cv, { x:sd.x, obs:sd.obs, calc:z.calculada, rho:z.rho, prof:z.prof, rms:z.rms,
    logo, titulo:tit, alvo, arranjo:'Schlumberger',
    leitura:{ titulo: integ ? 'LEITURA DE CAMPO — SEV + caminhamento' : 'LEITURA DE CAMPO — o que o perfil mostra',
              horizontes: li.horizontes, linhas, avisos:li.avisos },
    subtitulo:'Inversão automática no celular · modelo de poucas camadas no escritório' });
  return { rms:+z.rms.toFixed(2), camadas:z.rho.length, leitura: li, integrado: integ,
           perfil: window.GEOF.intervalos(z.rho, z.prof, 0.30)
             .map(k=>({de:+k.de.toFixed(1), ate:k.ate==null?null:+k.ate.toFixed(1), rho:+k.rho.toFixed(0)})) };
}
function repintarGeof(f){
  for(const b of (DEF[f.tipo].blocos||[])){ if(!b.grafico) continue;
    const src=GEOF_PIX[f.id+'_'+b.grafico], cv=$('#fig_'+b.grafico);
    if(src && cv){ cv.width=src.width; cv.height=src.height; cv.getContext('2d').drawImage(src,0,0); cv.style.display=''; } }
}
function verGrandeGeof(f,k){
  const src=GEOF_PIX[f.id+'_'+k]; if(!src) return;
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:#0B1220;z-index:9999;display:flex;flex-direction:column';
  ov.innerHTML=`<div style="padding:10px 14px;color:#fff;font:600 15px system-ui;display:flex;align-items:center;gap:12px">
     <button id="gvX" style="background:#fff;color:#14284D;border:0;border-radius:8px;padding:9px 16px;font:700 15px system-ui">Fechar</button>
     <span style="opacity:.8">gire o celular ou arraste para ver inteiro</span></div>
   <div id="gvBox" style="flex:1;overflow:auto;-webkit-overflow-scrolling:touch"></div>`;
  const img=new Image(); img.src=src.toDataURL('image/png');
  img.style.cssText='display:block;width:1240px;max-width:none;height:auto';
  ov.querySelector('#gvBox').appendChild(img);
  ov.querySelector('#gvX').onclick=()=>ov.remove();
  document.body.appendChild(ov);
}
function cartaoGrafico(f,b){
  const k=b.grafico, r=GEOF_CACHE[f.id+'_'+k]||f.dados['_fig_'+k];
  const T = window.GEOF.TERRENOS;
  const tid = terrenoId(f.dados);
  const daObra = terrenoDaObra(f);
  const sug = GEO_SUG[f.id];
  let origem = '';
  if (daObra && f.dados.terreno === daObra) origem = `<div class="mini">Veio da obra, definido no escritório.</div>`;
  else if (daObra && tid && tid !== daObra) origem = `<div class="erro">Você mudou o que o escritório definiu (${esc(T[daObra].curto)}). A mudança vai registrada na ficha.</div>`;
  let mapa = '';
  if (sug){
    if (sug.estado === 'ok'){
      const bate = tid && tid === sug.classe;
      mapa = `<div class="nota" style="margin-top:6px">Pelo mapa aqui é <b>${esc(T[sug.classe].curto)}</b> — ${esc(sug.sistema)}${sug.substrato?' · '+esc(sug.substrato):''}${sug.potencial&&!/^s\.i/.test(sug.potencial)?' · '+esc(sug.potencial):''}.
        <br>${esc(sug.fonte)}${sug.perto?` · <b style="color:var(--err)">a só ${String(sug.kmBorda).replace('.',',')} km do contato — nessa escala o mapa não decide</b>`:` · contato mais próximo a ${String(sug.kmBorda).replace('.',',')} km`}.
        ${tid&&!bate?'<br><b>Você escolheu diferente do mapa.</b> Pode estar certo: o mapa é 1:500.000 e de 2003.':''}</div>`;
    } else if (sug.estado === 'fora-do-mapa'){
      mapa = `<div class="nota" style="margin-top:6px">${esc(sug.nota)} Aqui não há sugestão: escolha pelo que você vê no terreno.</div>`;
    } else if (sug.estado === 'sem-coordenada'){
      mapa = `<div class="nota" style="margin-top:6px">Sem coordenada na ficha ainda — preencha o GPS e o mapa sugere o terreno.</div>`;
    } else if (sug.estado === 'sem-base'){
      mapa = `<div class="nota" style="margin-top:6px">O mapa do ZEE não está guardado neste celular. Sem sugestão; escolha pelo terreno.</div>`;
    }
  }
  let res='';
  if(k==='cam' && r && r.estaca!=null){
    res=`<div class="banner" style="background:#FDEBEC;color:#B91C1C;border:1px solid #F3C2C6;margin-top:10px">
      <b>Estaca indicada: ${esc(String(r.estaca))} m</b>${r.segunda!=null?` · segunda opção ${esc(String(r.segunda))} m${r.vantagem!=null?` (a primeira ganha por ${r.vantagem} %)`:''}`:''}
      <div style="font-weight:400;margin-top:4px">É a sugestão da regra de anomalia; use como ponto da SEV. Quem decide é você.</div></div>`;
    if(r.leitura){ const L=r.leitura;
      res+=`<div class="banner" style="background:#F7F9FB;color:var(--ink);border:1px solid var(--line);margin-top:8px">
        <b>Leitura de campo</b><div style="margin-top:4px">Marcar o poço na <b>estaca ${esc(String(L.estaca))} m</b>.</div>
        ${L.faixas.length?`<div>${L.tipo==='poroso'?'Aquífero poroso (camada contínua)':L.tipo==='fratura'?'Fratura estimada':'Zona favorável'} entre ${L.faixas.map(x=>Math.round(x.de)+'–'+Math.round(x.ate)+' m').join(' e ')}.</div>`:'<div>Nenhuma zona na faixa de alvo deste terreno.</div>'}
        <div class="mini" style="margin-top:4px">${esc(L.terreno)}</div></div>`;
      (L.avisos||[]).forEach(a=>{ res+=`<div class="erro">${esc(a)}</div>`; }); }
  }
  if(k==='sev' && r && r.leitura){
    const L=r.leitura;
    res=`<div class="banner" style="background:var(--ok-bg);color:var(--green-2);margin-top:10px"><b>Ajuste ${String(r.rms).replace('.',',')} %</b></div>
      <div class="banner" style="background:#F7F9FB;color:var(--ink);border:1px solid var(--line);margin-top:8px">
        <b>Leitura de campo</b>
        ${L.horizontes.map(h=>`<div style="margin-top:3px">${h.agua==='sim'?'<b>':''}<span style="display:inline-block;width:10px;height:10px;background:${h.cor};border-radius:2px;margin-right:6px"></span>${esc(h.classe)} — ${h.de===0?'da superfície':'de '+Math.round(h.de)+' m'} até ${h.ate==null?'o fundo':Math.round(h.ate)+' m'} (${Math.round(h.rho)} Ω·m)${h.agua==='sim'?'</b>':''}</div>`).join('')}
        <div class="mini" style="margin-top:5px">${esc(L.terreno)}</div></div>`;
    if(r.integrado) res+=`<div class="banner" style="background:#FDEBEC;color:#B91C1C;border:1px solid #F3C2C6;margin-top:8px">
        ${r.integrado.linhas.map(x=>`<div${x.forte?' style="font-weight:700"':''}>${esc(x.t)}</div>`).join('')}</div>`;
    (L.avisos||[]).forEach(a=>{ res+=`<div class="erro">${esc(a)}</div>`; });
  }
  return `<div class="card"><h2>${esc(b.t)}</h2>
    <div class="nota">Roda no próprio celular, sem internet. Gere de novo depois de lançar mais leituras.</div>
    <div class="sub2" style="margin-top:8px">Terreno — é ele que define toda a leitura</div>
    <div class="chips mt" data-terreno="${k}">
      <button class="${tid==='cristalino'?'on':''}" data-tv="cristalino">${esc(T.cristalino.curto)}</button>
      <button class="${tid==='sedimentar'?'on':''}" data-tv="sedimentar">${esc(T.sedimentar.curto)}</button>
    </div>
    ${tid?`<div class="mini">${esc(T[tid].rotulo)} · alvo ${T[tid].alvo.rMin}–${T[tid].alvo.rMax} Ω·m</div>`:''}
    ${origem}${mapa}
    ${tid?'':`<div class="erro" style="margin-top:8px">Escolha o terreno para gerar o gráfico. Não assumo por você: em Boa Vista a areia saturada é resistiva e a regra do cristalino marcaria argila como alvo.</div>`}
    <button class="big ${tid?'sec':'ghost'}" data-fig="${k}" ${tid?'':'disabled'} style="margin:10px 0">${r?'Gerar de novo':'Gerar gráfico'}</button>
    <canvas id="fig_${k}" width="1240" height="1000" style="width:100%;border:1px solid var(--line);border-radius:6px;background:#fff;${r?'':'display:none'}"></canvas>
    ${r?`<button class="big ghost" data-figver="${k}" style="margin-top:8px">Ver grande</button>`:''}
    ${res}</div>`;
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
    if(b.grafico){
      let g=GEOF_PIX[f.id+'_'+b.grafico], r=GEOF_CACHE[f.id+'_'+b.grafico]||f.dados['_fig_'+b.grafico];
      if(!g){ g=document.createElement('canvas'); g.width=1240; g.height=1000;
        try{ r=await desenharFiguraGeof(f, b.grafico, g); }catch(e){ r=null; }
        if(!r) g=null; }
      if(r && g){ const lw=W-2*M, lh=lw*g.height/g.width;
        if(y+lh+70>H-110) novaPag();
        titulo(b.t); c.drawImage(g, M, y, lw, lh);
        c.strokeStyle='#D9DEE5'; c.lineWidth=1; c.strokeRect(M, y, lw, lh); y+=lh+18; }
      continue; }
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
      linhas.forEach((l,li)=>{ const vals=cols.map(cc=> cc.tipo==='fixo'? String(l[cc.k]==null?'':l[cc.k]) : cc.tipo==='calc'? String(cc.calc(l,d)) : cc.tipo==='date'&&/^\d{4}-\d{2}-\d{2}$/.test(l[cc.k]||'')? l[cc.k].split('-').reverse().join('/') : (l[cc.k]==null?'':String(l[cc.k])));
        const qs=vals.map((v,i)=>quebra(v,ws[i]-8,15)); const h=Math.max(...qs.map(q=>q.length))*19+12;
        if(y+h>H-110){ novaPag(); cab(); }
        if(li%2){ c.fillStyle='#F3F5F8'; c.fillRect(M,y,larg,h); }
        let X=M; qs.forEach((q,i)=>{ c.fillStyle= cols[i].tipo==='calc'?'#137F5B':'#1B2430'; c.font=fonte(15, cols[i].k==='n'); q.forEach((t,j)=>c.fillText(t,X+4,y+19+j*19)); X+=ws[i]; });
        c.fillStyle='#D9DEE5'; c.fillRect(M,y+h,larg,1); y+=h; });
      y+=16; }
  }
  if(def.nota){ const ls=quebra(def.nota,W-2*M-20,15); garante(ls.length*20+24); c.fillStyle='#E7F6ED'; c.fillRect(M,y,W-2*M,ls.length*20+18); c.fillStyle='#137F5B'; c.font=fonte(15); ls.forEach((l,i)=>c.fillText(l,M+10,y+22+i*20)); y+=ls.length*20+30; }
  const av=def.avisos(d); if(av.length){ titulo(f.foraDoPadrao?'ENCERRADA FORA DO PADRÃO — o que faltou':'Avisos no encerramento (campo em branco é permitido)'); av.forEach(a=>{ const ls=quebra('• '+a,W-2*M,15); garante(ls.length*20); c.fillStyle='#B45309'; c.font=fonte(15); ls.forEach(l=>{ c.fillText(l,M,y+14); y+=20; }); }); }
  rodape();
  const jpgs=[], imgs=[]; for(const p of paginas){ const b=await new Promise(ok=>p.toBlob(ok,'image/jpeg',0.85)); imgs.push(b); jpgs.push(new Uint8Array(await b.arrayBuffer())); }
  const pdf=montarPDF(jpgs, W, H); pdf._paginas=imgs; return pdf;
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
  const temNA=d.na_ini!==''&&d.na_ini!=null, seco=d.seco!==''&&d.seco!=null; const modo = d._agua || (temNA?'agua':(seco?'seco':''));
  h+=`<div class="card agua"><h2>3 · Água no furo</h2>
   <div class="row" style="gap:8px"><button class="${modo==='agua'?'green':'sec'} opt" data-agua="agua">Achei água</button><button class="${modo==='seco'?'green':'sec'} opt" data-agua="seco">Furo seco</button></div>
   ${modo==='agua'?`<div class="grid" style="margin-top:8px">
     <div style="grid-column:span 2"><label for="f_na_ini">Achou água a (m)</label><div class="row">${inp('na_ini','profundidade','num')}<input id="f_na_ini_h" type="time" data-f="na_ini_h" value="${esc(d.na_ini_h||'')}" style="max-width:120px"><button class="sec" data-agora="na_ini_h" style="flex:0 0 auto;padding:10px">agora</button></div></div>
     <div style="grid-column:span 2"><label for="f_na_fim">No fim do furo, sondou de novo: (m)</label><div class="row">${inp('na_fim','profundidade','num')}<input id="f_na_fim_h" type="time" data-f="na_fim_h" value="${esc(d.na_fim_h||'')}" style="max-width:120px"><button class="sec" data-agora="na_fim_h" style="flex:0 0 auto;padding:10px">agora</button></div></div></div>`
   : modo==='seco'?`<div class="grid" style="margin-top:8px"><div style="grid-column:span 2"><label for="f_seco">Seco até (m)</label><div class="row">${inp('seco','profundidade','num')}${d.prof_final&&!d.seco?`<button class="sec" data-usarseco="${esc(d.prof_final)}" style="flex:0 0 auto">${esc(d.prof_final)} m</button>`:''}</div><div class="mini">É a profundidade que sondou e não achou água — em geral o fundo do furo.</div></div></div>`
   : `<div class="mini" style="margin-top:8px">Escolha uma das duas quando chegar a hora. Se achar água, o app pede a profundidade e a hora; se o furo for seco, pede até onde sondou.</div>`}</div>`;

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
  document.querySelectorAll('[data-agua]').forEach(b=>b.onclick=()=>{ const v=b.dataset.agua;
    if(v==='agua'){ d.seco=''; if(!d.na_ini_h) d.na_ini_h=AGORA(); }            // achou água: já marca a hora
    else { d.na_ini=''; d.na_ini_h=''; d.na_fim=''; d.na_fim_h=''; }            // furo seco: limpa o bloco de água
    d._agua=v; gravar(f); desenharSPT(f); });
  document.querySelectorAll('[data-usarseco]').forEach(b=>b.onclick=()=>{ d.seco=b.dataset.usarseco; gravar(f); desenharSPT(f); });
  document.querySelectorAll('[data-usarfim]').forEach(b=>b.onclick=()=>{ d.prof_final=b.dataset.usarfim; refazer(); });
  document.querySelectorAll('[data-fotoam]').forEach(b=>b.onclick=()=>{ const i=+b.dataset.fotoam; const l=g[i];
    CAM.extra={ fichaId:f.id, ficha:'SP-'+(d.furo||''), linha:i, metro:trechoTxt(l), amostra:l.am||String(i+1) };
    abrirCamera('amostra', `Amostra SP-${d.furo||''} · ${trechoTxt(l)}`); });
  // recalcular folha e avisos depois de qualquer mudança
  const box=$('#main'); box.addEventListener('input',()=>{ d.folha=`1 de ${Math.max(1,Math.ceil(g.length/12))}`; },{passive:true});
}

function confirmarForaDoPadrao(av){ // duas confirmacoes, deixando claro que vai fora do padrão
  return new Promise(ok=>{
    const ov=document.createElement('div'); ov.className='assov'; let passo=1;
    const pinta=()=>{ ov.innerHTML = passo===1
      ? `<div class="assbox"><h2 style="margin:0 0 6px;color:var(--err)">Faltam ${av.length} item(ns)</h2>
         <div class="nota">Dá para encerrar assim, mas vai <b>fora do padrão</b>. O que faltou vai anotado no PDF e nos dados, e o escritório vê que ficou incompleto.</div>
         <div style="max-height:34vh;overflow:auto;margin:8px 0">${av.map(x=>`<div class="erro">${esc(x)}</div>`).join('')}</div>
         <div class="row"><button class="sec" data-x="nao">Voltar e preencher</button><button class="danger" data-x="sim">Encerrar assim mesmo</button></div></div>`
      : `<div class="assbox"><h2 style="margin:0 0 6px;color:var(--err)">Confirma enviar fora do padrão?</h2>
         <div class="nota">Seu nome fica no registro como quem encerrou incompleto. Se foi por um motivo de campo (não deu para medir, não tinha como), escreva o motivo no diário hoje.</div>
         <div class="row" style="margin-top:10px"><button class="sec" data-x="nao">Não, vou preencher</button><button class="danger" data-x="sim">Sim, encerrar fora do padrão</button></div></div>`;
      ov.querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>{ if(b.dataset.x==='nao'){ ov.remove(); ok(false); return; } if(passo===1){ passo=2; pinta(); return; } ov.remove(); ok(true); }); };
    pinta(); document.body.appendChild(ov); }); }
async function encerrar(f){
  const def=DEF[f.tipo]; const av=def.avisos(f.dados);
  if(av.length){ const vai=await confirmarForaDoPadrao(av); if(!vai){ const bx=$('#avisosBox'); if(bx) bx.scrollIntoView({block:'center'}); return; } f.foraDoPadrao=true; gravar(f); }
  $('#encerrar').disabled=true; $('#encerrar').textContent='Gerando PDF…';
  try{
    const ob=(S.pacote?.obras||[]).find(o=>o.id===f.obraId) || {id:f.obraId,nome:f.obraNome};
    const prevObra=S.obraId; S.obraId=ob.id;
    const base=`${HOJE()}_${def.codigo.replace(/\s+/g,'-')}_${slug(def.ident(f.dados))}${f.versao>1?'_v'+f.versao:''}`;
    if(f.tipo==='spt'){ (f.dados.golpes||[]).forEach((l,i)=>{ l.fotos=fotosDoMetro(f,i).map(x=>x.nome); }); gravar(f); }
    for(const b of def.blocos){ if(!b.grafico || GEOF_PIX[f.id+'_'+b.grafico]) continue;
      const g=document.createElement('canvas'); g.width=1240; g.height=1000;
      try{ const r=await desenharFiguraGeof(f, b.grafico, g);
           if(r){ f.dados['_fig_'+b.grafico]=r; GEOF_PIX[f.id+'_'+b.grafico]=g; GEOF_CACHE[f.id+'_'+b.grafico]=r; } }catch(e){} }
    gravar(f);
    const pdf=await gerarPDF(f);
    await enfileirarArquivo(pdf,'ficha',base+'.pdf',{fichaId:f.id,tipo:f.tipo,versao:f.versao,avisos:av});
    const dados=new Blob([JSON.stringify({app:'campo',fichaId:f.id,tipo:f.tipo,codigo:def.codigo,sop:def.sop,versao:f.versao,obraId:f.obraId,obra:f.obraNome,por:f.por,criadoEm:f.criadoEm,encerradoEm:new Date().toISOString(),avisos:av,foraDoPadrao:!!f.foraDoPadrao,dados:Object.fromEntries(Object.entries(f.dados).map(([k,v])=>[k, (typeof v==='string'&&v.startsWith('data:image'))?'[assinatura no PDF]':v]))},null,1)],{type:'application/json'});
    await enfileirarArquivo(dados,'ficha',base+'.json',{fichaId:f.id,tipo:f.tipo,versao:f.versao});
    S.obraId=prevObra;
    f.status='encerrada'; f.encerradaEm=new Date().toISOString(); gravar(f);
    toast('Ficha encerrada: PDF e dados na fila de envio',3500); desenharEditor();
  }catch(e){ toast('Não consegui gerar o PDF: '+e.message,5000); $('#encerrar').disabled=false; $('#encerrar').textContent='Encerrar ficha e enviar'; }
}

window.FICHAS_DA_LINHA = FICHAS_DA_LINHA;
function encerradasHoje(obraId){ const h=HOJE(); return todas().filter(f=>f.obraId===obraId && f.status==='encerrada' && f.encerradaEm && new Date(f.encerradaEm).toDateString()===new Date().toDateString()).length; }
window.FICHAS = { encerradasHoje, secaoLista, ligarLista, abrir, fechar, aberta, desenharEditor, gerarPDF, DEF, _novaFicha:novaFicha, _pegar:pegar, _fig:desenharFiguraGeof };
})();
