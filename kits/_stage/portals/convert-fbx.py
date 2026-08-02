"""FBX -> GLB para o pack de portais (ANIO/PeachyTea).

Diferente do `convert.py` da skill (que importa .gltf self-contained), aqui:

1. **FBX**: importa via `import_scene.fbx`.
2. **Religa textura perdida**: parte dos prefabs referencia o disco do AUTOR
   (`E:\\Blender\\Game Assets\\...`, `has_data: false`). O índice `tex_index`
   mapeia basename -> arquivo real dentro do pack e reaponta a imagem.
3. **Aplica transforms**: vários prefabs vêm com escala de objeto não aplicada
   (Pool 4.14x, Mist 1.69x). Sem aplicar, o bbox medido mente e o GLB carrega
   escala no nó.
4. **Alpha**: o pack usa `blend_method HASHED`; o efeito do vão é um plano com
   PNG alpha. Marca o material como BLEND para o glTF sair com
   `alphaMode: BLEND` em vez de recorte duro.

Emite `sizes.json` no formato da skill (`{sizes, bounds, errors}`), com `bounds`
em Y-up (three) para as âncoras do gen-kit.
"""
import bpy, sys, json, os
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
list_path, tex_dirs_path, sizes_out = argv[0], argv[1], argv[2]

with open(list_path, "r", encoding="utf-8") as f:
    pairs = [ln.strip().split("|") for ln in f if ln.strip()]

# Índice basename(lower) -> caminho real, para religar textura perdida.
tex_index = {}
with open(tex_dirs_path, "r", encoding="utf-8") as f:
    for d in [ln.strip() for ln in f if ln.strip()]:
        for root, _dirs, files in os.walk(d):
            for fn in files:
                if fn.lower().endswith((".png", ".jpg", ".jpeg", ".tga")):
                    tex_index.setdefault(fn.lower(), os.path.join(root, fn))

sizes = {}
bounds = {}
errors = []
warnings = []


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures):
        for d in list(block):
            if d.users == 0:
                block.remove(d)


def relink_images(name):
    """Reaponta imagens sem dados para o arquivo real do pack."""
    for img in bpy.data.images:
        if img.users == 0 or img.has_data:
            continue
        # `.001`/`.002` são cópias do Blender do MESMO arquivo — usa o filepath.
        base = os.path.basename(img.filepath.replace("\\", "/")).lower()
        real = tex_index.get(base)
        if real:
            img.filepath = real
            try:
                img.reload()
            except Exception as e:  # textura corrompida: segue sem ela
                warnings.append({"name": name, "image": base, "error": str(e)})
        else:
            warnings.append({"name": name, "image": base, "error": "sem arquivo no pack"})


def apply_transforms():
    bpy.ops.object.select_all(action="DESELECT")
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in meshes:
        o.select_set(True)
    if not meshes:
        return
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def set_alpha_blend():
    """O pack usa alpha HASHED; para o glTF queremos BLEND (efeito translúcido)."""
    for mat in bpy.data.materials:
        if mat.users == 0 or not mat.use_nodes:
            continue
        has_alpha = False
        for node in mat.node_tree.nodes:
            if node.type != "TEX_IMAGE" or not node.image:
                continue
            # Alpha só importa se estiver de fato ligado ao shader.
            for out in node.outputs:
                if out.name == "Alpha" and out.is_linked:
                    has_alpha = True
        if has_alpha:
            mat.blend_method = "BLEND"


for i, (src, dst) in enumerate(pairs):
    name = os.path.splitext(os.path.basename(dst))[0]
    try:
        clear()
        bpy.ops.import_scene.fbx(filepath=src)
        relink_images(name)
        apply_transforms()
        set_alpha_blend()

        mn = [1e9, 1e9, 1e9]
        mx = [-1e9, -1e9, -1e9]
        has = False
        for obj in bpy.context.scene.objects:
            if obj.type != "MESH":
                continue
            has = True
            for c in obj.bound_box:
                w = obj.matrix_world @ Vector(c)
                for k in range(3):
                    mn[k] = min(mn[k], w[k])
                    mx[k] = max(mx[k], w[k])
        if not has:
            raise RuntimeError("sem mesh")

        # Blender Z-up -> three Y-up: width=X, height=Z, depth=Y
        sizes[name] = [round(mx[0] - mn[0], 3), round(mx[2] - mn[2], 3), round(mx[1] - mn[1], 3)]
        bounds[name] = [
            round(mn[0], 3), round(mn[2], 3), round(mn[1], 3),
            round(mx[0], 3), round(mx[2], 3), round(mx[1], 3),
        ]

        os.makedirs(os.path.dirname(dst), exist_ok=True)
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", use_selection=True)
    except Exception as e:
        errors.append({"name": name, "error": str(e)})
    print(f"[{i+1}/{len(pairs)}] {name}", flush=True)

with open(sizes_out, "w", encoding="utf-8") as f:
    json.dump({"sizes": sizes, "bounds": bounds, "errors": errors, "warnings": warnings}, f, indent=2)
print(f"DONE ok={len(sizes)} err={len(errors)} warn={len(warnings)}", flush=True)
