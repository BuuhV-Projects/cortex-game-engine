"""Pesos do auto-rig (SPEC-0724): bone heat do Blender sem os auxiliares, limpo por lado e por cadeia, e as
faixas estreitas do cotovelo e do joelho no auxiliar de meia-rotação. A mesma conta do pipeline do DDD 61.
"""
import bpy

from autorig_common import check
from autorig_skeleton import SIDES, chain_of, helper_of, part_of, side_of

MAX_INFLUENCES = 4
MIN_WEIGHT = 0.01
SIDE_MARGIN = 0.02     # osso de um lado não pega vértice além disto do outro lado (m)
WEIGHT_SUM_TOL = 1e-4


def segment_distance(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (a + ab * t - p).length


def skin(mesh_obj, arm, layout, bands, result):
    """Bone heat (sem os auxiliares), sem peso do lado oposto nem de perna em braço (e vice-versa), até
    MAX_INFLUENCES por vértice; depois a faixa estreita do cotovelo e do joelho."""
    mesh_obj.vertex_groups.clear()
    for m in list(mesh_obj.modifiers):
        mesh_obj.modifiers.remove(m)
    mesh_obj.parent = None
    bpy.ops.object.select_all(action='DESELECT')
    mesh_obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    for b in arm.data.bones:
        b.use_deform = helper_of(b.name) is None
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    for b in arm.data.bones:
        b.use_deform = True
        if b.name not in mesh_obj.vertex_groups:
            mesh_obj.vertex_groups.new(name=b.name)
    groups = {g.index: g.name for g in mesh_obj.vertex_groups}
    heat_empty = fallback = 0
    for v in mesh_obj.data.vertices:
        co = mesh_obj.matrix_world @ v.co
        weights = {groups[g.group]: g.weight for g in v.groups if g.weight > 0}
        heat_empty += not weights
        nearest = min(layout, key=lambda n: segment_distance(co, layout[n][0], layout[n][1]))
        near_chain = chain_of(nearest)
        keep = {}
        for name, w in weights.items():
            s = side_of(name)
            if s and SIDES[s] * co.x < -SIDE_MARGIN:
                continue
            c = chain_of(name)
            if near_chain and c and c != near_chain:
                continue
            keep[name] = w
        keep = {k: w for k, w in sorted(keep.items(), key=lambda kv: -kv[1])[:MAX_INFLUENCES] if w >= MIN_WEIGHT}
        if not keep:
            keep = {nearest: 1.0}
            fallback += 1
        total = sum(keep.values())
        for g in list(v.groups):
            mesh_obj.vertex_groups[g.group].remove([v.index])
        for name, w in keep.items():
            mesh_obj.vertex_groups[name].add([v.index], w / total, 'REPLACE')
    result['metrics']['heat_empty'] = heat_empty
    result['metrics']['fallback_nearest'] = fallback
    result['metrics']['joint_band_vertices'] = joint_bands(mesh_obj, layout, bands)


def joint_bands(mesh_obj, layout, bands):
    """Cotovelo e joelho: o heat mistura largo e colapsa na dobra fechada; aqui o auxiliar pega 1 no centro e 0
    na borda da faixa, e fora dela o osso de cima/baixo é rígido. Só nos vértices que o heat já pôs ≥
    `membership` no membro (na A-pose o cotovelo fica perto da camiseta)."""
    counts = {}
    for name in layout:
        pair = helper_of(name)
        if not pair:
            continue
        upper, lower = pair
        cfg = bands[part_of(name)]
        joint = layout[lower][0]
        up_dir = (layout[upper][0] - joint).normalized()
        low_dir = (layout[lower][1] - joint).normalized()
        n_done = 0
        for v in mesh_obj.data.vertices:
            rel = (mesh_obj.matrix_world @ v.co) - joint
            if rel.length > cfg['reach']:
                continue
            heat = {mesh_obj.vertex_groups[g.group].name: g.weight for g in v.groups}
            if heat.get(upper, 0.0) + heat.get(lower, 0.0) < cfg['membership']:
                continue
            x = (rel.dot(low_dir) - rel.dot(up_dir)) / 2  # < 0 lado de cima, > 0 lado de baixo
            w_help = max(0.0, 1.0 - abs(x) / cfg['band'])
            for g in list(v.groups):
                mesh_obj.vertex_groups[g.group].remove([v.index])
            if w_help > 0:
                mesh_obj.vertex_groups[name].add([v.index], w_help, 'REPLACE')
            if w_help < 1:
                mesh_obj.vertex_groups[upper if x < 0 else lower].add([v.index], 1.0 - w_help, 'REPLACE')
            n_done += 1
        counts[name] = n_done
    return counts


def check_weights(mesh_obj, result):
    groups = {g.index: g.name for g in mesh_obj.vertex_groups}
    worst_sum, most, crossed, empty = 0.0, 0, 0, 0
    for v in mesh_obj.data.vertices:
        co = mesh_obj.matrix_world @ v.co
        ws = [(groups[g.group], g.weight) for g in v.groups if g.weight > 0]
        empty += not ws
        if ws:
            worst_sum = max(worst_sum, abs(sum(w for _, w in ws) - 1))
        most = max(most, len(ws))
        crossed += sum(1 for name, _ in ws if side_of(name) and SIDES[side_of(name)] * co.x < -SIDE_MARGIN)
    check(result, 'weights_empty_vertices', empty, high=0)
    check(result, 'weights_sum_error', worst_sum, high=WEIGHT_SUM_TOL)
    check(result, 'weights_max_influences', most, high=MAX_INFLUENCES)
    check(result, 'weights_wrong_side', crossed, high=0)
