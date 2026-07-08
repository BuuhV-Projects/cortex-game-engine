/**
 * Aceleração de raycast por BVH (three-mesh-bvh).
 *
 * O {@link CharacterPhysicsSystem} faz vários raycasts POR FRAME contra a
 * geometria REAL da cena (chão + paredes). O `Raycaster` do three testa
 * **triângulo por triângulo** (O(n)) — barato num tile de 90 tris, mas
 * **catastrófico** num prop detalhado (uma ponte de corda com ~2000 tris ×
 * 13 raycasts/frame = dezenas de milhares de testes por frame). Em JS puro
 * (ainda mais no Hermes do export nativo, ~5-10× mais lento que o V8) isso
 * derruba o FPS quando o personagem encosta nesse prop — some ao se afastar.
 *
 * Solução: `three-mesh-bvh` constrói uma **árvore de volumes** por geometria e
 * troca o raycast por O(log n). Aqui a gente:
 * 1. **Aplica o patch global UMA vez** (`Mesh.prototype.raycast` acelerado +
 *    `BufferGeometry.computeBoundsTree`). O raycast acelerado **cai no padrão**
 *    quando a geometria não tem árvore — então é seguro pra TODO mundo (editor,
 *    picking, etc.), sem mudar comportamento.
 * 2. Constrói a árvore **sob demanda** só pra geometrias que valem a pena
 *    (acima de {@link MIN_BVH_TRIS} triângulos) — em geometrias pequenas o custo
 *    de montar a árvore não compensa.
 */
import { BufferGeometry, Mesh, type Object3D } from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Patch global idempotente (o d.ts do three não conhece estes membros do addon).
const geoProto = BufferGeometry.prototype as any;
if (!geoProto.computeBoundsTree) {
  geoProto.computeBoundsTree = computeBoundsTree;
  geoProto.disposeBoundsTree = disposeBoundsTree;
  (Mesh.prototype as any).raycast = acceleratedRaycast;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Abaixo disto o BVH não compensa: montar a árvore custa mais que o ganho no
 * raycast de uma malha pequena (tiles/itens do kit têm ~80–300 tris).
 */
export const MIN_BVH_TRIS = 512;

/**
 * Garante a árvore BVH da geometria de `mesh` **se valer a pena** (alta
 * contagem de triângulos). Idempotente e O(1) depois da 1ª vez (a árvore fica
 * cacheada na geometria). Ignora malhas **skinned** (a árvore seria da pose de
 * bind, errada pra malha animada — e o personagem é ignorado no raycast mesmo).
 *
 * @param mesh Objeto da cena a ser testado por raycast (chão/parede).
 */
export function ensureBoundsTree(mesh: Object3D): void {
  const m = mesh as Mesh & { isSkinnedMesh?: boolean };
  if (m.isSkinnedMesh) return;
  const g = m.geometry as
    | (BufferGeometry & { boundsTree?: unknown; computeBoundsTree?: () => void })
    | undefined;
  if (!g || g.boundsTree || (g.userData as Record<string, unknown>)['_cortexBvhSkip']) return;
  const posCount = (g.attributes as Record<string, { count?: number }>)['position']?.count ?? 0;
  const triCount = g.index ? g.index.count / 3 : posCount / 3;
  if (triCount >= MIN_BVH_TRIS) {
    g.computeBoundsTree?.();
  } else {
    (g.userData as Record<string, unknown>)['_cortexBvhSkip'] = true; // pequena: não vale a árvore
  }
}
