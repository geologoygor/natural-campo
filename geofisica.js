(function(){
/* ============================================================
   geofisica.js — NÚCLEO DE CÁLCULO (offline, sem biblioteca)
   Natural Engenharia · app de campo
   Porte do motor do escritório (sev1d.py / processa_caminhamento.py):
     - Bessel J0/J1: Abramowitz & Stegun 9.4.1-9.4.6
     - kernel T(λ): recorrência de Pekeris
     - ρa Schlumberger/Wenner/polo-polo: integral de Hankel com a parte
       homogênea resolvida analiticamente (só T-ρ1 vai para a quadratura)
     - inversão de camadas: Levenberg-Marquardt em log ρ e log espessura
   ============================================================ */

/* ---------- Bessel (A&S, erro < 1e-7) ---------- */
function J0(x){
  x = Math.abs(x);
  if (x < 3){
    const t = (x/3)*(x/3);
    return 1 + t*(-2.2499997 + t*(1.2656208 + t*(-0.3163866 + t*(0.0444479 + t*(-0.0039444 + t*0.00021)))));
  }
  const t = 3/x;
  const f = 0.79788456 + t*(-0.00000077 + t*(-0.00552740 + t*(-0.00009512 + t*(0.00137237 + t*(-0.00072805 + t*0.00014476)))));
  const th = x - 0.78539816 + t*(-0.04166397 + t*(-0.00003954 + t*(0.00262573 + t*(-0.00054125 + t*(-0.00029333 + t*0.00013558)))));
  return f*Math.cos(th)/Math.sqrt(x);
}
function J1(x){
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  if (x < 3){
    const t = (x/3)*(x/3);
    return s*x*(0.5 + t*(-0.56249985 + t*(0.21093573 + t*(-0.03954289 + t*(0.00443319 + t*(-0.00031761 + t*0.00001109))))));
  }
  const t = 3/x;
  const f = 0.79788456 + t*(0.00000156 + t*(0.01659667 + t*(0.00017105 + t*(-0.00249511 + t*(0.00113653 + t*(-0.00020033))))));
  const th = x - 2.35619449 + t*(0.12499612 + t*(0.00005650 + t*(-0.00637879 + t*(0.00074348 + t*(0.00079824 + t*(-0.00029166))))));
  return s*f*Math.cos(th)/Math.sqrt(x);
}

/* ---------- kernel de Pekeris ----------
   T_n = ρ_n ; T_i = [T_{i+1} + ρ_i·tanh(λh_i)] / [1 + T_{i+1}·tanh(λh_i)/ρ_i]   */
function kernel(lam, rho, esp){
  const n = rho.length, out = new Float64Array(lam.length);
  for (let k = 0; k < lam.length; k++){
    let T = rho[n-1];
    for (let i = n-2; i >= 0; i--){
      const th = Math.tanh(lam[k]*esp[i]);
      T = (T + rho[i]*th) / (1 + T*th/rho[i]);
    }
    out[k] = T;
  }
  return out;
}

/* ---------- grade de integração ----------
   log até ~1/x (onde o resto é suave), depois linear para resolver a
   oscilação de J₁ (período 2π/x); λmax ditado pela camada mais fina,
   porque o resto decai como e^(−2λh).                              */
const NLOG = 140, PPO = 16;      // validados contra o motor: erro ≤ 0,7 %
const NLOG_R = 70, PPO_R = 8;    // grade rápida: só dentro do laço da inversão
function grade(xi, esp, rapida){
  let fina = Infinity, prof = 0;
  for (const e of esp){ if (e < fina) fina = e; prof += e; }
  if (!isFinite(fina) || fina <= 0) fina = 1;
  const l1 = 1e-5/Math.max(xi, prof || xi), l2 = 15/fina, la = Math.min(1/xi, l2/2);
  const nl = rapida ? NLOG_R : NLOG, pp = rapida ? PPO_R : PPO;
  const g = [];
  const a = Math.log(l1), b = Math.log(Math.max(la, l1*1.000001));
  for (let i = 0; i < nl; i++) g.push(Math.exp(a + (b-a)*i/(nl-1)));
  const passo = Math.PI/(pp*xi);
  for (let v = la + passo; v < l2; v += passo) g.push(v);
  g.push(l2);
  return Float64Array.from(g);
}
function simpson(y, x){ // trapézio sobre grade irregular (Simpson não vale em grade desigual)
  let s = 0;
  for (let i = 1; i < x.length; i++) s += (x[i]-x[i-1])*(y[i]+y[i-1])/2;
  return s;
}

/* ---------- ρa direto ----------
   x = AB/2 (Schlumberger) | a (Wenner) | r (polo-polo)          */
function rhoA(arranjo, xs, rho, esp, rapida){
  const E = (esp && esp.length) ? esp : [1];
  const r1 = rho[0], out = new Float64Array(xs.length);
  for (let i = 0; i < xs.length; i++){
    const xi = xs[i], lam = grade(xi, E, rapida), T = kernel(lam, rho, E);
    const y = new Float64Array(lam.length);
    if (arranjo === 'schlumberger'){          // ρa = ρ1 + x² ∫ (T−ρ1) J₁(λx) λ dλ
      for (let k = 0; k < lam.length; k++) y[k] = (T[k]-r1)*J1(lam[k]*xi)*lam[k];
      out[i] = r1 + xi*xi*simpson(y, lam);
    } else if (arranjo === 'wenner'){         // ρa = ρ1 + 2x ∫ (T−ρ1)[J₀(λx)−J₀(2λx)] dλ
      for (let k = 0; k < lam.length; k++) y[k] = (T[k]-r1)*(J0(lam[k]*xi)-J0(2*lam[k]*xi));
      out[i] = r1 + 2*xi*simpson(y, lam);
    } else {                                  // polo-polo: ρa = ρ1 + x ∫ (T−ρ1) J₀(λx) dλ
      for (let k = 0; k < lam.length; k++) y[k] = (T[k]-r1)*J0(lam[k]*xi);
      out[i] = r1 + xi*simpson(y, lam);
    }
  }
  return out;
}

/* ---------- inversão automática de Zohdy (1989) ----------
   Determinística e à prova de mínimo local: o modelo de partida É a curva
   de campo (ρ da camada = ρa medida; profundidade = AB/2 × fator). Ajusta
   primeiro a escala de profundidade, depois corrige cada resistividade pela
   razão medido/calculado. Dá um modelo de muitas camadas (perfil suave) —
   que é o que o campo precisa: onde está o intervalo condutivo.
   O modelo de poucas camadas com análise de equivalência fica no escritório. */
function zohdy(arranjo, xs, obs, opt){
  opt = opt || {};
  const nIt = opt.iter || 14;
  const n = xs.length;
  const rms = calc => { let s = 0; for (let i = 0; i < n; i++){ const r = Math.log(obs[i]/calc[i]); s += r*r; }
                        return 100*Math.sqrt(s/n); };
  const modelo = (rho, fator) => {
    const prof = xs.map(x => x*fator);
    const esp = []; for (let i = 0; i < n-1; i++) esp.push(Math.max(prof[i] - (i ? prof[i-1] : 0), 1e-3));
    return { rho: rho.slice(), esp, prof: prof.slice(0, n-1) };
  };
  /* 1 · escala de profundidade */
  let melhor = null;
  for (let f = 0.20; f <= 0.85; f += 0.05){
    const m = modelo(obs, f), c = Array.from(rhoA(arranjo, xs, m.rho, m.esp, true)), e = rms(c);
    if (!melhor || e < melhor.e) melhor = { f, e, rho: m.rho, esp: m.esp, calc: c };
  }
  /* 2 · corrige resistividade camada por camada pela razão medido/calculado */
  let rho = melhor.rho.slice(), esp = melhor.esp, calc = melhor.calc, e = melhor.e;
  let bRho = rho.slice(), bCalc = calc.slice(), bE = e;
  for (let it = 0; it < nIt; it++){
    const nova = rho.map((r, i) => Math.min(1e6, Math.max(0.5, r*Math.pow(obs[i]/calc[i], 1.0))));
    const c = Array.from(rhoA(arranjo, xs, nova, esp, true)), en = rms(c);
    rho = nova; calc = c;
    if (en < bE){ bE = en; bRho = nova.slice(); bCalc = c.slice(); }
    else if (en > bE*1.5) break;              // divergiu: para e fica com o melhor
  }
  /* 3 · refino na grade acurada: tira o viés que a grade rápida deixa no modelo */
  bCalc = Array.from(rhoA(arranjo, xs, bRho, esp));
  bE = rms(bCalc);
  for (let it = 0; it < 4; it++){
    const nova = bRho.map((r, i) => Math.min(1e6, Math.max(0.5, r*(obs[i]/bCalc[i]))));
    const c = Array.from(rhoA(arranjo, xs, nova, esp)), en = rms(c);
    if (en < bE){ bE = en; bRho = nova; bCalc = c; } else break;
  }
  let abs = 0; for (let i = 0; i < n; i++) abs += Math.abs(Math.log(obs[i]/bCalc[i]));
  return { rho: bRho, esp, prof: melhor.f ? xs.slice(0, n-1).map(x => x*melhor.f) : [],
           fator: melhor.f, calculada: bCalc, rms: bE, erro: 100*abs/n, camadas: n };
}
/* resume o perfil suave em intervalos: junta camadas vizinhas parecidas */
function intervalos(rho, prof, tol){
  tol = tol || 0.18;                          // 18 % em log: mesma "unidade geoelétrica"
  const out = []; let i = 0;
  const topo = k => k === 0 ? 0 : prof[k-1];
  while (i < rho.length){
    let j = i, soma = Math.log(rho[i]), cnt = 1;
    while (j+1 < rho.length && Math.abs(Math.log(rho[j+1]) - soma/cnt) < tol){ j++; soma += Math.log(rho[j]); cnt++; }
    out.push({ de: topo(i), ate: j >= prof.length ? null : prof[j], rho: Math.exp(soma/cnt) });
    i = j+1;
  }
  return out;
}

/* ============================================================
   CAMINHAMENTO ELÉTRICO — polo-polo (e dipolo-dipolo / polo-dipolo)
   Mesma conta do motor do escritório (processa_caminhamento.py):
     ΔV = V − SP ;  ρa = K·ΔV/I  com K EXATO pelas posições reais
     K = 2π / (1/|AM| − 1/|AN| − 1/|BM| + 1/|BN|) ; remoto ausente = infinito
     ponto do dado: x = (A+M)/2 ; pseudoprof. = 0,867·AM (Edwards 1977)
   ============================================================ */
function Kexato(A, B, M, N){
  const g = (p, q) => (p == null || q == null || !isFinite(p) || !isFinite(q)) ? 0 : 1/Math.abs(p-q);
  const d = g(A,M) - g(A,N) - g(B,M) + g(B,N);
  return d === 0 ? NaN : 2*Math.PI/d;
}
function processarCaminhamento(cfg, leituras){
  const a = Number(cfg.a) || 20, Bx = cfg.Bx == null || cfg.Bx === '' ? null : Number(cfg.Bx),
        Nx = cfg.Nx == null || cfg.Nx === '' ? null : Number(cfg.Nx);
  const brutos = [];
  for (let i = 0; i < leituras.length; i++){
    const L = leituras[i];
    const A = Number(L.fixo), M = Number(L.movel), sp = Number(L.sp||0), v = Number(L.mv), I = Number(L.ma);
    if (!isFinite(A) || !isFinite(M) || !isFinite(v) || !isFinite(I) || I === 0 || A === M) continue;
    const dv = v - sp, K = Kexato(A, Bx, M, Nx), rho = K*dv/I;
    brutos.push({ i, A, M, sep: Math.abs(M-A), n: Math.round(Math.abs(M-A)/a),
                  x: (A+M)/2, z: 0.867*Math.abs(M-A), K, dv, I, rho, sit: 'ok' });
  }
  if (!brutos.length) return { pontos: [], niveis: [], qc: { total: 0, usadas: 0, avisos: ['Nenhuma leitura válida.'] } };
  /* sinal: a polaridade da maioria manda; leitura invertida é erro de ligação */
  const med = brutos.map(r => r.rho).sort((p,q) => p-q)[Math.floor(brutos.length/2)];
  const s = med < 0 ? -1 : 1;
  for (const r of brutos){
    r.rhoAbs = Math.abs(r.rho);
    if (r.rho*s < 0) r.sit = 'sinal invertido';
    else if (!isFinite(r.rhoAbs) || r.rhoAbs <= 0) r.sit = 'valor impossível';
  }
  /* discrepante em relação à vizinhança (mesmo nível, ±1,5a) — critério do motor */
  const ok0 = brutos.filter(r => r.sit === 'ok');
  for (const r of ok0){
    const viz = ok0.filter(q => q !== r && Math.abs(q.n-r.n) <= 1 && Math.abs(q.x-r.x) <= 1.5*a).map(q => q.rhoAbs);
    if (viz.length >= 3){
      const m = viz.slice().sort((p,q)=>p-q)[Math.floor(viz.length/2)];
      const f = r.rhoAbs/m;
      if (f > 4 || f < 0.25) r.sit = 'fora da vizinhança';
    }
  }
  const pontos = brutos.filter(r => r.sit === 'ok');
  const niveis = [...new Set(pontos.map(r => r.n))].sort((p,q)=>p-q);
  const avisos = [];
  const desc = brutos.length - pontos.length;
  if (desc) avisos.push(`${desc} de ${brutos.length} leituras fora do padrão (não entram no gráfico).`);
  if (Bx == null || Nx == null) avisos.push('Posição dos eletrodos remotos em branco: K sai aproximado.');
  else {
    const xs = pontos.map(r => r.x), x0 = Math.min(...pontos.map(r=>r.A)), x1 = Math.max(...pontos.map(r=>r.M));
    if (Math.abs(Bx - x0) < 2*a) avisos.push(`Remoto B a ${Math.abs(Bx-x0).toFixed(0)} m do início: perto demais (o ideal é ≥ ${(5*a).toFixed(0)} m).`);
    if (Math.abs(Nx - x1) < 2*a) avisos.push(`Remoto N a ${Math.abs(Nx-x1).toFixed(0)} m do fim: perto demais (o ideal é ≥ ${(5*a).toFixed(0)} m).`);
  }
  return { pontos, niveis, a,
    qc: { total: brutos.length, usadas: pontos.length, avisos,
          rhoMin: pontos.length ? Math.min(...pontos.map(r=>r.rhoAbs)) : 0,
          rhoMax: pontos.length ? Math.max(...pontos.map(r=>r.rhoAbs)) : 0,
          profMax: pontos.length ? Math.max(...pontos.map(r=>r.z)) : 0 } };
}

/* ---------- contorno da cobertura (como o Res2DInv): por nível ---------- */
function coberturaPoly(pontos, a){
  const porN = {};
  for (const p of pontos){ (porN[p.n] = porN[p.n] || []).push(p); }
  const ns = Object.keys(porN).map(Number).sort((x,y)=>x-y);
  const dir = [], esq = [];
  for (const n of ns){
    const g = porN[n], z = g[0].z;
    dir.push([Math.max(...g.map(p=>p.x)), z]);
    esq.push([Math.min(...g.map(p=>p.x)), z]);
  }
  const xs = pontos.map(p=>p.x);
  return [[Math.min(...xs)-a/2, 0], [Math.max(...xs)+a/2, 0], ...dir, ...esq.reverse()];
}
function dentroPoly(px, pz, poly){
  let d = false;
  for (let i = 0, j = poly.length-1; i < poly.length; j = i++){
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (((zi > pz) !== (zj > pz)) && (px < (xj-xi)*(pz-zi)/(zj-zi)+xi)) d = !d;
  }
  return d;
}

/* ---------- MELHOR ESTACA PARA PERFURAR (indicação de campo) ----------
   Não é "o menor ρa da linha": argila de capeamento é o menor valor e não
   serve. Procura zona de resistividade INTERMEDIÁRIA (rocha fraturada
   saturada) dentro da janela de profundidade útil, com contraste em relação
   ao resto da linha, continuidade vertical e longe das bordas (onde a
   cobertura do ensaio é pobre).                                          */
function melhorEstaca(res, alvo){
  const P = res.pontos, a = res.a;
  if (P.length < 6) return null;
  alvo = Object.assign({ rMin: 100, rMax: 600, zMin: 8, zMax: 60, extremo: 'min' }, alvo || {});
  const zTop = Math.min(alvo.zMax, Math.max(...P.map(p=>p.z)));
  const janela = P.filter(p => p.z >= alvo.zMin && p.z <= zTop);
  if (janela.length < 4) return null;
  const medGeral = mediana(janela.map(p=>p.rhoAbs));
  const xs = [...new Set(P.map(p=>p.A)), ...new Set(P.map(p=>p.M))].sort((u,v)=>u-v);
  const xIni = Math.min(...xs), xFim = Math.max(...xs);
  const cand = [];
  for (const xc of [...new Set(xs)]){
    const col = janela.filter(p => Math.abs(p.x-xc) <= 0.75*a);
    if (col.length < 3) continue;
    const dentro = col.filter(p => p.rhoAbs >= alvo.rMin && p.rhoAbs <= alvo.rMax);
    const fracao = dentro.length/col.length;
    const medCol = mediana(col.map(p=>p.rhoAbs));
    /* o contraste segue o terreno: no cristalino a coluna boa é MAIS CONDUTIVA
       que o resto da linha; no sedimentar de Boa Vista é MAIS RESISTIVA */
    const contraste = Math.min(3, Math.max(0.4,
      alvo.extremo === 'max' ? medCol/medGeral : medGeral/medCol));
    const zs = dentro.map(p=>p.z);
    const ext = zs.length ? (Math.max(...zs)-Math.min(...zs))/Math.max(1, zTop-alvo.zMin) : 0;
    const borda = Math.min(1, Math.min(xc-xIni, xFim-xc)/(1.5*a));
    const nota = fracao*(0.45+0.55*ext)*contraste*borda;
    cand.push({ x: xc, nota, fracao, contraste, ext, borda, medCol,
                z0: zs.length ? Math.min(...zs) : null, z1: zs.length ? Math.max(...zs) : null,
                rho: dentro.length ? mediana(dentro.map(p=>p.rhoAbs)) : medCol, npts: col.length });
  }
  if (!cand.length) return null;
  cand.sort((u,v) => v.nota-u.nota);
  const b = cand[0], avisos = [];
  if (b.nota < 0.25) avisos.push('Indicação fraca: nenhuma estaca se destaca. Vale estender a linha ou mudar o azimute.');
  if (b.borda < 1) avisos.push('A estaca escolhida está perto da ponta da linha, onde o ensaio enxerga menos.');
  if (b.fracao < 0.5) avisos.push(`Só ${Math.round(100*b.fracao)} % das leituras da coluna caem na faixa de alvo.`);
  if (b.contraste < 1.1) avisos.push('Pouco contraste com o resto da linha: a anomalia é discreta.');
  return { melhor: b, segundo: cand[1] || null, todos: cand, medGeral, alvo, zTop, avisos };
}
function mediana(v){ const s = v.slice().sort((p,q)=>p-q); const n = s.length;
  return n ? (n%2 ? s[(n-1)/2] : (s[n/2-1]+s[n/2])/2) : 0; }

/* ============================================================
   FIGURAS — padrão Natural Engenharia (layout tipo Res2DInv)
   Mesmas cores e mesmos rótulos de figura.py / figura_sev.py:
   R2D 17 cores, níveis em log, NAVY/GREEN/GRAY, barra de rodapé.
   ============================================================ */
const NAVY = '#14284D', GREEN = '#00A651', GRAY = '#5B6570', VERM = '#D6202B';
const R2D = ['#000080','#0000AA','#0000E6','#003CFF','#008CFF','#00DCFF','#00BE8C','#00E600','#008C00',
             '#82C800','#FFFF00','#BE8C00','#FF8C00','#FF0000','#C80000','#8C003C','#6E006E'];
const VIRIDIS = ['#440154','#482878','#3E4A89','#31688E','#26828E','#1F9E89','#35B779','#6ECE58','#B5DE2B','#FDE725'];
function pct(v, p){ const s = v.slice().sort((a,b)=>a-b); const i = (s.length-1)*p/100;
  const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi]-s[lo])*(i-lo); }
