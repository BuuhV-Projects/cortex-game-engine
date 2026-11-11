"""Marcadores do auto-rig (SPEC-0349 e SPEC-0724): do `<code>.markers.json` que o painel do Studio grava às
juntas do esqueleto Mixamo da etapa `skin`.

A derivação (`derive`) é Python puro, no plano frontal (x, altura), lado +x; a profundidade de cada junta sai da
malha na etapa `skin`. As frações foram calibradas no LUC-01 (2026-10-19) e são as mesmas do pipeline do DDD 61,
para o esqueleto sair igual ao do player. Autoteste: `python autorig_markers.py --selftest`.
"""
import json
import math
from pathlib import Path

MARKERS = ('chin', 'groin', 'wristL', 'wristR', 'elbowL', 'elbowR', 'kneeL', 'kneeR')
# opcionais (o Studio grava desde o adendo dos ombros); sem eles o ombro é estimado na reta punho→cotovelo
OPTIONAL = ('shoulderL', 'shoulderR')
PAIRS = ('wrist', 'elbow', 'knee')
# frações calibradas no LUC-01 (2026-10-19), em D = queixo − virilha
SPINE = {'Hips': 0.06, 'Spine': 0.19, 'Spine1': 0.38, 'Spine2': 0.57, 'Neck': 0.85, 'Head': 0.99}
SHOULDER_AT = 0.79       # altura do ombro, em D acima da virilha, na reta punho→cotovelo
HEAD_END_BELOW_TOP = 0.022  # em altura do personagem
CLAVICLE_UP = 0.02       # m acima do ombro
CLAVICLE_IN = 0.32       # fração do x do ombro
HAND_REACH = 0.72        # ponta da mão além do punho, em comprimento do antebraço
HIP_X = 0.78             # fração do x do joelho
ANKLE_AT = 0.315         # altura do tornozelo, em altura do joelho, na reta quadril→joelho
BALL = (0.072, 0.019)    # bola do pé: (à frente do tornozelo, altura), em altura do personagem
TOE = (0.158, 0.011)     # ponta do dedão


def load(path, cfg, root=None):
    """Lê e confere o arquivo do Studio contra a config; devolve {nome: (x, y, z)} no espaço do glTF. `source`
    relativo é do projeto (`root`); a config resolvida já vem absoluta."""
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    problems = []
    if data.get('version') != 1:
        problems.append(f'versão {data.get("version")} (esperava 1)')
    if data.get('space') != 'gltf':
        problems.append(f'espaço {data.get("space")} (esperava gltf)')
    if data.get('code') != cfg['code']:
        problems.append(f'code {data.get("code")} ≠ {cfg["code"]}')
    src = Path(data.get('source', ''))
    if not src.is_absolute() and root is not None:
        src = Path(root) / src
    if src.resolve() != Path(cfg['source']).resolve():
        problems.append(f'source {data.get("source")} ≠ {cfg["source"]}')
    missing = [k for k in MARKERS if k not in data.get('markers', {})]
    if missing:
        problems.append(f'marcadores faltando: {missing}')
    present = [k for k in OPTIONAL if k in data.get('markers', {})]
    if len(present) == 1:
        problems.append(f'ombro só de um lado: {present[0]}')
    if problems:
        raise ValueError('marcadores inválidos: ' + '; '.join(problems))
    return {k: tuple(data['markers'][k]) for k in (*MARKERS, *present)}


def to_game(p, rotate_deg, center, scale):
    """glTF (Y para cima) → Blender, como `import_body`: (x, −z, y), giro em Z, centro e escala."""
    x, y, z = p[0], -p[2], p[1]
    a = math.radians(rotate_deg)
    x, y = x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)
    return ((x - center[0]) * scale, (y - center[1]) * scale, (z - center[2]) * scale)


def frontal(game):
    """{nome: (x, y, z)} → plano frontal do lado +x: pares L/R espelhados e médios, queixo e virilha em x = 0."""
    out = {'chin': (0.0, game['chin'][2]), 'groin': (0.0, game['groin'][2])}
    for k in (*PAIRS, 'shoulder') if 'shoulderL' in game else PAIRS:
        left, right = game[k + 'L'], game[k + 'R']
        out[k] = ((abs(left[0]) + abs(right[0])) / 2, (left[2] + right[2]) / 2)
    return out


def _at_height(a, b, z):
    """Ponto da reta a→b (prolongada) na altura z."""
    t = (z - a[1]) / (b[1] - a[1])
    return (a[0] + t * (b[0] - a[0]), z)


def derive(f, top, height, pinned=None):
    """Plano frontal (x, z) de cada junta. `pinned` fixa juntas medidas fora dos marcadores (o autoteste usa)."""
    g, c = f['groin'][1], f['chin'][1]
    d = c - g
    j = {k: (0.0, g + s * d) for k, s in SPINE.items()}
    j['HeadEnd'] = (0.0, top - HEAD_END_BELOW_TOP * height)
    j['elbow'], j['wrist'], j['knee'] = f['elbow'], f['wrist'], f['knee']
    j['shoulder'] = f['shoulder'] if 'shoulder' in f else _at_height(f['wrist'], f['elbow'], g + SHOULDER_AT * d)
    j['hip'] = (HIP_X * f['knee'][0], g)
    if pinned:
        j.update(pinned)
    fore = math.dist(j['elbow'], j['wrist'])
    ux, uz = (j['wrist'][0] - j['elbow'][0]) / fore, (j['wrist'][1] - j['elbow'][1]) / fore
    j['handTip'] = (j['wrist'][0] + HAND_REACH * fore * ux, j['wrist'][1] + HAND_REACH * fore * uz)
    j['clavicle'] = (CLAVICLE_IN * j['shoulder'][0], j['shoulder'][1] + CLAVICLE_UP)
    j['ankle'] = _at_height(j['hip'], j['knee'], ANKLE_AT * j['knee'][1])
    return j


