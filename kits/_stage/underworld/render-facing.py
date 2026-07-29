# Renderiza UM asset pelos 4 lados (+Z, -Z, +X, -X do three) numa tira — é como
# se descobre pra que lado a FACE de uma estátua/personagem aponta com rotY=0,
# coisa que thumbnail 3/4 não resolve.
#
# Uso: blender -b -P render-facing.py -- <asset.glb> <saida-base>
# Gera <saida-base>-{zpos,zneg,xpos,xneg}.png
import bpy, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, out_base = argv[0], argv[1]

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath=src)

mn = Vector((1e9, 1e9, 1e9))
mx = Vector((-1e9, -1e9, -1e9))
for ob in bpy.context.scene.objects:
    if ob.type != "MESH":
        continue
    for corner in ob.bound_box:
        p = ob.matrix_world @ Vector(corner)
        mn = Vector((min(mn[i], p[i]) for i in range(3)))
        mx = Vector((max(mx[i], p[i]) for i in range(3)))
center = (mn + mx) / 2
size = max((mx - mn).x, (mx - mn).y, (mx - mn).z)

scene = bpy.context.scene
try:
    scene.render.engine = "BLENDER_EEVEE_NEXT"
except TypeError:
    scene.render.engine = "BLENDER_WORKBENCH"
scene.render.resolution_x = 420
scene.render.resolution_y = 560
world = bpy.data.worlds.new("W")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.06, 0.09, 0.12, 1)
scene.world = world

sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", type="SUN"))
sun.data.energy = 5
sun.rotation_euler = (0.7, 0, 0.6)
scene.collection.objects.link(sun)

cam_data = bpy.data.cameras.new("Cam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = size * 1.2
cam_data.clip_start = 0.01
cam_data.clip_end = size * 8
cam = bpy.data.objects.new("Cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

# Blender é Z-up e o glTF vem convertido: o +Z do three é o -Y do Blender.
# Nomes abaixo estão no eixo do THREE (o que o jogo usa no `place.rotY`).
VIEWS = {
    "zpos": Vector((0, -1, 0)),
    "zneg": Vector((0, 1, 0)),
    "xpos": Vector((1, 0, 0)),
    "xneg": Vector((-1, 0, 0)),
}
for name, d in VIEWS.items():
    d = d.normalized()
    cam.location = center + d * size * 3
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = f"{out_base}-{name}.png"
    bpy.ops.render.render(write_still=True)
    print(f"FACING {name}")
print("FACING_DONE")
