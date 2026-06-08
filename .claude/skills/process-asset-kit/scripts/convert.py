import bpy, sys, json, os

argv = sys.argv[sys.argv.index("--") + 1:]
list_path, sizes_out = argv[0], argv[1]

with open(list_path, "r", encoding="utf-8") as f:
    pairs = [ln.strip().split("|") for ln in f if ln.strip()]

sizes = {}
errors = []

def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures):
        for d in list(block):
            if d.users == 0:
                block.remove(d)

for i, (src, dst) in enumerate(pairs):
    name = os.path.splitext(os.path.basename(dst))[0]
    try:
        clear()
        bpy.ops.import_scene.gltf(filepath=src)
        # bbox em world space (Blender Z-up)
        mn = [1e9, 1e9, 1e9]; mx = [-1e9, -1e9, -1e9]
        has = False
        for obj in bpy.context.scene.objects:
            if obj.type != "MESH":
                continue
            has = True
            for c in obj.bound_box:
                w = obj.matrix_world @ __import__("mathutils").Vector(c)
                for k in range(3):
                    mn[k] = min(mn[k], w[k]); mx[k] = max(mx[k], w[k])
        if not has:
            raise RuntimeError("sem mesh")
        dx, dy, dz = (mx[0]-mn[0], mx[1]-mn[1], mx[2]-mn[2])
        # Blender Z-up -> three Y-up: width=X, height=Z, depth=Y
        sizes[name] = [round(dx, 3), round(dz, 3), round(dy, 3)]
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", use_selection=True)
    except Exception as e:
        errors.append({"name": name, "error": str(e)})
    if (i + 1) % 25 == 0:
        print(f"[{i+1}/{len(pairs)}]", flush=True)

with open(sizes_out, "w", encoding="utf-8") as f:
    json.dump({"sizes": sizes, "errors": errors}, f, indent=2)
print(f"DONE ok={len(sizes)} err={len(errors)}", flush=True)