function niveisLog(vals){
  let lo = pct(vals, 2), hi = pct(vals, 98);
  if (!(lo > 0)) lo = Math.max(1e-3, Math.min(...vals.filter(v=>v>0)) || 1);
  if (!(hi > lo)) hi = lo*10;
  const n = R2D.length-1, out = [];
  for (let i = 0; i < n; i++) out.push(Math.exp(Math.log(lo) + (Math.log(hi)-Math.log(lo))*i/(n-1)));
  return out;
}
function corDe(v, niveis){
  let i = 0; while (i < niveis.length && v >= niveis[i]) i++;
  return R2D[Math.min(R2D.length-1, i)];
}
function viridisFaixa(rho){ const v = rho.filter(r=>r>0);
  let lo = Math.log10(Math.min(...v)), hi = Math.log10(Math.max(...v));
  if (hi-lo < 0.5){ const m=(lo+hi)/2; lo=m-0.25; hi=m+0.25; }
  return r => { const t = Math.min(1, Math.max(0, (Math.log10(Math.max(r,1))-lo)/(hi-lo)));
    return VIRIDIS[Math.min(VIRIDIS.length-1, Math.round(t*(VIRIDIS.length-1)))]; }; }
function fmtN(v){ const s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(0) : v.toFixed(1);
  return s.replace('.', ','); }

