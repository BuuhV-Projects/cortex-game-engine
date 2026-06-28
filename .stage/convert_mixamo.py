"""
Monta um player a partir de anims do Mixamo (mesmo esqueleto mixamorig). Usa um
personagem-base (mesh+rig+textura) e mescla as actions dos FBXs de anim, renomeadas
pra idle/walk/run/jump/fall, em NLA tracks → 1 GLB. Uso:

  blender --background --python convert_mixamo.py -- <ANIM_DIR> <OUT_GLB> [BASE_FBX]

Sem BASE_FBX: usa o Idle.fbx do ANIM_DIR como base (mesh+rig). Com BASE_FBX: usa esse
personagem como base e pega SÓ as actions dos anim FBXs (todos mixamorig → casam).
"""
import bpy, sys, os

argv = sys.argv[sys.argv.index("--") + 1:]
SRC, OUT = argv[0], argv[1]
BASE = argv[2] if len(argv) > 2 else None

# alvo lógico -> arquivo de anim (Mixamo)
CLIPS = [
    ("idle", "Idle.fbx"),
    ("walk", "Walking.fbx"),
    ("run", "Running.fbx"),
    ("jump", "Jumping.fbx"),
    ("fall", "Falling.fbx"),
]

bpy.ops.wm.read_factory_settings(use_empty=True)


def import_fbx(path):
    before_objs = set(bpy.data.objects)
    before_acts = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=True)
    new_objs = [o for o in bpy.data.objects if o not in before_objs]
    new_acts = [a for a in bpy.data.actions if a not in before_acts]
    return new_objs, new_acts


def push(arm, act, name):
    act.name = name
    act.use_fake_user = True
    tr = arm.animation_data.nla_tracks.new()
    tr.name = name
    tr.strips.new(name, int(act.frame_range[0]), act)
    print("CLIPE OK:", name)


# 1) Base (mesh + rig + textura). BASE_FBX (personagem) ou o Idle.fbx.
clips = list(CLIPS)
if BASE:
    base_objs, _ = import_fbx(BASE)
else:
    base_objs, base_acts = import_fbx(os.path.join(SRC, CLIPS[0][1]))

main_arm = next((o for o in base_objs if o.type == "ARMATURE"), None)
assert main_arm, "armature nao encontrado na base"
if not main_arm.animation_data:
    main_arm.animation_data_create()

if not BASE:
    assert base_acts, "sem action no Idle.fbx"
    push(main_arm, base_acts[0], "idle")
    clips = CLIPS[1:]  # idle já veio da base

# 2) Demais (ou todas, se BASE): importa, pega a action, remove objetos dup, NLA.
for target, fname in clips:
    path = os.path.join(SRC, fname)
    if not os.path.exists(path):
        print("FALTA:", fname)
        continue
    objs, acts = import_fbx(path)
    act = acts[0] if acts else None
    for o in objs:
        try:
            bpy.data.objects.remove(o, do_unlink=True)
        except Exception as e:
            print("rm falhou", e)
    if not act:
        print("SEM ACTION:", fname)
        continue
    push(main_arm, act, target)

# 2.5) Texturas do Mixamo vêm em 2K/4K (glb fica pesado). Cap em 1024 (suficiente pro jogo).
MAXTEX = 1024
for img in bpy.data.images:
    w, h = img.size
    if max(w, h) > MAXTEX:
        f = MAXTEX / max(w, h)
        img.scale(max(1, int(w * f)), max(1, int(h * f)))
        print("RESIZE", img.name, w, "x", h, "->", img.size[0], "x", img.size[1])

# 3) Export único (NLA tracks viram animações no glTF).
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    export_animations=True,
    export_animation_mode="NLA_TRACKS",
    export_yup=True,
)
print("EXPORTADO:", OUT)
