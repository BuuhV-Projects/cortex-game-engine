"""Etapa `preview` do auto-rig do Studio (SPEC-0724): renderiza o `<work>/skinned/rig-skinned.blend` em repouso e
em cada pose de `skinned.preview`, de frente, de lado e de 3/4 de costas, com o ESQUELETO por cima do corpo (para
ver se as juntas batem com ele), e junta tudo na folha `<work>/skinned/previa/folha.png` (+ `shots.json`).

O esqueleto é um octaedro fino por osso e uma esfera por junta, presos ao osso (seguem a pose), renderizados numa
segunda passada sem o corpo, com cor chapada por cadeia, e aplicados por cima da imagem do corpo.
"""
import json
import math
import os
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from autorig_common import log, run_stage  # noqa: E402
from autorig_skeleton import ARMATURE_NAME, chain_of, side_of  # noqa: E402

VIEWS = {'frente': (0.0, -1.0, 0.0), 'lado': (1.0, 0.0, 0.0), 'costas 3/4': (-0.7, 0.7, 0.0)}
RES = (420, 620)
CAMERA_DIST = 6.0
FRAME_MARGIN = 1.22        # folga do enquadramento sobre a altura do personagem
BONE_WIDTH = 0.08          # largura do octaedro, em comprimento do osso
BONE_WIDTH_MAX = 0.025     # m
JOINT_RADIUS = 0.018       # m
OVERLAY_ALPHA = 0.9
BACKGROUND = (0.92, 0.92, 0.92)
LABEL_SIZE = 0.045          # altura do rótulo, em altura do quadro
LABEL_MARGIN = 0.03
# cores chapadas por cadeia (as dos marcadores do painel, SPEC-0349)
COLORS = {'spine': (0.13, 0.83, 0.93), 'armLeft': (0.64, 0.9, 0.21), 'armRight': (0.98, 0.8, 0.08),
          'legLeft': (0.98, 0.57, 0.24), 'legRight': (0.96, 0.45, 0.71), 'label': (0.05, 0.05, 0.05)}
EXTREME_BONES = ('LeftUpLeg', 'RightUpLeg', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm')
COLS = 3


def color_key(bone_name):
    c = chain_of(bone_name)
    return f'{c}{side_of(bone_name)}' if c else 'spine'


def octahedron(length):
    """Octaedro do osso no espaço dele (Y ao longo do osso, da cabeça à cauda), como o do Blender."""
    w = min(BONE_WIDTH * length, BONE_WIDTH_MAX)
    bm = bmesh.new()
    head, tail = bm.verts.new((0, 0, 0)), bm.verts.new((0, length, 0))
    ring = [bm.verts.new((x * w, 0.2 * length, z * w)) for x, z in ((1, 0), (0, 1), (-1, 0), (0, -1))]
    for i in range(4):
        a, b = ring[i], ring[(i + 1) % 4]
        bm.faces.new((head, a, b))
        bm.faces.new((tail, b, a))
    return bm


def skeleton_objects(arm):
    """Um objeto por osso (octaedro + esfera na cabeça), filho do osso: segue a pose."""
    coll = bpy.data.collections.new('skeleton')
    bpy.context.scene.collection.children.link(coll)
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    for b in arm.data.bones:
        bm = octahedron(b.length)
        sphere = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=JOINT_RADIUS)
        del sphere
        me = bpy.data.meshes.new(f'bone-{b.name}')
        bm.to_mesh(me)
        bm.free()
        obj = bpy.data.objects.new(me.name, me)
        obj.color = (*COLORS[color_key(b.name)], 1.0)
        coll.objects.link(obj)
        obj.parent = arm
        obj.parent_type = 'BONE'
        obj.parent_bone = b.name
        # o filho de osso nasce na CAUDA do osso; volta para a cabeça, no eixo do osso
        obj.matrix_world = arm.matrix_world @ b.matrix_local
    return coll


def label_object(text):
    curve = bpy.data.curves.new('label', 'FONT')
    curve.body = text
    obj = bpy.data.objects.new('label', curve)
    obj.color = (*COLORS['label'], 1.0)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def aim(cam, target, d, scale):
    d = Vector(d).normalized()
    cam.data.ortho_scale = scale
    cam.location = target + d * CAMERA_DIST
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()


def place_label(label, cam, scale):
    """Rótulo no canto de cima à esquerda, de frente para a câmera."""
    rot = cam.rotation_euler.to_matrix()
    right, up, back = rot @ Vector((1, 0, 0)), rot @ Vector((0, 1, 0)), rot @ Vector((0, 0, 1))
    aspect = RES[0] / RES[1]
    half_h, half_w = scale / 2, scale / 2 * aspect
    size = LABEL_SIZE * scale
    corner = cam.location - back * 1.0 + right * (-half_w + LABEL_MARGIN * scale) + up * (half_h - LABEL_MARGIN * scale - size)
    label.data.size = size
    label.matrix_world = Matrix.Translation(corner) @ rot.to_4x4()


def render_pass(scene, path, show_body, body, skeleton, label):
    body.hide_render = not show_body
    skeleton.hide_render = show_body
    label.hide_render = show_body
    scene.render.film_transparent = not show_body
    scene.display.shading.light = 'STUDIO' if show_body else 'FLAT'
    scene.display.shading.color_type = 'TEXTURE' if show_body else 'OBJECT'
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def load_rgba(path):
    img = bpy.data.images.load(str(path))
    px = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    size = tuple(img.size)
    bpy.data.images.remove(img)
    return px.reshape(size[1], size[0], 4)