function moldura(c, W, H, cab, titulo, logo){
  c.fillStyle = '#fff'; c.fillRect(0,0,W,H);
  if (logo){ const lw = W*0.20, lh = lw*logo.height/logo.width; c.drawImage(logo, W*0.035, H*0.022, lw, lh); }
  c.textAlign = 'right'; c.fillStyle = NAVY; c.font = '700 26px Arial, Helvetica, sans-serif';
  c.fillText(cab, W*0.965, H*0.055);
  c.fillStyle = GREEN; c.font = '700 19px Arial, Helvetica, sans-serif';
  c.fillText(titulo, W*0.965, H*0.085);
  c.fillStyle = GREEN; c.fillRect(W*0.035, H*0.105, W*0.93, 3);
  c.textAlign = 'left';
}
function rodape(c, W, H, subtitulo, infoDir){
  c.fillStyle = NAVY; c.fillRect(0, H-30, W, 30);
  c.fillStyle = '#fff'; c.font = '700 15px Arial, Helvetica, sans-serif'; c.textAlign = 'left';
  c.fillText('NATURAL ENGENHARIA', W*0.035, H-10);
  c.font = '400 14px Arial, Helvetica, sans-serif'; c.textAlign = 'right';
  c.fillText('Resp. técnico: Ygor Sthefan de Sousa – Geólogo – CREA/RR 091754129-4', W*0.965, H-10);
  if (subtitulo){ c.fillStyle = GRAY; c.font = '400 14px Arial, Helvetica, sans-serif'; c.textAlign = 'right';
    c.fillText(subtitulo, W*0.965, H-42); }
  if (infoDir){ c.fillStyle = NAVY; c.font = '700 15px Arial, Helvetica, sans-serif'; c.textAlign = 'left';
    c.fillText(infoDir, W*0.07, H-42); }
  c.textAlign = 'left';
}
function escalaCor(c, W, H, niveis, rotulo, y){
  const n = R2D.length, x0 = W*0.07, wb = W*0.0215, hb = 20;
  for (let j = 0; j < n; j++){
    c.fillStyle = R2D[j]; c.fillRect(x0 + j*wb*1.18, y, wb, hb);
    c.strokeStyle = NAVY; c.lineWidth = 0.5; c.strokeRect(x0 + j*wb*1.18, y, wb, hb);
  }
  c.fillStyle = NAVY; c.font = '400 13px Arial, Helvetica, sans-serif'; c.textAlign = 'center';
  niveis.forEach((v, j) => { if (j % 2 === 0) c.fillText(fmtN(v), x0 + (j+1)*wb*1.18 - wb*0.09, y + hb + 15); });
  c.font = '700 15px Arial, Helvetica, sans-serif';
  c.fillText(rotulo, x0 + n*wb*1.18/2, y + hb + 36);
  c.textAlign = 'left';
}
function eixoPainel(c, X, Y, LW, LH, xmin, xmax, zmax, rotY, titulo){
  c.strokeStyle = NAVY; c.lineWidth = 1.2; c.strokeRect(X, Y, LW, LH);
  c.fillStyle = NAVY; c.font = '400 13px Arial, Helvetica, sans-serif';
  const passo = escolherPasso(xmax-xmin);
  c.textAlign = 'center';
  for (let v = Math.ceil(xmin/passo)*passo; v <= xmax; v += passo){
    const px = X + (v-xmin)/(xmax-xmin)*LW;
    c.beginPath(); c.moveTo(px, Y); c.lineTo(px, Y+6); c.stroke();
    c.fillText(String(v), px, Y-6);
  }
  c.textAlign = 'left'; c.fillText('m', X+LW+8, Y+14);
  c.textAlign = 'right';
  const pz = escolherPasso(zmax);
  for (let v = 0; v <= zmax; v += pz){
    const py = Y + v/zmax*LH;
    c.beginPath(); c.moveTo(X, py); c.lineTo(X+6, py); c.stroke();
    c.fillText(String(v), X-8, py+4);
  }
  c.save(); c.translate(X-46, Y+LH/2); c.rotate(-Math.PI/2);
  c.textAlign = 'center'; c.font = '400 14px Arial, Helvetica, sans-serif'; c.fillText(rotY, 0, 0); c.restore();
  c.textAlign = 'left'; c.fillStyle = GREEN; c.fillRect(X, Y+LH+14, 5, 17);
  c.fillStyle = NAVY; c.font = '700 16px Arial, Helvetica, sans-serif'; c.fillText(titulo, X+14, Y+LH+28);
}
function escolherPasso(faixa){
  const alvo = faixa/8, p = Math.pow(10, Math.floor(Math.log10(alvo)));
  for (const m of [1,2,2.5,5,10]) if (p*m >= alvo) return p*m;
  return p*10;
}

