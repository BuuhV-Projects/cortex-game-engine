"""Diagnóstico do pack de portais: escala, materiais, texturas e hierarquia.

FBX não embute textura e costuma vir em centímetros — antes de escrever o
conversor precisamos saber o que o import realmente traz.
"""
import bpy, sys, json, os

argv = sys.argv[sys.argv.index("--") + 1:]
files = argv[:-1]
out_path = argv[-1]

report = []


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures):
        for d in list(block):
            if d.users == 0:
                block.remove(d)


for src in files:
    name = os.path.splitext(os.path.basename(src))[0]
    entry = {"name": name}
    try:
        clear()
        bpy.ops.import_scene.fbx(filepath=src)
        mn = [1e9] * 3
        mx = [-1e9] * 3
        objs = []
        tris = 0
        for obj in bpy.context.scene.objects:
            objs.append({"name": obj.name, "type": obj.type, "scale": [round(v, 4) for v in obj.scale]})
            if obj.type != "MESH":
                continue
            tris += len(obj.data.loop_triangles) or len(obj.data.polygons)
            for c in obj.bound_box:
                w = obj.matrix_world @ __import__("mathutils").Vector(c)
                for k in range(3):
                    mn[k] = min(mn[k], w[k])
                    mx[k] = max(mx[k], w[k])
        entry["objects"] = objs
        entry["tris"] = tris
        if mn[0] < 1e8:
            # Blender Z-up -> three Y-up: width=X, height=Z, depth=Y
            entry["size"] = [round(mx[0] - mn[0], 3), round(mx[2] - mn[2], 3), round(mx[1] - mn[1], 3)]
            entry["minZ"] = round(mn[2], 3)
        mats = []
        for mat in bpy.data.materials:
            if mat.users == 0:
                continue
            imgs = []
            if mat.use_nodes:
                for node in mat.node_tree.nodes:
                    if node.type == "TEX_IMAGE" and node.image:
                        imgs.append({"image": node.image.name, "file": node.image.filepath, "has_data": node.image.has_data})
            mats.append({"name": mat.name, "images": imgs, "blend": mat.blend_method})
        entry["materials"] = mats
    except Exception as e:
        entry["error"] = str(e)
    report.append(entry)

with open(out_path, "w", encoding="utf-8") as f:
    json.dump(report, f, indent=2)
print("DONE", flush=True)
