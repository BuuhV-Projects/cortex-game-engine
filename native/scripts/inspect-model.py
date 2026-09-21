# Validação de modelo 3D no Blender (SPEC-0231): mede e RENDERIZA um .glb.
#
# Serve a dois donos: o refinador de asset, que precisa provar que a aparência
# não mudou depois de fundir materiais, e o Chat IA, que hoje entrega modelo
# gerado sem olhar para ele.
#
# Uso: blender -b -P inspect-model.py -- <modelo.glb> <saida.png> [lado_px] [lado]
#   lado: `frente` (padrão) ou `tras` — vira a câmera. Peça com detalhe só de um
#   lado (uma roda, por exemplo) esconde o que interessa no ângulo padrão.
import json
import sys

import bpy
from mathutils import Vector

# Lado padrão da imagem de validação. Pequeno de propósito: serve para comparar
# e para o Chat IA olhar, não para material de divulgação.
DEFAULT_RENDER_SIZE = 512
# Distância da câmera em relação ao raio do modelo — enquadra com folga.
CAMERA_DISTANCE_FACTOR = 2.6
# Direção da câmera: 3/4 frontal, o ângulo em que se lê a silhueta.
CAMERA_DIRECTION = Vector((1.0, -1.2, 0.8))
SUN_ENERGY = 3.0


def limpar_cena():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def medir(objetos):
    """Bounding box no espaço de mundo, em Y-up (convenção do glTF)."""
    minimo = Vector((float("inf"),) * 3)
    maximo = Vector((float("-inf"),) * 3)
    triangulos = 0
    materiais = set()
    for obj in objetos:
        if obj.type != "MESH":
            continue
        for slot in obj.material_slots:
            if slot.material:
                materiais.add(slot.material.name)
        obj.data.calc_loop_triangles()
        triangulos += len(obj.data.loop_triangles)
        for canto in obj.bound_box:
            mundo = obj.matrix_world @ Vector(canto)
            for eixo in range(3):
                minimo[eixo] = min(minimo[eixo], mundo[eixo])
                maximo[eixo] = max(maximo[eixo], mundo[eixo])
    if minimo.x == float("inf"):
        return None
    tamanho = maximo - minimo
    return {
        "min": [round(v, 4) for v in minimo],
        "max": [round(v, 4) for v in maximo],
        # Blender é Z-up; o projeto mede em metros no eixo Y-up do glTF.
        "size": {
            "largura": round(tamanho.x, 4),
            "altura": round(tamanho.z, 4),
            "profundidade": round(tamanho.y, 4),
        },
        "triangulos": triangulos,
        "materiais": sorted(materiais),
        "malhas": len([o for o in objetos if o.type == "MESH"]),
    }


def montar_camera(medidas, lado, virar=False):
    centro = Vector(
        [(medidas["min"][i] + medidas["max"][i]) / 2 for i in range(3)]
    )
    extensao = max(
        medidas["size"]["largura"], medidas["size"]["altura"], medidas["size"]["profundidade"]
    )
    raio = max(extensao, 0.001)
    direcao = CAMERA_DIRECTION.normalized()
    if virar:
        direcao = Vector((-direcao.x, -direcao.y, direcao.z))
    bpy.ops.object.camera_add(location=centro + direcao * raio * CAMERA_DISTANCE_FACTOR)
    camera = bpy.context.object
    # Aponta a câmera para o centro do modelo.
    camera.rotation_mode = "QUATERNION"
    camera.rotation_quaternion = (centro - camera.location).to_track_quat("-Z", "Y")
    bpy.context.scene.camera = camera

    bpy.ops.object.light_add(type="SUN", location=centro + Vector((raio, -raio, raio * 2)))
    bpy.context.object.data.energy = SUN_ENERGY

    cena = bpy.context.scene
    # O nome do EEVEE mudou entre versões do Blender (4.2 usa BLENDER_EEVEE_NEXT,
    # 5.x voltou a BLENDER_EEVEE). Escolhe o que existir nesta instalação.
    engines = cena.render.bl_rna.properties["engine"].enum_items.keys()
    for candidato in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "BLENDER_WORKBENCH"):
        if candidato in engines:
            cena.render.engine = candidato
            break
    cena.render.resolution_x = lado
    cena.render.resolution_y = lado
    cena.render.film_transparent = True


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :]
    if len(argv) < 2:
        print("INSPECT_DONE ok=0 err=1 motivo=argumentos")
        return
    modelo, saida = argv[0], argv[1]
    lado = int(argv[2]) if len(argv) > 2 else DEFAULT_RENDER_SIZE
    virar = len(argv) > 3 and argv[3] == "tras"

    limpar_cena()
    bpy.ops.import_scene.gltf(filepath=modelo)
    objetos = list(bpy.context.scene.objects)
    medidas = medir(objetos)
    if medidas is None:
        print("INSPECT_DONE ok=0 err=1 motivo=sem-malha")
        return

    montar_camera(medidas, lado, virar)
    bpy.context.scene.render.filepath = saida
    bpy.ops.render.render(write_still=True)

    print("INSPECT_JSON " + json.dumps(medidas))
    print("INSPECT_DONE ok=1 err=0")


main()
