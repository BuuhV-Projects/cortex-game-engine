"""Esqueleto do auto-rig (SPEC-0724): juntas dos marcadores → layout dos 26 ossos do LUC-01 (22 do Mixamo, sem
dedos, mais os auxiliares de meia-rotação do cotovelo e do joelho) → armature, com os mesmos eixos do player.
"""
import bpy
from mathutils import Vector

import autorig_markers as markers

ARMATURE_NAME = 'SkinRig'
SIDES = {'Left': 1.0, 'Right': -1.0}
ARM_CHAIN = ('Arm', 'ForeArm', 'Hand', 'ElbowHelper')
LEG_CHAIN = ('UpLeg', 'Leg', 'Foot', 'ToeBase', 'KneeHelper')
# auxiliares de meia-rotação (não existem no Mixamo): mesmo repouso do osso de baixo, filhos do de cima
HELPERS = {'ElbowHelper': ('Arm', 'ForeArm'), 'KneeHelper': ('UpLeg', 'Leg')}
MIXAMO_BONES = 22
BONE_COUNT = MIXAMO_BONES + len(SIDES) * len(HELPERS)
SLICE = 0.03           # fatia de altura (m) para achar a profundidade da coluna e dos membros
LIMB_HALF = 0.06       # meia largura (m) da fatia de um membro em torno da junta
DECIMALS = 4
# o Z local de cada osso aponta para a frente (−Y do Blender, +Z do glTF), como no Mixamo e no LUC-01
FRONT = Vector((0.0, -1.0, 0.0))
# pé e dedão apontam para a frente: o Z deles fica perpendicular a ela e sai da conferência
AXIS_EXEMPT = ('Foot', 'ToeBase')
AXIS_BACK_TOL = -0.05


def short(name):
    return name.split(':')[-1]


def side_of(name):
    return next((s for s in SIDES if name.startswith(s)), None)


def part_of(name):
    s = side_of(name)
    return name[len(s):] if s else name


def chain_of(name):
    p = part_of(name)
    return 'arm' if p in ARM_CHAIN else 'leg' if p in LEG_CHAIN else None


def helper_of(name):
    """(osso de cima, osso de baixo) se `name` é auxiliar, senão None."""
    p = part_of(name)
    if p not in HELPERS:
        return None
    s = side_of(name)
    upper, lower = HELPERS[p]
    return s + upper, s + lower


def mesh_center_y(mesh_obj, z, half_width, x=0.0):
    """Profundidade (y) do centro da malha na altura z, pelos vértices e pelas arestas que cruzam z (SPEC-0725)."""
    points = [tuple(mesh_obj.matrix_world @ v.co) for v in mesh_obj.data.vertices]
    edges = [tuple(e.vertices) for e in mesh_obj.data.edges]
    y = markers.slice_depth(points, edges, z, x, half_width, SLICE)
    if y is None:
        raise ValueError(f'fatia vazia da malha em x={round(x, 3)} z={round(z, 3)}')
    return y


def marker_joints(cfg, mesh_obj, frame, result):
    """Juntas no plano frontal (lado +x) a partir dos marcadores do Studio, na escala do corpo já importado."""
    sk = cfg['skinned']
    raw = markers.load(sk['markers'], cfg, cfg['project'])
    center, scale = frame
    game = {k: markers.to_game(p, cfg['transform']['rotateZDeg'], center, scale) for k, p in raw.items()}
    front = markers.frontal(game)
    result['metrics']['markers'] = {k: [round(v, 3) for v in p] for k, p in front.items()}
    top = max((mesh_obj.matrix_world @ v.co).z for v in mesh_obj.data.vertices)
    j = markers.derive(front, top, cfg['transform']['height'])
    for problem in markers.sanity(j):
        result['failures'].append(f'marcadores: {problem}')
    return j


