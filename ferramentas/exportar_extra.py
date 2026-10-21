#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""EXPORTAR EXTRA -> campo_novo.json (Natural Engenharia) - v1.0, 07/10/2026

Roda DEPOIS do exportar_campo.py, sobre o pacote que ele gerou, e acrescenta:
  * obras[].etapas  - os itens do contrato de cada obra aberta (do cadastro da obra no painel),
                      com o quanto cada um ja andou (pct). Sem preco nem custo: o app nao leva dinheiro.
                      E o que o encarregado usa no "Avanço de hoje" do app (v1.15+).
  * obras[].diario  - True quando a obra tem diario obrigatorio (conta na regua de quem conduz).
  * equipe[].regua  - o espelho da regua do SOP-009 que o PROPRIO PAINEL calcula e grava em
                      `regua_app/<funcionarioId>`. Este script nao calcula nota nenhuma: so copia.

Uso:
  python3 exportar_extra.py <db_dir> <campo_novo.json>
    db_dir: pasta do ArtifactData (obras/*.json e regua_app/*.json)
Grava por cima do proprio campo_novo.json.
"""
import json, os, sys, glob


def carregar(pasta):
    out = {}
    for f in glob.glob(os.path.join(pasta, '*.json')):
        try:
            d = json.load(open(f, encoding='utf-8'))
        except Exception:
            continue
        out[d.get('id') or d.get('fid') or os.path.basename(f)[:-5]] = d
    return out


def etapas_app(o):
    out = []
    for e in (o.get('etapas') or []):
        if not isinstance(e, dict) or not e.get('id'):
            continue
        pct = 100 if e.get('feito') else int(round(float(e.get('pct') or 0)))
        out.append({'id': e['id'], 'cap': (e.get('cap') or '')[:80], 'desc': (e.get('desc') or '')[:160],
                    'un': e.get('un') or '', 'qtd': e.get('qtd') or 0, 'pct': max(0, min(100, pct))})
    return out


def regua_app(r):
    # so o que o app mostra; nada de RH/dinheiro (o painel ja monta assim)
    chaves = ['mes', 'mesRot', 'base', 'nota', 'ajuste', 'eixos', 'resumo', 'dica', 'calcEm', 'dias']
    return {k: r.get(k) for k in chaves if k in r}


def main(dbdir, caminho):
    pac = json.load(open(caminho, encoding='utf-8'))
    obras = carregar(os.path.join(dbdir, 'obras'))
    reg = carregar(os.path.join(dbdir, 'regua_app'))
    n_et = n_reg = 0
    for o in pac.get('obras') or []:
        src = obras.get(o.get('id')) or {}
        et = etapas_app(src)
        if et:
            o['etapas'] = et; n_et += 1
        if src.get('diario'):
            o['diario'] = True
    for f in pac.get('equipe') or []:
        r = reg.get(f.get('id'))
        if r:
            f['regua'] = regua_app(r); n_reg += 1
    json.dump(pac, open(caminho, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'extra: {n_et} obra(s) com itens do contrato, {n_reg} pessoa(s) com regua -> {caminho}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
