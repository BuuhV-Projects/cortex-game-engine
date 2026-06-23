"""
Monta o player a partir do KayKit Character Animations (CC0): Mannequin_Medium.glb
(mesh+rig) + clipes escolhidos dos GLBs de animação, renomeados pra idle/walk/run/
jump/fall/land. Uso:

  blender --background --python convert_kaykit.py -- <KAYKIT_DIR> <OUT_GLB>
"""
import bpy, sys, os

argv = sys.argv[sys.argv.index("--") + 1:]
KIT, OUT = argv[0], argv[1]

CHAR = os.path.join(KIT, "Mannequin Character", "characters", "Mannequin_Medium.glb")
GEN = os.path.join(KIT, "Animations", "gltf", "Rig_Medium", "Rig_Medium_General.glb")
MOV = os.path.join(KIT, "Animations", "gltf", "Rig_Medium", "Rig_Medium_MovementBasic.glb")

# alvo lógico -> (arquivo, nome do clipe KayKit)
CLIPS = [
    ("idle", GEN, "Idle_A"),
    ("walk", MOV, "Walking_A"),
    ("run", MOV, "Running_A"),
    ("jump", MOV, "Jump_Full_Long"),
    ("fall", MOV, "Jump_Idle"),
    ("land", MOV, "Jump_Land"),
]

bpy.ops.wm.read_factory_settings(use_empty=True)

# 1) Personagem (mesh + rig).
bpy.ops.import_scene.gltf(filepath=CHAR)
main_arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
assert main_arm, "armature não encontrado no Mannequin"
if not main_arm.animation_data:
    main_arm.animation_data_create()
keep_objs = set(bpy.data.objects)

# 2) Importa os GLBs de animação uma vez cada, coletando as actions por nome.
def import_actions(path):
    before = set(bpy.data.actions)
    before_objs = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new_acts = [a for a in bpy.data.actions if a not in before]
    # remove objetos importados (armature+mesh duplicados), mantém as actions
    for o in set(bpy.data.objects) - before_objs:
        bpy.data.objects.remove(o, do_unlink=True)
    return new_acts

pools = {}
for path in {GEN, MOV}:
    pools[path] = import_actions(path)
    print("IMPORT", os.path.basename(path), "->", [a.name for a in pools[path]])

# 3) Pra cada alvo, acha a action pelo nome KayKit, renomeia e empilha em NLA track.
for target, path, srcname in CLIPS:
    act = next((a for a in pools[path] if srcname.lower() in a.name.lower()), None)
    if not act:
        print("NÃO ACHOU:", target, "<-", srcname, "em", os.path.basename(path))
        continue
    act.name = target
    act.use_fake_user = True
    tr = main_arm.animation_data.nla_tracks.new()
    tr.name = target
    tr.strips.new(target, int(act.frame_range[0]), act)
    print("CLIPE OK:", target, "<-", srcname)

# 4) Export único.
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_animations=True, export_animation_mode="NLA_TRACKS")
print("EXPORTADO:", OUT)
