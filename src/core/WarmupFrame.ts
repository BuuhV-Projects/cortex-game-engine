/**
 * Quadro de aquecimento (ADR-0262 / SPEC-0263).
 *
 * O render pula objeto invisível e objeto fora da câmera — e é justamente o que
 * o aquecimento precisa compilar: efeitos escondidos até o uso, pista fora de
 * quadro. Isto revela a árvore inteira para UM render e devolve como desfazer.
 */
import type { Object3D } from 'three';

/**
 * Força `visible = true` e `frustumCulled = false` em `root` e descendentes.
 *
 * @returns função que devolve cada objeto ao estado anterior. Chame num
 *   `finally`: sem restaurar, a cena inteira ficaria visível e sem culling.
 */
export function revealForWarmup(root: Object3D): () => void {
  const saved: Array<[Object3D, boolean, boolean]> = [];
  root.traverse((object) => {
    saved.push([object, object.visible, object.frustumCulled]);
    object.visible = true;
    object.frustumCulled = false;
  });
  return () => {
    for (const [object, visible, frustumCulled] of saved) {
      object.visible = visible;
      object.frustumCulled = frustumCulled;
    }
  };
}
