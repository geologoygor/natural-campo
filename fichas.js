/* ============================================================
   FICHAS DE CAMPO DIGITAIS — Natural Engenharia
   Mesmos campos das fichas de papel oficiais:
   FC-SPT v1.1 (SOP-017) · FC-POÇO Perfuração (SOP-008/021/023/024)
   FC-POÇO Teste de bombeamento (SOP-008/018) · FC-POÇO Entrega (SOP-020)
   FC-POÇO Limpeza (SOP-043 — limpeza e manutenção de poço)
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
      {k:'n', r:'N SPT', tipo:'calc', w:.5, calc: l => nSPT(l)},
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
    g.forEach((l,i)=>{ if(nSPT(l)==='?') a.push(`Linha ${i+1}: golpe que não é número (escreva só o número de golpes e os cm no campo ao lado).`); });
    if(/impenetr/.test(d.parou||'') && d.parou.includes('SPT') && !g.some(impenetravel)) a.push('Marcou "impenetrável (SPT)", mas nenhuma linha de golpes atende ao critério — confira os golpes e os cm.');
    if(d.parou && !/impenetr/.test(d.parou) && g.length && impenetravel(g[g.length-1])) a.push('A última linha atende ao critério de impenetrável, mas o motivo da parada não diz isso.');
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
    const P=d.perfil||[];
    P.forEach((l,i)=>{ if(!l.mat) a.push(`Camada ${i+1} (${l.de||'?'}–${l.ate||'?'} m) sem descrição.`);
      const de=NUM(l.de), ate=NUM(l.ate);
      if(isNaN(de)||isNaN(ate)) a.push(`Camada ${i+1}: "De" ou "Até" em branco — profundidade de camada não se recupera.`);
      else if(ate<=de) a.push(`Camada ${i+1}: "Até" (${l.ate}) não é maior que "De" (${l.de}).`);
      if(i>0){ const ant=NUM(P[i-1].ate); if(!isNaN(ant)&&!isNaN(de)&&Math.abs(ant-de)>0.05) a.push(`Entre a camada ${i} e a ${i+1} há ${de>ant?'buraco':'sobreposição'} (${P[i-1].ate} → ${l.de} m).`); } });
    if(P.length && d.prof_final){ const ult=NUM(P[P.length-1].ate); if(!isNaN(ult) && Math.abs(ult-NUM(d.prof_final))>0.05) a.push(`A última camada termina em ${P[P.length-1].ate} m e a profundidade final é ${d.prof_final} m.`); }
    if(!d.coord) a.push('Coordenada do poço em branco.');
    if(!d.prof_final) a.push('Profundidade final em branco.');
    if(d.parou==='Rocha / precisa de compressor' && !d.autorizou) a.push('Parou em rocha e a autorização do cliente não foi registrada.');
    if(d.prof_final && d.prof_ref && NUM(d.prof_final)>NUM(d.prof_ref) && !d.autorizou) a.push('Passou da profundidade de referência sem autorização registrada.');
    if(d.prof_final && d.prof_ref && NUM(d.prof_final)>NUM(d.prof_ref) && /^Não/.test(d.autorizou||'')) a.push('O cliente NÃO autorizou, mas a profundidade final passou da referência do contrato.');
    if(d.aut_ate && d.prof_final && NUM(d.prof_final)>NUM(d.aut_ate)) a.push(`Perfurou até ${d.prof_final} m, além do autorizado (${d.aut_ate} m).`);
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
   { t:'Recuperação (anotar até voltar ao NE)', nota:'Começa quando a bomba desliga (início + 720 min, ou o minuto real em que ela parou). t/t\' = (tempo de bombeamento + t\') / t\'.', tabela:{k:'rec', seq:'fixo', fixo:TEMPOS_B.map(t=>({t})), cols:[
      {k:'t', r:'t\' (min)', tipo:'fixo', w:.6}, {k:'h', r:'Hora', tipo:'calc', w:.8, calc:(l,d)=>somaHora(d.hini,tBomba(d)+l.t)},
      {k:'tt', r:'t/t\'', tipo:'calc', w:.7, calc:(l,d)=>((tBomba(d)+l.t)/l.t).toFixed(1).replace('.',',')},
      {k:'nd', r:'N.D. (m)', tipo:'num', w:1}]}},
   { t:'Resultado', campos:[
     {k:'estab', r:'Minuto em que o nível estabilizou', tipo:'int'}, {k:'volta', r:'Minuto em que voltou ao NE', tipo:'int'}, {k:'ndf', r:'ND final (m)', tipo:'num'},
     {k:'tp', r:'Bomba desligou no minuto (só se parou antes de 720)', tipo:'int'},
     {k:'parou', r:'Parou antes de 720 min? motivo', tipo:'text', w:3}]}
  ],
  nota:'Bomba ligada 720 minutos completos, mesmo que estabilize antes. Parou antes (energia, bomba, cliente): registra o minuto real e avisa — não se completa a tabela. Campo em branco é permitido; campo inventado, não.',
  avisos: d => { const a=[];
    if(!d.hini) a.push('Hora de início em branco — as horas da tabela não calculam.');
    if(!d.ne) a.push('NE em branco.');
    if(!d.estab) a.push('Minuto da estabilização em branco — é dado que não se recupera (SOP-008).');
    if(!d.volta) a.push('Minuto da recuperação (voltou ao NE) em branco — é dado que não se recupera (SOP-008).');
    if(d.parou && !d.tp) a.push('Escreveu que a bomba parou antes, mas o minuto em que ela desligou está em branco — sem ele a recuperação sai com horário e t/t\' errados.');
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
     {k:'foto_recebe', r:'Foto de quem recebe (se aceitar)', tipo:'foto', w:2},
     {k:'ass_recebe', r:'Assinatura de quem recebe', tipo:'ass', w:2}, {k:'encarregado', r:'Encarregado da Natural (nome)', tipo:'text', w:2, pre:'quem'},
     {k:'ass_enc', r:'Assinatura do encarregado', tipo:'ass', w:2}]}
  ],
  nota:'Campo em branco é permitido; campo inventado, não. Nada de valor, desconto ou prazo de pagamento em campo — "isso é com o escritório". A cópia desta ficha vai no grupo "Divulgações Natural".',
  avisos: d => { const a=[];
    if(!d.recebe) a.push('Nome de quem recebe em branco.');
    if(!d.ass_recebe) a.push('Sem assinatura de quem recebe — o poço fica "pronto, não entregue".');
    if(d.quem_e==='Indicado pelo cliente por WhatsApp' && !d.ind_data) a.push('Indicado por WhatsApp sem a data da indicação.');
    if(!(d.declara||[]).length) a.push('Declaração "recebi o poço funcionando" não marcada.');
    if(d.__obraId) for(const p of pendenciasCriticas(d.__obraId)) a.push('Dado que não se recupera ainda faltando: '+p+'.');
    if(!d.pend) a.push('Pendências em branco — se não houver, escreva "nenhum".');
    return a; }
 }
};

/* ============================================================
   LIMPEZA E MANUTENÇÃO DE POÇO — SOP-043 v1.1 (07/10/2026)
   A prova do serviço é o ANTES × DEPOIS: nível e vazão medidos antes de tirar a bomba
   e de novo no teste até estabilizar. Vazão pelo balde: litros ÷ segundos × 3,6 = m³/h.
   ============================================================ */
