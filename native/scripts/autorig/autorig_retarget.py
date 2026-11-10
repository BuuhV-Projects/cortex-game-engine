"""Retarget dos FBX do Mixamo para o esqueleto do auto-rig (SPEC-0724), com a mesma conta do pipeline do DDD 61:
o repouso do personagem vai por conta à T-pose do Mixamo (cada osso gira até apontar como o de origem); daí
R(t) = R_src(t) · R_src_rest⁻¹ · R_dst_T. Só FBX do Mixamo (nomes `mixamorig:<osso>`); outras fontes ficam para os
ganchos do projeto.
"""
import math
import os

import bpy
from mathutils import Matrix, Quaternion, Vector

from autorig_offsets import ARM_OFFSET_KEYS, FOLLOW_BONES, arm_offsets, follow_constraints, pose_offsets
from autorig_skeleton import SIDES, helper_of, part_of, short

HELPER_SHARE = 0.5
DECIMALS = 4
# o repouso do Mixamo (T-pose) tem o pé ~20° pra fora; pé e dedão do personagem ficam no repouso da malha e
# levam só o giro do mocap a partir do repouso (como o Mixamo aplica nos personagens dele)
REST_DELTA_PARTS = ('Foot', 'ToeBase')
ARM_PARTS = ('Shoulder', 'Arm', 'ForeArm', 'Hand')


def rotation(m):
    return m.to_3x3().normalized()


def _hips_root_motion(hips, out):
    """O FBX anda: a deriva horizontal do quadril sai (a cápsula anda) e vira a passada (m/ciclo). No sentido do
    passo o quadril fica parado (o mocap acelera e freia dentro do passo); o balanço de lado e a subida ficam."""
    drift = hips[-1] - hips[0]
    drift.z = 0.0
    for i, h in enumerate(hips):
        h -= drift * (i / (len(hips) - 1))
    if drift.length > 1e-9:
        along = drift.normalized()
        for h in hips:
            h -= along * (h - hips[0]).dot(along)
    out['stride'] = round(drift.length, DECIMALS)


def _hips_jump(hips, rest_z, fps, out):
    """A física sobe a cápsula: o quadril perde a subida (fica o agachamento); marcas em s."""
    rise = [h.z - rest_z for h in hips]
    apex = max(range(len(rise)), key=lambda i: rise[i])
    takeoff = max((i for i in range(apex) if rise[i] <= 0), default=0)
    land = min((i for i in range(apex + 1, len(rise)) if rise[i] <= 0), default=len(rise) - 1)
    out['marks'] = {'takeoff': round(takeoff / fps, DECIMALS), 'apex': round(apex / fps, DECIMALS), 'land': round(land / fps, DECIMALS)}
    for h, r in zip(hips, rise):
        h.z -= max(0.0, r)


def _sample(src, mw, mixamo, src_rest_rot, dst_t_rot, dst_hip_rest, src_hip_rest, scale, first, last):
    src_pose = {short(pb.name): pb for pb in src.pose.bones}
    rots, hips, src_dirs = [], [], []
    scene = bpy.context.scene
    for f in range(first, last + 1):
        scene.frame_set(f)
        rots.append({n: rotation(mw @ src_pose[n].matrix) @ src_rest_rot[n].inverted() @ dst_t_rot[n] for n in mixamo})
        hips.append(dst_hip_rest + ((mw @ src_pose['Hips'].head) - src_hip_rest) * scale)
        src_dirs.append({n: ((mw @ src_pose[n].tail) - (mw @ src_pose[n].head)).normalized() for n in mixamo})
    return rots, hips, src_dirs


