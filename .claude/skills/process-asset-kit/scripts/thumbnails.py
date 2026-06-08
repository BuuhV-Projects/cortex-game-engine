# Renderiza 1 thumbnail por asset (vista 3/4, fundo transparente) — referência pro
# dev e pra IA, e cache do futuro inspect_assets (ADR-0037/0053). Salva em
# <kitDir>/thumbnails/<name>.png.
#
# Uso (Blender headless):
#   blender -b -P thumbnails.py -- <size_px> <thumbsDir1> <assetsDir1> [<thumbsDir2> <assetsDir2> ...]
import bpy, sys, os, math
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
size = int(argv[0])
pairs = list(zip(argv[1::2], argv[2::2]))  # (thumbsDir, assetsDir)

# cena fixa: câmera 3/4 ortográfica + sol + mundo claro (transparente no filme)
def setup_world_cam():
    cam_data = bpy.data.cameras.new("c"); cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("c", cam_data); bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    sun = bpy.data.objects.new("s", bpy.data.lights.new("s", "SUN"))
    sun.data.energy = 3.5; sun.rotation_euler = (math.radians(55), 0, math.radians(40))
    bpy.context.scene.collection.objects.link(sun)
    w = bpy.data.worlds.new("w"); w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[1].default_value = 1.2
    bpy.context.scene.world = w
    sc = bpy.context.scene
    engs = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engs else "BLENDER_EEVEE"
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    return cam

def clear_meshes():
    for o in [o for o in bpy.context.scene.objects if o.type != "CAMERA" and o.type != "LIGHT"]:
        bpy.data.objects.remove(o, do_unlink=True)
    for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures):
        for d in list(blk):
            if d.users == 0:
                blk.remove(d)

cam = setup_world_cam()
DIR = Vector((1, -1, 0.65)).normalized()
ok = err = 0
for thumbs_dir, assets_dir in pairs:
    os.makedirs(thumbs_dir, exist_ok=True)
    for f in sorted(os.listdir(assets_dir)):
        if not f.endswith(".glb"):
            continue
        name = f[:-4]
        try:
            clear_meshes()
            bpy.ops.import_scene.gltf(filepath=os.path.join(assets_dir, f).replace("\\", "/"))
            mn = Vector((1e9,)*3); mx = Vector((-1e9,)*3)
            for o in bpy.context.scene.objects:
                if o.type != "MESH":
                    continue
                for c in o.bound_box:
                    wv = o.matrix_world @ Vector(c)
                    mn = Vector((min(mn[i], wv[i]) for i in range(3))); mx = Vector((max(mx[i], wv[i]) for i in range(3)))
            center = (mn + mx) / 2; radius = max((mx - mn).length / 2, 0.01)
            cam.location = center + DIR * radius * 4
            cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
            cam.data.ortho_scale = radius * 2.2
            bpy.context.scene.render.filepath = os.path.join(thumbs_dir, name + ".png").replace("\\", "/")
            bpy.ops.render.render(write_still=True)
            ok += 1
        except Exception as e:
            print("FAIL", name, e); err += 1
        if (ok + err) % 40 == 0:
            print(f"[{ok+err}] ok={ok} err={err}", flush=True)
print(f"THUMBS_DONE ok={ok} err={err}", flush=True)