/* bloco de leitura direta, em baixo das duas figuras (texto à esquerda, avisos à direita) */
function blocoLeitura(c, W, y, alt, titulo, linhas, avisos){
  const X = W*0.07, LW = W*0.895, COL = LW*0.60;
  c.fillStyle = '#F7F9FB'; c.fillRect(X, y, LW, alt);
  c.strokeStyle = '#D9DEE5'; c.lineWidth = 1; c.strokeRect(X, y, LW, alt);
  c.fillStyle = GREEN; c.fillRect(X, y, 5, alt);
  c.fillStyle = NAVY; c.font = '700 17px Arial, Helvetica, sans-serif'; c.textAlign = 'left';
  c.fillText(titulo, X+16, y+24);
  let yy = y+50;
  for (const l of linhas){
    if (yy > y+alt-26) break;
    if (l.cor){ c.fillStyle = l.cor; c.fillRect(X+16, yy-11, 12, 12); }
    c.fillStyle = l.forte ? NAVY : '#1B2430';
    c.font = (l.forte ? '700 ' : '400 ') + '16px Arial, Helvetica, sans-serif';
    c.fillText(l.t, X+(l.cor?36:16), yy);
    yy += 23;
  }
  if (avisos && avisos.length){
    let ay = y+50; const aw = LW-COL-30;
    c.fillStyle = '#8A5200';
    for (const a of avisos){
      c.font = 'italic 400 13.5px Arial, Helvetica, sans-serif';
      let ln = '· ';
      for (const w of String(a).split(/\s+/)){
        const tt = ln === '· ' ? ln+w : ln+' '+w;
        if (c.measureText(tt).width > aw && ln !== '· '){
          if (ay > y+alt-26) break;
          c.fillText(ln, X+COL+10, ay); ay += 17; ln = '   '+w;
        } else ln = tt;
      }
      if (ay <= y+alt-26 && ln.trim()){ c.fillText(ln, X+COL+10, ay); ay += 21; }
    }
  }
  c.fillStyle = GRAY; c.font = 'italic 400 13px Arial, Helvetica, sans-serif';
  c.fillText(FRASE_PADRAO, X+16, y+alt-9);
}

