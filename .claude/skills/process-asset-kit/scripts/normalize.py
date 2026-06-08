# Normaliza escala de um subconjunto de .glb (ADR-0053 §4 — gotcha de escala).
# Packs de origens diferentes vêm em unidades diferentes; depois de detectar o
# fator no lineup, aplique-o aqui (bakeado no .glb, sobrescreve o arquivo).
#
# Uso (Blender headless):
#   blender -b -P normalize.py -- <factor> <list.txt>
#   - list.txt: um caminho .glb por linha (os a reescalar)
import bpy, sys

argv = sys.argv[sys.argv.index("--") + 1:]
factor = float(argv[0])
paths = [ln.strip() for ln in open(argv[1], encoding="utf-8") if ln.strip()]

def clear():
    bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete()
    for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures):
        for d in list(blk):
            if d.users == 0:
                blk.remove(d)

ok = err = 0
for i, p in enumerate(paths):
    try:
        clear()
        bpy.ops.import_scene.gltf(filepath=p)
        # escala só os top-level (filhos herdam) e aplica no mesh data
        for o in bpy.context.scene.objects:
            if o.parent is None:
                o.scale = [s * factor for s in o.scale]
        bpy.context.view_layer.update()
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bpy.ops.export_scene.gltf(filepath=p, export_format="GLB", use_selection=True)
        ok += 1
    except Exception as e:
        print("FAIL", p, e); err += 1
    if (i + 1) % 25 == 0:
        print(f"[{i+1}/{len(paths)}]", flush=True)
print(f"NORMALIZE_DONE factor={factor} ok={ok} err={err}", flush=True)
