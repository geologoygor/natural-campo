#!/usr/bin/env python3
"""
GEORREF_PDF — Natural Engenharia (17/10/2026)
Grava a georreferência (padrão ISO 32000 "GeoPDF", o mesmo que Avenza, QGIS e ArcGIS
leem) dentro de um PDF de mapa já pronto. Depois disso o PDF abre no app de campo
com o ponto azul do GPS em cima.

Uso no motor de mapas (nat_mapa) — chamar logo depois de salvar o PDF:
    from georref_pdf import georreferenciar
    georreferenciar('mapa.pdf', 'mapa.pdf',
                    quadro_pt=(x0, y0, x1, y1),        # moldura do mapa na folha, em pontos PDF (origem embaixo-esquerda)
                    extensao=(Emin, Nmin, Emax, Nmax), # o que a moldura mostra, nas coordenadas do mapa
                    epsg=31974)                          # SIRGAS 2000 UTM 20N (31980 = 20S, 31981 = 21S, 4674 = geográficas)

Pela linha de comando:
    python3 georref_pdf.py entrada.pdf saida.pdf x0 y0 x1 y1 Emin Nmin Emax Nmax EPSG [pagina]

Regras: a moldura tem que ser exatamente o retângulo onde a imagem/desenho do mapa
foi posto (eixos sem rotação). Mapa de localização (inset) não entra: só a moldura principal.
Precisa só de pypdf.
"""
import math, sys
from pypdf import PdfReader, PdfWriter
from pypdf.generic import (ArrayObject, DictionaryObject, FloatObject, NameObject,
                           NumberObject, TextStringObject)

A, F, K0 = 6378137.0, 1 / 298.257223563, 0.9996
N_ = F / (2 - F)
AA = A / (1 + N_) * (1 + N_ ** 2 / 4 + N_ ** 4 / 64)
BE = [N_ / 2 - 2 * N_ ** 2 / 3 + 37 * N_ ** 3 / 96, N_ ** 2 / 48 + N_ ** 3 / 15, 17 * N_ ** 3 / 480]
DE = [2 * N_ - 2 * N_ ** 2 / 3 - 2 * N_ ** 3, 7 * N_ ** 2 / 3 - 8 * N_ ** 3 / 5, 56 * N_ ** 3 / 15]


def utm_para_geo(E, N, zona, sul):
    xi = (N - (1e7 if sul else 0)) / (K0 * AA)
    eta = (E - 500000) / (K0 * AA)
    xp, ep = xi, eta
    for j in range(1, 4):
        xp -= BE[j - 1] * math.sin(2 * j * xi) * math.cosh(2 * j * eta)
        ep -= BE[j - 1] * math.cos(2 * j * xi) * math.sinh(2 * j * eta)
    chi = math.asin(math.sin(xp) / math.cosh(ep))
    phi = chi + sum(DE[j - 1] * math.sin(2 * j * chi) for j in range(1, 4))
    lon0 = math.radians((zona - 1) * 6 - 180 + 3)
    return math.degrees(phi), math.degrees(lon0 + math.atan(math.sinh(ep) / math.cos(xp)))


def epsg_info(c):
    c = int(c)
    if c in (4326, 4674): return None
    if 31965 <= c <= 31976: return (c - 31965 + 11, False)
    if 31977 <= c <= 31985: return (c - 31977 + 17, True)
    if 32601 <= c <= 32660: return (c - 32600, False)
    if 32701 <= c <= 32760: return (c - 32700, True)
    raise ValueError('EPSG não suportado: %s (use SIRGAS 2000 UTM, WGS 84 UTM ou geográficas)' % c)


def georreferenciar(entrada, saida, quadro_pt, extensao, epsg, pagina=0):
    x0, y0, x1, y1 = [float(v) for v in quadro_pt]
    e0, n0, e1, n1 = [float(v) for v in extensao]
    info = epsg_info(epsg)
    # cantos na ordem dos LPTS: (0,0) baixo-esq, (0,1) cima-esq, (1,1) cima-dir, (1,0) baixo-dir
    cantos = [(e0, n0), (e0, n1), (e1, n1), (e1, n0)]
    gpts = []
    for E, N in cantos:
        lat, lon = (N, E) if info is None else utm_para_geo(E, N, *info)
        gpts += [lat, lon]
    leitor = PdfReader(entrada)
    escritor = PdfWriter(clone_from=leitor)
    pg = escritor.pages[pagina]
    gcs = DictionaryObject({NameObject('/Type'): NameObject('/GEOGCS'), NameObject('/EPSG'): NumberObject(4674),
                            NameObject('/WKT'): TextStringObject('GEOGCS["SIRGAS 2000",DATUM["Sistema_de_Referencia_Geocentrico_para_las_AmericaS_2000",SPHEROID["GRS 1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]')})
    medida = DictionaryObject({
        NameObject('/Type'): NameObject('/Measure'), NameObject('/Subtype'): NameObject('/GEO'),
        NameObject('/Bounds'): ArrayObject([FloatObject(v) for v in (0, 0, 0, 1, 1, 1, 1, 0)]),
        NameObject('/LPTS'): ArrayObject([FloatObject(v) for v in (0, 0, 0, 1, 1, 1, 1, 0)]),
        NameObject('/GPTS'): ArrayObject([FloatObject(round(v, 9)) for v in gpts]),
        NameObject('/GCS'): escritor._add_object(gcs),
        NameObject('/PDU'): ArrayObject([NameObject('/M'), NameObject('/SQM'), NameObject('/DEG')])})
    vp = DictionaryObject({NameObject('/Type'): NameObject('/Viewport'),
                           NameObject('/BBox'): ArrayObject([FloatObject(v) for v in (x0, y0, x1, y1)]),
                           NameObject('/Name'): TextStringObject('Mapa'),
                           NameObject('/Measure'): escritor._add_object(medida)})
    pg[NameObject('/VP')] = ArrayObject([vp])
    with open(saida, 'wb') as f:
        escritor.write(f)
    return gpts


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) < 11:
        print(__doc__); sys.exit(1)
    g = georreferenciar(a[0], a[1], a[2:6], a[6:10], a[10], int(a[11]) if len(a) > 11 else 0)
    print('ok — cantos (lat, lon):', [(round(g[i], 6), round(g[i + 1], 6)) for i in range(0, 8, 2)])
