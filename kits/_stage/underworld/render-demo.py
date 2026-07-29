# Renderiza o MAPA-DEMO de um pack (glb com a cena montada) em vistas de
# referência — é o que mostra como as peças encaixam entre si, coisa que a
# thumbnail isolada não conta.
#
# Uso (Blender headless):
#   blender -b -P render-demo.py -- <demo.glb> <saida-base> [largura]
# Gera <saida-base>-iso.png e <saida-base>-topo.png.
import bpy, sys, math
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, out_base = argv[0], argv[1]
width = int(argv[2]) if len(argv) > 2 else 1600

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
bpy.ops.import_scene.gltf(filepath=src)

# Bounds de tudo que foi importado (mundo).
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
print(f"DEMO bounds min={list(mn)} max={list(mx)} size={size:.1f}")

scene = bpy.context.scene
try:
    scene.render.engine = "BLENDER_EEVEE_NEXT"  # Blender 4.2+
except TypeError:
    scene.render.engine = "BLENDER_WORKBENCH"
scene.render.resolution_x = width
scene.render.resolution_y = int(width * 0.62)
scene.render.film_transparent = False
world = bpy.data.worlds.new("W")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.05, 0.06, 0.09, 1)
scene.world = world

sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", type="SUN"))
sun.data.energy = 4
sun.rotation_euler = (math.radians(50), 0, math.radians(35))
scene.collection.objects.link(sun)

cam_data = bpy.data.cameras.new("Cam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = size * 1.15
# Clip pro TAMANHO da cena: o default (100) deixa um mapa de centenas de
# unidades inteiramente atrás do plano distante — render sai vazio, sem erro.
cam_data.clip_start = 0.1
cam_data.clip_end = size * 6
cam = bpy.data.objects.new("Cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam


def shoot(name, direction):
    """Câmera em `center + direction`, MIRANDO no centro (track_to, não euler
    cru: ângulo escrito à mão erra o alvo e sai quadro vazio)."""
    d = direction.normalized()
    cam.location = center + d * size * 2
    # A câmera olha ao longo do -Z local: alinhe -Z com o vetor que aponta pro
    # centro (usar "Z" aqui vira a câmera de costas pra cena).
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = f"{out_base}-{name}.png"
    bpy.ops.render.render(write_still=True)
    print(f"RENDER {name} -> {scene.render.filepath}")


# Iso 3/4 (o enquadramento que mostra encaixe e altura ao mesmo tempo).
shoot("iso", Vector((1, -1, 0.85)))
# Topo puro (planta: mostra o traçado do percurso).
shoot("topo", Vector((0, 0, 1)))
print("DEMO_DONE")