const qBalde = (l, s) => { const L=NUM(l), T=NUM(s); return (L>0 && T>0) ? Math.round(L/T*3.6*100)/100 : NaN; };
const fmtQ = v => isNaN(v) ? '' : String(v).replace('.',',');
const qAntes = d => { const b=qBalde(d.q_ant_l,d.q_ant_s); return !isNaN(b)?b:NUM(d.q_ant); };
const qDepois = d => { const b=qBalde(d.q_dep_l,d.q_dep_s); return !isNaN(b)?b:NUM(d.q_dep); };
DEF.poco_limpeza = {
  codigo:'FC-POÇO Limpeza', titulo:'Ficha de campo — Limpeza e manutenção de poço', sop:'SOP-043',
  ident: d => d.poco || 'poço',
  blocos: [
   { t:'1 · O poço', campos:[
     {k:'cliente', r:'Cliente / propriedade', tipo:'text', w:2, pre:'cliente'}, {k:'poco', r:'Poço (nº / identificação)', tipo:'text', ph:'P-01'}, {k:'mun', r:'Município / localidade', tipo:'text'},
     {k:'coord', r:'Coordenada do poço', tipo:'gps', w:2}, {k:'data', r:'Data', tipo:'date', pre:'hoje'}, {k:'chegada', r:'Chegada', tipo:'time', agora:true, w:2},
     {k:'equipe', r:'Equipe (comanda + ajudante)', tipo:'text', w:2, pre:'quem'},
     {k:'diam', r:'Diâmetro do poço', tipo:'sel', op:['','4"','6"','8"','outro','não sei']}, {k:'prof_inf', r:'Profundidade informada (m)', tipo:'num'},
     {k:'b_tipo', r:'Bomba que está no poço', tipo:'sel', op:['','Submersa','Injetora','Outra','Sem bomba']}, {k:'b_cv', r:'Potência (CV)', tipo:'text'},
     {k:'b_marca', r:'Marca / modelo da bomba', tipo:'text', w:2}
   ]},
   { t:'2 · Antes de mexer no poço', nota:'Sem o número de antes não há como provar a melhora. Meça ANTES de retirar a bomba.', campos:[
     {k:'frase', r:'A proposta diz que a limpeza recupera o poço, não aumenta o que o aquífero dá?', tipo:'sel', op:['','Sim, está na proposta','Não está — avisei o escritório','Não sei'], w:4},
     {k:'rel_desde', r:'Desde quando tem o problema (relato do cliente)', tipo:'text', w:2, ph:'ex.: uns 3 meses'},
     {k:'rel_antes', r:'Quanta água dava antes (relato)', tipo:'text', w:2, ph:'ex.: enchia a caixa de 1.000 L em 1 h'},
     {k:'rel_sint', r:'O que mudou', tipo:'check', w:4, op:['Diminuiu a água','Água suja ou com areia','Bomba desliga sozinha','Bomba liga e não puxa','Cor ou cheiro estranho','Outro (escrever abaixo)']},
     {k:'rel_txt', r:'Relato nas palavras do cliente', tipo:'area', w:4},
     {k:'ne_ant', r:'Nível estático ANTES (m)', tipo:'num'}, {k:'ne_ant_h', r:'às', tipo:'time', agora:true, w:2},
     {k:'prof_ant', r:'Profundidade sondada ANTES (m)', tipo:'num', w:2},
     {k:'q_ant_l', r:'Vazão antes — balde (litros)', tipo:'num'}, {k:'q_ant_s', r:'encheu em (segundos)', tipo:'num'},
     {k:'q_ant_c', r:'= vazão (m³/h)', tipo:'calc', calc:d=>fmtQ(qBalde(d.q_ant_l,d.q_ant_s))}, {k:'q_ant', r:'ou vazão medida de outro jeito (m³/h)', tipo:'num'},
     {k:'nao_mediu', r:'Não deu para medir antes? por quê', tipo:'text', w:4, ph:'ex.: bomba queimada, não liga'}
   ]},
   { t:'3 · Retirada da bomba', nota:'Devagar, com o cabo de segurança preso e as emendas protegidas. Fotografe bomba, cabo e emendas ASSIM QUE SAÍREM (aba Fotos → Foto extra).', campos:[
     {k:'seg', r:'Antes de puxar', tipo:'check', w:4, op:['Quadro desligado e confirmado SEM energia','Cabo de segurança preso','Emendas protegidas']},
     {k:'ret_h', r:'Bomba fora às', tipo:'time', agora:true, w:2}, {k:'prof_b', r:'Bomba estava a (m)', tipo:'num'},
     {k:'est_bomba', r:'Bomba ao sair', tipo:'sel', op:['','Boa','Danificada','Presa — não saiu (PAREI e avisei o Ygor)'], w:2},
     {k:'est_cabo', r:'Cabo e emendas ao sair', tipo:'sel', op:['','Bons','Emendas ruins','Cabo danificado'], w:2},
     {k:'est_obs', r:'O que viu de errado (mostrado ao cliente na hora)', tipo:'text', w:2},
     {k:'fotos_ret', r:'Fotos ao sair', tipo:'check', w:4, op:['Bomba','Cabo','Emendas']}
   ]},
   { t:'4 · Limpeza', campos:[
     {k:'metodo', r:'Como limpou', tipo:'check', w:4, op:['Compressor / air-lift','Escovação','Pistoneamento','Caçamba (bailer)','Outro']},
     {k:'lim_ini', r:'Início', tipo:'time', agora:true, w:2}, {k:'lim_fim', r:'Fim', tipo:'time', agora:true, w:2},
     {k:'agua_limpa', r:'Água saiu limpa às', tipo:'time', agora:true, w:2},
     {k:'saiu', r:'O que saiu do poço', tipo:'check', w:4, op:['Areia','Lama / argila','Incrustação (ferro, crosta)','Raízes','Objetos / peças caídas','Só água turva']},
     {k:'obstr', r:'Obstrução a (m)', tipo:'num'}, {k:'prof_dep', r:'Profundidade sondada DEPOIS (m)', tipo:'num'},
     {k:'lim_obs', r:'Observações da limpeza', tipo:'area', w:4}
   ]},
   { t:'5 · Volta da bomba e elétrico', nota:'Conferir ANTES de ligar: problema elétrico na volta já aconteceu.', campos:[
     {k:'volta', r:'Conferido antes de ligar', tipo:'check', w:4, op:['Emendas ruins refeitas','Fases conferidas','Quadro e proteção conferidos','Bomba de volta na mesma profundidade']},
     {k:'prof_b2', r:'Bomba recolocada a (m)', tipo:'num'},
     {k:'troca', r:'Trocou peça, bomba ou cabo?', tipo:'sel', op:['','Não','Sim — autorizado pelo Ygor'], w:2}, {k:'troca_q', r:'O que trocou', tipo:'text'}
   ]},
   { t:'6 · Teste até o nível estabilizar', nota:'Ligue a bomba e anote o nível e a vazão até o nível parar de descer. Toque em + para cada leitura.', campos:[
     {k:'t_ini', r:'Bomba ligou às', tipo:'time', agora:true, w:2}, {k:'ne_dep', r:'Nível estático DEPOIS, antes de ligar (m)', tipo:'num', w:2}],
     tabela:{k:'teste', seq:'livre', cols:[
      {k:'h', r:'Hora', tipo:'time', w:.8, agora:true}, {k:'nd', r:'N.D. (m)', tipo:'num', w:1}, {k:'q', r:'Q (m³/h)', tipo:'num', w:1}]}},
   { t:'7 · Resultado — antes × depois', campos:[
     {k:'estab_h', r:'Nível estabilizou às', tipo:'time', agora:true, w:2}, {k:'nd_estab', r:'N.D. estabilizado (m)', tipo:'num'},
     {k:'q_dep_l', r:'Vazão final — balde (litros)', tipo:'num'}, {k:'q_dep_s', r:'encheu em (segundos)', tipo:'num'},
     {k:'q_dep_c', r:'= vazão final (m³/h)', tipo:'calc', calc:d=>fmtQ(qBalde(d.q_dep_l,d.q_dep_s))}, {k:'q_dep', r:'ou vazão final medida de outro jeito (m³/h)', tipo:'num'},
     {k:'comp', r:'Vazão antes → depois', tipo:'calc', w:2, calc:d=>{ const a=qAntes(d), b=qDepois(d); if(isNaN(b)) return ''; if(isNaN(a)||a<=0) return `depois ${fmtQ(b)} m³/h (sem o antes)`; const p=Math.round((b-a)/a*100); return `${fmtQ(a)} → ${fmtQ(b)} m³/h (${p>=0?'+':''}${p}%)`; }},
     {k:'mostrou', r:'Com o cliente', tipo:'check', w:4, op:['Mostrei funcionando, com os números de antes e depois']}
   ]},
   { t:'8 · Aceite do cliente (SOP-031)', campos:[
     {k:'recebe', r:'Nome de quem recebe', tipo:'text', w:2},
     {k:'quem_e', r:'Quem recebe é', tipo:'sel', op:['','O próprio cliente','Indicado pelo cliente por WhatsApp'], w:2},
     {k:'pend', r:'Pedidos fora do escopo (a Natural orça à parte — não prometer). Se não houver, escreva "nenhum".', tipo:'area', w:4},
     {k:'foto_recebe', r:'Foto de quem recebe (se aceitar)', tipo:'foto', w:2},
     {k:'ass_recebe', r:'Assinatura de quem recebe', tipo:'ass', w:2}, {k:'ass_enc', r:'Assinatura do encarregado', tipo:'ass', w:2}
   ]}
  ],
  nota:'Bomba presa, mexer no quadro do cliente, troca de bomba ou cabo e qualquer valor fora da proposta: PARE e avise o Ygor. Vazão não melhorou: anote os números, mostre ao cliente e avise — não prometa nova limpeza sem orçamento. Campo em branco é permitido; campo inventado, não.',
  avisos: d => { const a=[]; const sem=v=>v===''||v==null;
    if(sem(d.ne_ant) && !d.nao_mediu) a.push('Nível estático de ANTES em branco — sem ele não há como provar a melhora (SOP-043).');
    if(isNaN(qAntes(d)) && !d.nao_mediu) a.push('Vazão de ANTES em branco (balde: litros e segundos).');
    if(!(d.seg||[]).includes('Quadro desligado e confirmado SEM energia')) a.push('Quadro desligado e sem energia não confirmado.');
    if((d.fotos_ret||[]).length<3) a.push('Faltam fotos de bomba, cabo e emendas ao sair do poço.');
    if(!(d.saiu||[]).length) a.push('O que saiu do poço não foi anotado.');
    if((d.volta||[]).length<3) a.push('Elétrico não conferido por inteiro antes de ligar (emendas, fases, quadro).');
    if(/^Presa/.test(d.est_bomba||'')) a.push('Bomba presa: não force — avise o Ygor com foto antes de tentar de novo.');
    if(/^Sim/.test(d.troca||'') && !d.troca_q) a.push('Trocou peça: escreva o que foi trocado.');
    if(!(d.teste||[]).some(l=>!sem(l.nd))) a.push('Nenhuma leitura de nível no teste.');
    if(sem(d.nd_estab)) a.push('N.D. estabilizado em branco.');
    if(isNaN(qDepois(d))) a.push('Vazão final em branco.');
    const qa=qAntes(d), qd=qDepois(d); if(!isNaN(qa)&&!isNaN(qd)&&qd<=qa) a.push('A vazão NÃO melhorou: anote, mostre ao cliente e avise o Ygor hoje.');
    if(!(d.mostrou||[]).length) a.push('Não marcou que mostrou ao cliente funcionando, com antes e depois.');
    if(!d.recebe || !d.ass_recebe) a.push('Sem nome e assinatura de quem recebe — o serviço fica sem aceite (SOP-031).');
    if(!d.pend) a.push('Pedidos fora do escopo em branco — se não houver, escreva "nenhum".');
    return a; }
};

/* ============================================================
   GEOFÍSICA — procedimento padrão da Natural (set/2026)
   Caminhamento polo-polo: linha de 200 m, a = 20 m, remotos B em −100 m e N em +300 m → 55 leituras.
   SEV Schlumberger: AB/2 de 1,5 a 250 m, com duas embreagens → 24 leituras.
   K SEMPRE com a posição real dos remotos (fator exato), nunca 2·π·a.
   ============================================================ */
const GEO = { a:20, L:200, rem:100 };          // ficha antiga (antes da v1.10.0): geometria fixa
const GEO_ESP = [15, 12, 10];                   // espaçamento dos eletrodos que se escolhe antes de começar (m)
const GEO_REM = [100, 200, 300, 400];           // distância dos infinitos (remotos B e N) às pontas (m)
const GEO_EST = 10;                             // a linha tem 10 espaçamentos = 11 estacas = 55 leituras
/* geometria da ficha: a escolhida no começo do levantamento, ou a antiga fixa */
function geoDe(d){ const a=NUM(d&&d.geo_a), r=NUM(d&&d.geo_rem);
  if(a>0 && r>0) return { a, L:a*GEO_EST, rem:r };
  return GEO; }
function geoPendente(d){ return !!(d && d.geo_pendente); }
function K_polopolo(A,M,g){ g=g||GEO; const B=-g.rem, N=g.L+g.rem;
  const s = 1/Math.abs(M-A) - 1/Math.abs(N-A) - 1/Math.abs(M-B) + 1/Math.abs(N-B);
  return 2*Math.PI/s; }
function leiturasCam(g){ const n=Math.round(g.L/g.a), out=[]; let o=1;
  for(let k=1;k<=n;k++) for(let i=0;i+k<=n;i++){ const A=i*g.a, M=(i+k)*g.a;
    out.push({ ord:o++, n:k, A, M, K:Math.round(K_polopolo(A,M,g)*10)/10, sp:'', mv:'', ma:'' }); }
  return out; }
const LEITURAS_CAM = leiturasCam(GEO);
/* profundidade investigada: a tabela calibrada é para a = 20 m e escala com a geometria */
/* Profundidade mediana de investigação (Edwards, 1977) com as posições REAIS de A, M, B e N.
   Com a = 20 m e remotos a 100 m ela reproduz a tabela PROF_NIVEL (±1 m), que fica valendo
   para a ficha antiga. A distância dos infinitos muda muito a profundidade: não dá para escalar só por a. */
function zEdwards(A,M,B,N){ const pares=[[A,M,1],[A,N,-1],[B,M,-1],[B,N,1]];
  const Sz=z=>pares.reduce((s,[p,q,sg])=>s+sg/Math.sqrt((p-q)*(p-q)+4*z*z),0); const S0=Sz(0);
  let lo=0, hi=5000; for(let i=0;i<70;i++){ const m=(lo+hi)/2; if(1-Sz(m)/S0<0.5) lo=m; else hi=m; } return (lo+hi)/2; }
