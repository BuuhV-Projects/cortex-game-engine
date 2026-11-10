"""Etapa `skin` do auto-rig do Studio (SPEC-0724, ADR-0723): corpo da fonte → esqueleto pelos marcadores do painel
(os 26 ossos e os eixos do LUC-01) → pesos → clipes do Mixamo → ganchos do projeto → GLB skinned.

Saída: `<work>/staging/<code>-skinned.glb`, `<work>/staging/<code>-skinned.json` e
`<work>/skinned/rig-skinned.blend` (a prévia renderiza dele).
"""
import importlib.util
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from autorig_common import check, import_body, log, run_stage  # noqa: E402
from autorig_retarget import retarget  # noqa: E402
from autorig_skeleton import (BONE_COUNT, arm_reach, bone_length_check, build_armature, check_axes,  # noqa: E402
                              game_pivots, marker_joints, skeleton_layout)
from autorig_weights import MAX_INFLUENCES, check_weights, skin  # noqa: E402

DIRECTION_TOL_DEG = 1.0
LOOP_SEAM_TOL_DEG = 5.0
SIDECAR_CLIP_KEYS = ('loop', 'duration', 'stride', 'marks', 'phase', 'armOffsets', 'poseOffsets', 'follow')


def run_hooks(cfg, arm, mesh_obj, layout, result, sidecar):
    """Ganchos do projeto (`skinned.hooks`): `before_export(ctx)` de cada arquivo, na ordem da lista."""
    ctx = SimpleNamespace(cfg=cfg, armature=arm, mesh=mesh_obj, layout=layout, result=result, sidecar=sidecar)
    for i, path in enumerate(cfg['skinned']['hooks']):
        spec = importlib.util.spec_from_file_location(f'autorig_hook_{i}', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        if not hasattr(module, 'before_export'):
            raise AttributeError(f'gancho sem before_export(ctx): {path}')
        log('gancho', Path(path).name)
        module.before_export(ctx)


def retarget_clips(cfg, arm, layout, result):
    sk = cfg['skinned']
    clips = {}
    for name, clip in sk['clips'].items():
        if not clip.get('file'):
            log(f'clipe {name} sem "file": fica para os ganchos do projeto')
            continue
        c = retarget(name, clip, sk['fbx'], arm, layout, sk['jointLimitsDeg'])
        clips[name] = c
        log(f'clipe {name}: {c["frames"]} quadros, direção {c["direction_error_max_deg"]}°')
        if c['direction_error_max_deg'] > DIRECTION_TOL_DEG:
            result['failures'].append(f'{name}: osso fora da direção do mocap ({c["direction_error_max_deg"]}°)')
        if c.get('loop_seam_deg', 0) > LOOP_SEAM_TOL_DEG:
            result['failures'].append(f'{name}: laço não fecha ({c["loop_seam_deg"]}°)')
    result['metrics']['clips'] = clips
    return clips


def export_glb(arm, mesh_obj, path):
    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True)
    mesh_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_skins=True,
                              export_animations=True, export_animation_mode='NLA_TRACKS', export_yup=True,
                              export_influence_nb=MAX_INFLUENCES, export_all_influences=False,
                              export_force_sampling=True, export_vertex_color='ACTIVE')


def check_glb(cfg, path, clips, result):
    """Recarrega o GLB: uma malha skinada, os 26 ossos, os clipes e o orçamento de triângulos."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent in arms]  # sem a Icosphere de exibição
    check(result, 'glb_meshes', len(meshes), low=1, high=1)
    check(result, 'glb_bones', len(arms[0].data.bones) if arms else 0, low=BONE_COUNT, high=BONE_COUNT)
    tris = sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons)
    budget = cfg.get('budget')
    check(result, 'glb_triangles', tris, low=budget and budget['minTriangles'], high=budget and budget['maxTriangles'])
    names = [a.name for a in bpy.data.actions]
    missing = [n for n in clips if not any(a.startswith(n) for a in names)]
    if missing:
        result['failures'].append(f'animações faltando no GLB: {missing}')


def stage(cfg, result):
    work = Path(cfg['work'])
    for d in ('skinned', 'staging'):
        (work / d).mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mesh_obj, frame = import_body(cfg)
    log(f'corpo: {len(mesh_obj.data.vertices)} vértices, {len(mesh_obj.data.polygons)} faces')
    j = marker_joints(cfg, mesh_obj, frame, result)
    if result['failures']:
        result['failures'].append('esqueleto não gerado: ajustar os marcadores no Studio')
        return
    layout = skeleton_layout(mesh_obj, j, cfg['transform']['height'])
    if not bone_length_check(layout, result):
        return
    arm = build_armature(layout)
    check(result, 'bones', len(arm.data.bones), low=BONE_COUNT, high=BONE_COUNT)
    check_axes(arm, result)
    log('esqueleto: 26 ossos; pesando a malha (bone heat)')
    skin(mesh_obj, arm, layout, cfg['skinned']['jointBands'], result)
    check_weights(mesh_obj, result)
    clips = retarget_clips(cfg, arm, layout, result)
    sidecar = {'bones': BONE_COUNT, 'pivots': game_pivots(arm), 'armReach': arm_reach(arm),
               'clips': {n: {k: v for k, v in c.items() if k in SIDECAR_CLIP_KEYS} for n, c in clips.items()}}
    run_hooks(cfg, arm, mesh_obj, layout, result, sidecar)
    bpy.context.scene.frame_set(0)
    bpy.ops.wm.save_as_mainfile(filepath=str(work / 'skinned' / 'rig-skinned.blend'))
    glb = work / 'staging' / f'{cfg["code"]}-skinned.glb'
    export_glb(arm, mesh_obj, glb)
    (work / 'staging' / f'{cfg["code"]}-skinned.json').write_text(json.dumps(sidecar, ensure_ascii=False, indent=1) + '\n', encoding='utf-8', newline='\n')
    check_glb(cfg, glb, list(sidecar['clips']), result)
    log(f'GLB: {glb}')


run_stage(stage)