def _apply_adjustments(clip, rots, hips, layout, mixamo, dst_bones, dst_t_rot, out):
    """Ajustes de braço, pose por junta e "seguir" da aba Animações; devolve os ossos que saem da conferência."""
    offsets = {k: clip.get(k, 0.0) for k in ARM_OFFSET_KEYS}
    adjusted = set()
    if any(offsets.values()):
        rots[:] = [arm_offsets(r, dst_t_rot, *offsets.values()) for r in rots]
        out['armOffsets'] = offsets
        adjusted |= {side + b for side in SIDES for b in ARM_PARTS}
    rest_rots = {n: rotation(dst_bones[n].matrix_local) for n in mixamo}
    parent_of = lambda n: layout[n][2]  # noqa: E731
    pose = {n: q for n, q in clip.get('pose', {}).items() if n in mixamo}
    if pose:
        rots[:] = [pose_offsets(r, rest_rots, parent_of, mixamo, pose) for r in rots]
        out['poseOffsets'] = pose

    def chain(f):
        mid = layout[f][2]
        return {f, mid, layout[mid][2]}
    # quem segue é mão/pé; o alvo não pode estar na própria cadeia (seguiria a si mesmo)
    follows = [c for c in clip.get('follow', []) if c.get('bone') in FOLLOW_BONES and c.get('target') in mixamo and c['target'] not in chain(c['bone'])]
    if follows:
        rest_heads = {n: dst_bones[n].head_local.copy() for n in mixamo}
        rots[:] = [follow_constraints(r, h, rest_rots, rest_heads, parent_of, mixamo, follows) for r, h in zip(rots, hips)]
        out['follow'] = follows
    posed = set()
    chains = {layout[layout[c['bone']][2]][2] for c in follows}  # braço/coxa de quem segue (e o resto abaixo)
    for n in mixamo:  # ordem da hierarquia: o pai vem antes
        if n in pose or n in chains or layout[n][2] in posed:
            posed.add(n)
    return adjusted | posed | {n for n in mixamo if part_of(n) in REST_DELTA_PARTS}


def _mark_shot(clip, rots, fps, out):
    """Tiro: o quadro antes do primeiro em que o giro do osso chega à metade do máximo."""
    b = clip['shot']
    turn = [0.0] + [(rots[i][b] @ rots[i - 1][b].inverted()).to_quaternion().angle for i in range(1, len(rots))]
    kick = next(i for i, v in enumerate(turn) if v >= max(turn) / 2)
    out.setdefault('marks', {})['shot'] = round(max(0, kick - 1) / fps, DECIMALS)


def _key_frames(arm, layout, rots, hips, src_dirs, limits, adjusted):
    """Grava os quadros na action ativa; devolve o pior erro de direção e os quadros limitados por osso."""
    order = list(layout)
    mixamo = [n for n in order if not helper_of(n)]
    rest = {n: arm.data.bones[n].matrix_local for n in order}
    prev_q, clamped = {}, {}
    worst = 0.0

    def key(n, q, frame, loc=None):
        if n in prev_q and q.dot(prev_q[n]) < 0:
            q.negate()
        prev_q[n] = q
        pb = arm.pose.bones[n]
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = q
        pb.keyframe_insert('rotation_quaternion', frame=frame)
        if loc is not None:
            pb.location = loc
            pb.keyframe_insert('location', frame=frame)

    for i, frame_rots in enumerate(rots):
        posed, bases = {}, {}
        for n in mixamo:
            parent = layout[n][2]
            limit = limits.get(part_of(n))
            if parent:
                # matrix_basis = (P_pai · B_pai⁻¹ · B)⁻¹ · P, com P = [R | presa ao pai]
                anchor = posed[parent] @ rest[parent].inverted() @ rest[n]
                pm = Matrix.Translation(anchor.translation) @ frame_rots[n].to_4x4()
                q = (anchor.inverted() @ pm).to_quaternion()
                if limit is not None and math.degrees(q.angle) > limit:
                    q = Quaternion().slerp(q, math.radians(limit) / q.angle)
                    pm = anchor @ q.to_matrix().to_4x4()
                    clamped[n] = clamped.get(n, 0) + 1
                key(n, q.copy(), i)
            else:
                pm = Matrix.Translation(hips[i]) @ frame_rots[n].to_4x4()
                loc, q, _ = (rest[n].inverted() @ pm).decompose()
                key(n, q.copy(), i, loc)
            posed[n] = pm
            bases[n] = q
            if limit is None and n not in adjusted:  # o osso limitado/ajustado sai da direção do mocap de propósito
                d_dir = (pm.to_3x3() @ Vector((0.0, 1.0, 0.0))).normalized()
                worst = max(worst, math.degrees(d_dir.angle(src_dirs[i][n], 0.0)))
        for n in order:
            pair = helper_of(n)
            if pair:  # mesmo repouso do osso de baixo: a base dele pela metade (caminho curto: w ≥ 0)
                b = bases[pair[1]]
                key(n, Quaternion().slerp(-b if b.w < 0 else b, HELPER_SHARE), i)
    return worst, clamped


