"""
Converte o personagem ThirdPerson (Unity StarterAssets) num GLB único com o rig +
os clipes (idle/walk/run/jump/fall/land). Os clipes vêm de FBX separados; importamos
cada um, renomeamos a action, e ligamos ao armature principal. Uso:

  blender --background --python convert_thirdperson.py -- <CHARACTER_DIR> <OUT_GLB>

CHARACTER_DIR = .../ThirdPersonController/Character
"""
import bpy, sys, os

argv = sys.argv[sys.argv.index("--") + 1:]
CHAR_DIR, OUT = argv[0], argv[1]

# Cena vazia.
bpy.ops.wm.read_factory_settings(use_empty=True)

# 1) Mesh + rig.
bpy.ops.import_scene.fbx(filepath=os.path.join(CHAR_DIR, "Models", "Armature.fbx"))
main_arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
assert main_arm, "armature não encontrado no Armature.fbx"
if not main_arm.animation_data:
    main_arm.animation_data_create()

# 2) Clipes (nome lógico -> arquivo FBX de animação).
CLIPS = {
    "idle": "Stand--Idle.anim.fbx",
    "walk": "Locomotion--Walk_N.anim.fbx",
    "run": "Locomotion--Run_N.anim.fbx",
    "jump": "Jump--Jump.anim.fbx",
    "fall": "Jump--InAir.anim.fbx",
    "land": "Locomotion--Run_N_Land.anim.fbx",
}
adir = os.path.join(CHAR_DIR, "Animations")

for clip, fname in CLIPS.items():
    path = os.path.join(adir, fname)
    if not os.path.exists(path):
        print("PULANDO (não existe):", path)
        continue
    before_objs = set(bpy.data.objects)
    before_acts = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=path)
    new_acts = [a for a in bpy.data.actions if a not in before_acts]
    if new_acts:
        act = new_acts[0]
        act.name = clip
        act.use_fake_user = True
        track = main_arm.animation_data.nla_tracks.new()
        track.name = clip
        start = int(act.frame_range[0])
        track.strips.new(clip, start, act)
        print("CLIPE OK:", clip, "<-", fname)
    else:
        print("SEM ACTION em:", fname)
    # remove o que veio do FBX de anim (armature+mesh duplicados), mantém a action.
    for o in set(bpy.data.objects) - before_objs:
        bpy.data.objects.remove(o, do_unlink=True)

# 2.5) Texturas: liga albedo (sRGB) + normal por material (Arms/Body/Legs).
TEX = os.path.join(CHAR_DIR, "Textures")

def load_img(name):
    p = os.path.join(TEX, name)
    if not os.path.exists(p):
        print("TEX faltando:", name)
        return None
    return bpy.data.images.load(p, check_existing=True)

mesh_obj = next((o for o in bpy.data.objects if o.type == "MESH"), None)
if mesh_obj:
    for slot in mesh_obj.material_slots:
        mat = slot.material
        if not mat:
            continue
        nl = mat.name.lower()
        part = "Arms" if "arm" in nl else "Body" if "body" in nl else "Legs" if "leg" in nl else None
        print("MAT:", mat.name, "-> part:", part)
        if not part:
            continue
        mat.use_nodes = True
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            continue
        alb = load_img("Armature_%s_AlbedoTransparency.tif" % part)
        if alb:
            alb.colorspace_settings.name = "sRGB"
            tn = nt.nodes.new("ShaderNodeTexImage")
            tn.image = alb
            nt.links.new(tn.outputs["Color"], bsdf.inputs["Base Color"])
        nrm = load_img("Armature_%s_Normal.tif" % part)
        if nrm:
            nrm.colorspace_settings.name = "Non-Color"
            tn2 = nt.nodes.new("ShaderNodeTexImage")
            tn2.image = nrm
            nmap = nt.nodes.new("ShaderNodeNormalMap")
            nt.links.new(tn2.outputs["Color"], nmap.inputs["Color"])
            nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

# 2.6) Reduz as texturas pra 1024 (as .tif originais são enormes; placeholder de teste).
MAXTEX = 1024
for im in bpy.data.images:
    if im.size[0] > MAXTEX or im.size[1] > MAXTEX:
        im.scale(min(im.size[0], MAXTEX), min(im.size[1], MAXTEX))
        print("RESIZE:", im.name, "->", tuple(im.size))

# 3) Export GLB com todas as animações (modo NLA_TRACKS = 1 anim por track).
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    export_animations=True,
    export_animation_mode="NLA_TRACKS",
    export_yup=True,
)
print("EXPORTADO:", OUT)
print("ACTIONS:", [a.name for a in bpy.data.actions])
