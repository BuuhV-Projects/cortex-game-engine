"""Comum às etapas do auto-rig do Studio (SPEC-0724): config resolvida, resultado da etapa e o corpo da fonte
na escala e orientação do esqueleto.

A config chega resolvida pelo Studio (`electron/main/autoRig/autoRigConfig.ts`): caminhos absolutos e padrões
preenchidos. Uso: blender -b --factory-startup --python <etapa>.py -- <config resolvida> <resultado>.
"""
import json
import math
import sys
import traceback
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

LOG_PREFIX = '[autorig]'


def log(*parts):
    """Linha que o painel do Studio mostra (o resto da saída do Blender fica só no log da etapa)."""
    print(LOG_PREFIX, *parts, flush=True)


def load_config():
    """Argumentos depois de `--`: <config resolvida> <arquivo de resultado>."""
    args = sys.argv[sys.argv.index('--') + 1:]
    cfg = json.loads(Path(args[0]).read_text(encoding='utf-8'))
    return cfg, Path(args[1])


def run_stage(fn):
    """Roda a etapa e grava {ok, metrics, failures, infra}; exceção vira falha de infraestrutura."""
    cfg, result_path = load_config()
    result = {'ok': False, 'metrics': {}, 'failures': [], 'infra': None}
    try:
        fn(cfg, result)
        result['ok'] = not result['failures']
    except Exception as e:  # o Studio lê a falha no resultado (o log tem o traceback)
        traceback.print_exc()
        result['infra'] = f'{type(e).__name__}: {e}'
    result_path.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding='utf-8', newline='\n')


def check(result, name, value, low=None, high=None, unit=''):
    """Guarda a medida e reprova fora de [low, high]."""
    result['metrics'][name] = round(value, 4) if isinstance(value, float) else value
    if (low is not None and value < low) or (high is not None and value > high):
        lim = f'[{round(low, 3) if low is not None else "-inf"}, {round(high, 3) if high is not None else "inf"}]'
        result['failures'].append(f'{name} = {round(value, 4)}{unit} fora de {lim}{unit}')


def import_meshes(path):
    """Importa o GLB e devolve as malhas novas (sem as que vieram antes)."""
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    return [o for o in bpy.context.scene.objects if o not in before and o.type == 'MESH']


def select_only(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def join_meshes(meshes, name):
    """Junta as malhas da fonte numa só (o esqueleto pesa uma malha)."""
    if not meshes:
        raise ValueError('a fonte não tem malha')
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    # a malha não pode ficar presa a um esqueleto que veio na fonte
    obj.parent = None
    for m in list(obj.modifiers):
        obj.modifiers.remove(m)
    obj.vertex_groups.clear()
    obj.name = name
    return obj


def source_frame(points, rotate_deg, height):
    """Centro (x, y no meio, z nos pés) e escala que levam a fonte girada à altura da config."""
    rot = Matrix.Rotation(math.radians(rotate_deg), 4, 'Z')
    co = [rot @ p for p in points]
    lo = Vector([min(c[i] for c in co) for i in range(3)])
    hi = Vector([max(c[i] for c in co) for i in range(3)])
    if hi.z - lo.z <= 0:
        raise ValueError('a fonte não tem altura')
    return Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z)), height / (hi.z - lo.z)


def import_body(cfg):
    """Corpo da fonte girado para a frente −Y (glTF +Z), pés em z = 0, na altura da config, soldado.
    Devolve a malha e (centro, escala) da fonte girada, para levar os marcadores junto."""
    t = cfg['transform']
    obj = join_meshes(import_meshes(cfg['source']), cfg['code'])
    select_only(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    center, scale = source_frame([v.co.copy() for v in obj.data.vertices], t['rotateZDeg'], 1.0)
    scale *= t['height']
    rot = Matrix.Rotation(math.radians(t['rotateZDeg']), 4, 'Z')
    for v in obj.data.vertices:
        v.co = (rot @ v.co - center) * scale
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=t['weld'])
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    if t.get('sharpAngleDeg') is not None:
        clean_normals(obj, t['sharpAngleDeg'])
    return obj, (tuple(center), scale)


def clean_normals(obj, sharp_deg):
    """Normais da própria malha: as da fonte densa não batem com a malha final e viram manchas."""
    me = obj.data
    if 'custom_normal' in me.attributes:
        me.attributes.remove(me.attributes['custom_normal'])
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(sharp_deg))