def retarget(name, clip, fbx_dir, arm, layout, limits):
    """Uma trilha NLA (muda) no `arm` com o clipe do FBX. Devolve passada, marcas, erro de direção e limites."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(fbx_dir, clip['file']), automatic_bone_orientation=False, ignore_leaf_bones=False)
    new = [o for o in bpy.data.objects if o not in before]
    src = next(o for o in new if o.type == 'ARMATURE')
    first, last = (int(v) for v in src.animation_data.action.frame_range)
    mw = src.matrix_world
    src_bones = {short(b.name): b for b in src.data.bones}
    mixamo = [n for n in layout if not helper_of(n)]
    missing = [n for n in mixamo if n not in src_bones]
    if missing:
        raise ValueError(f'{clip["file"]}: o FBX não tem os ossos do Mixamo {missing}')
    dst_bones = arm.data.bones
    src_rest_rot, dst_t_rot = {}, {}
    for n in mixamo:
        sb = src_bones[n]
        src_rest_rot[n] = rotation(mw @ sb.matrix_local)
        s_dir = ((mw @ sb.tail_local) - (mw @ sb.head_local)).normalized()
        db = dst_bones[n]
        d_dir = (db.tail_local - db.head_local).normalized()
        align = Matrix.Identity(3) if part_of(n) in REST_DELTA_PARTS else d_dir.rotation_difference(s_dir).to_matrix()
        dst_t_rot[n] = align @ rotation(db.matrix_local)
    src_hip_rest = mw @ src_bones['Hips'].head_local
    dst_hip_rest = dst_bones['Hips'].head_local.copy()
    scale = dst_hip_rest.z / src_hip_rest.z
    rots, hips, src_dirs = _sample(src, mw, mixamo, src_rest_rot, dst_t_rot, dst_hip_rest, src_hip_rest, scale, first, last)
    fps = bpy.context.scene.render.fps
    out = {'loop': bool(clip.get('loop')), 'fps': fps, 'frames': len(rots), 'duration': round((len(rots) - 1) / fps, DECIMALS)}
    if clip.get('rootMotion'):
        _hips_root_motion(hips, out)
    if clip.get('jump'):
        _hips_jump(hips, dst_hip_rest.z, fps, out)
    adjusted = _apply_adjustments(clip, rots, hips, layout, mixamo, dst_bones, dst_t_rot, out)
    if clip.get('shot') in mixamo:
        _mark_shot(clip, rots, fps, out)
    action = bpy.data.actions.new(name)
    arm.animation_data_create()
    arm.animation_data.action = action
    worst, clamped = _key_frames(arm, layout, rots, hips, src_dirs, limits, adjusted)
    track = arm.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, action)
    track.mute = True
    arm.animation_data.action = None
    action.use_fake_user = True
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        if a.users == 0:
            bpy.data.actions.remove(a)
    out['direction_error_max_deg'] = round(worst, 3)
    if clamped:
        out['clamped_frames'] = clamped
    if out['loop']:
        # fase: fração do ciclo em que a coxa direita (−X) está mais atrás (+y no Blender); laços diferentes
        # misturam com a mesma perna no mesmo lugar
        back = max(range(len(src_dirs) - 1), key=lambda i: src_dirs[i]['RightUpLeg'].y)
        out['phase'] = round(back / (len(src_dirs) - 1), DECIMALS)
        seam = max(math.degrees(rots[0][n].to_quaternion().rotation_difference(rots[-1][n].to_quaternion()).angle) for n in mixamo)
        out['loop_seam_deg'] = round(min(seam, 360 - seam), 2)
    return out