def skeleton_layout(mesh_obj, j, height):
    """Cabeça, cauda e pai de cada osso (repouso = a pose da malha). Profundidade: o centro da fatia da malha."""
    shoulder_x = j['shoulder'][0]
    spine = {k: Vector((0.0, mesh_center_y(mesh_obj, j[k][1], shoulder_x), j[k][1])) for k in (*markers.SPINE, 'HeadEnd')}

    def limb(k):
        x, z = j[k]
        return Vector((x, mesh_center_y(mesh_obj, z, LIMB_HALF, x), z))

    pts = {k: limb(k) for k in ('shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle')}
    # a ponta da mão passa dos dedos (fora da malha): mesma profundidade do punho
    pts['handTip'] = Vector((j['handTip'][0], pts['wrist'].y, j['handTip'][1]))
    pts['ball'], pts['toe'] = (Vector(p) for p in markers.foot(pts['ankle'].x, pts['ankle'].y, height))
    pts['clavicle'] = Vector((j['clavicle'][0], spine['Spine2'].y, j['clavicle'][1]))
    bones = {
        'Hips': (spine['Hips'], spine['Spine'], None),
        'Spine': (spine['Spine'], spine['Spine1'], 'Hips'),
        'Spine1': (spine['Spine1'], spine['Spine2'], 'Spine'),
        'Spine2': (spine['Spine2'], spine['Neck'], 'Spine1'),
        'Neck': (spine['Neck'], spine['Head'], 'Spine2'),
        'Head': (spine['Head'], spine['HeadEnd'], 'Neck'),
    }
    for side, s in SIDES.items():
        m = lambda k: Vector((s * pts[k].x, pts[k].y, pts[k].z))  # noqa: E731
        bones[side + 'Shoulder'] = (m('clavicle'), m('shoulder'), 'Spine2')
        bones[side + 'Arm'] = (m('shoulder'), m('elbow'), side + 'Shoulder')
        bones[side + 'ForeArm'] = (m('elbow'), m('wrist'), side + 'Arm')
        bones[side + 'Hand'] = (m('wrist'), m('handTip'), side + 'ForeArm')
        bones[side + 'UpLeg'] = (m('hip'), m('knee'), 'Hips')
        bones[side + 'Leg'] = (m('knee'), m('ankle'), side + 'UpLeg')
        bones[side + 'Foot'] = (m('ankle'), m('ball'), side + 'Leg')
        bones[side + 'ToeBase'] = (m('ball'), m('toe'), side + 'Foot')
        for helper, (upper, lower) in HELPERS.items():
            head, tail, _ = bones[side + lower]
            bones[side + helper] = (head, tail, side + upper)
    return bones


def build_armature(layout):
    data = bpy.data.armatures.new(ARMATURE_NAME)
    arm = bpy.data.objects.new(ARMATURE_NAME, data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for name, (head, tail, _) in layout.items():
        b = data.edit_bones.new(name)
        b.head, b.tail = head, tail
        b.align_roll(FRONT)  # Z local para a frente, x local no plano do corpo, como no Mixamo
    for name, (head, _, parent) in layout.items():
        if parent:
            b = data.edit_bones[name]
            b.parent = data.edit_bones[parent]
            b.use_connect = (data.edit_bones[parent].tail - head).length < 1e-6
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def check_axes(arm, result):
    """Nenhum osso (fora pé e dedão) com o Z local para trás: é o que inverte a pegada e as poses nos NPCs."""
    backward = [b.name for b in arm.data.bones if part_of(b.name) not in AXIS_EXEMPT
                and (b.matrix_local.to_3x3() @ Vector((0.0, 0.0, 1.0))).dot(FRONT) < AXIS_BACK_TOL]
    result['metrics']['bones_z_backward'] = backward
    if backward:
        result['failures'].append(f'ossos com o Z local para trás: {backward}')


def game_pivots(arm):
    """Ombro/cotovelo e quadril/joelho no formato do catálogo do DDD 61 (membro 1 = perna −X, 2 = perna +X,
    3 = braço −X, 4 = braço +X; [superior, inferior]) e no espaço do glTF: Blender x, y, z → x, z, −y."""
    to_gltf = lambda v: [round(v.x, DECIMALS), round(v.z, DECIMALS), round(-v.y, DECIMALS)]  # noqa: E731
    head = lambda name: to_gltf(arm.data.bones[name].head_local)  # noqa: E731
    limbs = {'1': ('Right', 'UpLeg', 'Leg'), '2': ('Left', 'UpLeg', 'Leg'), '3': ('Right', 'Arm', 'ForeArm'), '4': ('Left', 'Arm', 'ForeArm')}
    return {k: [head(side + upper), head(side + lower)] for k, (side, upper, lower) in limbs.items()}


def arm_reach(arm):
    """Do ombro ao meio da mão com o braço no repouso (m)."""
    b = arm.data.bones
    hand = (b['LeftHand'].head_local + b['LeftHand'].tail_local) / 2
    return round((hand - b['LeftArm'].head_local).length, DECIMALS)


def bone_length_check(layout, result):
    """Osso de comprimento zero não tem direção (o retarget e o bone heat quebram nele)."""
    tiny = [n for n, (head, tail, _) in layout.items() if (tail - head).length < 1e-4]
    if tiny:
        result['failures'].append(f'ossos sem comprimento: {tiny}')
    result['metrics']['shortest_bone_m'] = round(min((t - h).length for h, t, _ in layout.values()), DECIMALS)
    return not tiny