/* ---------- FIGURA 1 · pseudo-seção do caminhamento ---------- */
function figuraCaminhamento(cv, o){
  const W = cv.width, H = cv.height, c = cv.getContext('2d');
  const res = o.res, P = res.pontos;
  moldura(c, W, H, 'CAMINHAMENTO ELÉTRICO 2D', o.titulo || '', o.logo);
  if (!P.length){ c.fillStyle = GRAY; c.font = '400 20px Arial'; c.fillText('Sem leitura válida para desenhar.', W*0.07, H*0.3); return; }
  const niveis = niveisLog(P.map(p=>p.rhoAbs));
  const xs = P.map(p=>p.x), a = res.a;
  const xmin = Math.min(...xs)-a/2, xmax = Math.max(...xs)+a/2, zmax = Math.max(...P.map(p=>p.z))*1.06;
  const X = W*0.085, LW = W*0.875, Y = H*0.165, LH = H*0.330;
  c.fillStyle = NAVY; c.font = '700 15px Arial, Helvetica, sans-serif'; c.textAlign = 'right';
  c.fillText(`${res.qc.usadas} de ${res.qc.total} leituras usadas  ·  resistividade aparente de ${fmtN(res.qc.rhoMin)} a ${fmtN(res.qc.rhoMax)} Ω·m`, X+LW, H*0.133);
  c.textAlign = 'left';
  const poly = coberturaPoly(P, a);
  /* preenchimento por distância inversa, recortado na cobertura */
  const px2x = px => xmin + (px-X)/LW*(xmax-xmin), py2z = py => (py-Y)/LH*zmax;
  const passo = 2;
  for (let py = Y; py < Y+LH; py += passo){
    const z = py2z(py);
    for (let pxx = X; pxx < X+LW; pxx += passo){
      const x = px2x(pxx);
      if (!dentroPoly(x, z, poly)) continue;
      let sw = 0, sv = 0;
      for (const p of P){
        const dx = (p.x-x)/a, dz = (p.z-z)/(a*0.9);
        const d2 = dx*dx + dz*dz;
        if (d2 > 9) continue;
        const w = 1/(d2 + 0.02); sw += w; sv += w*Math.log(p.rhoAbs);
      }
      if (!sw) continue;
      c.fillStyle = corDe(Math.exp(sv/sw), niveis);
      c.fillRect(pxx, py, passo, passo);
    }
  }
  /* pontos medidos + eletrodos */
  c.fillStyle = '#000';
  for (const p of P){
    const pxx = X + (p.x-xmin)/(xmax-xmin)*LW, py = Y + p.z/zmax*LH;
    c.beginPath(); c.arc(pxx, py, 1.8, 0, 6.2832); c.fill();
  }
  const els = [...new Set([...P.map(p=>p.A), ...P.map(p=>p.M)])].sort((u,v)=>u-v);
  c.fillStyle = NAVY;
  for (const e of els){
    const pxx = X + (e-xmin)/(xmax-xmin)*LW;
    c.beginPath(); c.moveTo(pxx-5, Y-9); c.lineTo(pxx+5, Y-9); c.lineTo(pxx, Y); c.closePath(); c.fill();
  }
  eixoPainel(c, X, Y, LW, LH, xmin, xmax, zmax, o.rotZ || 'Pseudoprof. (m)', 'Seção de resistividade aparente medida');
  /* marca da estaca indicada */
  if (o.loc && o.loc.melhor){
    const b = o.loc.melhor, pxx = X + (b.x-xmin)/(xmax-xmin)*LW;
    c.strokeStyle = VERM; c.lineWidth = 4; c.beginPath(); c.moveTo(pxx, Y); c.lineTo(pxx, Y+LH*0.62); c.stroke();
    c.strokeStyle = '#fff'; c.lineWidth = 1.4; c.setLineDash([5,5]);
    c.beginPath(); c.moveTo(pxx, Y); c.lineTo(pxx, Y+LH*0.62); c.stroke(); c.setLineDash([]);
    c.strokeStyle = VERM; c.lineWidth = 4.5; c.beginPath(); c.moveTo(pxx-11, Y); c.lineTo(pxx+11, Y); c.stroke();
    c.fillStyle = VERM; c.beginPath(); c.moveTo(pxx-9, Y-16); c.lineTo(pxx+9, Y-16); c.lineTo(pxx, Y-3); c.closePath(); c.fill();
    const rot = `ESTACA ${fmtN(b.x)} m`;
    c.font = '700 16px Arial, Helvetica, sans-serif'; c.textAlign = 'center';
    const w = c.measureText(rot).width + 16;
    const bx = Math.min(Math.max(pxx-w/2, X+4), X+LW-w-4), by = Y+LH*0.70;
    c.fillStyle = '#fff'; c.fillRect(bx, by, w, 24);
    c.strokeStyle = VERM; c.lineWidth = 1.4; c.strokeRect(bx, by, w, 24);
    c.fillStyle = VERM; c.fillText(rot, bx+w/2, by+17); c.textAlign = 'left';
  }
  /* painel 2 · ρa média por estaca na janela (a curva da decisão) */
  const Y2 = H*0.565, LH2 = H*0.095;
  const cols = (o.loc && o.loc.todos) ? o.loc.todos.slice().sort((u,v)=>u.x-v.x) : [];
  if (cols.length){
    const nTop = Math.max(...cols.map(k=>k.nota)) || 1;   // a melhor estaca = 100 %
    const nmax = 1.18;
    c.strokeStyle = NAVY; c.lineWidth = 1.2; c.strokeRect(X, Y2, LW, LH2);
    const fx = v => X + (v-xmin)/(xmax-xmin)*LW;
    const fy = v => Y2 + LH2 - Math.min(1, (v/nTop)/nmax)*LH2;
    const lg = LW/(cols.length*1.9);
    for (const k of cols){
      const h = Y2+LH2-fy(k.nota);
      c.fillStyle = (o.loc.melhor && k.x === o.loc.melhor.x) ? VERM
                  : (o.loc.segundo && k.x === o.loc.segundo.x) ? '#E8A33D' : '#9AA6B4';
      c.fillRect(fx(k.x)-lg, fy(k.nota), lg*2, h);
    }
    if (o.loc.melhor){
      const px = fx(o.loc.melhor.x);
      c.fillStyle = VERM; c.font = '700 14px Arial'; c.textAlign = 'center';
      c.fillText('melhor', px, fy(o.loc.melhor.nota)-7);
      c.textAlign = 'left';
    }
    c.fillStyle = NAVY; c.font = '400 13px Arial'; c.textAlign = 'right';
    c.fillText('100%', X-8, fy(nTop)+4); c.fillText('0', X-8, Y2+LH2);
    c.save(); c.translate(X-48, Y2+LH2/2); c.rotate(-Math.PI/2); c.textAlign='center';
    c.font='400 13px Arial'; c.fillText('nota relativa', 0, 0); c.restore();
    c.textAlign = 'left'; c.fillStyle = GREEN; c.fillRect(X, Y2+LH2+13, 5, 16);
    c.fillStyle = NAVY; c.font = '700 16px Arial';
    c.fillText('Nota da anomalia por estaca — foi ela que escolheu o ponto', X+14, Y2+LH2+26);
    c.font = '400 13px Arial'; c.fillStyle = GRAY;
    c.fillText(`faixa de alvo ${fmtN(o.loc.alvo.rMin)}–${fmtN(o.loc.alvo.rMax)} Ω·m entre ${fmtN(o.loc.alvo.zMin)} e ${fmtN(o.loc.zTop)} m de profundidade investigada`, X+14, Y2+LH2+44);
  }
  escalaCor(c, W, H, niveis, 'Resistividade aparente (Ω·m)', H*0.725);
  c.fillStyle = NAVY; c.font = '700 15px Arial'; c.textAlign = 'right';
  c.fillText(`Espaçamento unitário dos eletrodos: ${fmtN(res.a)} m`, W*0.965, H*0.725+56);
  c.textAlign = 'left';
  if (o.leitura) blocoLeitura(c, W, H*0.800, H*0.152, o.leitura.titulo, o.leitura.linhas, o.leitura.avisos);
  rodape(c, W, H, o.subtitulo || '', '');
}

