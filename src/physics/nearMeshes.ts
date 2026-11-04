import { Matrix4, type Box3, type InstancedMesh, type Intersection, type Object3D, type Raycaster } from 'three';
import { INSTANCE_SPHERE_STRIDE, spheresOf } from './instancedRaycast.js';
import { CROSSED_MIN_BVH_TRIS, ensureBoundsTree } from './raycastAccel.js';
import { firstHitAmong, nativeRaycastActive } from './nativeRaycast.js';
import type { NearMeshIndex } from './nearMeshIndex.js';

export { GRID_CELL, MOVE_EPSILON, MOVING_MARGIN, NearMeshIndex, STATIC_MARGIN, worldBox, worldSphere } from './nearMeshIndex.js';

/**
 * Filtro barato "só o que está perto" pros raycasts de colisão (SPEC-0302): em vez
 * de cada raio testar a cena inteira, as esferas envolventes em mundo (as MESMAS que o
 * raycast do three testa antes dos triângulos) são guardadas junto da lista de
 * malhas e cada quadro só passa adiante as que alcançam o ponto.
 */

/**
 * Percorre `o` como `Object3D.traverse`, podando o que nunca colide (SPEC-0307):
 * - **não desce** em subárvore com `userData.editorInternal` (gizmo/helpers do editor:
 *   o flag fica na RAIZ do `TransformControls`, as peças filhas não o têm);
 * - **não desce** em subárvore com `userData.cortexNoCollide` (decoração declarada:
 *   nunca colide com personagem/câmera nem ganha BVH — SPEC-0308);
 * - `hidden` = está numa subárvore escondida (`visible = false` nela ou num
 *   ancestral). Exceção: o objeto escondido que é ele mesmo `cortexSolid` (nó com
 *   `visible: false` + `collider` = parede/chão invisível declarado) não esconde.
 * Quem coleta alvo de colisão ignora `hidden`; quem só prepara (BVH) pode usá-lo.
 * `visit` devolvendo `false` **não desce** nos filhos (SPEC-0320): dentro de uma
 * subárvore escondida tudo é escondido, então quem não prepara nada ali corta a
 * descida — a maior parte de um mapa grande está escondida (células fora do alcance).
 */
export function traverseCollidable(
  o: Object3D,
  visit: (o: Object3D, hidden: boolean) => boolean | void,
  hidden = false,
): void {
  const ud = o.userData as Record<string, unknown>;
  if (ud['editorInternal'] || ud['cortexNoCollide']) return;
  const h = hidden || (!o.visible && ud['cortexSolid'] !== true);
  if (visit(o, h) === false) return;
  for (const c of o.children) traverseCollidable(c, visit, h);
}

/** Malhas visíveis (não skinadas) de uma varredura da raiz e quando ela aconteceu (ms, `performance.now`). */
export interface SceneScan {
  readonly meshes: readonly Object3D[];
  readonly at: number;
  /** Índice já montado de parte de `meshes` (o de chão da física) e o resto delas — SPEC-0646. */
  readonly ground?: NearMeshIndex;
  readonly rest?: readonly Object3D[];
}

const scans = new WeakMap<Object3D, SceneScan>();

/**
 * Publica o resultado de uma varredura de `root` (SPEC-0328): as malhas visíveis, não
 * skinadas, com a mesma poda do {@link traverseCollidable}. Quem varre a mesma raiz
 * logo depois (a câmera da 3ª pessoa, depois do `CharacterPhysicsSystem`) reaproveita
 * em vez de descer na cena de novo. A lista é do publicador: copie, não guarde.
 */
export function publishScan(
  root: Object3D,
  meshes: readonly Object3D[],
  ground?: NearMeshIndex,
  rest?: readonly Object3D[],
): void {
  scans.set(root, { meshes, at: performance.now(), ground, rest });
}

/** A varredura publicada de `root` com até `maxAgeMs` de idade, ou `undefined`. */
export function recentScan(root: Object3D, maxAgeMs: number): SceneScan | undefined {
  const s = scans.get(root);
  return s && performance.now() - s.at <= maxAgeMs ? s : undefined;
}


