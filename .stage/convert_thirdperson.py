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
