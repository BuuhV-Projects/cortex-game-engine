# Contact-sheet de verificação visual (ADR-0053 §4). Importa 1 representante por
# família de cada kit num grid, com um cubo-referência de PLAYER (1.8u) na 1ª
# célula — assim a ESCALA REAL fica evidente (packs de origens diferentes vêm em
# escalas diferentes; esse render mostra na cara).
#
# Uso (Blender headless):
#   blender -b -P lineup.py -- <sizes.json> <out.png> <assetsDir1> [assetsDir2 ...]
import bpy, sys, json, os, math, re
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
sizes = json.load(open(argv[0], encoding="utf-8"))["sizes"]
out_png = argv[1]
asset_dirs = argv[2:]

# coleta todos os glb e escolhe 1 por "família" (nome sem variante/tamanho)
def family(name):
    n = name.lower()
    n = re.sub(r"_(color\d+|singlesided|mesh|dirty|cut|waterless|covered_[a-z]|stack)", "", n)
    n = re.sub(r"_(small|medium|large)\b", "", n)
    n = re.sub(r"_[a-z]$", "", n)        # sufixo de variante _A.._Z
    n = re.sub(r"_?\d+$", "", n)          # números finais
    n = re.sub(r"_(a|b|c|d|e)$", "", n)
    return n

reps = {}
for d in asset_dirs:
    for f in sorted(os.listdir(d)):
        if not f.endswith(".glb"):
            continue
        name = f[:-4]
        fam = family(name)
        if fam not in reps:
            reps[fam] = os.path.join(d, f).replace("\\", "/")

names = list(reps.values())
bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete()

maxdim = max((max(sizes[os.path.basename(p)[:-4]]) for p in names if os.path.basename(p)[:-4] in sizes), default=4)
cell = maxdim * 1.25
COLS = max(6, round(math.sqrt(len(names) + 1)))

def place_at(objs, cx, base_z):
    mn = Vector((1e9,)*3); mx = Vector((-1e9,)*3)
    for o in objs:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector((min(mn[i], w[i]) for i in range(3)))
            mx = Vector((max(mx[i], w[i]) for i in range(3)))
    center = (mn + mx) / 2
    delta = Vector((cx - center.x, 0 - center.y, base_z - mn.z))
    for o in objs:
        o.location += delta

# player-ref 1.8u (cubo vermelho) — célula 0
bpy.ops.mesh.primitive_cube_add(size=1)
ref = bpy.context.active_object
ref.scale = (0.25, 0.25, 0.9); ref.location = (0, 0, 0.9)
mat = bpy.data.materials.new("ref"); mat.use_nodes = True
mat.node_tree.nodes["Principled BSDF"].inputs[0].default_value = (0.9, 0.1, 0.1, 1)
ref.data.materials.append(mat)

idx = 1
for p in names:
    before = set(bpy.context.scene.objects)
    try:
        bpy.ops.import_scene.gltf(filepath=p)
    except Exception as e:
        print("FAIL", p, e); continue
    imported = [o for o in bpy.context.scene.objects if o not in before]
    place_at(imported, (idx % COLS) * cell, -(idx // COLS) * cell)
    idx += 1

rows = math.ceil(idx / COLS)
gw, gh = COLS * cell, rows * cell
cam_data = bpy.data.cameras.new("cam"); cam_data.type = "ORTHO"
cam_data.ortho_scale = max(gw, gh) * 1.05
cam = bpy.data.objects.new("cam", cam_data); bpy.context.scene.collection.objects.link(cam)
cam.location = (gw/2 - cell/2, -200, -gh/2 + cell/2); cam.rotation_euler = (math.radians(90), 0, 0)
bpy.context.scene.camera = cam
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 3; sun.rotation_euler = (math.radians(50), 0, math.radians(30))
bpy.context.scene.collection.objects.link(sun)
world = bpy.data.worlds.new("w"); world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.85, 0.88, 0.92, 1)
bpy.context.scene.world = world
sc = bpy.context.scene
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
sc.render.resolution_x = 2200; sc.render.resolution_y = int(2200 * gh / gw)
sc.render.filepath = out_png
bpy.ops.render.render(write_still=True)
print("LINEUP_DONE", out_png, "items:", idx)
