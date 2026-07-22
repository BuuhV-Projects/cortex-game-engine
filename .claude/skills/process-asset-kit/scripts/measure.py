# Mede o bounding box (Y-up do three) de .glb que JÁ estão prontos — pra packs que
# vêm em glb direto (ex.: Kenney), sem conversão. Escreve sizes.json no formato do
# convert.py ({ sizes, errors }) + `bounds` ({ name: [minX,minY,minZ,maxX,maxY,maxZ] }
# em Y-up), que o gen-kit.mjs usa pra ancorar `top` no topo REAL — a origem do
# modelo nem sempre está na base. Não re-exporta (preserva o glb original).
#
# Uso (Blender headless):
#   blender -b -P measure.py -- <list.txt> <sizes.json>
#   - list.txt: um caminho .glb por linha
import bpy, sys, json, os
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
paths = [ln.strip() for ln in open(argv[0], encoding="utf-8") if ln.strip()]
out = argv[1]

def clear():
    bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete()
    for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures):
        for d in list(blk):
            if d.users == 0:
                blk.remove(d)

sizes, bounds, errors = {}, {}, []
for i, p in enumerate(paths):
    name = os.path.splitext(os.path.basename(p))[0]
    try:
        clear()
        bpy.ops.import_scene.gltf(filepath=p)
        mn = [1e9, 1e9, 1e9]; mx = [-1e9, -1e9, -1e9]; has = False
        for obj in bpy.context.scene.objects:
            if obj.type != "MESH":
                continue
            has = True
            for c in obj.bound_box:
                w = obj.matrix_world @ Vector(c)
                for k in range(3):
                    mn[k] = min(mn[k], w[k]); mx[k] = max(mx[k], w[k])
        if not has:
            raise RuntimeError("sem mesh")
        # Blender Z-up → three Y-up: width=X, height=Z, depth=Y
        sizes[name] = [round(mx[0]-mn[0], 3), round(mx[2]-mn[2], 3), round(mx[1]-mn[1], 3)]
        # bounds em Y-up: three X=X, Y=Z, Z=-Y (Blender +Y vira -Z no three)
        bounds[name] = [round(v, 3) for v in
                        (mn[0], mn[2], -mx[1], mx[0], mx[2], -mn[1])]
    except Exception as e:
        errors.append({"name": name, "error": str(e)})
    if (i + 1) % 40 == 0:
        print(f"[{i+1}/{len(paths)}]", flush=True)

json.dump({"sizes": sizes, "bounds": bounds, "errors": errors}, open(out, "w", encoding="utf-8"))
print(f"MEASURE_DONE ok={len(sizes)} err={len(errors)}", flush=True)