const _boxToMesh = new Matrix4();

interface WithBvh {
  isInstancedMesh?: boolean;
  matrixWorld: Matrix4;
  geometry?: { boundsTree?: { intersectsBox(box: Box3, boxToMesh: Matrix4): boolean } };
}

/**
 * Filtra `meshes` pras que podem ter triângulo dentro de `box` (em mundo) — SPEC-0323.
 * Malha com árvore BVH (não instanciada) faz UM teste exato caixa × triângulos e sai se
 * não toca; sem árvore ou instanciada fica (o raio decide). Conservador: nunca tira uma
 * malha que um raio contido na caixa acertaria.
 */
export function touchingBox(meshes: readonly Object3D[], box: Box3, out: Object3D[]): Object3D[] {
  out.length = 0;
  // no host os raios vão pro C++ (SPEC-0347): não monta árvore JS só pra eles
  const buildTrees = !nativeRaycastActive();
  for (let i = 0; i < meshes.length; i++) {
    const m = meshes[i]! as unknown as WithBvh;
    // encostada no personagem: os 12 raios vão cruzá-la — árvore já a partir de poucos triângulos (SPEC-0328)
    if (buildTrees && !m.isInstancedMesh && !m.geometry?.boundsTree) ensureBoundsTree(meshes[i]!, CROSSED_MIN_BVH_TRIS);
    if (m.isInstancedMesh) {
      // instâncias: fica só se a esfera de alguma toca a caixa (SPEC-0328) — antes passava
      // sempre e levava os 12 raios, cada um varrendo todas as instâncias
      if (!anySphereTouches(spheresOf(meshes[i] as InstancedMesh), box)) continue;
      out.push(meshes[i]!);
      continue;
    }
    const tree = m.geometry?.boundsTree;
    if (tree && !tree.intersectsBox(box, _boxToMesh.copy(m.matrixWorld).invert())) continue;
    out.push(meshes[i]!);
  }
  return out;
}

/** Alguma esfera (x, y, z, raio por instância) toca a caixa? Distância do centro ao ponto mais próximo da caixa. */
function anySphereTouches(c: { count: number; spheres: Float32Array }, box: Box3): boolean {
  const s = c.spheres;
  for (let i = 0; i < c.count; i++) {
    const k = i * INSTANCE_SPHERE_STRIDE;
    const x = s[k]!, y = s[k + 1]!, z = s[k + 2]!, r = s[k + 3]!;
    const dx = x < box.min.x ? box.min.x - x : x > box.max.x ? x - box.max.x : 0;
    const dy = y < box.min.y ? box.min.y - y : y > box.max.y ? y - box.max.y : 0;
    const dz = z < box.min.z ? box.min.z - z : z > box.max.z ? z - box.max.z : 0;
    if (dx * dx + dy * dy + dz * dz <= r * r) return true;
  }
  return false;
}

const _alongCand: Object3D[] = [];
const _alongEntry: number[] = [];

/**
 * O acerto mais próximo do `raycaster` entre as malhas de `index` (SPEC-0328) — mesmo
 * resultado que `intersectObjects(lista, false)` filtrado por `skip` e lido no 1º, mas
 * só testa o que o raio cruza, mais perto primeiro, e para quando a próxima malha entra
 * além do melhor acerto. Respeita `layers` (como o `intersectObjects`). Ligue
 * `raycaster.firstHitOnly` pra árvore BVH parar no 1º triângulo. No export nativo o
 * teste das malhas roda em C++ (SPEC-0347).
 * @param skip Descarta o acerto (ex.: o próprio personagem).
 */
export function firstHit(
  raycaster: Raycaster,
  index: NearMeshIndex,
  skip?: (o: Object3D) => boolean,
): Intersection | null {
  const cand = index.alongRay(raycaster.ray, raycaster.near, raycaster.far, _alongCand, _alongEntry);
  return firstHitAmong(raycaster, cand, _alongEntry, skip);
}
