"""Normaliza a escala do kit de portais ASSET A ASSET (metros reais).

O `normalize.py` da skill aplica UM fator a uma lista — não serve aqui: o pack é
uma coleção sem escala unificada (portal de 9,4 m, plataforma de 38 m, flor de
2,8 m). Cada família tem seu próprio fator, derivado de uma medida-alvo real
(REGRA do projeto: escala métrica, player = 1,8 m).

Entrada: JSON `{ "<asset>": <fator>, ... }`, onde `<fator>` é um número (escala
uniforme) OU `[larg, alt, prof]` em Y-up para os casos não-uniformes — o
`pool_green` foi remontado da mesh-base e precisa da mesma escala torta que o
prefab dos irmãos carregava (`scale [4.14, 2.45, 2.45]`). Baka o fator na
geometria (não deixa escala no nó) e reemite sizes/bounds já escalados.

Uso: blender -b -P normalize-per-asset.py -- <assetsDir> <fatores.json> <sizes_out.json>
"""
import bpy, sys, json, os
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
assets_dir, factors_path, sizes_out = argv[0], argv[1], argv[2]

with open(factors_path, "r", encoding="utf-8") as f:
    factors = json.load(f)

sizes = {}
bounds = {}
errors = []


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures):
        for d in list(block):
            if d.users == 0:
                block.remove(d)


for name, factor in sorted(factors.items()):
    path = os.path.join(assets_dir, f"{name}.glb")
    if not os.path.exists(path):
        errors.append({"name": name, "error": "glb ausente"})
        continue
    try:
        clear()
        bpy.ops.import_scene.gltf(filepath=path)

        meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
        if not meshes:
            raise RuntimeError("sem mesh")

        # Fator uniforme (número) ou por eixo em Y-up [larg, alt, prof].
        # Y-up -> Blender Z-up: X=larg, Y=prof, Z=alt.
        if isinstance(factor, (list, tuple)):
            fx, fy, fz = float(factor[0]), float(factor[2]), float(factor[1])
        else:
            fx = fy = fz = float(factor)

        # Escala em torno da ORIGEM do arquivo (preserva a relação pivô/geometria).
        bpy.ops.object.select_all(action="DESELECT")
        roots = [o for o in bpy.context.scene.objects if o.parent is None]
        for o in roots:
            o.select_set(True)
            o.scale = (o.scale[0] * fx, o.scale[1] * fy, o.scale[2] * fz)
            o.location = (o.location[0] * fx, o.location[1] * fy, o.location[2] * fz)
        bpy.context.view_layer.objects.active = roots[0]
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)

        mn = [1e9] * 3
        mx = [-1e9] * 3
        for o in meshes:
            for c in o.bound_box:
                w = o.matrix_world @ Vector(c)
                for k in range(3):
                    mn[k] = min(mn[k], w[k])
                    mx[k] = max(mx[k], w[k])

        # Blender Z-up -> three Y-up
        sizes[name] = [round(mx[0] - mn[0], 3), round(mx[2] - mn[2], 3), round(mx[1] - mn[1], 3)]
        bounds[name] = [
            round(mn[0], 3), round(mn[2], 3), round(mn[1], 3),
            round(mx[0], 3), round(mx[2], 3), round(mx[1], 3),
        ]

        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True)
        print(f"{name}: x{factor} -> {sizes[name]}", flush=True)
    except Exception as e:
        errors.append({"name": name, "error": str(e)})

with open(sizes_out, "w", encoding="utf-8") as f:
    json.dump({"sizes": sizes, "bounds": bounds, "errors": errors}, f, indent=2)
print(f"DONE ok={len(sizes)} err={len(errors)}", flush=True)