def foot(ankle_x, ankle_y, height):
    """Bola e ponta do pé (x, y, z), à frente (−y) do tornozelo."""
    return ((ankle_x, ankle_y - BALL[0] * height, BALL[1] * height),
            (ankle_x, ankle_y - TOE[0] * height, TOE[1] * height))


def sanity(j):
    """Ordem anatômica no plano frontal; devolve a lista de problemas."""
    bad = []
    if not j['Head'][1] > j['Hips'][1]:
        bad.append('queixo abaixo da virilha')
    if not j['shoulder'][1] > j['elbow'][1] > j['wrist'][1]:
        bad.append('cotovelo fora de entre ombro e punho')
    if not j['hip'][1] > j['knee'][1] > j['ankle'][1] > 0:
        bad.append('joelho fora de entre quadril e tornozelo')
    return bad


def slice_depth(points, edges, z, x, half_width, slab):
    """Centro em y da malha na altura `z`, a até `half_width` de `x` (SPEC-0725): os vértices a até `slab` da
    altura e os pontos onde as arestas cruzam `z`. Malha de poucos triângulos tem fatia sem vértice nenhum (o
    triângulo grande atravessa a fatia); a aresta que cruza a altura sempre dá ponto. None se nada cai na fatia."""
    ys = [p[1] for p in points if abs(p[2] - z) < slab and abs(p[0] - x) < half_width]
    for i, k in edges:
        a, b = points[i], points[k]
        if (a[2] - z) * (b[2] - z) >= 0:
            continue
        t = (z - a[2]) / (b[2] - a[2])
        if abs(a[0] + t * (b[0] - a[0]) - x) < half_width:
            ys.append(a[1] + t * (b[1] - a[1]))
    return (min(ys) + max(ys)) / 2 if ys else None


def _selftest():
    """LUC-01 (medido em 2026-10-19): as frações reproduzem o esqueleto do player."""
    f = {'chin': (0.0, 1.53), 'groin': (0.0, 0.8158), 'elbow': (0.345, 1.045), 'wrist': (0.416, 0.85), 'knee': (0.132, 0.46)}
    pinned = {'shoulder': (0.22, 1.38), 'elbow': (0.345, 1.045), 'hip': (0.103, 0.82), 'knee': (0.132, 0.46)}
    j = derive(f, top=1.8, height=1.8, pinned=pinned)
    old = {'Hips': 0.86, 'Spine': 0.96, 'Spine1': 1.09, 'Spine2': 1.22, 'Neck': 1.42, 'Head': 1.52, 'HeadEnd': 1.76}
    for k, z in old.items():
        assert abs(j[k][1] - z) < 0.01, (k, j[k], z)
    assert abs(j['clavicle'][1] - 1.40) < 0.005 and abs(j['clavicle'][0] - 0.07) < 0.005, j['clavicle']
    assert abs(j['handTip'][1] - 0.70) < 0.01, j['handTip']
    assert abs(j['ankle'][0] - 0.154) < 0.01 and abs(j['ankle'][1] - 0.145) < 0.005, j['ankle']
    free = derive(f, top=1.8, height=1.8)
    assert math.dist(free['shoulder'], pinned['shoulder']) < 0.04, free['shoulder']
    assert math.dist(free['hip'], pinned['hip']) < 0.01, free['hip']
    ball, toe = foot(0.154, 0.0, 1.8)
    assert abs(ball[1] + 0.13) < 0.002 and abs(toe[1] + 0.285) < 0.002 and abs(ball[2] - 0.035) < 0.002
    assert not sanity(j)
    assert to_game((1.0, 2.0, 3.0), 0, (0, 0, 0), 1) == (1.0, -3.0, 2.0)
    marked = derive({**f, 'shoulder': (0.2, 1.4)}, top=1.8, height=1.8)
    assert marked['shoulder'] == (0.2, 1.4) and abs(marked['clavicle'][1] - 1.42) < 1e-9, marked['clavicle']
    side = {'chin': (0, 1.5, 0), 'groin': (0, 0.8, 0), **{k + s: ((1 if s == 'L' else -1) * x, 0, z) for k, (x, z) in
            {'wrist': (0.4, 0.85), 'elbow': (0.34, 1.05), 'knee': (0.13, 0.46), 'shoulder': (0.21, 1.39)}.items() for s in 'LR'}}
    assert frontal(side)['shoulder'] == (0.21, 1.39)
    # triângulo grande sem vértice na fatia: as arestas que cruzam z = 0.9 dão a profundidade
    tri = [(0.1, -0.1, 0.5), (0.1, 0.1, 1.3), (0.12, 0.1, 0.5)]
    assert abs(slice_depth(tri, [(0, 1), (1, 2), (2, 0)], 0.9, 0.107, 0.06, 0.015) - 0.05) < 1e-9
    assert slice_depth(tri, [(0, 1), (1, 2), (2, 0)], 0.9, 0.4, 0.06, 0.015) is None
    assert abs(slice_depth([(0, 0.2, 0.9), (0, 0.4, 0.91)], [], 0.9, 0, 0.06, 0.015) - 0.3) < 1e-9
    print('autorig_markers: autoteste ok')


if __name__ == '__main__':
    import sys
    if '--selftest' in sys.argv:
        _selftest()
