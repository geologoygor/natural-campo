#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Exportação do painel da Natural Engenharia -> campo.json (pacote que o app de campo consome).

Uso:
  python3 exportar_campo.py <pasta com obras/*.json e sops/*.json> <saida campo.json>

A pasta de entrada é o que a ferramenta ArtifactData grava com out_dir
(coleções `obras` e `sops` do painel; desde 22/09/2026 também `bens` e
`funcionarios`, para a página de inventário de patrimônio). O painel é a ÚNICA fonte da verdade:
este script não inventa obra nem SOP — só filtra, classifica por linha de
serviço e empacota. A tabela LINHAS abaixo é a única regra própria daqui.
"""
import json, sys, os, re, glob, datetime

# ---------------------------------------------------------------------------
# Linhas de serviço de campo e os SOPs que regem cada uma (códigos do painel).
# "comum" entra em toda obra. "ref" é leitura de apoio, não checklist.
# ---------------------------------------------------------------------------
LINHAS = {
    "poco":         {"nome": "Poço tubular", "sops": ["SOP-008", "SOP-018", "SOP-020", "SOP-021", "SOP-023", "SOP-024", "SOP-003"],
                     "chaves": ["poço", "poco", "perfura", "artesian", "semi-artesian", "tubular"]},
    "limpeza-poco": {"nome": "Limpeza e manutenção de poço", "sops": ["SOP-043"],   # SOP-020 é a entrega de poço NOVO
                     "chaves": ["limpeza de poço", "limpeza de poco", "manutenção de poço", "manutencao de poco", "desobstru"]},
    "outorga":      {"nome": "Campo de outorga / licenciamento de poço", "sops": ["SOP-018", "SOP-003"],
                     "chaves": ["outorga", "licenciamento", "uso insignificante"]},
    "agua":         {"nome": "Coleta de amostra de água", "sops": ["SOP-003"],
                     "chaves": ["coleta de água", "coleta de agua", "análise de água", "analise de agua", "amostra de água"]},
    "spt":          {"nome": "Sondagem SPT", "sops": ["SOP-017"],
                     "chaves": ["spt", "sondagem"]},
    "geofisica":    {"nome": "Estudo geofísico", "sops": [],
                     "chaves": ["geofís", "geofis", "eletrorres", "resistiv"]},
    "georef":       {"nome": "Georreferenciamento / SIGEF", "sops": ["SOP-016"],
                     "chaves": ["georref", "sigef", "geo rural", "geo ", "imóvel rural", "imovel rural"]},
    "topografia":   {"nome": "Levantamento topográfico", "sops": ["SOP-016"],
                     "chaves": ["topograf", "planialt", "croqui", "memorial", "terraplen", "locação", "locacao", "as-built", "as built"]},
    "cartografia":  {"nome": "Mapas, cartografia e drone", "sops": [],
                     "chaves": ["mapa", "cartograf", "drone", "vant", "ortofoto"]},
    "obra-civil":   {"nome": "Obra civil de apoio", "sops": [],
                     "chaves": ["casa de bomba", "obra civil", "construção", "construcao", "reservat", "alvenaria", "laje"]},
    "consultoria":  {"nome": "Consultoria, laudo e vistoria", "sops": [],
                     "chaves": ["consultoria", "laudo", "vistoria", "visita técnica", "visita tecnica", "parecer"]},
}
COMUM = ["SOP-001", "SOP-022"]
REFERENCIA = ["SOP-013", "SOP-026"]
STATUS_ABERTOS = {"andamento"}          # o que aparece no app como "obra aberta"

# Roteiro fixo de campo (vem do SOP-001 v1.3; se o SOP mudar, mudar aqui junto)
ROTEIRO_FOTOS = [
    {"k": "chegando",  "t": "Chegando",           "d": "A obra de longe, mostrando o acesso e o entorno, antes de descarregar."},
    {"k": "maquina",   "t": "Máquina trabalhando", "d": "A sonda, o receptor, o eletrorresistivímetro ou o drone em uso."},
    {"k": "gente",     "t": "Gente trabalhando",   "d": "A equipe em ação, com EPI (bota, capacete, óculos, colete)."},
    {"k": "perto",     "t": "De perto",            "d": "O detalhe do que foi feito: tubo entrando, marco cravado, amostra na mão, eletrodo no chão."},
    {"k": "resultado", "t": "O resultado",         "d": "Água saindo, laje pronta, marco no lugar, furo terminado."},
]
ROTEIRO_DIARIO = [
    "Que serviço é este e para qual cliente.",
    "Quem está no campo hoje (primeiro e segundo nome de cada um).",
    "O que rendeu hoje: metros, furos, pontos, vértices.",
    "O que deu errado ou mudou, e por quê.",
    "O que fica para amanhã ou para o escritório.",
]


def norm(s):
    return (s or "").lower()


def classificar(obra):
    txt = norm(obra.get("servico")) + " | " + norm(obra.get("nome")) + " | " + norm(obra.get("centro"))
    linhas = []
    # limpeza antes de poço, para "limpeza de poço" não virar perfuração
    for k in ["limpeza-poco", "outorga", "agua", "spt", "geofisica", "georef", "topografia", "cartografia", "obra-civil", "consultoria", "poco"]:
        for ch in LINHAS[k]["chaves"]:
            if ch in txt:
                linhas.append(k)
                break
    if "limpeza-poco" in linhas and "poco" in linhas:
        linhas.remove("poco")
    if "outorga" in linhas and "poco" in linhas and "perfura" not in txt:
        linhas.remove("poco")
    if not linhas:
        linhas = ["consultoria"]
    return linhas


def folder_id(url):
    if not url:
        return None
    m = re.search(r"/folders/([A-Za-z0-9_-]+)", url)
    return m.group(1) if m else None


# ---------------------------------------------------------------------------
# PATRIMÔNIO para a página pública de inventário (inventario.html), 22/09/2026.
# Só o que quem está em campo precisa para achar o bem e completar a ficha: nada
# de valor, dívida, observação interna ou dado de documento (RENAVAM, IMEI…).
# "faltas" é o que ainda falta na ficha — é o que a página mostra em vermelho.
# ---------------------------------------------------------------------------
def faltas_bem(b):
    f, fi = [], (b.get("ficha") or {})
    c = fi.get("c") or {}
    veic = b.get("categoria") == "veiculo"
    sem_placa = c.get("temPlaca") == "Não (não emplacado)"
    if not b.get("marca"): f.append("marca")
    if not b.get("modelo"): f.append("modelo")
    if not b.get("serie"): f.append("placa/chassi" if veic else "nº de série")
    if not b.get("patrimonio"): f.append("nº de patrimônio")
    if not fi.get("fotos"): f.append("fotos")
    if veic and not sem_placa:
        if not any(d.get("k") == "crlv" for d in (fi.get("docs") or [])): f.append("CRLV")
        if not (b.get("fipe") or {}).get("valor"): f.append("FIPE")
    if not b.get("local"): f.append("onde fica")
    return f


def patrimonio(entrada):
    bens, mx = [], 0
    for f in glob.glob(os.path.join(entrada, "bens", "*.json")):
        b = json.load(open(f, encoding="utf-8"))
        bid = b.get("id") or os.path.basename(f)[:-5]
        m = re.match(r"NE-(\d+)", str(b.get("patrimonio") or ""), re.I)
        if m: mx = max(mx, int(m.group(1)))
        pr = ((b.get("inventario") or {}).get("proposto") or {}).get("patrimonio") or ""
        m = re.match(r"NE-(\d+)", pr, re.I)
        if m: mx = max(mx, int(m.group(1)))
        if b.get("situacao") in ("baixado", "vendido"):
            continue
        bens.append({"id": bid, "nome": b.get("nome"), "categoria": b.get("categoria"),
                     "tipo": ((b.get("ficha") or {}).get("tipo")) or ((b.get("inventario") or {}).get("tipo")) or "",
                     "marca": b.get("marca") or "", "modelo": b.get("modelo") or "", "serie": b.get("serie") or "",
                     "patrimonio": b.get("patrimonio") or "", "local": b.get("local") or "", "centro": b.get("centro") or "",
                     "validacao": b.get("validacao") or "", "faltas": faltas_bem(b)})
    bens.sort(key=lambda x: (x["nome"] or ""))
    equipe = []
    for f in glob.glob(os.path.join(entrada, "funcionarios", "*.json")):
        d = json.load(open(f, encoding="utf-8"))
        if d.get("ativo") is False or d.get("nivel") == "fora":
            continue
        equipe.append({"id": d.get("id") or os.path.basename(f)[:-5], "nome": d.get("nome")})
    equipe.sort(key=lambda x: x["nome"] or "")
    return bens, "NE-%04d" % (mx + 1), equipe


# ---------------------------------------------------------------------------------
# AGENDA no app de campo (06/10/2026, app v1.11). Sem senha, por decisão do Ygor:
# qualquer um que escolher um nome no aparelho vê a agenda daquele nome. Por isso o que
# é de RH ou dinheiro (advertência, salário, adiantamento, prestação de contas, valores
# em R$...) NÃO vai para o app — continua só no painel.
# Vai dentro de `equipe` (cada pessoa leva a sua agenda e as suas tarefas abertas)
# porque o Robô de Campo já repassa `equipe` inteiro da fatia de patrimônio; assim não
# precisa reimplantar o robô. A agenda da empresa, no app, é a união das agendas de todos.
# Também sai em `agenda` no topo, para quando o robô passar a repassar essa chave.
# ---------------------------------------------------------------------------------
AG_DIAS_ANTES, AG_DIAS_DEPOIS = 3, 45
FECHADAS = {"concluida", "cancelada", "arquivada"}
ORIGEM_RESERVADA = {"adiantamento", "financeiro", "caixa"}
# assunto de RH/dinheiro no TÍTULO: a tarefa/compromisso inteiro fica fora do app
RX_RH = re.compile(
    r"advert[eê]ncia|sal[aá]rio|folha de pag|adiantament|presta[cç][aã]o de contas|prestar contas|"
    r"reembols|descont|f[eé]rias|rescis|demiss|holerite|contracheque|\binss\b|\bfgts\b", re.I)
# no texto de apoio (porque, descrição, notas): se tocar em RH ou dinheiro, esse texto não vai
RX_DINHEIRO = re.compile(RX_RH.pattern + r"|fatur|pagament|\bpix\b|R\$|reais\b", re.I)
RX_VALOR = re.compile(r"R\$\s*[\d.,]+(?:\s*(?:mil|k))?", re.I)


def reservado(*textos):
    return any(RX_RH.search(t or "") for t in textos)


def apoio(t, n):
    """Texto de apoio só vai se não falar de RH nem de dinheiro."""
    return "" if RX_DINHEIRO.search(t or "") else curto(t, n)


def sem_valor(t):
    return RX_VALOR.sub("R$ ···", t or "")


def curto(t, n):
    t = re.sub(r"\s+", " ", (t or "")).strip()
    return t if len(t) <= n else t[:n - 1].rstrip() + "…"


def ler_colecao(entrada, nome):
    out = []
    for f in sorted(glob.glob(os.path.join(entrada, nome, "*.json"))):
        try:
            d = json.load(open(f, encoding="utf-8"))
        except Exception:
            continue
        d.setdefault("id", os.path.basename(f)[:-5])
        out.append(d)
    return out


def agenda_e_tarefas(entrada, equipe, hoje=None):
    hoje = hoje or datetime.date.today()
    ini = (hoje - datetime.timedelta(days=AG_DIAS_ANTES)).isoformat()
    fim = (hoje + datetime.timedelta(days=AG_DIAS_DEPOIS)).isoformat()
    nomes_obra = {o["id"]: o.get("nome") for o in ler_colecao(entrada, "obras")}
    ids = {f["id"] for f in equipe}
    eventos = []
    for a in ler_colecao(entrada, "agenda"):
        dt = (a.get("data") or "")[:10]
        if not dt or dt < ini or dt > fim or a.get("cancelado"):
            continue
        if reservado(a.get("titulo"), a.get("tipo")):
            continue
        eventos.append({"id": a["id"], "data": dt, "hora": a.get("hora") or "", "tipo": a.get("tipo") or "",
                        "lugar": a.get("lugar") or "", "titulo": curto(sem_valor(a.get("titulo")), 120),
                        "onde": curto(a.get("onde"), 120), "obraId": a.get("obraId") or "",
                        "obra": nomes_obra.get(a.get("obraId")) or "", "funcs": [x for x in (a.get("funcs") or []) if x in ids],
                        "todos": not (a.get("funcs") or []),   # compromisso sem nome = da empresa toda
                        "notas": apoio(a.get("notas"), 200)})
    eventos.sort(key=lambda e: (e["data"], e["hora"], e["titulo"]))
    tarefas = {}
    for d in ler_colecao(entrada, "demandas"):
        if d.get("status") in FECHADAS or d.get("funcionarioId") not in ids:
            continue
        if (d.get("origem") or "") in ORIGEM_RESERVADA or reservado(d.get("titulo")):
            continue
        if not (d.get("titulo") or "").strip():
            continue
        tarefas.setdefault(d["funcionarioId"], []).append({
            "id": d["id"], "n": d.get("numero"), "titulo": curto(sem_valor(d.get("titulo")), 140),
            "prazo": (d.get("prazo") or "")[:10], "status": d.get("status") or "", "bola": d.get("bola") or "",
            "prioridade": d.get("prioridade") or "", "obraId": d.get("obraId") or "",
            "obra": nomes_obra.get(d.get("obraId")) or "",
            "porque": apoio(d.get("porque"), 180),
            # a descrição só vai quando não há o "porquê" (o app mostra um ou outro; a fatia fica leve)
            "desc": "" if apoio(d.get("porque"), 180) else apoio(d.get("desc"), 240),
            "check": [{"t": curto(sem_valor(c.get("t")), 90), "ok": bool(c.get("ok"))} for c in (d.get("checklist") or [])
                      if isinstance(c, dict) and not RX_RH.search(c.get("t") or "")][:8]})
    for lst in tarefas.values():
        lst.sort(key=lambda t: (t["prazo"] or "9999", t["n"] or 0))
    for f in equipe:
        f["agenda"] = [e for e in eventos if e["todos"] or f["id"] in e["funcs"]]
        f["tarefas"] = tarefas.get(f["id"], [])
    return eventos


def main(entrada, saida):
    obras, sops = [], {}
    for f in glob.glob(os.path.join(entrada, "sops", "*.json")):
        d = json.load(open(f, encoding="utf-8"))
        if d.get("rascunho"):
            continue
        sops[d["codigo"]] = {
            "codigo": d.get("codigo"), "titulo": d.get("titulo"), "versao": d.get("versao"),
            "objetivo": d.get("objetivo"), "quando": d.get("quando"), "executa": d.get("executa"),
            "fases": d.get("fases") or [], "regras": d.get("regras") or [], "erros": d.get("erros") or [],
            "pronto": d.get("pronto") or [], "autonomia": d.get("autonomia") or {},
            "ficha": d.get("ficha"), "drive": d.get("drive"),
        }
    for f in glob.glob(os.path.join(entrada, "obras", "*.json")):
        d = json.load(open(f, encoding="utf-8"))
        if d.get("status") not in STATUS_ABERTOS:
            continue
        linhas = classificar(d)
        cods = list(COMUM)
        for l in linhas:
            for c in LINHAS[l]["sops"]:
                if c not in cods:
                    cods.append(c)
        obras.append({
            "id": d["id"], "nome": d.get("nome"), "cliente": d.get("cliente"), "servico": d.get("servico"),
            "linhas": linhas, "sops": [c for c in cods if c in sops],
            "inicio": d.get("inicio"), "fimPrevisto": d.get("fimPrevisto"),
            "pastaUrl": d.get("pastaUrl"), "pastaId": folder_id(d.get("pastaUrl")),
            "propostaId": d.get("propostaId"), "responsavelId": d.get("responsavelId"),
            # terreno geofisico decidido no escritorio: "cristalino" | "sedimentar" | ""
            # o app de campo usa isso para calibrar a leitura antes de alguem tocar
            # no botao; sem ele o grafico nao e gerado (padrao errado e pior que nenhum)
            "terreno": (d.get("terreno") or "").strip().lower(),
        })
    obras.sort(key=lambda o: (o.get("inicio") or "", o["nome"]))
    pacote = {
        "geradoEm": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "versao": 1,
        "linhas": {k: {"nome": v["nome"], "sops": v["sops"]} for k, v in LINHAS.items()},
        "comum": COMUM, "referencia": [c for c in REFERENCIA if c in sops],
        "roteiroFotos": ROTEIRO_FOTOS, "roteiroDiario": ROTEIRO_DIARIO,
        "obras": obras,
        "sops": sops,
    }
    if os.path.isdir(os.path.join(entrada, "bens")):
        pacote["patrimonio"], pacote["patrimonioProx"], pacote["equipe"] = patrimonio(entrada)
        if os.path.isdir(os.path.join(entrada, "agenda")) or os.path.isdir(os.path.join(entrada, "demandas")):
            eventos = agenda_e_tarefas(entrada, pacote["equipe"])
            pacote["agenda"] = eventos
    json.dump(pacote, open(saida, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"campo.json: {len(obras)} obras abertas, {len(sops)} SOPs, {len(pacote.get('patrimonio') or [])} bens, {len(pacote.get('agenda') or [])} compromissos na agenda, {sum(len(f.get('tarefas') or []) for f in pacote.get('equipe') or [])} tarefas abertas -> {saida}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