/* ---------- FIGURA 2 · SEV ---------- */
function figuraSEV(cv, o){
  const W = cv.width, H = cv.height, c = cv.getContext('2d');
  moldura(c, W, H, 'SONDAGEM ELÉTRICA VERTICAL', o.titulo || '', o.logo);
  const x = o.x, obs = o.obs, calc = o.calc, rho = o.rho, prof = o.prof;
  if (!x || x.length < 3){ c.fillStyle = GRAY; c.font='400 20px Arial'; c.fillText('Poucas medidas para desenhar a curva.', W*0.07, H*0.3); return; }
  const X = W*0.09, LW = W*0.50, Y = H*0.150, LH = H*0.500;
  const todos = obs.concat(calc||[]).filter(v=>v>0);
  const vmin = Math.min(...todos)/1.35, vmax = Math.max(...todos)*1.35;
  const xmin = Math.min(...x)/1.25, xmax = Math.max(...x)*1.25;
  const fx = v => X + (Math.log(v)-Math.log(xmin))/(Math.log(xmax)-Math.log(xmin))*LW;
  const fy = v => Y + LH - (Math.log(v)-Math.log(vmin))/(Math.log(vmax)-Math.log(vmin))*LH;
  /* grade log */
  c.strokeStyle = '#CCD3DD'; c.lineWidth = 0.8;
  for (let d = Math.floor(Math.log10(xmin)); d <= Math.ceil(Math.log10(xmax)); d++)
    for (let m = 1; m < 10; m++){ const v = m*Math.pow(10,d); if (v < xmin || v > xmax) continue;
      c.beginPath(); c.moveTo(fx(v), Y); c.lineTo(fx(v), Y+LH); c.stroke(); }
  for (let d = Math.floor(Math.log10(vmin)); d <= Math.ceil(Math.log10(vmax)); d++)
    for (let m = 1; m < 10; m++){ const v = m*Math.pow(10,d); if (v < vmin || v > vmax) continue;
      c.beginPath(); c.moveTo(X, fy(v)); c.lineTo(X+LW, fy(v)); c.stroke(); }
  c.strokeStyle = NAVY; c.lineWidth = 1.2; c.strokeRect(X, Y, LW, LH);
  c.fillStyle = NAVY; c.font = '400 13px Arial'; c.textAlign = 'center';
  for (let d = Math.floor(Math.log10(xmin)); d <= Math.ceil(Math.log10(xmax)); d++)
    for (const m of [1,2,5]){ const v = m*Math.pow(10,d); if (v < xmin || v > xmax) continue;
      c.fillText(fmtN(v), fx(v), Y+LH+18); }
  c.textAlign = 'right';
  for (let d = Math.floor(Math.log10(vmin)); d <= Math.ceil(Math.log10(vmax)); d++)
    for (const m of [1,2,5]){ const v = m*Math.pow(10,d); if (v < vmin || v > vmax) continue;
      c.fillText(fmtN(v), X-8, fy(v)+4); }
  c.textAlign = 'center'; c.font = '400 14px Arial';
  c.fillText(o.rotX || 'AB/2 (m)', X+LW/2, Y+LH+44);
  c.save(); c.translate(X-52, Y+LH/2); c.rotate(-Math.PI/2);
  c.fillText('Resistividade aparente (Ω·m)', 0, 0); c.restore();
  /* calculada */
  if (calc && calc.length === x.length){
    c.strokeStyle = GREEN; c.lineWidth = 3; c.beginPath();
    x.forEach((v,i) => { const px=fx(v), py=fy(calc[i]); i?c.lineTo(px,py):c.moveTo(px,py); }); c.stroke(); }
  /* medida */
  c.fillStyle = NAVY;
  x.forEach((v,i) => { c.beginPath(); c.arc(fx(v), fy(obs[i]), 4.4, 0, 6.2832); c.fill(); });
  /* legenda */
  c.textAlign = 'left'; c.font = '400 14px Arial';
  c.fillStyle = NAVY; c.beginPath(); c.arc(X+16, Y+18, 4.4, 0, 6.2832); c.fill();
  c.fillText('medida', X+28, Y+23);
  c.strokeStyle = GREEN; c.lineWidth = 3; c.beginPath(); c.moveTo(X+100, Y+18); c.lineTo(X+130, Y+18); c.stroke();
  c.fillStyle = NAVY; c.fillText('calculada', X+138, Y+23);
  /* coluna do modelo */
  const X2 = W*0.68, LW2 = W*0.20;
  if (rho && rho.length){
    /* a coluna mostra os MESMOS blocos da leitura de campo, com a cor da classe:
       desenhar as camadas finas do Zohdy aqui brigaria com o texto embaixo */
    const HZ = (o.leitura && o.leitura.horizontes) ? o.leitura.horizontes : null;
    const zmax = (prof && prof.length ? prof[prof.length-1] : Math.max(...x)/2)*1.25;
    const fz = z => Y + Math.min(1, z/zmax)*LH;
    const corCam = viridisFaixa(rho);
    const faixas = HZ || blocar(rho, prof, {maxCam:5}).map(b=>({de:b.de, ate:b.ate, rho:b.rho, cor:corCam(b.rho), classe:''}));
    for (const k of faixas){
      const z1 = k.ate == null ? zmax : Math.min(k.ate, zmax);
      if (k.de > zmax) continue;
      c.fillStyle = k.cor || corCam(k.rho);
      c.fillRect(X2, fz(k.de), LW2, Math.max(1, fz(z1)-fz(k.de)));
      if (fz(z1)-fz(k.de) >= 28){
        c.textAlign = 'center'; c.fillStyle = '#fff';
        c.font = '700 13px Arial'; c.fillText(`${fmtN(Math.round(k.rho))} Ω·m`, X2+LW2/2, (fz(k.de)+fz(z1))/2 - 2);
        if (k.classe){ c.font = '400 11.5px Arial';
          const t = k.classe.length > 30 ? k.classe.slice(0,29)+'…' : k.classe;
          c.fillText(t, X2+LW2/2, (fz(k.de)+fz(z1))/2 + 13); }
      }
      c.textAlign = 'left'; c.fillStyle = NAVY; c.font = '400 12px Arial';
      c.fillText(`${fmtN(Math.round(k.de))} m`, X2+LW2+6, fz(k.de)+4);
    }
    c.strokeStyle = NAVY; c.lineWidth = 1.2; c.strokeRect(X2, Y, LW2, LH);
    c.fillStyle = NAVY; c.font = '700 16px Arial'; c.textAlign = 'left';
    c.fillText('Modelo de camadas', X2, Y-10);
    c.font = '400 13px Arial'; c.textAlign = 'right';
    const pz = escolherPasso(zmax);
    for (let v = 0; v <= zmax; v += pz) c.fillText(String(v), X2-6, fz(v)+4);
    c.save(); c.translate(X2-42, Y+LH/2); c.rotate(-Math.PI/2); c.textAlign='center';
    c.font='400 14px Arial'; c.fillText('Profundidade (m)', 0, 0); c.restore();
    const hAlvo = HZ ? HZ.filter(h=>h.agua==='sim')[0] : null;
    const alvo = o.alvo || (hAlvo ? {de:hAlvo.de, ate:hAlvo.ate==null?zmax:hAlvo.ate} : null);
    if (alvo){ const yA = fz(alvo.de), yB = fz(Math.min(alvo.ate, zmax));
      c.strokeStyle = VERM; c.lineWidth = 3; c.strokeRect(X2-3, yA, LW2+6, yB-yA);
      c.fillStyle = VERM; c.font = '700 13px Arial'; c.textAlign = 'left';
      c.fillText('ALVO', X2+LW2+6, yB+16); }
  }
  c.textAlign = 'left';
  if (o.leitura) blocoLeitura(c, W, H*0.730, H*0.215, o.leitura.titulo, o.leitura.linhas, o.leitura.avisos);
  rodape(c, W, H, o.subtitulo || '',
    `Arranjo ${o.arranjo || 'Schlumberger'}  ·  ${x.length} medidas  ·  ajuste ${fmtN(o.rms||0)} %`);
}


/* ============================================================
   LEITURA DO PERFIL — interpretação direta, para o campo
   Faixas de BASE DE CONHECIMENTO\faixas_propriedades_geofisicas.json e das
   particularidades de RR em REGRAS_INTERPRETACAO_E_REDACAO_ROBO.md §4.
   EM BOA VISTA A LÓGICA SE INVERTE: a água é pouco mineralizada
   (ρw ≈ 330 Ω·m), então areia saturada sai com MILHARES de Ω·m e abaixo de
   ~1000 tende a argila. Por isso a regra inteira troca com o terreno.
   Para o embasamento NÃO HÁ valor publicado em RR: são análogos, declarados
   como inferência, a calibrar em calibracao_geofisica_rr.csv.
   ============================================================ */
const TERRENOS = {
  cristalino: {
    id:'cristalino', curto:'Cristalino / fraturado',
    rotulo: 'Embasamento cristalino (Surumu, granito, gnaisse)',
    alvo: { rMin: 100, rMax: 600 },
    classes: [
      { ate: 80,      nome:'argila / saprolito argiloso',    agua:'nao',    cor:'#2B6CB0' },
      { ate: 300,     nome:'manto de alteração (saprolito)', agua:'talvez', cor:'#2F855A' },
      { ate: 1500,    nome:'rocha alterada / fraturada',     agua:'sim',    cor:'#B7791F' },
      { ate: 8000,    nome:'embasamento (rocha sã)',         agua:'nao',    cor:'#9C4221' },
      { ate: Infinity,nome:'rocha sã muito resistiva / crosta laterítica', agua:'nao', cor:'#742A2A' }
    ],
    aquifero:'fraturado', extremo:'min',   /* no cristalino o alvo é o CONDUTIVO */
    aviso:'Faixas por análogo: não há valor publicado em Roraima para saprolito, rocha fraturada e rocha sã. Confirmar com o que a perfuração encontrar.'
  },
  sedimentar: {
    id:'sedimentar', curto:'Sedimentar / poroso',
    rotulo: 'Sedimentar — Fm. Boa Vista / SAB',
    alvo: { rMin: 3000, rMax: 14000 },
    classes: [
      { ate: 500,     nome:'muito condutivo — suspeita de contaminação', agua:'nao', cor:'#9B2C2C' },
      { ate: 1000,    nome:'argila',                         agua:'nao',    cor:'#2B6CB0' },
      { ate: 3000,    nome:'argilo-arenoso',                 agua:'talvez', cor:'#2C7A7B' },
      { ate: 14000,   nome:'areia saturada — zona favorável (SAB)', agua:'sim', cor:'#2F855A' },
      { ate: Infinity,nome:'areia seca / crosta laterítica',  agua:'nao',    cor:'#B7791F' }
    ],
    aquifero:'poroso', extremo:'max',      /* em Boa Vista o alvo é o RESISTIVO: areia saturada */
    aviso:'Em Boa Vista a água é pouco mineralizada (ρw ≈ 330 Ω·m): areia saturada fica resistiva e abaixo de ~1000 Ω·m tende a argila.'
  }
};
function classeDe(rho, T){ for (const c of T.classes) if (rho < c.ate) return c; return T.classes[T.classes.length-1]; }

