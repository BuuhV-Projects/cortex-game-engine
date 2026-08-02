"""Remonta um prefab quebrado a partir da MESH-BASE + textura do pack.

`Portal_Pool-Green.fbx` veio VAZIO no pack (0 objetos) — as outras duas cores da
mesma família (blue/celestial) importam normal. Em vez de perder a variante,
reconstruímos: mesh base (`Portal Meshes And Textures/Portal_Pool.fbx`) +
`T_Pool_Green.png`, no mesmo material translúcido/emissivo dos irmãos.

Uso: blender -b -P rebuild-from-base.py -- <mesh.fbx> <textura.png> <saida.glb>
"""
import bpy, sys, os, json
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
mesh_path, tex_path, out_path = argv[0], argv[1], argv[2]

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
bpy.ops.import_scene.fbx(filepath=mesh_path)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if not meshes:
    raise SystemExit("mesh base tambem esta vazia")

# Aplica transforms (o pack traz escala de objeto não aplicada).
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

# Material: textura com alpha, emissiva (é energia de portal, não superfície).
mat = bpy.data.materials.new(name="M_Portal_Pool-Green")
mat.use_nodes = True
mat.blend_method = "BLEND"
nodes, links = mat.node_tree.nodes, mat.node_tree.links
bsdf = nodes.get("Principled BSDF")
tex = nodes.new("ShaderNodeTexImage")
tex.image = bpy.data.images.load(tex_path)
links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
bsdf.inputs["Emission Strength"].default_value = 1.0

for o in meshes:
    o.data.materials.clear()
    o.data.materials.append(mat)

mn = [1e9] * 3
mx = [-1e9] * 3
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        for k in range(3):
            mn[k] = min(mn[k], w[k])
            mx[k] = max(mx[k], w[k])

os.makedirs(os.path.dirname(out_path), exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=out_path, export_format="GLB", use_selection=True)

name = os.path.splitext(os.path.basename(out_path))[0]
print("REBUILT " + json.dumps({
    "name": name,
    "size": [round(mx[0] - mn[0], 3), round(mx[2] - mn[2], 3), round(mx[1] - mn[1], 3)],
    "bounds": [round(mn[0], 3), round(mn[2], 3), round(mn[1], 3),
               round(mx[0], 3), round(mx[2], 3), round(mx[1], 3)],
}), flush=True)