const PROF_CACHE={};
function profNivel(n, g){ g=g||GEO;
  if(g.a===GEO.a && g.rem===GEO.rem && g.L===GEO.L) return PROF_NIVEL[n]||null;
  const ch=g.a+'|'+g.rem; if(!PROF_CACHE[ch]){ const t={}, B=-g.rem, N=g.L+g.rem, k=Math.round(g.L/g.a);
    for(let m=1;m<=k;m++){ const zs=[]; for(let i=0;i+m<=k;i++) zs.push(zEdwards(i*g.a,(i+m)*g.a,B,N));
      zs.sort((u,v)=>u-v); const q=zs.length; t[m]=Math.round(q%2?zs[(q-1)/2]:(zs[q/2-1]+zs[q/2])/2); }
    PROF_CACHE[ch]=t; }
  return PROF_CACHE[ch][n]||null; }
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
  {k:'sp', r:'SP (mV)', tipo:'num', neg:true, w:.7}, {k:'mv', r:'mV com corrente', tipo:'num', neg:true, w:.9}, {k:'ma', r:'mA', tipo:'num', neg:true, w:.6},
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
     {k:'geo_a', r:'Espaçamento dos eletrodos — a (m)', tipo:'lido', ph:'escolhido no começo'}, {k:'geo_L', r:'Comprimento da linha (m)', tipo:'lido', ph:'10 × a'},
     {k:'geo_rem', r:'Infinitos B e N — distância das pontas (m)', tipo:'lido', w:2, ph:'escolhido no começo'},
     {k:'c_ini', r:'Coordenada da ESTACA 0', tipo:'lido', w:2}, {k:'c_fim', r:'Coordenada da ESTACA FINAL', tipo:'lido', w:2},
     {k:'azim', r:'Rumo da linha (graus, da estaca 0 para a final)', tipo:'lido', w:2, ph:'sai sozinho das duas pontas'},
     {k:'c_b', r:'Coordenada do remoto B (antes da estaca 0)', tipo:'lido', w:2}, {k:'c_n', r:'Coordenada do remoto N (depois da estaca final)', tipo:'lido', w:2},
     {k:'contato', r:'Resistência de contato / terreno (seco, molhado…)', tipo:'text', w:2}
   ]},
   { t:'2 · Como andar com os eletrodos', img:'COMO_ANDAR_CAMINHAMENTO.png',
     nota:'B e N ficam cravados além de cada ponta, na distância escolhida no começo, e não saem do lugar. Só A e M andam. O par anda de estaca em estaca até o fim da linha; aí aumenta um espaçamento (a) a distância entre os dois e volta para a estaca 0.' },
   { t:'3 · As 55 leituras', nota:'A ordem já está pronta: siga o cartão verde lá em cima. A tabela aqui embaixo serve para corrigir.',
     tabela:{ k:'leituras', seq:'fixo', fixo:LEITURAS_CAM,
       rot:(l)=>`<b>Leitura ${l.ord}</b><span class="chip">A na estaca ${l.A}</span><span class="chip">M na estaca ${l.M}</span><span class="chip">K = ${fmtN(l.K)} m</span>`,
       cols:[{k:'ord', r:'Leitura', tipo:'fixo', w:.4},{k:'n', r:'Nível', tipo:'fixo', w:.4},
             {k:'A', r:'A (estaca)', tipo:'fixo', w:.6},{k:'M', r:'M (estaca)', tipo:'fixo', w:.6},
             {k:'K', r:'K (m)', tipo:'fixo', w:.7}].concat(COL_MEDIDA) }},
   { t:'4 · Resultado no campo', nota:'Faixa em branco = a do terreno. Preenchida, ela vale para a estaca, para a leitura de campo e para a SEV desta linha.', campos:[
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
    if(geoPendente(d)) a.push('Espaçamento e infinitos ainda não escolhidos — escolha no cartão lá em cima antes de começar.');
    if(!d.c_fim) a.push(`Coordenada da estaca final (${geoDe(d).L} m) em branco — sem ela o mapa sai só com um ponto, sem o rumo da linha.`);
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
     {k:'c_centro', r:'Coordenada do CENTRO', tipo:'lido', w:2}, {k:'estaca', r:'Estaca do centro (se estiver sobre a linha)', tipo:'text'},
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
   { t:'4 · Faixa de alvo', nota:'Em branco = a faixa que o caminhamento desta linha usou; se ele também ficou em branco, a do terreno. Preencha só se quiser procurar outro alvo — a mesma faixa vale para o gráfico e para a leitura de campo.', campos:[
     {k:'r_min', r:'Faixa de alvo — mínimo (Ω·m)', tipo:'num'}, {k:'r_max', r:'Faixa de alvo — máximo (Ω·m)', tipo:'num'}
   ]},
   { grafico:'sev', t:'5 · Curva de campo e modelo de camadas' },
   { t:'6 · Leitura do geólogo', campos:[
     {k:'alvo_de', r:'Intervalo de interesse — de (m)', tipo:'num'}, {k:'alvo_ate', r:'até (m)', tipo:'num'},
     {k:'prof_rec', r:'Profundidade de perfuração recomendada (m)', tipo:'num', w:2},
     {k:'obs_int', r:'O que a curva mostrou', tipo:'area', w:4}
   ]},
   { t:'7 · Antes de sair do campo', campos:[
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
  const g = geoDe(f.dados), L = g.L, R = g.rem;
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
  const d=f.dados, g=geoDe(d), L=g.L, R=g.rem;
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
    if(!posFresca(60000)){ toast(S.pos?'GPS desatualizado — espere fixar de novo e toque outra vez.':'Procurando GPS… tente de novo em alguns segundos (céu aberto ajuda).',4000); return; }
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
    ? `nível ${l.n} · esta leitura enxerga ≈ ${profNivel(l.n, geoDe(d))} m`
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
     <div class="gol"><div class="t">1 · SP</div><input class="g" inputmode="decimal" id="g_sp" value="${esc(l.sp||'')}"><button class="sec sinal" data-sinal="g_sp" type="button">± negativo</button></div>
     <div class="gol"><div class="t">2 · voltagem</div><input class="g" inputmode="decimal" id="g_mv" value="${esc(l.mv||'')}"><button class="sec sinal" data-sinal="g_mv" type="button">± negativo</button></div>
     <div class="gol"><div class="t">3 · corrente</div><input class="g" inputmode="decimal" id="g_ma" value="${esc(l.ma||'')}"><button class="sec sinal" data-sinal="g_ma" type="button">± negativo</button></div>
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
   <div class="mini" style="margin-top:6px">Os três números do visor do X6xtal, na ordem em que ele mostra (SP em mV · voltagem em mV · corrente em mA). Valor negativo no visor? Digite o número e toque em <b>± negativo</b>. Pular é melhor do que chutar.</div></div>`;
}
/* ---------- caminhamento: espaçamento e infinitos, escolhidos ANTES da primeira leitura ---------- */
const GEO_ESC = {};   // escolha em andamento, por ficha (só vira dado quando confirma)
function desenharEscolhaGeo(f){
  const def=DEF[f.tipo], d=f.dados, e=GEO_ESC[f.id]||(GEO_ESC[f.id]={a:NUM(d._geo_a_ant)||null, rem:NUM(d._geo_rem_ant)||null});
  $('#hTit').textContent=def.codigo+' · '+def.ident(d); $('#hSub').textContent=f.obraNome; $('#hBtn').classList.remove('hide'); $('#hBtn').textContent='Fichas';
  injetarCssSPT();
  const bt=(grupo,v,sel,txt,sub)=>`<button class="${sel?'green':'sec'}" data-gesc="${grupo}" data-v="${v}" style="flex:1 1 30%;min-height:64px;padding:8px"><b style="font-size:20px">${txt}</b>${sub?`<br><small>${sub}</small>`:''}</button>`;
  let h=`<div class="card" style="border-left:5px solid var(--green)"><h2>Antes de começar: a linha</h2>
    <div class="nota">Escolha o espaçamento dos eletrodos e a distância dos infinitos. A tabela das leituras e os K saem disso — depois da primeira leitura anotada não dá mais para trocar.</div></div>`;
  h+=`<div class="card"><h2>1 · Espaçamento dos eletrodos (a)</h2><div class="row" style="gap:8px;flex-wrap:wrap">`+
     GEO_ESP.map(a=>bt('a',a,e.a===a,a+' m',`linha de ${a*GEO_EST} m`)).join('')+
     `</div><div class="mini" style="margin-top:6px">Menor espaçamento = mais detalhe perto da superfície, linha mais curta, enxerga menos fundo.</div></div>`;
  h+=`<div class="card"><h2>2 · Infinitos — remotos B e N</h2><div class="row" style="gap:8px;flex-wrap:wrap">`+
     GEO_REM.map(r=>bt('rem',r,e.rem===r,r+' m',e.a?`enxerga ≈ ${profNivel(10,{a:e.a,L:e.a*GEO_EST,rem:r})} m`:'além de cada ponta')).join('')+
     `</div><div class="mini" style="margin-top:6px">B fica antes da estaca 0 e N depois da estaca final, nessa distância, no prolongamento da linha. Mais longe = enxerga mais fundo e o sinal das leituras fundas fica mais forte; com 100 m, erro de cravação dos remotos pesa mais no K.</div></div>`;
  const pronto = e.a && e.rem;
  h+= pronto
    ? `<div class="card spt" style="border-left:5px solid var(--green)"><div style="font-size:17px;line-height:1.5">a = <b>${e.a} m</b> · linha de <b>${e.a*GEO_EST} m</b> (estacas 0 a ${e.a*GEO_EST}) · 55 leituras<br>B em <b>−${e.rem} m</b> · N em <b>+${e.a*GEO_EST+e.rem} m</b> · enxerga até ≈ <b>${profNivel(10,{a:e.a,L:e.a*GEO_EST,rem:e.rem})} m</b></div><button class="big green" id="gescOk" style="margin-top:10px">Começar o levantamento</button></div>`
    : `<div class="card nota">Escolha as duas coisas para liberar o levantamento.</div>`;
  h+=`<button class="big ghost" id="excluir" style="margin-top:8px;color:var(--err)">Excluir esta ficha</button>`;
  $('#main').innerHTML=h;
  document.querySelectorAll('[data-gesc]').forEach(b=>b.onclick=()=>{ e[b.dataset.gesc]=+b.dataset.v; desenharEscolhaGeo(f); });
  const ok=$('#gescOk'); if(ok) ok.onclick=()=>{
    const g={ a:e.a, L:e.a*GEO_EST, rem:e.rem };
    d.geo_a=String(g.a); d.geo_rem=String(g.rem); d.geo_L=String(g.L); delete d.geo_pendente; delete d._geo_a_ant; delete d._geo_rem_ant;
    d.leituras=leiturasCam(g);
    /* a janela de profundidade padrão acompanha o que a linha enxerga */
    if(d.z_min===''||d.z_min==null||d._z_auto) { d.z_min=String(Math.round(10*g.a/20)); d.z_max=String(profNivel(10,g)); d._z_auto=true; }
    delete GEO_ESC[f.id]; delete GEO_POS[f.id]; gravar(f); toast(`Linha de ${g.L} m, a = ${g.a} m, infinitos a ${g.rem} m`); desenharEditor(); window.scrollTo(0,0); };
  const exc=$('#excluir'); if(exc) exc.onclick=()=>{ const copia=JSON.parse(JSON.stringify(f)); remover(f.id); fechar();
    barraDesfazer('Ficha excluída.', ()=>{ gravar(copia); render(); toast('Ficha de volta'); }, 12000); };
}
function cartaoLinhaGeo(f){
  const d=f.dados, g=geoDe(d), feitas=(d.leituras||[]).filter(l=>(l.mv!==''&&l.mv!=null)||l.pulou).length;
  return `<div class="card" style="border-left:5px solid var(--navy,#113E6B)"><h2>A linha</h2><div style="font-size:16px;line-height:1.5">a = <b>${g.a} m</b> · linha de <b>${g.L} m</b> · infinitos a <b>${g.rem} m</b> (B em −${g.rem}, N em +${g.L+g.rem})</div>`+
    (feitas ? `<div class="mini">Já tem leitura anotada: a geometria ficou fixa nesta ficha. Para outra geometria, abra outra ficha.</div>`
            : `<button class="sec" id="gTroca" style="margin-top:8px">Trocar espaçamento ou infinitos</button>`)+`</div>`;
}
/* ---------- figura "Como andar com os eletrodos" desenhada pela geometria da ficha ----------
   Mesmo desenho da figura padrão (COMO_ANDAR_CAMINHAMENTO.png), com os números da linha escolhida:
   espaçamento, comprimento, infinitos, A–M de cada rodada e quanto cada leitura enxerga. */
const FIG_ANDAR={};
function figuraComoAndar(g){
  const ch=g.a+'|'+g.rem; if(FIG_ANDAR[ch]) return FIG_ANDAR[ch];
  const W=1320, H=1140, cv=document.createElement('canvas'); cv.width=W; cv.height=H; const c=cv.getContext('2d');
  const NAVY='#14385C', LAR='#C8510A', AZ='#1F6FAE', VERDE='#1E7A4C', CINZA='#6B7280', TRILHO='#DDCBB2', EST='#D7DEE6';
  const F=(w,s)=>`${w} ${s}px Arial, Helvetica, sans-serif`;
  const L=g.L, a=g.a, R=g.rem, n=Math.round(L/a);
  const xB=172, x0=238, xL=924, xN=990, X=i=>x0+(xL-x0)*i/n;
  const txt=(s,x,y,font,cor,al)=>{ c.font=font; c.fillStyle=cor; c.textAlign=al||'left'; c.fillText(s,x,y); };
  const bola=(x,y,r,cor,letra,corL)=>{ c.beginPath(); c.arc(x,y,r,0,2*Math.PI); c.fillStyle=cor; c.fill(); if(letra) txt(letra,x,y+r*0.38,F('700',r*1.05),corL||'#fff','center'); };
  const seta=(xa,xb,y,cor)=>{ c.strokeStyle=cor; c.lineWidth=1.4; c.beginPath(); c.moveTo(xa,y); c.lineTo(xb,y); c.stroke();
    for(const [x,d] of [[xa,1],[xb,-1]]){ c.beginPath(); c.moveTo(x,y); c.lineTo(x+7*d,y-4); c.lineTo(x+7*d,y+4); c.closePath(); c.fillStyle=cor; c.fill(); } };
  const trilho=(y)=>{ c.fillStyle=TRILHO; c.fillRect(139,y,884,9); };
  const sec=(num,tit,y)=>{ bola(79,y,22,NAVY,String(num)); txt(tit,121,y+8,F('700',19),NAVY); };
  c.fillStyle='#fff'; c.fillRect(0,0,W,H);
  txt('CAMINHAMENTO ELÉTRICO — COMO ANDAR COM OS ELETRODOS',W/2,35,F('700',26),NAVY,'center');
  txt(`linha de ${L} m  ·  uma estaca a cada ${a} m  ·  infinitos a ${R} m  ·  55 leituras`,W/2,68,F('400',16),CINZA,'center');
  /* 1 · montar */
  sec(1,'MONTAR E NÃO MEXER MAIS',114);
  trilho(182); for(let i=0;i<=n;i++){ bola(X(i),169,9,EST); if(i%2===0) txt(String(i*a),X(i),152,F('400',11),'#555','center'); }
  bola(xB,169,16,'#555','B'); bola(xN,169,16,'#555','N');
  txt(`${R} m`,(xB+x0)/2,206,F('700',13),CINZA,'center'); txt(`${L} m  (a linha)`,(x0+xL)/2,206,F('700',13),CINZA,'center'); txt(`${R} m`,(xL+xN)/2,206,F('700',13),CINZA,'center');
  seta(xB,x0,217,CINZA); seta(x0,xL,217,CINZA); seta(xL,xN,217,CINZA);
  txt(`${L+2*R} m de corredor em linha reta`,(xB+xN)/2,254,F('700',14),NAVY,'center'); seta(xB,xN,265,NAVY);
  txt(`B e N ficam cravados ${R} m além de cada ponta e NÃO saem do lugar o dia inteiro.`,660,296,F('400',15),'#333','center');
  /* 2 · quem anda */
  sec(2,'SÓ DOIS ELETRODOS ANDAM',365);
  bola(290,413,15,LAR,'A'); txt('manda a corrente',333,419,F('400',16),'#333'); bola(686,413,15,AZ,'M'); txt('lê a voltagem',729,419,F('400',16),'#333');
  /* 3 · como o par caminha */
  sec(3,'COMO O PAR A–M CAMINHA',463);
  const linhaLeit=(y,rot,iA,iM,cotaAcima)=>{
    txt(rot,13,y+6,F('700',14),NAVY); trilho(y+14);
    for(let i=0;i<=n;i++) if(i!==iA && i!==iM) bola(X(i),y,8,EST);
    bola(xB,y,9,'#BFBFBF','B'); bola(xN,y,9,'#BFBFBF','N');
    bola(X(iA),y,15,LAR,'A'); bola(X(iM),y,15,AZ,'M');
    txt(`estaca ${iA*a}`,X(iA),y-21,F('700',11),LAR,'center'); txt(`estaca ${iM*a}`,X(iM),y-21,F('700',11),AZ,'center');
    const am=(iM-iA)*a; seta(X(iA),X(iM),y-45,NAVY); txt(`A–M = ${am} m`,(X(iA)+X(iM))/2,y-58,F('700',13),NAVY,'center');
    txt(`A–M = ${am} m`,1030,y-7,F('700',13),NAVY); txt(`enxerga ≈ ${profNivel(iM-iA,g)} m`,1030,y+22,F('700',13),VERDE);
  };
  linhaLeit(556,'leitura 1',0,1); linhaLeit(659,'leitura 2',1,2); linhaLeit(761,'leitura 10',n-1,n);
  txt('acabou a linha  →  AFASTA o M mais uma estaca  →  VOLTA para a estaca 0',660,817,F('700',16),'#B5410C','center');
  linhaLeit(898,'leitura 11',0,2); linhaLeit(1001,'leitura 55',0,n);
  /* a regra */
  c.fillStyle='#FFF4E2'; c.strokeStyle='#E3963E'; c.lineWidth=2; c.beginPath(); c.roundRect?c.roundRect(98,1036,1124,80,14):c.rect(98,1036,1124,80); c.fill(); c.stroke();
  txt(`A REGRA:  o par A–M anda junto, de estaca em estaca, até o fim da linha. Quando acaba, aumenta ${a} m a distância`,660,1070,F('700',15),NAVY,'center');
  txt(`entre os dois e recomeça da estaca 0.   São ${n} rodadas (${a}, ${2*a}, ${3*a} … ${L} m entre A e M) e 55 leituras no total.`,660,1095,F('700',15),NAVY,'center');
  txt('NATURAL ENGENHARIA',660,1132,F('700',11),'#AAA','center');
  return (FIG_ANDAR[ch]=cv.toDataURL('image/png'));
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

const FICHAS_DA_LINHA = { spt:['spt'], poco:['poco_perf','poco_teste','poco_entrega'], outorga:['poco_teste'], geofisica:['geof_cam','geof_sev'], 'limpeza-poco':['poco_limpeza'] };

/* ============================================================
   TERMO DE RECEBIMENTO — SOP-031 v1.2 (texto validado pelo Ygor em 25/09/2026)
   Para SPT, topografia, georreferenciamento, geofísica e obra civil (o poço tem a FC-POÇO Entrega).
   O termo lista só o que foi medido no "Terminei o campo" (SOP-030) e NÃO fala de valor:
   assinar não pode virar argumento de quitação.
   ============================================================ */
const dataBR = v => /^\d{4}-\d{2}-\d{2}$/.test(v||'') ? v.split('-').reverse().join('/') : (v||'');
function textoTermo(d){ const b=(v,ph)=> (v&&String(v).trim()) ? String(v).trim() : ph;
  const quem = /^Indicado/.test(d.quem_e||'') ? `indicado pelo cliente por WhatsApp em ${b(dataBR(d.ind_data),'[data]')}` : (/^Represent/.test(d.quem_e||'') ? 'representante do cliente' : 'cliente');
  return `Declaro que recebi o serviço ${b(d.servico,'[descrição]')}, executado pela Natural Engenharia na obra ${b(d.obra,'[obra]')}${d.local?' ('+d.local.trim()+')':''} em ${b(dataBR(d.data),'[data]')}, conforme medido: ${b(d.medido,'[itens e quantidades]')}. Pendências anotadas: ${b(d.pend,'nenhuma')}. Assinatura de ${b(d.recebe,'[nome]')}, ${quem}.`; }
DEF.termo = {
  codigo:'TERMO DE RECEBIMENTO', titulo:'Termo de recebimento do serviço', sop:'SOP-031',
  ident: d => d.recebe ? 'aceite '+d.recebe.split(' ')[0] : 'aceite',
  blocos: [
   { t:'1 · O serviço', notaSoApp:true, nota:'Mostre ao cliente o que foi feito, item por item, antes de pedir a assinatura.', campos:[
     {k:'servico', r:'Serviço', tipo:'text', w:4, pre:'servico'}, {k:'obra', r:'Obra', tipo:'text', w:2, pre:'obra'}, {k:'local', r:'Local', tipo:'text', w:2, ph:'fazenda, rua, município'},
     {k:'data', r:'Data', tipo:'date', pre:'hoje', w:2}, {k:'hora', r:'Hora', tipo:'time', agora:true, w:2}, {k:'coord', r:'Coordenada', tipo:'gps', w:4}
   ]},
   { t:'2 · Conforme medido (SOP-030)', notaSoApp:true, nota:'Vem do cartão "Terminei o campo" da aba Roteiro. Só o que foi medido — nada de item novo escrito na hora. Nada de valor.', campos:[
     {k:'medido', r:'Itens e quantidades', tipo:'area', w:4, pre:'medicao', ph:'Ex.: 2 furos SPT, 24 m no total'},
     {k:'pend', r:'Pendências (se não houver, escreva "nenhuma")', tipo:'area', w:4}
   ]},
   { t:'3 · Quem recebe', campos:[
     {k:'recebe', r:'Nome de quem recebe', tipo:'text', w:2},
     {k:'quem_e', r:'Quem recebe é', tipo:'sel', w:2, op:['','O próprio cliente','Indicado pelo cliente por WhatsApp','Representante do cliente (cliente com termo próprio)']},
     {k:'ind_data', r:'Indicado no WhatsApp em', tipo:'date'}, {k:'relacao', r:'Relação com o cliente', tipo:'text', ph:'caseiro, gerente, fiscal…'},
     {k:'doc_cli', r:'Cliente tem termo próprio (aeroporto, China Mobile…)', tipo:'sel', w:2, op:['','Não','Sim — assinou o dele; fotografei e anexei']}
   ]},
   { t:'4 · O termo', campos:[
     {k:'texto', r:'', tipo:'texto', w:4, calc:textoTermo},
     {k:'declara', r:'', tipo:'check', w:4, op:['Li o termo com quem recebe e ele concordou']}
   ]},
   { t:'5 · Foto e assinaturas', notaSoApp:true, nota:'A foto de quem assina, ao lado do serviço, é a prova de quem recebeu e onde. Só se a pessoa aceitar.', campos:[
     {k:'foto_recebe', r:'Foto de quem assina', tipo:'foto', w:2}, {k:'ass_recebe', r:'Assinatura de quem recebe', tipo:'ass', w:2},
     {k:'encarregado', r:'Encarregado da Natural (nome)', tipo:'text', w:2, pre:'quem'}, {k:'ass_enc', r:'Assinatura do encarregado', tipo:'ass', w:2}
   ]},
   { t:'Se a pessoa recusar', soSe: d=>/^Sim/.test(d.recusa||'')||!!d.recusa_motivo, campos:[
     {k:'recusa', r:'Recusou assinar?', tipo:'sel', w:2, op:['','Não','Sim — recusou']}, {k:'recusa_motivo', r:'Motivo, com as palavras dela', tipo:'area', w:4}
   ]}
  ],
  nota:'Termo assinado não é quitação: conversa de pagamento é com o escritório. Recusa: não discuta, anote o motivo, fotografe o serviço funcionando e avise o Ygor no mesmo dia. Sem sinal: tudo fica no celular e sobe quando pegar internet.',
  avisos: d => { const a=[];
    if(!d.medido) a.push('Itens medidos em branco — preencha o "Terminei o campo" ou escreva aqui o que foi medido.');
    if(!d.recebe) a.push('Nome de quem recebe em branco.');
    if(/^Indicado/.test(d.quem_e||'') && !d.ind_data) a.push('Indicado por WhatsApp sem a data da indicação.');
    if(/^Sim/.test(d.recusa||'')){ if(!d.recusa_motivo) a.push('Recusa sem o motivo escrito.'); a.push('Recusa de assinar: avise o Ygor hoje.'); }
    else { if(!d.ass_recebe) a.push('Sem assinatura de quem recebe — o serviço fica sem aceite (SOP-031).');
      if(!(d.declara||[]).length) a.push('Não marcou que leu o termo com quem recebe.'); }
    if(!d.foto_recebe) a.push('Sem foto de quem assina (só se a pessoa aceitar).');
    if(!d.pend) a.push('Pendências em branco — se não houver, escreva "nenhuma".');
    return a; }
};
['spt','geofisica','georef','topografia','obra-civil'].forEach(l=>{ FICHAS_DA_LINHA[l]=(FICHAS_DA_LINHA[l]||[]).concat('termo'); });

/* foto de quem assina: câmera traseira, reduzida e carimbada com data, hora e coordenada */
function fotografar(pronto){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.capture='environment'; inp.style.display='none'; document.body.appendChild(inp);
  inp.onchange=async()=>{ const fl=inp.files&&inp.files[0]; inp.remove(); if(!fl) return;
    try{ const url=URL.createObjectURL(fl); const im=await new Promise((ok,er)=>{ const i=new Image(); i.onload=()=>ok(i); i.onerror=er; i.src=url; });
      const lado=900, r=Math.min(1,lado/Math.max(im.width,im.height)); const cv=document.createElement('canvas'); cv.width=Math.round(im.width*r); cv.height=Math.round(im.height*r);
      const c=cv.getContext('2d'); c.drawImage(im,0,0,cv.width,cv.height); URL.revokeObjectURL(url);
      const carimbo=`${fmtData(new Date())} · ${S.pos?fmtCoordCurta(S.pos,S.fmt):'sem GPS'} · ${S.quem||''}`;
      c.fillStyle='rgba(17,62,107,.8)'; c.fillRect(0,cv.height-34,cv.width,34); c.fillStyle='#fff'; c.font='18px system-ui,Arial'; c.fillText(carimbo,10,cv.height-11);
      pronto(cv.toDataURL('image/jpeg',0.72)); }catch(e){ toast('Não consegui ler a foto: '+e.message,4000); } };
  inp.click(); }

function somaHora(h, min){ if(!h||!/^\d{1,2}:\d{2}$/.test(h)) return ''; const [a,b]=h.split(':').map(Number); const t=a*60+b+Number(min); const d=Math.floor(t/1440); const r=((t%1440)+1440)%1440; return String(Math.floor(r/60)).padStart(2,'0')+':'+String(r%60).padStart(2,'0')+(d?` (+${d}d)`:''); }

/* ---------------- Armazenamento (no celular, salva a cada toque) ---------------- */
const K='fichas_v1';
function todas(){ try{ return JSON.parse(localStorage.getItem('nc_'+K)||'[]'); }catch(e){ return []; } }
function salvarTodas(a){ try{ localStorage.setItem('nc_'+K, JSON.stringify(a)); return true; }catch(e){ toast('Memória do celular cheia: envie a fila e apague fichas antigas.',5000); return false; } }
function pegar(id){ return todas().find(f=>f.id===id); }
function gravar(f){ const a=todas(); const i=a.findIndex(x=>x.id===f.id); f.atualizadoEm=new Date().toISOString(); if(i<0) a.push(f); else a[i]=f;
  const ok=salvarTodas(a); faixaMemoria(!ok); return ok; }
/* faixa vermelha FIXA enquanto a ficha não estiver gravada no celular (memória cheia): toast de 5 s ninguém vê,
   e tudo que for digitado depois some se o app fechar */
function faixaMemoria(mostra){ let el=document.getElementById('faixaMem');
  if(!mostra){ if(el) el.remove(); return; }
  if(!el){ el=document.createElement('div'); el.id='faixaMem'; el.style.cssText='position:fixed;left:0;right:0;top:0;z-index:9998;background:#B42318;color:#fff;padding:12px 14px;font:700 15px system-ui;text-align:center';
    el.textContent='A FICHA NÃO ESTÁ SENDO SALVA: memória do celular cheia. Não feche o app. Envie a fila (precisa de sinal) e apague fichas antigas já enviadas.'; document.body.appendChild(el); } }
/* fichas encerradas e já enviadas não precisam guardar as assinaturas (estão no PDF que subiu): libera memória */
function aliviarMemoria(){ try{ const env=new Set((S.fila||[]).filter(x=>x.status==='enviado'&&x.tipo==='ficha').map(x=>x.meta&&x.meta.extra&&x.meta.extra.fichaId));
  const a=todas(); let mudou=false;
  for(const f of a) if(f.status==='encerrada' && env.has(f.id)) for(const [k,v] of Object.entries(f.dados)) if(typeof v==='string' && v.startsWith('data:image')){ f.dados[k]='[imagem no PDF enviado]'; mudou=true; }
  if(mudou) salvarTodas(a); }catch(e){} }
function remover(id){ salvarTodas(todas().filter(f=>f.id!==id)); }

let ABERTA=null; // id da ficha em edição

function novaFicha(tipo, ob){
  const def=DEF[tipo]; const d={};
  for(const b of def.blocos){ for(const c of (b.campos||[])){
      if(c.pre==='hoje') d[c.k]=HOJE(); else if(c.pre==='obra') d[c.k]=ob.nome; else if(c.pre==='cliente') d[c.k]=ob.cliente||ob.nome; else if(c.pre==='quem') d[c.k]=S.quem||''; else if(c.pre==='servico') d[c.k]=ob.servico||''; else if(c.pre==='medicao'){ let m=null; try{ m=JSON.parse(localStorage.getItem('nc_desmob_'+ob.id)||'null'); }catch(e){} d[c.k]=(m&&m.qtd)||''; } else d[c.k]= c.tipo==='check'?[]:''; }
    if(b.tabela){ const tb=b.tabela; d[tb.k] = tb.seq==='fixo' ? tb.fixo.map(x=>Object.assign({},x)) : []; } }
  if(tipo==='geof_cam'){ d.leituras=[]; d.geo_pendente=true; d.geo_a=''; d.geo_rem=''; d.geo_L=''; }
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
  if(c.tipo==='calc') return `<div style="${span}">${lab}<input id="${id}" data-calcf="${c.k}" value="${esc(v==null?'':v)}" disabled style="font-weight:700;opacity:.9"></div>`;
  if(c.tipo==='texto') return `<div style="${span}"><div class="termo-txt" data-textof="${c.k}">${esc(v||'')}</div></div>`;
  if(c.tipo==='foto') return `<div style="${span}">${lab}<div class="ass fotoass" data-foto="${c.k}">${v&&String(v).startsWith('data:image')?`<img src="${v}" alt="foto">`:(v?`<span class="muted">${esc(v)}</span>`:'<span class="muted">📷 Toque para fotografar</span>')}</div>${v&&!ro?`<button class="ghost" data-fotox="${c.k}" style="color:var(--err)">tirar a foto</button>`:''}</div>`;
  if(c.tipo==='ass') return `<div style="${span}">${lab}<div class="ass" data-ass="${c.k}">${v?`<img src="${v}" alt="assinatura">`:'<span class="muted">Toque para assinar</span>'}</div></div>`;
  if(c.tipo==='sel') return `<div style="${span}">${lab}<select id="${id}" data-f="${c.k}" ${dis}>${c.op.map(o=>`<option ${o===v?'selected':''}>${esc(o)}</option>`).join('')}</select></div>`;
  if(c.tipo==='area') return `<div style="${span}">${lab}<textarea id="${id}" data-f="${c.k}" ${dis} placeholder="${esc(c.ph||'')}">${esc(v||'')}</textarea></div>`;
  if(c.tipo==='gps') return `<div style="${span}">${lab}<div class="row"><input id="${id}" data-f="${c.k}" value="${esc(v||'')}" ${dis} placeholder="toque em GPS"><button class="sec" data-gps="${c.k}" style="flex:0 0 auto" ${dis}>GPS</button></div></div>`;
  if(c.tipo==='lido') return `<div style="${span}">${lab}<input id="${id}" value="${esc(v==null?'':v)}" disabled placeholder="${esc(c.ph||'marque no cartão Pontos da linha, lá em cima')}" style="opacity:.85"></div>`; /* 'lido': dado único, nasce no cartão Pontos da linha (Estou aqui — marcar); aqui só se lê */  const tp = c.tipo==='num'?'inputmode="decimal"':c.tipo==='int'?'inputmode="numeric"':'';
  const type = c.tipo==='date'?'date':c.tipo==='time'?'time':'text';
  return `<div style="${span}">${lab}<div class="row"><input id="${id}" type="${type}" ${tp} data-f="${c.k}" value="${esc(v==null?'':v)}" placeholder="${esc(c.ph||'')}" ${dis}>${c.neg&&!ro?`<button class="sec sinal" data-sinal="${id}" type="button" style="flex:0 0 auto;padding:10px">±</button>`:''}${c.agora&&!ro?`<button class="sec" data-agora="${c.k}" style="flex:0 0 auto;padding:10px">agora</button>`:''}</div></div>`;
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
      else inp=`<div class="row"><input id="${id}" type="${c.tipo==='time'?'time':c.tipo==='date'?'date':'text'}" ${tp} data-t="${tb.k}.${i}.${c.k}" value="${esc(l[c.k]==null?'':l[c.k])}" ${ro?'disabled':''}>${c.neg&&!ro?`<button class="sec sinal" data-sinal="${id}" type="button" style="flex:0 0 auto;padding:8px 10px">±</button>`:''}${c.agora&&!ro?`<button class="sec" data-tagora="${tb.k}.${i}.${c.k}" style="flex:0 0 auto;padding:8px">agora</button>`:''}</div>`;
      h+=`<div style="${span}"><label for="${id}">${esc(c.r)}</label>${inp}</div>`; }
    h+=`</div></div>`; });
  if(!ro && tb.seq!=='fixo') h+=`<button class="big sec" data-add="${tb.k}">+ ${tb.seq==='metro'?'próximo metro':'nova linha'}</button>`;
  if(tb.seq==='fixo') h+=`<button class="ghost" data-mostra="${tb.k}">mostrar/ocultar linhas vazias</button>`;
  return h+`</div>`;
}
/* tempo de bombeamento: 720 min, ou o minuto real em que a bomba desligou (queda de energia é comum) */
function tBomba(d){ const v=NUM(d&&d.tp); return (v>0 && v<720) ? v : 720; }
/* tolerância de atraso da leitura: meio minuto no começo, 10 % do tempo depois — leitura dos 60 min feita
   aos 60,6 não pode cair na linha dos 70 (antes caía, e a leitura certa dos 70 apagava a dos 60) */
const tolT = t => Math.max(0.5, 0.1*t);
function leituraDaVez(d){ // qual linha da tabela é a leitura de agora
  if(!d.hini||!/^\d{1,2}:\d{2}$/.test(d.hini)) return null;
  const [a,b]=d.hini.split(':').map(Number); const agora=new Date(); const ini=new Date(); ini.setHours(a,b,0,0); if(ini>agora) ini.setDate(ini.getDate()-1);
  const min=(agora-ini)/60000, T=tBomba(d);
  const vazio=(tab,i)=>{ const l=(d[tab]||[])[i]; return !l || l.nd===''||l.nd==null; };
  if(min<=T+0.5){ let i=TEMPOS_B.findIndex((t,k)=>t<=T && min<=t+tolT(t) && vazio('bomb',k)); if(i<0) i=TEMPOS_B.findIndex(t=>t<=T && min<=t+tolT(t));
    if(i>=0) return {tab:'bomb', i, t:TEMPOS_B[i], hora:somaHora(d.hini,TEMPOS_B[i]), min}; }
  const mr=min-T; let i=TEMPOS_B.findIndex((t,k)=>mr<=t+tolT(t) && vazio('rec',k)); if(i<0) i=TEMPOS_B.findIndex(t=>mr<=t+tolT(t));
  if(i>=0) return {tab:'rec', i, t:TEMPOS_B[i], hora:somaHora(d.hini,T+TEMPOS_B[i]), min};
  return {fim:true, min}; }
function cartaoLeitura(d){
  if(!d.hini) return `<div class="card spt" id="prox" style="border-left:5px solid var(--green)"><h2>Leitura da vez</h2><div class="nota">Quando a bomba ligar, toque aqui:</div><button class="big green" data-agora="hini">Bomba ligou agora</button></div>`;
  const L=leituraDaVez(d); if(!L||L.fim) return `<div class="card" id="prox"><h2>Teste encerrado</h2><div class="nota">Passou de ${tBomba(d)} + 720 min.</div></div>`;
  const nome=L.tab==='bomb'?`Bombeamento · t = ${L.t} min`:`Recuperação · t' = ${L.t} min`; const v=(d[L.tab][L.i]||{}).nd||'';
  return `<div class="card spt" id="prox" style="border-left:5px solid var(--green)"><h2>Leitura da vez</h2><div class="mini">${esc(nome)} · às <b>${esc(L.hora)}</b> · agora ${Math.floor(L.min)} min de teste</div>
   <div class="gols" style="grid-template-columns:2fr 1fr;margin-top:8px"><div class="gol"><div class="t">N.D. (m)</div><input class="g" inputmode="decimal" id="ldv" value="${esc(v)}" placeholder="nível"></div>
   <div class="gol"><div class="t">&nbsp;</div><button class="green" id="ldvOk" data-slot="${L.tab}:${L.i}:${L.t}" style="height:58px;width:100%">Anotar</button></div></div>
   <div class="row" style="margin-top:8px;flex-wrap:wrap;gap:6px">${L.tab==='bomb'?`<button class="sec" data-marca="estab" style="flex:1 1 45%">Nível estabilizou agora</button><button class="sec" data-marca="tp" style="flex:1 1 45%">Bomba desligou agora (antes dos 720)</button>`:`<button class="sec" data-marca="volta" style="flex:1 1 45%">Voltou ao NE agora</button>`}</div>
   <div class="mini" style="margin-top:6px">A tabela completa continua lá embaixo, para corrigir qualquer leitura.</div></div>`; }
function ligarProx(f){
  const lo=$('#ldvOk'); if(lo) lo.onclick=()=>{ const v=$('#ldv').value.trim(); if(!v) return toast('Digite o nível');
    /* grava na linha que o CARTÃO mostrava, não na que o relógio acha agora */
    const [tab,ii,tt]=String(lo.dataset.slot||'').split(':'); const L={tab, i:+ii, t:+tt}; if(!f.dados[L.tab]||!f.dados[L.tab][L.i]) return;
    f.dados[L.tab][L.i].nd=v; gravar(f); toast(`Anotado: ${L.tab==='bomb'?'t':'t\''} = ${L.t} min → ${v} m`); renderProx(f); atualizarTabelaTeste(f); };
  document.querySelectorAll('[data-marca]').forEach(b=>b.onclick=()=>{ const L=leituraDaVez(f.dados); if(!L||L.fim) return; const k=b.dataset.marca;
    if((k==='estab'||k==='tp') && L.tab!=='bomb') return toast('Isso só vale durante o bombeamento.');
    if(k==='volta' && L.tab!=='rec') return toast('Isso só vale na recuperação, depois que a bomba desligou.');
    const val = String(Math.round(k==='volta' ? L.min-tBomba(f.dados) : L.min));
    if(f.dados[k] && f.dados[k]!==val && !confirm(`Já está anotado o minuto ${f.dados[k]}. Trocar por ${val}?`)) return;
    f.dados[k]=val; gravar(f); const e=$('#f_'+k); if(e) e.value=f.dados[k]; renderProx(f); atualizarCalc(f);
    toast(k==='estab'?`Estabilizou no minuto ${val}`:k==='tp'?`Bomba desligou no minuto ${val}: a recuperação conta daqui`:`Voltou ao NE no minuto ${val} da recuperação`); });
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
  if(f.tipo==='geof_cam' && !geoPendente(f.dados) && !f.dados.geo_a){   /* ficha antiga: grava a geometria fixa que ela usou */
    f.dados.geo_a=String(GEO.a); f.dados.geo_rem=String(GEO.rem); f.dados.geo_L=String(GEO.L); gravar(f); }
  if(f.tipo==='geof_cam' && geoPendente(f.dados) && f.status!=='encerrada') return desenharEscolhaGeo(f);
  if(f.tipo==='spt' && f.status!=='encerrada') return desenharSPT(f);
  const gpsBom = (typeof posFresca==='function') ? posFresca(60000) : null;
  if(f.status!=='encerrada' && gpsBom && (gpsBom.acc||99)<=15){ let mudou=false; for(const b of DEF[f.tipo].blocos) for(const c of (b.campos||[])) if(c.tipo==='gps' && !f.dados[c.k]){ f.dados[c.k]=textoCoordFicha(gpsBom); mudou=true; } if(mudou) gravar(f); }
  if(f.tipo==='poco_entrega') f.dados.__obraId=f.obraId;
  if(f.status!=='encerrada') injetarCssSPT();
  const def=DEF[f.tipo]; const d=f.dados; const ro=f.status==='encerrada';
  $('#hTit').textContent=def.codigo+' · '+def.ident(d); $('#hSub').textContent=f.obraNome; $('#hBtn').classList.remove('hide'); $('#hBtn').textContent='Fichas';
  let h=`<div class="card" style="border-left:5px solid var(--green)"><h2>${esc(def.titulo)}</h2><div class="muted">${esc(def.sop)}${def.norma?' · '+esc(def.norma):''} · salva sozinha a cada toque${f.versao>1?` · versão ${f.versao}`:''}</div>${ro?'<div class="banner" style="background:var(--ok-bg);color:var(--green-2);margin:10px 0 0">Ficha encerrada: o PDF e os dados estão na fila de envio. Para corrigir, reabra — sai uma versão nova.</div>':''}</div>`;
  if(f.tipo==='poco_teste' && !ro) h+=cartaoLeitura(d);
  if(f.tipo==='geof_cam' && !ro) h+=cartaoLinhaGeo(f);
  if(ehGeo(f.tipo) && !ro) h+=cartaoPontos(f);
  if(ehGeo(f.tipo) && !ro) h+=cartaoGeo(f);
  def.blocos.forEach((b0,bi)=>{
    let b=b0;
    if(f.tipo==='geof_cam' && b0.img==='COMO_ANDAR_CAMINHAMENTO.png'){ const g=geoDe(d);
      b=Object.assign({},b0,{ img:figuraComoAndar(g), nota:`B e N ficam cravados ${g.rem} m além de cada ponta e não saem do lugar. Só A e M andam. O par anda de estaca em estaca até o fim da linha (estaca ${g.L}); aí aumenta ${g.a} m a distância entre os dois e volta para a estaca 0.` }); }
    if(b.grafico){ h+=cartaoGrafico(f,b); return; }
    h+=`<div class="card"><h2>${esc(b.t)}</h2>${b.nota?`<div class="nota">${esc(b.nota)}</div>`:''}`;
    if(b.img) h+=`<img src="${b.img}" data-zoom="${b.img}" alt="${esc(b.t)}" style="width:100%;border:1px solid var(--line);border-radius:12px;margin-top:8px"><div class="mini">toque na figura para ampliar — abre por cima da ficha, com botão Fechar; nada se perde</div>`;
    if(b.campos) h+=`<div class="grid">`+b.campos.map(c=>campoHTML(c,(c.tipo==='calc'||c.tipo==='texto')?c.calc(d):d[c.k],ro)).join('')+`</div>`;
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
  document.querySelectorAll('[data-gps]').forEach(b=>b.onclick=()=>{ iniciarGPS(); const p=posFresca(60000); if(!p){ toast(S.pos?'GPS desatualizado — espere alguns segundos e toque de novo.':'Procurando GPS… tente de novo em alguns segundos (céu aberto ajuda).'); return; } const v=textoCoordFicha(p); f.dados[b.dataset.gps]=v; $('#f_'+b.dataset.gps).value=v; salvar(); toast('Coordenada preenchida'); });
  document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{ const tb=def.blocos.find(x=>x.tabela&&x.tabela.k===b.dataset.add).tabela; const arr=f.dados[tb.k]; let extra={};
      if(tb.seq==='metro'){ const u=arr[arr.length-1]; const de=u&&u.ate!==''&&!isNaN(NUM(u.ate))?NUM(u.ate):0; extra={de:String(de).replace('.',','), ate:String(de+1).replace('.',',')}; }
      else if(arr.length && arr[arr.length-1].ate!==undefined){ extra={de:arr[arr.length-1].ate||''}; }
      arr.push(linhaVazia(tb,extra)); gravar(f); desenharEditor(); const ult=document.querySelector(`[data-li="${arr.length-1}"]`); if(ult) ult.scrollIntoView({block:'center'}); });
  document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{ const [k,i]=b.dataset.del.split('.'); const linha=f.dados[k][+i];
    f.dados[k].splice(+i,1); gravar(f); desenharEditor();
    barraDesfazer('Apagado.', ()=>{ f.dados[k].splice(+i,0,linha); gravar(f); desenharEditor(); }); });
  document.querySelectorAll('[data-mostra]').forEach(b=>b.onclick=()=>{ document.querySelectorAll('.linha.vz').forEach(x=>x.classList.toggle('oc')); });
  document.querySelectorAll('[data-foto]').forEach(el=>el.onclick=()=>{ if(f.status==='encerrada') return; fotografar(url=>{ f.dados[el.dataset.foto]=url; gravar(f); desenharEditor(); }); });
  document.querySelectorAll('[data-fotox]').forEach(b=>b.onclick=()=>{ const k=b.dataset.fotox, ant=f.dados[k]; f.dados[k]=''; gravar(f); desenharEditor(); barraDesfazer('Foto tirada da ficha.', ()=>{ f.dados[k]=ant; gravar(f); desenharEditor(); }); });
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
  document.querySelectorAll('[data-figver]').forEach(x=>{ x.onclick=()=>verGrandeGeof(f, x.dataset.figver); }); document.querySelectorAll('[data-zoom]').forEach(x=>{ x.onclick=()=>verGrandeImg(x.dataset.zoom, x.alt); });
  document.querySelectorAll('[data-terreno] [data-tv]').forEach(x=>{ x.onclick=async()=>{
    const k=x.closest('[data-terreno]').dataset.terreno, tv=x.dataset.tv;
    if(f.dados.terreno===tv) return;
    f.dados.terreno=tv; gravar(f);
    if(GEOF_CACHE[f.id+'_'+k]){   /* já tinha gráfico: refaz só a classificação */
      const off=document.createElement('canvas'); off.width=1240; off.height=1000;
      try{ const r=await desenharFiguraGeof(f, k, off);
           if(r){ GEOF_CACHE[f.id+'_'+k]=r; GEOF_PIX[f.id+'_'+k]=off; f.dados['_fig_'+k]=r;
                  if(k==='cam' && r.estaca!=null && !r.fraca && (f.dados.estaca_final===''||f.dados.estaca_final==null)) f.dados.estaca_final=r.estaca; gravar(f); } }
      catch(e){ toast('Não consegui refazer: '+e.message,4000); }
    }
    desenharEditor();
  }; });
  document.querySelectorAll('[data-fig]').forEach(x=>{ x.onclick=async()=>{
    const k=x.dataset.fig, txt=x.textContent;
    { const arr=f.dados.leituras||[], falta=arr.filter(l=>!l.pulou && (l.mv===''||l.mv==null||l.ma===''||l.ma==null)), pul=arr.filter(l=>l.pulou);
      if(falta.length || pul.length){
        const fundo = k==='cam' ? [...new Set(falta.map(l=>l.n))].sort((a,b)=>b-a).slice(0,3) : [];
        const msg = `GRÁFICO PARCIAL\n\n${arr.length-falta.length-pul.length} de ${arr.length} leituras medidas`+(falta.length?` · ${falta.length} ainda em branco`:'')+(pul.length?` · ${pul.length} marcada(s) como "não deu para medir"`:'')+
          (k==='cam'&&fundo.length?`\nFaltam leituras do nível ${fundo.join(', ')} — ${fundo[0]>=7?'a parte mais funda da figura fica sem dado.':'a figura fica com buraco.'}`:'')+
          (k==='sev'&&falta.some(l=>l.ab2>=100)?'\nFaltam as aberturas maiores: o fundo do perfil não é visto.':'')+
          `\n\nA estaca e as profundidades podem MUDAR quando completar. Use só como indicação provisória.\n\nGerar assim mesmo?`;
        if(!confirm(msg)) return; } }
    x.disabled=true; x.textContent='Calculando…';
    try{
      const off=document.createElement('canvas'); off.width=1240; off.height=1000;
      const r=await desenharFiguraGeof(f, k, off);
      if(r && r.semTerreno) toast('Escolha o terreno primeiro.',4000);
      else if(!r) toast(k==='cam'?'Precisa de pelo menos 4 leituras anotadas.':'Precisa de pelo menos 6 leituras anotadas.',4000);
      else if(!r.semTerreno) { GEOF_CACHE[f.id+'_'+k]=r; GEOF_PIX[f.id+'_'+k]=off; f.dados['_fig_'+k]=r;
             if(k==='cam' && r.estaca!=null && !r.fraca && (f.dados.estaca_final===''||f.dados.estaca_final==null)) f.dados.estaca_final=r.estaca;
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
  const gt=$('#gTroca'); if(gt) gt.onclick=()=>{ const d=f.dados;
    if((d.leituras||[]).some(l=>(l.mv!==''&&l.mv!=null)||l.pulou)) return toast('Já tem leitura anotada: abra outra ficha para outra geometria.',4000);
    d._geo_a_ant=d.geo_a; d._geo_rem_ant=d.geo_rem; d.geo_pendente=true; d.leituras=[]; gravar(f); desenharEditor(); };
  if(f.tipo==='poco_teste' && f.status!=='encerrada'){ clearInterval(window.__proxT); window.__proxT=setInterval(()=>{ const p=$('#prox'); if(!p||!aberta()){ clearInterval(window.__proxT); return; } if(document.activeElement && document.activeElement.id==='ldv') return; renderProx(f); },20000); }
}
function atualizarCalc(f){
  const def=DEF[f.tipo]; const d=f.dados;
  def.blocos.filter(b=>b.tabela).forEach(b=>{ const tb=b.tabela; (d[tb.k]||[]).forEach((l,i)=>tb.cols.filter(c=>c.tipo==='calc').forEach(c=>{ const el=document.querySelector(`[data-calc="${tb.k}.${i}.${c.k}"]`); if(el) el.textContent=String(c.calc(l,d)); })); });
  def.blocos.forEach(b=>(b.campos||[]).filter(c=>c.tipo==='calc').forEach(c=>{ const el=document.querySelector(`[data-calcf="${c.k}"]`); if(el) el.value=String(c.calc(d)); }));
  def.blocos.forEach(b=>(b.campos||[]).filter(c=>c.tipo==='texto').forEach(c=>{ const el=document.querySelector(`[data-textof="${c.k}"]`); if(el) el.textContent=String(c.calc(d)); }));
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
/* impressão digital de tudo que muda o gráfico: leituras na ordem, geometria, faixa, janela e terreno.
   A soma ponderada antiga não via leitura trocada de linha — o gráfico ficava velho. */
function assinatura(d){ let h=2166136261;
  const s=JSON.stringify([(d.leituras||[]).map(l=>[l.ord,l.pulou?1:0,l.sp,l.mv,l.ma]), d.geo_a, d.geo_rem, d.r_min, d.r_max, d.z_min, d.z_max, d.terreno]);
  for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); }
  return (h>>>0).toString(36)+':'+s.length; }
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
function faixaDigitada(d){ const a=NUM(d&&d.r_min), b=NUM(d&&d.r_max);
  return (isFinite(a) && isFinite(b) && b>a) ? { rMin:a, rMax:b } : null; }
function faixaDaSev(f){ const p=faixaDigitada(f.dados); if(p) return { ...p, origem:'SEV' };
  const c=camIrmao(f), q=c?faixaDigitada(c.dados):null; return q ? { ...q, origem:'caminhamento '+(c.dados.linha_id||'') } : null; }
/* acha o caminhamento que deu origem a esta SEV, para integrar as duas */
function camIrmao(f){
  const d=f.dados;
  const c=todas().filter(x=>x.tipo==='geof_cam' && x.obraId===f.obraId
            && x.dados && x.dados._fig_cam && x.dados._fig_cam.leitura);
  if(!c.length) return null;
  const est=NUM(String(d.estaca||'').replace(/[^0-9.,-]/g,''));
  c.sort((a,b)=>a.criadoEm<b.criadoEm?1:-1);
  if(!isFinite(est)) return c[0];          /* SEV sem estaca anotada: o caminhamento mais recente da obra */
  const perto=c.filter(x=>{ const e=NUM(x.dados.estaca_final); const alvo=isFinite(e)?e:NUM(x.dados._fig_cam.leitura.estaca);
    return Math.abs(alvo-est) <= 0.5*geoDe(x.dados).a + 1e-6; });
  return perto.length ? perto[0] : null;   /* anotou estaca e nenhuma linha bate: não integra com a linha errada */
}
function geoValidas(d){ return (d.leituras||[]).filter(l=>!l.pulou && l.mv!==''&&l.mv!=null&&l.ma!==''&&l.ma!=null&&NUM(l.ma)!==0); }
function geoResCam(d, fid){
  const sig=assinatura(d), ch=GEOF_NUM[fid+'_cam'];
  if(ch && ch.sig===sig) return ch.res;
  const L=geoValidas(d); if(L.length<4) return null;
  const g = geoDe(d);
  const res = window.GEOF.processarCaminhamento({a:g.a, Bx:-g.rem, Nx:g.L+g.rem},
    L.map(l=>({fixo:l.A, movel:l.M, sp:NUM(l.sp)||0, mv:NUM(l.mv), ma:NUM(l.ma)})));
  /* profundidade do eixo: a mediana investigada calibrada no motor da Natural
     (PROF_NIVEL, feita para a = 20 m e escalada para o espaçamento da ficha) */
  for(const pt of res.pontos){ const z=profNivel(pt.n, g); if(z) pt.z=z; }
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
  /* EMENDA das embreagens: cada troca de MN cria um degrau na curva. O trecho com o MN novo é
     multiplicado pela razão medida na embreagem (MN antigo / MN novo), acumulando — a média das
     duas leituras deixava o degrau no resto da curva e mudava a profundidade do alvo. */
  const val=l=>{ const r=R_geo(l); if(r==='') return null; const v=Math.abs(l.K*r); return v>0?v:null; };
  const mns=[...new Set((d.leituras||[]).map(l=>l.mn2))].sort((u,v)=>u-v);
  const fator={}, emendas=[]; fator[mns[0]]=1;
  for(let s=1;s<mns.length;s++){
    const vel=L.filter(l=>l.mn2===mns[s-1]), nov=L.filter(l=>l.mn2===mns[s]);
    const par=nov.map(n=>[vel.find(v=>v.ab2===n.ab2), n]).find(([v,n])=>v && val(v) && val(n));
    const fz = par ? val(par[0])/val(par[1]) : 1;
    fator[mns[s]] = fator[mns[s-1]] * fz;
    if(par) emendas.push({ ab2:par[1].ab2, fator:+fz.toFixed(3) });
  }
  const por2={};
  for(const l of L){ const v=val(l); if(v==null) continue;
    (por2[l.ab2]=por2[l.ab2]||[]).push(v*(fator[l.mn2]||1)); }
  const ab=Object.keys(por2).map(Number).sort((u,v)=>u-v);
  return { x:ab, obs:ab.map(k=>por2[k].reduce((u,v)=>u+v,0)/por2[k].length), emendas };
}
async function desenharFiguraGeof(f, tipo, cv, terrenoTmp){
  const d = terrenoTmp ? Object.assign({}, f.dados, {terreno:terrenoTmp}) : f.dados;
  if (!terrenoId(d)) return { semTerreno:true };
  const logo=await new Promise(ok=>{ const i=new Image(); i.onload=()=>ok(i); i.onerror=()=>ok(null); i.src='logo-color.png'; });
  const tit=`${d.cliente||f.obraNome} · ${DEF[f.tipo].ident(d)}${d.local?' · '+d.local:''}`;
  if(tipo==='cam'){
    const res=geoResCam(d, f.id); if(!res) return null;
    const loc=geoLocCam(d,res);
    const li=window.GEOF.lerCaminhamento(res, loc, terrenoId(d), faixaAlvo(d));
    const linhas=[];
    if(li){
      const fraca = !li.faixas.length || !loc || !loc.melhor || loc.melhor.nota < 0.25;
      linhas.push(fraca
        ? { t:`O caminhamento NÃO achou zona favorável — a estaca ${fmtN(li.estaca)} m é só a menos ruim da linha`, forte:true }
        : { t:`Marcar o poço na ESTACA ${fmtN(li.estaca)} m da linha`, forte:true });
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
    const parcial = res.qc.total < (d.leituras||[]).length;
    return { estaca: loc&&loc.melhor?loc.melhor.x:null, nota:+nB.toFixed(3), fraca: !li || !li.faixas.length || nB < 0.25, parcial,
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
  const fx=faixaDaSev(f);
  const li=window.GEOF.lerSEV(z.rho, z.prof, terrenoId(d), {arranjo:'schlumberger', xs:sd.x, obs:sd.obs, faixa:fx});
  if(fx) li.avisos.unshift(`Faixa de alvo ${fmtN(fx.rMin)}–${fmtN(fx.rMax)} Ω·m (da ${fx.origem}), no lugar da faixa do terreno.`);
  for(const em of (sd.emendas||[])) if(Math.abs(em.fator-1)>0.15)
    li.avisos.push(`Embreagem em AB/2 = ${fmtN(em.ab2)} m: o trecho seguinte foi corrigido em ${Math.round((em.fator-1)*100)} %. Degrau grande: confira se A e B ficaram parados.`);
  if(!camIrmao(f) && String(d.estaca||'').trim() && todas().some(x=>x.tipo==='geof_cam'&&x.obraId===f.obraId))
    li.avisos.push('A estaca anotada nesta SEV não bate com a estaca escolhida em nenhum caminhamento da obra: a SEV não foi integrada.');
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
/* Figura de instrução ampliada DENTRO do app (antes abria numa aba nova e, no app instalado, não tinha como voltar no meio do levantamento). Zoom por pinça ou pelos botões; fecha no botão Fechar ou no voltar do celular. */ let ZOOM_OV=null; function fecharZoom(){ if(!ZOOM_OV) return false; ZOOM_OV.remove(); ZOOM_OV=null; return true; } function verGrandeImg(src, titulo){ if(ZOOM_OV) fecharZoom(); const ov=document.createElement('div'); ov.style.cssText='position:fixed;inset:0;background:#0B1220;z-index:9999;display:flex;flex-direction:column;touch-action:none'; ov.innerHTML=`<div style="padding:10px 14px;color:#fff;font:600 15px system-ui;display:flex;align-items:center;gap:10px"><button id="zX" style="background:#fff;color:#14284D;border:0;border-radius:8px;padding:9px 16px;font:700 15px system-ui">Fechar</button><span style="flex:1;opacity:.85;font-weight:400">${esc(titulo||'')} — pinça ou botões para o zoom; arraste para ver</span><button id="zMenos" style="background:#243B5C;color:#fff;border:0;border-radius:8px;width:42px;height:38px;font:700 22px system-ui">−</button><button id="zMais" style="background:#243B5C;color:#fff;border:0;border-radius:8px;width:42px;height:38px;font:700 22px system-ui">+</button></div><div id="zBox" style="flex:1;overflow:auto;-webkit-overflow-scrolling:touch"><img id="zImg" src="${src}" alt="" style="display:block;max-width:none;transform-origin:0 0"></div>`; document.body.appendChild(ov); ZOOM_OV=ov; const box=ov.querySelector('#zBox'), img=ov.querySelector('#zImg'); let esc0=1; const aplica=()=>{ img.style.width=(box.clientWidth*esc0)+'px'; }; img.onload=aplica; aplica(); const zoom=(fz,cx,cy)=>{ const n=Math.min(6,Math.max(1,esc0*fz)); if(n===esc0) return; const rx=(box.scrollLeft+(cx==null?box.clientWidth/2:cx))/esc0, ry=(box.scrollTop+(cy==null?box.clientHeight/2:cy))/esc0; esc0=n; aplica(); box.scrollLeft=rx*esc0-(cx==null?box.clientWidth/2:cx); box.scrollTop=ry*esc0-(cy==null?box.clientHeight/2:cy); }; ov.querySelector('#zMais').onclick=()=>zoom(1.5); ov.querySelector('#zMenos').onclick=()=>zoom(1/1.5); let d0=null, e0=1; box.addEventListener('touchstart',e=>{ if(e.touches.length===2){ d0=Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY); e0=esc0; } },{passive:true}); box.addEventListener('touchmove',e=>{ if(e.touches.length===2 && d0){ e.preventDefault(); const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY); const alvo=e0*d/d0; const r=box.getBoundingClientRect(); zoom(alvo/esc0, (e.touches[0].clientX+e.touches[1].clientX)/2-r.left, (e.touches[0].clientY+e.touches[1].clientY)/2-r.top); } },{passive:false}); box.addEventListener('touchend',()=>{ d0=null; },{passive:true}); img.ondblclick=()=>zoom(esc0>1?1/esc0:2); ov.querySelector('#zX').onclick=()=>{ if(history.state&&history.state.t==='zoom') history.back(); else fecharZoom(); }; try{ history.pushState({t:'zoom'},''); }catch(e){} }function verGrandeGeof(f,k){
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
    c.fillText(`Preenchida no app de campo por ${f.por||'—'} · ${f.encerradaEm?'encerrada em '+fmtData(new Date(f.encerradaEm)):'gerada em '+fmtData(new Date())} · ficha ${f.id}${f.versao>1?' · v'+f.versao:''}`,M,M+124);
    y=M+150; };
  const rodape=()=>{ paginas.forEach((p,i)=>{ const x=p.getContext('2d'); x.fillStyle='#D9DEE5'; x.fillRect(M,H-90,W-2*M,1); x.fillStyle='#8A94A0'; x.font=fonte(15); x.textAlign='center';
      x.fillText('NATURAL ENGENHARIA · R. Lírio do Vale, 24 – Andar 01, Sala F08 – Aparecida, Boa Vista/RR · (95) 98109-5431 · naturalengenhariarr@gmail.com',W/2,H-62);
      x.fillText(`Campo em branco é permitido; campo inventado, não. · Página ${i+1} de ${paginas.length}`,W/2,H-40); x.textAlign='left'; }); };
  const garante=h=>{ if(y+h>H-110){ novaPag(); } };
  const quebra=(txt,larg,px,b)=>{ c.font=fonte(px,b); const ps=String(txt).split(/\s+/); const ls=[]; let l=''; for(const p of ps){ const t=l?l+' '+p:p; if(c.measureText(t).width>larg && l){ ls.push(l); l=p; } else l=t; } if(l) ls.push(l); return ls.length?ls:['']; };
  const titulo=t=>{ garante(60); c.fillStyle='#19A878'; c.fillRect(M,y+6,6,30); c.fillStyle='#113E6B'; c.font=fonte(22,true); c.fillText(t,M+16,y+30); y+=48; };
  const valor=(cp,v)=>{ if(cp.tipo==='calc'){ const r=cp.calc(d); return r===''||r==null?'—':String(r); } if(cp.tipo==='date' && /^\d{4}-\d{2}-\d{2}$/.test(v||'')) return v.split('-').reverse().join('/'); if(cp.tipo==='check') return (cp.op.map(o=>((v||[]).includes(o)?'☑ ':'☐ ')+o)).join('   '); return v==null||v===''?'—':String(v); };
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
    if(b.soSe && !b.soSe(d)) continue;
    titulo(b.t);
    if(b.nota && !b.notaSoApp){ const ls=quebra(b.nota,W-2*M,15); garante(ls.length*20); c.fillStyle='#5B6570'; c.font=fonte(15); ls.forEach(l=>{ c.fillText(l,M,y+14); y+=20; }); y+=6; }
    if(b.campos){ // grade de 4 colunas
      const col=(W-2*M)/4; let x=0, alt=0; const linha=[];
      const flush=()=>{ y+=alt+10; x=0; alt=0; };
      for(const cp of b.campos){ const span=Math.min(cp.w||1,4); if(x+span>4) flush();
        const X=M+x*col, larg=span*col-14;
        if(cp.tipo==='texto'){ if(x>0) flush(); const ls=quebra(cp.calc(d),W-2*M-30,19); garante(ls.length*26+30); c.fillStyle='#F3F5F8'; c.fillRect(M,y,W-2*M,ls.length*26+24); c.fillStyle='#1B2430'; c.font=fonte(19); ls.forEach((l,i)=>c.fillText(l,M+15,y+30+i*26)); y+=ls.length*26+36; continue; }
        if(cp.tipo==='foto'){ garante(270); const img=d[cp.k]; c.fillStyle='#5B6570'; c.font=fonte(14,true); quebra(cp.r.toUpperCase(),larg,14,true).slice(0,1).forEach(l=>c.fillText(l,X,y+14));
          c.strokeStyle='#D9DEE5'; c.strokeRect(X,y+22,larg,240);
          if(img && String(img).startsWith('data:image')){ const im=await new Promise(ok=>{ const i=new Image(); i.onload=()=>ok(i); i.onerror=()=>ok(null); i.src=img; }); if(im){ const r=Math.min(larg/im.width,240/im.height); c.drawImage(im,X+(larg-im.width*r)/2,y+22,im.width*r,im.height*r); } }
          else { c.fillStyle='#B45309'; c.font=fonte(15); c.fillText('sem foto de quem assina',X+10,y+140); }
          alt=Math.max(alt,270); x+=span; continue; }
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
/* impenetrável pelos critérios escritos na própria ficha: 30 golpes sem entrar 15 cm num trecho,
   50 golpes sem entrar 30 cm somando trechos, ou 10 golpes sem descer nada */
function impenetravel(l){ const v=k=>NUM(l[k]); let G=0, C=0;
  for(const [g,c] of [['g1','c1'],['g2','c2'],['g3','c3']]){ const gg=v(g), cc=v(c); if(isNaN(gg)||isNaN(cc)) continue;
    if(gg>=30 && cc<15) return true; if(gg>=10 && cc===0) return true; G+=gg; C+=cc; if(G>=50 && C<30) return true; }
  return false; }
/* N = 2º + 3º trechos. Penetração menor que 30 cm sai como golpes/penetração (ex.: 50/23), como manda a NBR 6484;
   número mal digitado ("2O", "30/10") sai "?" e vira aviso — antes saía NaN no PDF */
function nSPT(l){ if(l.g2===''||l.g2==null||l.g3===''||l.g3==null) return '';
  const g2=NUM(l.g2), g3=NUM(l.g3); if(isNaN(g2)||isNaN(g3)) return '?';
  const c2=NUM(l.c2), c3=NUM(l.c3), pen=(isNaN(c2)?15:c2)+(isNaN(c3)?15:c3);
  return pen<30 ? `${g2+g3}/${pen}` : (g2+g3); }
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
.spt .gol .sinal{width:100%;padding:6px 0;font:700 14px system-ui;margin-top:2px}
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
  { const p=(typeof posFresca==='function')?posFresca(60000):null; if(!d.coord && p && (p.acc||99)<=15){ d.coord=textoCoordFicha(p); gravar(f); } }
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
  else if(f.foraDoPadrao){ f.foraDoPadrao=false; gravar(f); }   /* versão corrigida e completa não carrega o selo da anterior */
  $('#encerrar').disabled=true; $('#encerrar').textContent='Gerando PDF…';
  try{
    const ob=(S.pacote?.obras||[]).find(o=>o.id===f.obraId) || {id:f.obraId,nome:f.obraNome,pastaId:null};
    const prevObra=S.obraId; S.obraId=ob.id;
    const base=`${HOJE()}_${def.codigo.replace(/\s+/g,'-')}_${slug(def.ident(f.dados))}${f.versao>1?'_v'+f.versao:''}`;
    if(f.tipo==='spt'){ (f.dados.golpes||[]).forEach((l,i)=>{ l.fotos=fotosDoMetro(f,i).map(x=>x.nome); }); gravar(f); }
    for(const b of def.blocos){ if(!b.grafico) continue;
      const g=document.createElement('canvas'); g.width=1240; g.height=1000;
      try{ const r=await desenharFiguraGeof(f, b.grafico, g);
           if(r){ f.dados['_fig_'+b.grafico]=r; GEOF_PIX[f.id+'_'+b.grafico]=g; GEOF_CACHE[f.id+'_'+b.grafico]=r; } }catch(e){} }
    gravar(f);
    const pdf=await gerarPDF(f);
    await enfileirarArquivo(pdf,'ficha',base+'.pdf',{fichaId:f.id,tipo:f.tipo,versao:f.versao,avisos:av},{obra:ob});
    const dados=new Blob([JSON.stringify({app:'campo',fichaId:f.id,tipo:f.tipo,codigo:def.codigo,sop:def.sop,versao:f.versao,obraId:f.obraId,obra:f.obraNome,por:f.por,criadoEm:f.criadoEm,encerradoEm:new Date().toISOString(),avisos:av,foraDoPadrao:!!f.foraDoPadrao,dados:Object.fromEntries(Object.entries(f.dados).map(([k,v])=>[k, (typeof v==='string'&&v.startsWith('data:image'))?'[imagem no PDF]':v]))},null,1)],{type:'application/json'});
    await enfileirarArquivo(dados,'ficha',base+'.json',{fichaId:f.id,tipo:f.tipo,versao:f.versao},{obra:ob});
    S.obraId=prevObra;
    f.status='encerrada'; f.encerradaEm=new Date().toISOString();
    if(!gravar(f)) toast('PDF na fila, mas a ficha não foi marcada como encerrada (memória cheia). Não encerre de novo.',8000);
    toast('Ficha encerrada: PDF e dados na fila de envio',3500); desenharEditor();
  }catch(e){ toast('Não consegui gerar o PDF: '+e.message,5000); $('#encerrar').disabled=false; $('#encerrar').textContent='Encerrar ficha e enviar'; }
}

window.FICHAS_DA_LINHA = FICHAS_DA_LINHA;
/* os três dados que NÃO se recuperam no poço (SOP-008): o app avisa, nunca trava */
function pendenciasCriticas(obraId){
  const ob=(S.pacote?.obras||[]).find(o=>o.id===obraId); if(!ob) return [];
  const o=[];
  if((ob.linhas||[]).includes('limpeza-poco')){ const lim=todas().filter(f=>f.obraId===obraId && f.tipo==='poco_limpeza');
    const sem=v=>v===''||v==null;
    if(!lim.length) o.push('Ficha de limpeza do poço não foi aberta no app (antes × depois)'); else {
    if(!lim.some(f=>!sem(f.dados.ne_ant)||f.dados.nao_mediu)) o.push('Nível estático de ANTES da limpeza');
    if(!lim.some(f=>!isNaN(qAntes(f.dados))||f.dados.nao_mediu)) o.push('Vazão de ANTES da limpeza');
    if(!lim.some(f=>!sem(f.dados.nd_estab))) o.push('Nível estabilizado no teste depois da limpeza');
    if(!lim.some(f=>!isNaN(qDepois(f.dados)))) o.push('Vazão final depois da limpeza'); } }
  if(!(ob.linhas||[]).includes('poco')) return o;
  const fs=todas().filter(f=>f.obraId===obraId), perf=fs.filter(f=>f.tipo==='poco_perf'), tes=fs.filter(f=>f.tipo==='poco_teste'), out=o;
  if(!perf.length) out.push('Ficha de perfuração não foi aberta no app (profundidade das camadas)');
  else if(!perf.some(f=>(f.dados.perfil||[]).some(l=>l.de!==''&&l.ate!==''&&l.de!=null&&l.ate!=null))) out.push('Perfil sem profundidade das camadas');
  if(!tes.length) out.push('Ficha do teste de bombeamento não foi aberta no app');
  else { if(!tes.some(f=>f.dados.estab)) out.push('Minuto em que o nível estabilizou'); if(!tes.some(f=>f.dados.volta)) out.push('Minuto em que o nível voltou ao NE'); }
  return out; }
function encerradasHoje(obraId){ const h=HOJE(); return todas().filter(f=>f.obraId===obraId && f.status==='encerrada' && f.encerradaEm && new Date(f.encerradaEm).toDateString()===new Date().toDateString()).length; }
window.FICHAS = { aliviarMemoria, pendenciasCriticas, encerradasHoje, secaoLista, ligarLista, abrir, fechar, aberta, fecharZoom, desenharEditor, gerarPDF, DEF, _novaFicha:novaFicha, _pegar:pegar, _fig:desenharFiguraGeof };
})();

/* ± : o teclado numérico do Android (inputmode decimal) não tem o sinal de menos.
   O botão troca o sinal do número do campo e avisa o campo (input), para gravar igual a uma digitação. */
document.addEventListener('click', e=>{ const b=e.target.closest('[data-sinal]'); if(!b) return; e.preventDefault();
  const el=document.getElementById(b.dataset.sinal); if(!el||el.disabled) return;
  let v=el.value.trim().replace(/^[−–]/,'-');
  v = v.startsWith('-') ? v.slice(1) : (v ? '-'+v : '-');
  el.value=v; el.dispatchEvent(new Event('input',{bubbles:true}));
  if(navigator.vibrate) try{ navigator.vibrate(15); }catch(_){}
});