/* reduz o perfil suave do Zohdy a poucos blocos espessos ANTES de nomear.
   Sem isso a inversão suave oscila em torno dos degraus verdadeiros e a leitura
   sai piscando entre "rocha sã" e "fraturada" de metro em metro. */
function blocar(rho, prof, opt){
  opt = opt || {}; const n = rho.length; if (!n) return [];
  const fundo = prof.length ? prof[prof.length-1] : 10;
  const minEsp = opt.minEsp != null ? opt.minEsp : Math.max(2, 0.08*fundo);
  const maxCam = opt.maxCam || 5;
  let B = [];
  for (let i = 0; i < n; i++){
    const de = i ? prof[i-1] : 0, ate = i < prof.length ? prof[i] : null;
    B.push({ de, ate, esp:(ate==null ? Math.max(minEsp, fundo*0.4) : ate-de), lr:Math.log(rho[i]) });
  }
  const juntar = i => { const a=B[i], b=B[i+1], e=a.esp+b.esp;
    B.splice(i,2,{ de:a.de, ate:b.ate, esp:e, lr:(a.lr*a.esp + b.lr*b.esp)/e }); };
  const parecido = i => (i===0) ? 0 : (i===B.length-1) ? i-1
    : (Math.abs(B[i].lr-B[i-1].lr) <= Math.abs(B[i].lr-B[i+1].lr) ? i-1 : i);
  let g=0;
  while (B.length > 1 && g++ < 500){
    let pior=-1, menor=Infinity;
    for (let i=0;i<B.length;i++) if (B[i].esp < minEsp && B[i].esp < menor){ menor=B[i].esp; pior=i; }
    if (pior < 0) break; juntar(parecido(pior));
  }
  g=0;
  while (B.length > maxCam && g++ < 500){
    let k=0, d=Infinity;
    for (let i=0;i<B.length-1;i++){ const dd=Math.abs(B[i].lr-B[i+1].lr); if (dd<d){ d=dd; k=i; } }
    juntar(k);
  }
  return B.map(b => ({ de:b.de, ate:b.ate, rho:Math.exp(b.lr) }));
}

function lerSEV(rho, prof, terrenoId){
  const T = TERRENOS[terrenoId] || TERRENOS.cristalino;
  const h = [];
  for (const k of blocar(rho, prof, { maxCam:5 })){
    const c = classeDe(k.rho, T), ult = h[h.length-1];
    if (ult && ult.classe === c.nome){ ult.ate = k.ate; ult.rho = (ult.rho+k.rho)/2; }
    else h.push({ de:k.de, ate:k.ate, rho:k.rho, classe:c.nome, agua:c.agua, cor:c.cor });
  }
  /* o horizonte de cima nunca é alvo: ninguém loca poço no primeiro metro */
  if (h.length && h[0].de === 0 && h[0].ate != null && h[0].ate <= 10){
    h[0].classe = h[0].rho > 8000 ? 'crosta laterítica / cobertura' : 'solo / cobertura';
    h[0].agua = 'nao'; h[0].cor = '#8A94A0';
  }
  /* o alvo tem de ser EXTREMO LOCAL, e o sentido depende do terreno:
     no cristalino o alvo é o condutivo (mínimo); em Boa Vista a areia saturada
     é resistiva, então o alvo é o MÁXIMO. Sem isso a regra marca a cauda de
     transição, ou pior, a argila. */
  const eMax = T.extremo === 'max';
  const melhorQue = (a,b) => eMax ? a > b : a < b;
  const fora = eMax ? -Infinity : Infinity;
  for (let i=0;i<h.length;i++){
    if (h[i].agua !== 'sim') continue;
    const acima  = i>0            ? h[i-1].rho : fora;
    const abaixo = i<h.length-1   ? h[i+1].rho : fora;
    if (!(melhorQue(h[i].rho, acima) && melhorQue(h[i].rho, abaixo))) h[i].agua = 'talvez';
  }
  if (!h.some(x => x.agua === 'sim')){
    let k=-1;
    for (let i=0;i<h.length;i++){
      if (/cobertura/.test(h[i].classe)) continue;
      if (classeDe(h[i].rho, T).agua === 'nao') continue;
      if (k<0 || melhorQue(h[i].rho, h[k].rho)) k=i;
    }
    if (k>=0) h[k].agua='sim';
  }
  const alvos = h.filter(x => x.agua === 'sim');
  const avisos = [T.aviso, 'A primeira camada é mal resolvida: a menor abertura é AB/2 = 1,5 m.'];
  if (!alvos.length) avisos.push('Nenhum horizonte caiu na faixa de alvo deste terreno.');
  for (const a of alvos) if (a.de > 50)
    avisos.push(`Alvo a ${fmtN(Math.round(a.de))} m: o CPRM aponta 70–80 % das fraturas produtoras acima de 50 m.`);
  if (terrenoId === 'sedimentar' && h.some(x => /contamina/.test(x.classe)))
    avisos.push('Há camada abaixo de 500 Ω·m: pode ser contaminação. Não captar sem verificar.');
  return { terreno:T.rotulo, curto:T.curto, horizontes:h, alvos,
           base:h.filter(x=>/rocha sã|embasamento/.test(x.classe))[0]||null,
           avisos, aquifero:T.aquifero };
}

function lerCaminhamento(res, loc, terrenoId){
  if (!loc || !loc.melhor) return null;
  const T = TERRENOS[terrenoId] || TERRENOS.cristalino;
  const b = loc.melhor, a = res.a;
  const col = res.pontos.filter(p => Math.abs(p.x-b.x) <= 0.75*a).sort((u,v)=>u.z-v.z);
  /* passo = distância típica entre níveis. Tirar de col[1]-col[0] dá ZERO quando
     duas leituras da coluna caem no mesmo nível, e aí nada junta nem alarga. */
  const zsU = [...new Set(col.map(p=>p.z))].sort((u,v)=>u-v);
  const difs = []; for (let i=1;i<zsU.length;i++) difs.push(zsU[i]-zsU[i-1]);
  const passo = difs.length ? mediana(difs) : 10;
  const dentro = col.filter(p => p.rhoAbs >= T.alvo.rMin && p.rhoAbs <= T.alvo.rMax);
  const faixas = [];
  for (const p of dentro){
    const ult = faixas[faixas.length-1];
    if (ult && p.z-ult.ate <= 1.6*passo) ult.ate = p.z;
    else faixas.push({ de:p.z, ate:p.z, rho:p.rhoAbs });
  }
  /* fratura (local) ou camada (aquífero poroso)? mede quantas estacas da linha
     também caem na faixa, na mesma profundidade */
  const xs = [...new Set(res.pontos.map(p=>p.x))];
  let dentroN=0, tot=0;
  for (const f of faixas) for (const xc of xs){
    const cel = res.pontos.filter(p => Math.abs(p.x-xc)<=0.75*a && p.z>=f.de-1 && p.z<=f.ate+1);
    if (!cel.length) continue;
    tot++; const m = mediana(cel.map(p=>p.rhoAbs));
    if (m >= T.alvo.rMin && m <= T.alvo.rMax) dentroN++;
  }
  /* cada leitura representa uma BANDA de profundidade, não um ponto: sem
     alargar, uma faixa de um nível só sai com largura zero e nunca cruza com a SEV */
  for (const f of faixas){ f.de = Math.max(0, f.de - passo/2); f.ate = f.ate + passo/2; }
  const continuidade = tot ? dentroN/tot : 0;
  const tipo = continuidade >= 0.6 ? 'poroso' : continuidade <= 0.35 ? 'fratura' : 'indefinido';
  const avisos = [T.aviso];
  if (tipo === 'poroso') avisos.push('A zona atravessa quase toda a linha: comporta-se como CAMADA (aquífero poroso), não como fratura. Aí a posição lateral importa menos — o que manda é a profundidade.');
  if (tipo === 'indefinido') avisos.push('Não dá para dizer se é fratura ou camada: larga demais para uma, curta demais para a outra. O escritório decide com a inversão.');
  for (const f of faixas) if (f.de > 50)
    avisos.push(`Alvo a partir de ${fmtN(Math.round(f.de))} m: o CPRM aponta 70–80 % das fraturas produtoras acima de 50 m.`);
  if (!faixas.length) avisos.push('Nenhuma leitura da coluna caiu na faixa de alvo deste terreno.');
  return { terreno:T.rotulo, curto:T.curto, estaca:b.x, faixas, tipo,
           continuidade:+continuidade.toFixed(2),
           aquifero: tipo==='poroso' ? 'poroso' : T.aquifero, avisos };
}

