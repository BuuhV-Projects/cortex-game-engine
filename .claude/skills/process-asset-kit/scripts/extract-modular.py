# Extrai de um showroom .glb (todas as peças skinnadas num esqueleto único):
# rig.glb (esqueleto puro) + um .glb por peça (esqueleto em bind pose + 1 mesh,
# sem clips) — formato do composeModularCharacter (SPEC-0068).
#
# GOTCHA (aprendido no characters-cute): showrooms exibem as peças numa GRADE —
# os vértices da mesh skinnada carregam o offset da vitrine, não a posição de
# vestir. Se o pack traz cópias estáticas na posição de vestir (personagem
# montado na origem), passe o diretório delas: a geometria de cada peça é
# TRANSLADADA pro bbox da estática de mesmo nome antes do export.
#
# Uso: blender -b -P extract-modular.py -- <src.glb> <out_assets> <sizes.json> [<statics_dir>]
import bpy
import json
import os
import re
import struct
import sys

from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT_ASSETS, SIZES_JSON = argv[0], argv[1], argv[2]
STATICS_DIR = argv[3] if len(argv) > 3 else None
os.makedirs(OUT_ASSETS, exist_ok=True)


def glb_position_bounds(path):
    """Bounds POSITION (glTF Y-up) do header de um .glb, sem importar."""
    with open(path, 'rb') as f:
        head = f.read(20)
        if struct.unpack('<I', head[0:4])[0] != 0x46546C67:
            return None
        json_len = struct.unpack('<I', head[12:16])[0]
        j = json.loads(f.read(json_len))
    mn = [1e9] * 3
    mx = [-1e9] * 3
    for mesh in j.get('meshes', []):
        for prim in mesh.get('primitives', []):
            acc = j['accessors'][prim['attributes']['POSITION']]
            for i in range(3):
                mn[i] = min(mn[i], acc['min'][i])
                mx[i] = max(mx[i], acc['max'][i])
    return (mn, mx) if mn[0] < 1e8 else None


def gltf_to_blender(v):
    """glTF Y-up -> Blender Z-up."""
    return Vector((v[0], -v[2], v[1]))


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)

arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for o in bpy.data.objects:
    o.hide_set(False)
    o.hide_viewport = False

parts = [
    o for o in bpy.data.objects
    if o.type == 'MESH' and o.find_armature() == arm
    and not o.name.lower().startswith('test')
]
print(f'armature: {arm.name} | pecas skinnadas: {len(parts)}')

seen = {}
def uniq_name(raw):
    n = re.sub(r'\.\d+$', '', raw)
    if n not in seen:
        seen[n] = 1
        return n
    seen[n] += 1
    return f'{n}_{seen[n]}'


def do_export(objs, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    kw = dict(filepath=path, export_format='GLB',
              export_animations=False, export_apply=False,
              export_yup=True)
    try:
        bpy.ops.export_scene.gltf(use_selection=True, **kw)
    except TypeError:
        bpy.ops.export_scene.gltf(export_use_selection=True, **kw)


sizes = {}
sem_estatica = []

d = arm.dimensions
sizes['rig'] = [round(d.x, 3), round(d.z, 3), round(d.y, 3)]
do_export([arm], os.path.join(OUT_ASSETS, 'rig.glb'))

for m in sorted(parts, key=lambda o: o.name):
    name = uniq_name(m.name)

    if STATICS_DIR:
        static_path = os.path.join(STATICS_DIR, name + '.glb')
        bounds = glb_position_bounds(static_path) if os.path.exists(static_path) else None
        if bounds is None:
            sem_estatica.append(name)
        else:
            target_c = (gltf_to_blender(bounds[0]) + gltf_to_blender(bounds[1])) / 2
            bb = [m.matrix_world @ Vector(c) for c in m.bound_box]
            cur_c = sum(bb, Vector()) / 8
            m.data.transform(Matrix.Translation(target_c - cur_c))

    d = m.dimensions  # Blender Z-up -> engine Y-up: [x, z, y]
    sizes[name] = [round(d.x, 3), round(d.z, 3), round(d.y, 3)]
    do_export([arm, m], os.path.join(OUT_ASSETS, name + '.glb'))

with open(SIZES_JSON, 'w') as f:
    json.dump({'sizes': sizes, 'errors': sem_estatica}, f, indent=1)
if sem_estatica:
    print(f'AVISO: {len(sem_estatica)} pecas sem estatica (ficaram na posicao do showroom): {sem_estatica[:10]}')
print(f'exportados: rig + {len(parts)} pecas -> {OUT_ASSETS}')
