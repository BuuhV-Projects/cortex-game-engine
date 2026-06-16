import { Skeleton, SkinnedMesh, Bone } from 'three';
import type { Object3D } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { type GLTF } from '../core/AssetLoader.js';
import { loadGLB } from './SceneAssets.js';
import { SceneAnimator } from './SceneAnimator.js';

/**
 * Um personagem **modular** montado: o `object` (pronto pra `scene.add`) com todas as
 * peças deformando juntas, e o `animator` que toca os clipes do rig. Ver
 * {@link composeModularCharacter}.
 */
export interface ModularCharacter {
  /** Raiz do personagem (esqueleto do rig + meshes das peças). Adicione à cena. */
  object: Object3D;
  /** Animador ligado ao esqueleto do rig — toque `idle`/`walk`/… e dê `update(dt)` por frame. */
  animator: SceneAnimator;
}

/**
 * Compõe um personagem **modular** a partir de um **rig** (esqueleto + animações) e de
 * **peças** (corpo/pele, rosto, cabelo, roupa…) que foram exportadas do **mesmo
 * esqueleto**. Cada peça é rebindada nos ossos do rig **por nome**, então todas
 * deformam juntas quando o {@link SceneAnimator} toca um clipe — base de um criador de
 * personagem (mistura livre de peças, sem pré-assar combinações).
 *
 * **Por que por nome (e não por índice):** o exportador glTF só inclui em cada peça os
 * ossos que ela usa (o cabelo não referencia ossos da perna), então `skin.joints` varia
 * de peça pra peça. Rebindar por índice quebraria; casar `mesh.skeleton.bones[i].name`
 * com o osso homônimo do rig preserva o mapeamento `skinIndex → osso` correto. Os
 * `boneInverses` da peça valem nos ossos do rig porque ambos compartilham a **pose de
 * descanso** (mesmo esqueleto de origem).
 *
 * Requisito: todo osso de cada peça tem que existir no rig (mesmo esqueleto). Peças e
 * rig tipicamente saem do mesmo kit/pipeline.
 *
 * @param rig - GLTF com o esqueleto (Bones) + as `animations`. Um mesh próprio do rig
 *   (ex.: um corpo base) é **descartado** — o corpo vem das peças.
 * @param parts - GLTFs das peças; cada um traz 1+ `SkinnedMesh` skinado no mesmo esqueleto.
 * @returns O {@link ModularCharacter} (object + animator).
 *
 * @example
 * const { object, animator } = await loadModularCharacter('rig.glb',
 *   ['body_10.glb', 'outfit_01.glb', 'face_f_usual02.glb', 'hair_f_03.glb'])
 * scene.add(object)
 * animator.play('Idle_Relaxed')
 * // no loop: animator.update(dt)
 */
export function composeModularCharacter(rig: GLTF, parts: GLTF[]): ModularCharacter {
  const rigRoot = clone(rig.scene);

  // Mapa nome → osso do rig (os ossos animados que vão deformar todas as peças).
  const rigBones = new Map<string, Bone>();
  rigRoot.traverse((node) => {
    if ((node as Bone).isBone) rigBones.set(node.name, node as Bone);
  });

  // Descarta o(s) mesh(es) do próprio rig — só queremos o esqueleto + animações.
  const rigMeshes: Object3D[] = [];
  rigRoot.traverse((node) => {
    if ((node as SkinnedMesh).isSkinnedMesh) rigMeshes.push(node);
  });
  for (const mesh of rigMeshes) mesh.removeFromParent();

  for (const part of parts) {
    const partRoot = clone(part.scene);
    const partMeshes: SkinnedMesh[] = [];
    partRoot.traverse((node) => {
      if ((node as SkinnedMesh).isSkinnedMesh) partMeshes.push(node as SkinnedMesh);
    });

    for (const mesh of partMeshes) {
      // Remapeia os ossos da peça pros ossos do rig (mesma ordem da peça, por nome).
      const remappedBones = mesh.skeleton.bones.map((bone) => {
        const rigBone = rigBones.get(bone.name);
        if (!rigBone) {
          throw new Error(`composeModularCharacter: osso "${bone.name}" da peça não existe no rig`);
        }
        return rigBone;
      });
      // boneInverses da peça valem nos ossos do rig (mesma pose de descanso).
      const skeleton = new Skeleton(remappedBones, mesh.skeleton.boneInverses);
      mesh.bind(skeleton, mesh.bindMatrix);
      // Animação tira o mesh da esfera de cull em descanso — não deixar sumir.
      mesh.frustumCulled = false;
      // Reparenta sob a raiz do rig (compartilha o espaço dos ossos).
      rigRoot.add(mesh);
    }
  }

  const animator = new SceneAnimator(rigRoot, rig.animations);
  return { object: rigRoot, animator };
}

/**
 * Carrega o rig e as peças por URL (com o cache do {@link loadGLB}) e compõe o
 * personagem modular. Atalho assíncrono pra {@link composeModularCharacter}.
 *
 * @param rigUrl - URL do `.glb` do rig (esqueleto + animações).
 * @param partUrls - URLs dos `.glb` das peças, na ordem de montagem.
 */
export async function loadModularCharacter(rigUrl: string, partUrls: string[]): Promise<ModularCharacter> {
  const rig = await loadGLB(rigUrl);
  const parts = await Promise.all(partUrls.map((url) => loadGLB(url)));
  return composeModularCharacter(rig, parts);
}
