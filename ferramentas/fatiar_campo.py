#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Decide o que precisa ir para o Drive e escreve SÓ isso.

  python3 fatiar.py campo_novo.json campo_base.json lista.txt ./saida AAAAMMDD_HHMM

  campo_novo.json  pacote recém-gerado do painel (exportar_campo.py)
  campo_base.json  o campo.json base da pasta CLAUDE (pacote inteiro)
  lista.txt        nomes dos arquivos da pasta CLAUDE, um por linha (search_files)
  saida/           onde as fatias a gravar são escritas
  selo             AAAAMMDD_HHMM em America/Manaus

Como decide, sem baixar nada: cada fatia publicada carrega no nome a impressão
digital do seu conteúdo (_h<8 hex>). O que vale hoje para cada seção é a fatia
mais recente daquele tipo; se não houver fatia, vale a seção do campo.json base.
Se a impressão digital do que seria gerado agora bate com a que já está publicada,
não grava nada. Fatia mais recente sem _h no nome = desconhecida, então regrava.
"""
import json, os, re, sys, hashlib

RX_FATIA = re.compile(r'^campo_(obras|patrimonio|base)_(\d{8}_\d{4})(?:_h([0-9a-f]{8}))?\.json$')
RX_SOP   = re.compile(r'^campo_sop_([A-Za-z0-9._-]+?)_(\d{8}_\d{4})(?:_h([0-9a-f]{8}))?\.json$')
SECOES_BASE = ['linhas', 'comum', 'referencia', 'roteiroFotos', 'roteiroDiario']


def jd(o):
    return json.dumps(o, ensure_ascii=False, separators=(',', ':'))


def digital(texto):
    return hashlib.sha256(texto.encode('utf-8')).hexdigest()[:8]


def publicado(lista):
    """Do nome dos arquivos: a fatia mais recente de cada seção e sua impressão digital."""
    fat, sops = {}, {}
    for n in [l.strip() for l in lista if l.strip()]:
        m = RX_SOP.match(n)
        if m:
            c = m.group(1).upper()
            if c not in sops or m.group(2) > sops[c][0]:
                sops[c] = (m.group(2), m.group(3))
            continue
        m = RX_FATIA.match(n)
        if m:
            t = m.group(1)
            if t not in fat or m.group(2) > fat[t][0]:
                fat[t] = (m.group(2), m.group(3))
    return fat, sops


def main(novo_p, base_p, lista_p, saida, selo):
    novo = json.load(open(novo_p, encoding='utf-8'))
    base = json.load(open(base_p, encoding='utf-8'))
    fat, sops_pub = publicado(open(lista_p, encoding='utf-8').readlines())
    os.makedirs(saida, exist_ok=True)
    g = novo.get('geradoEm')
    saiu = []

    def resolver(tipo, corpo_base):
        """Impressão digital do que está valendo hoje para esta seção (None = desconhecida)."""
        if tipo in fat:
            return fat[tipo][1]
        return digital(jd(corpo_base))

    def considerar(tipo, corpo, nome_base, corpo_do_base):
        texto = jd(corpo)
        h = digital(texto)
        if h == resolver(tipo, corpo_do_base):
            return
        nome = f'{nome_base}_{selo}_h{h}.json'
        open(os.path.join(saida, nome), 'w', encoding='utf-8').write(texto)
        saiu.append((nome, len(texto.encode('utf-8'))))

    considerar('obras', {'geradoEm': g, 'obras': novo.get('obras')},
               'campo_obras', {'geradoEm': g, 'obras': base.get('obras')})

    considerar('patrimonio',
               {'geradoEm': g, 'patrimonio': novo.get('patrimonio'),
                'patrimonioProx': novo.get('patrimonioProx'), 'equipe': novo.get('equipe')},
               'campo_patrimonio',
               {'geradoEm': g, 'patrimonio': base.get('patrimonio'),
                'patrimonioProx': base.get('patrimonioProx'), 'equipe': base.get('equipe')})

    cn = {'geradoEm': g}; cn.update({k: novo.get(k) for k in SECOES_BASE})
    cb = {'geradoEm': g}; cb.update({k: base.get(k) for k in SECOES_BASE})
    considerar('base', cn, 'campo_base', cb)

    sn, sb = novo.get('sops') or {}, base.get('sops') or {}
    for cod in sorted(set(sn) | set(sb) | set(sops_pub)):
        corpo = {'geradoEm': g, 'codigo': cod, 'sop': sn.get(cod)}
        texto = jd(corpo)
        h = digital(texto)
        chave = cod.upper()
        atual = sops_pub[chave][1] if chave in sops_pub else digital(jd({'geradoEm': g, 'codigo': cod, 'sop': sb.get(cod)}))
        if h == atual:
            continue
        if cod not in sn and chave not in sops_pub and cod not in sb:
            continue
        nome = f"campo_sop_{cod.replace('/', '-').replace(' ', '')}_{selo}_h{h}.json"
        open(os.path.join(saida, nome), 'w', encoding='utf-8').write(texto)
        saiu.append((nome, len(texto.encode('utf-8'))))

    if not saiu:
        print('SEM MUDANCA')
    for n, b in saiu:
        print(f'{b:>7} bytes  {n}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5])