/* ---------- integra caminhamento + SEV ----------
   O caminhamento manda na POSIÇÃO (varre a linha inteira) e a SEV manda na
   PROFUNDIDADE (amostragem densa em AB/2 sobre um ponto só). Quando os dois
   existem, a leitura final usa cada um no que ele é melhor.                */
function integrar(cam, sev){
  if (!cam || !sev) return null;
  const fx = cam.faixas || [], al = (sev.alvos||[]).map(a=>({de:a.de, ate:a.ate==null?1e9:a.ate}));
  let inter = null;
  for (const f of fx) for (const a of al){
    const de = Math.max(f.de, a.de), ate = Math.min(f.ate, a.ate);
    if (ate > de && (!inter || (ate-de) > (inter.ate-inter.de))) inter = { de, ate };
  }
  const linhas = [], avisos = [];
  /* o caminhamento só manda na posição se ELE achou alguma coisa. Sem faixa na
     janela, a estaca é a menos ruim da linha, não uma indicação — e a frase
     tem de dizer isso, senão soa igual a um caso bom. */
  if (fx.length)
    linhas.push({ t:`Furar na ESTACA ${fmtN(cam.estaca)} m — posição dada pelo caminhamento`, forte:true });
  else {
    linhas.push({ t:`O caminhamento NÃO achou zona favorável em nenhuma estaca.`, forte:true });
    linhas.push({ t:`A estaca ${fmtN(cam.estaca)} m é só a menos ruim da linha — não é indicação.` });
    avisos.push('Posição lateral sem apoio do caminhamento: ou a linha não pegou o alvo, ou a faixa de alvo deste terreno não serve aqui. Vale estender a linha, mudar o azimute, ou rever o terreno escolhido.');
  }
  if (al.length){
    const a = al[0];
    linhas.push({ t:`Entrada de água esperada entre ${fmtN(Math.round(a.de))} e ${a.ate>=1e9?'o fundo do ensaio':fmtN(Math.round(a.ate))+' m'} — profundidade dada pela SEV`, forte:true });
  }
  if (inter){
    linhas.push({ t:`Os dois métodos concordam entre ${fmtN(Math.round(inter.de))} e ${fmtN(Math.round(inter.ate))} m` });
  } else if (fx.length && al.length){
    avisos.push(`Caminhamento e SEV NÃO se sobrepõem: o caminhamento marca ${fx.map(f=>Math.round(f.de)+'–'+Math.round(f.ate)+' m').join(', ')} e a SEV marca ${al.map(a=>Math.round(a.de)+'–'+(a.ate>=1e9?'fundo':Math.round(a.ate))+' m').join(', ')}. Vale conferir se a SEV foi mesmo centrada na estaca indicada.`);
  }
  linhas.push({ t:`Aquífero: ${cam.tipo==='poroso'||sev.aquifero==='poroso' ? 'poroso (camada)' : 'fraturado'}` });
  avisos.push('A profundidade final do poço é decisão de projeto, não do ensaio: a geofísica diz onde furar e onde esperar a entrada de água.');
  return { concorda: !!inter, interseccao: inter, linhas, avisos };
}
const FRASE_PADRAO = 'Zona de resistividade favorável é indicação de alvo, não comprovação de água. A confirmação depende da perfuração, do desenvolvimento e do teste de vazão.';


/* ============================================================
   SUGESTÃO DE TERRENO PELO GPS — offline
   Base: ZEE Roraima, camada de hidrogeologia (SIRGAS 2000), campo DOM_AQ.
   Simplificada a ~444 m de tolerância: medido em 2.500 pontos, a
   simplificação troca a classe em 0,16 % e deixa 0,56 % "fora do mapa".
   LIMITES REAIS, que o app declara: a camada é 1:500.000 e NÃO cobre o
   extremo norte do estado (acaba na latitude 4,50 — Uiramutã fica de fora),
   nem nada fora de Roraima. Perto de um contato o mapa não decide nada.
   É SUGESTÃO. Quem escolhe é a pessoa.
   ============================================================ */
let HIDROGEO = null, HIDROGEO_ERRO = null;
async function carregarHidrogeo(){
  if (HIDROGEO || HIDROGEO_ERRO) return HIDROGEO;
  try{
    const r = await fetch('hidrogeo.json', {cache:'force-cache'});
    if (!r.ok) throw new Error('HTTP '+r.status);
    HIDROGEO = await r.json();
  }catch(e){ HIDROGEO_ERRO = e.message; }
  return HIDROGEO;
}
function dentroAnel(x, y, anel){
  let d = false;
  for (let i = 0, j = anel.length-1; i < anel.length; j = i++){
    const xi = anel[i][0], yi = anel[i][1], xj = anel[j][0], yj = anel[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj-xi)*(y-yi)/(yj-yi || 1e-300) + xi)) d = !d;
  }
  return d;
}
function dentroFeicao(x, y, g){
  let cnt = 0;
  for (const anel of g) if (dentroAnel(x, y, anel)) cnt++;
  return cnt % 2 === 1;      // even-odd: buraco cancela
}
function kmAteBorda(x, y, g){
  const cl = Math.cos(y*Math.PI/180), md = { v: Infinity };
  for (const anel of g) for (const p of anel){
    const dx = (p[0]-x)*111.32*cl, dy = (p[1]-y)*110.57;
    const d = Math.sqrt(dx*dx + dy*dy);
    if (d < md.v) md.v = d;
  }
  return md.v;
}
function sugerirTerreno(lat, lon){
  if (!HIDROGEO) return { estado: HIDROGEO_ERRO ? 'sem-base' : 'carregando' };
  if (!isFinite(lat) || !isFinite(lon)) return { estado: 'sem-coordenada' };
  for (const f of HIDROGEO){
    let x0=Infinity, x1=-Infinity, y0=Infinity, y1=-Infinity;
    for (const a of f.g) for (const p of a){
      if (p[0]<x0) x0=p[0]; if (p[0]>x1) x1=p[0];
      if (p[1]<y0) y0=p[1]; if (p[1]>y1) y1=p[1];
    }
    if (lon<x0 || lon>x1 || lat<y0 || lat>y1) continue;
    if (!dentroFeicao(lon, lat, f.g)) continue;
    const km = kmAteBorda(lon, lat, f.g);
    return { estado:'ok', classe:f.c, sistema:f.s, substrato:f.sub, potencial:f.p,
             kmBorda:+km.toFixed(1), perto: km < 1.5,
             fonte:'ZEE Roraima · hidrogeologia (1:500.000)' };
  }
  return { estado:'fora-do-mapa',
           nota:'Este ponto está fora da camada do ZEE Roraima — ela não cobre o extremo norte do estado nem fora de Roraima.' };
}

/* ---------------- exportação para o app ---------------- */
window.GEOF = {
  Kexato, processarCaminhamento, melhorEstaca, coberturaPoly,
  rhoA, zohdy, intervalos, blocar, figuraCaminhamento, figuraSEV,
  TERRENOS, lerSEV, lerCaminhamento, integrar, FRASE_PADRAO,
  carregarHidrogeo, sugerirTerreno,
  NAVY, GREEN, GRAY, VERM
};

})();
