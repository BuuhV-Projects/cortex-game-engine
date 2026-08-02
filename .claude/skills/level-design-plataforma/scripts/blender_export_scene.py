# Extrai a coleção "Demonstration" (o nível montado, sem o showroom "Assets")
# em ESPAÇO-ENGINE (glTF Y-up) e escreve JSON: nome, categoria, pos, rot(euler
# XYZ rad), escala. Roda: blender --background <arq.blend> --python este.py -- <out.json>
import bpy, re, json, sys
from math import radians
from mathutils import Matrix

out = sys.argv[-1]
CONV = Matrix.Rotation(radians(-90), 4, 'X')  # Blender Z-up → glTF Y-up (convenção do exporter)

demo = bpy.data.collections.get('Demonstration')
objs = [o for o in (demo.all_objects if demo else bpy.data.objects) if o.type == 'MESH']

def base(n):
    n = re.sub(r'\.\d+$', '', n)          # sufixo de instância .001
    return n

def stem_asset(n):
    # nome do ARQUIVO do kit: tira só o sufixo .001 de instância
    return re.sub(r'\.\d+$', '', n)

def categorize(nm):
    b = re.sub(r'\.\d+$', '', nm).lower()
    b = re.sub(r'_\d+$', '', b)  # obstacle_5_001 → obstacle_5 → obstacle_5; grass_001 → grass
    b2 = re.sub(r'_\d+$', '', b)
    key = b
    if key.startswith('checkpoint_tree'): return 'decor'      # árvore do checkpoint = decor
    if key.startswith('checkpoint'): return 'checkpoint'
    if key.startswith('finish'): return 'finish'
    if key == 'coin' or key.startswith('coin'): return 'coin'
    if key.startswith('obstacle') or any(key.startswith(h) for h in ('bomb','tnt','box_tnt','dynamite','anvil','cannon','waves')): return 'hazard'
    if key.startswith('trampoline'): return 'trampoline'
    if any(key.startswith(t) for t in ('grass','land','landscape')): return 'ground'
    if any(key.startswith(t) for t in ('fence','stake','rope','barrier')): return 'border'
    if any(key.startswith(t) for t in ('bridge','ladder','big_log','log')): return 'traversal'
    if any(key.startswith(t) for t in ('flag','indicator','signboard','scroll','shadow')): return 'marker'
    if any(key.startswith(t) for t in ('tree','bush','flower','pumpkin','hive','berries','apple','mushroom','vegetation')): return 'decor'
    if any(key.startswith(t) for t in ('rock','stone')): return 'terrain-decor'
    return 'other'

pieces = []
bb = {'min':[1e18]*3, 'max':[-1e18]*3}
CONV_INV = CONV.inverted()
for o in objs:
    # Mudança de BASE (conjugação), não left-multiply: os GLBs do kit já foram
    # exportados em Y-up, então o -90°X é do SISTEMA DE COORDENADAS, não da peça.
    # C @ M @ C⁻¹ converte a posição e manda rotação-no-up-do-Blender pro Y do
    # engine SEM vazar -90°X pra cada peça (senão tudo tomba/flutua).
    me = CONV @ o.matrix_world @ CONV_INV
    loc, rot, scale = me.decompose()
    eul = rot.to_euler('XYZ')
    pos = [round(loc.x,3), round(loc.y,3), round(loc.z,3)]
    piece = {
        'name': o.name,
        'asset': stem_asset(o.name),               # base pro arquivo <asset>.glb
        'cat': categorize(o.name),
        'pos': pos,
        'rot': [round(eul.x,4), round(eul.y,4), round(eul.z,4)],
        'scale': [round(scale.x,3), round(scale.y,3), round(scale.z,3)],
    }
    pieces.append(piece)
    for i in range(3):
        bb['min'][i] = min(bb['min'][i], pos[i]); bb['max'][i] = max(bb['max'][i], pos[i])

cats = {}
for p in pieces: cats[p['cat']] = cats.get(p['cat'],0)+1
print('Demonstration MESH:', len(pieces))
print('bbox min', [round(v,1) for v in bb['min']], 'max', [round(v,1) for v in bb['max']])
print('dim (X,Y,Z):', [round(bb['max'][i]-bb['min'][i],1) for i in range(3)])
print('categorias:', cats)
json.dump({'bbox':bb, 'pieces':pieces}, open(out,'w'))
print('escrito:', out)