def save_rgba(arr, path):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(Path(path).stem, w, h, alpha=True)
    img.pixels.foreach_set(arr.astype(np.float32).ravel())
    img.filepath_raw = str(path)
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


def composite(body_path, bones_path, out_path):
    body, bones = load_rgba(body_path), load_rgba(bones_path)
    a = bones[..., 3:4] * OVERLAY_ALPHA
    out = body.copy()
    out[..., :3] = body[..., :3] * (1 - a) + bones[..., :3] * a
    out[..., 3] = 1.0
    save_rgba(out, out_path)
    return out


def sheet(images, path):
    """Folha: três imagens por linha (frente, lado, costas 3/4), na ordem das poses."""
    rows = (len(images) + COLS - 1) // COLS
    h, w = RES[1], RES[0]
    out = np.ones((rows * h, COLS * w, 4), dtype=np.float32)
    for i, im in enumerate(images):
        r, c = i // COLS, i % COLS
        # as linhas da imagem do Blender vão de baixo para cima: a primeira pose fica no alto da folha
        y0 = (rows - 1 - r) * h
        out[y0:y0 + h, c * w:(c + 1) * w] = im
    save_rgba(out, path)


def most_extreme(arm, action):
    first, last = (int(v) for v in action.frame_range)
    best, best_f = -math.inf, first
    for f in range(first, last + 1):
        bpy.context.scene.frame_set(f)
        s = sum(arm.pose.bones[b].matrix_basis.to_quaternion().angle for b in EXTREME_BONES)
        if s > best:
            best, best_f = s, f
    return best_f


def pose_frame(arm, pose, marks, fps):
    clip, mark = pose.get('clip'), pose.get('mark')
    if clip is None:
        arm.animation_data_create()
        arm.animation_data.action = None
        for pb in arm.pose.bones:
            pb.matrix_basis.identity()
        return 0
    action = bpy.data.actions[clip]
    arm.animation_data.action = action
    if action.slots:
        arm.animation_data.action_slot = action.slots[0]
    if mark:
        return int(round(marks[clip][mark] * fps))
    return most_extreme(arm, action)


def setup_scene(work):
    bpy.ops.wm.open_mainfile(filepath=str(work / 'skinned' / 'rig-skinned.blend'))
    scene = bpy.context.scene
    arm = bpy.data.objects[ARMATURE_NAME]
    if arm.animation_data:
        for t in arm.animation_data.nla_tracks:
            t.mute = True
    body = next(o for o in bpy.data.objects if o.type == 'MESH')
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x, scene.render.resolution_y = RES
    # cor chapada sem a curva do AgX (ela lava as cores do esqueleto e acinzenta o rótulo)
    scene.view_settings.view_transform = 'Standard'
    scene.world = bpy.data.worlds.new('fundo')
    scene.world.color = BACKGROUND
    scene.render.image_settings.color_mode = 'RGBA'
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    scene.collection.objects.link(cam)
    scene.camera = cam
    return scene, arm, body, cam


def stage(cfg, result):
    work = Path(cfg['work'])
    out = work / 'skinned' / 'previa'
    out.mkdir(parents=True, exist_ok=True)
    scene, arm, body, cam = setup_scene(work)
    skeleton = skeleton_objects(arm)
    label = label_object('')
    height = cfg['transform']['height']
    scale = height * FRAME_MARGIN
    sidecar = json.loads((work / 'staging' / f'{cfg["code"]}-skinned.json').read_text(encoding='utf-8'))
    marks = {n: c.get('marks', {}) for n, c in sidecar['clips'].items()}
    shots, images, frames = [], [], {}
    for pose in [{'label': 'repouso'}] + cfg['skinned']['preview']:
        frame = pose_frame(arm, pose, marks, scene.render.fps)
        scene.frame_set(frame)
        frames[pose['label']] = frame
        hips = arm.matrix_world @ arm.pose.bones['Hips'].head
        target = Vector((hips.x, hips.y, height / 2 + hips.z - arm.data.bones['Hips'].head_local.z))
        for view, d in VIEWS.items():
            aim(cam, target, d, scale)
            label.data.body = f'{pose["label"]} - {view}'
            place_label(label, cam, scale)
            stem = f'{pose["label"]}-{view}'.replace(' ', '-').replace('/', '')
            render_pass(scene, out / f'{stem}.corpo.png', True, body, skeleton, label)
            render_pass(scene, out / f'{stem}.ossos.png', False, body, skeleton, label)
            images.append(composite(out / f'{stem}.corpo.png', out / f'{stem}.ossos.png', out / f'{stem}.png'))
            for tmp in ('corpo', 'ossos'):
                (out / f'{stem}.{tmp}.png').unlink()
            shots.append({'file': f'{stem}.png', 'label': f'{pose["label"]} · {view}'})
    sheet(images, out / 'folha.png')
    (out / 'shots.json').write_text(json.dumps(shots, ensure_ascii=False, indent=1), encoding='utf-8', newline='\n')
    result['metrics']['frames'] = frames
    result['metrics']['shots'] = len(shots)
    log(f'folha: {out / "folha.png"} ({len(shots)} imagens)')


run_stage(stage)
