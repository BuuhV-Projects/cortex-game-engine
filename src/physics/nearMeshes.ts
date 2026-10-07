import { Matrix4, Sphere, type Box3, type Object3D, type Vector3 } from 'three';

/**
 * Filtro barato "só o que está perto" pros raycasts de colisão (SPEC-0302): em vez
 * de cada raio testar a cena inteira, as esferas envolventes em mundo (as MESMAS que o
 * raycast do three testa antes dos triângulos) são guardadas junto da lista de
 * malhas e cada quadro só passa adiante as que alcançam o ponto.
 */

interface WithSphere {
  isInstancedMesh?: boolean;
  boundingSphere?: Sphere | null;
  computeBoundingSphere?(): void;
  geometry?: { boundingSphere: Sphere | null; computeBoundingSphere(): void };
  matrixWorld: Object3D['matrixWorld'];
}

/**
 * Folga (m) pro que se move entre duas varreduras (a cada `COLLECT_INTERVAL_MS`):
 * um carro a 17 m/s anda ~4,3 m em 250 ms. Mais rápido que isso pode ser ignorado
 * por até uma varredura.
 */
export const MOVING_MARGIN = 5;

/**
 * Folga (m) da malha que NÃO se mexeu desde a varredura anterior (SPEC-0323): cobre
 * quem começa a andar logo depois dela (parado → 2 m/s² por 250 ms anda 6 cm).
 */
export const STATIC_MARGIN = 0.5;

/** Diferença (m) de centro/raio da esfera abaixo da qual a malha conta como parada. */
export const MOVE_EPSILON = 1e-3;

const tmp = new Sphere();

/** Esfera envolvente de `o` em mundo, ou `null` se não tiver geometria. */
export function worldSphere(o: Object3D, out: Sphere = tmp): Sphere | null {
  const m = o as unknown as WithSphere;
  if (m.isInstancedMesh) {
    if (!m.boundingSphere) m.computeBoundingSphere?.();
    return m.boundingSphere ? out.copy(m.boundingSphere).applyMatrix4(m.matrixWorld) : null;
  }
  const g = m.geometry;
  if (!g) return null;
  if (!g.boundingSphere) g.computeBoundingSphere();
  return g.boundingSphere ? out.copy(g.boundingSphere).applyMatrix4(m.matrixWorld) : null;
}

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

/** Floats por malha no índice: centro x, y, z e raio (já com a folga). */
const STRIDE = 4;

/**
 * Malhas + esferas em mundo, calculadas em {@link NearMeshIndex.rebuild} (junto da
 * varredura da cena). Malha sem esfera entra sempre (raio infinito: não arrisca).
 */
export class NearMeshIndex {
  private meshes: readonly Object3D[] = [];
  private data = new Float32Array(0);
  /** Esfera em mundo (x, y, z, raio) de cada malha na varredura anterior (SPEC-0323). */
  private previous = new WeakMap<Object3D, Float32Array>();

  /**
   * Recalcula as esferas de `meshes` (chamar quando a lista é remontada). A folga é
   * {@link MOVING_MARGIN} pra quem se mexeu desde o rebuild anterior (ou é nova) e
   * {@link STATIC_MARGIN} pra quem ficou parada (SPEC-0323).
   */
  rebuild(meshes: readonly Object3D[]): void {
    this.meshes = meshes;
    if (this.data.length < meshes.length * STRIDE) this.data = new Float32Array(meshes.length * STRIDE);
    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i]!;
      const s = worldSphere(mesh);
      const k = i * STRIDE;
      if (!s) {
        this.data[k] = this.data[k + 1] = this.data[k + 2] = 0;
        this.data[k + 3] = Infinity;
        continue;
      }
      let prev = this.previous.get(mesh);
      const moved =
        !prev ||
        Math.abs(prev[0]! - s.center.x) > MOVE_EPSILON ||
        Math.abs(prev[1]! - s.center.y) > MOVE_EPSILON ||
        Math.abs(prev[2]! - s.center.z) > MOVE_EPSILON ||
        Math.abs(prev[3]! - s.radius) > MOVE_EPSILON;
      if (!prev) this.previous.set(mesh, (prev = new Float32Array(STRIDE)));
      prev[0] = s.center.x;
      prev[1] = s.center.y;
      prev[2] = s.center.z;
      prev[3] = s.radius;
      this.data[k] = s.center.x;
      this.data[k + 1] = s.center.y;
      this.data[k + 2] = s.center.z;
      this.data[k + 3] = s.radius + (moved ? MOVING_MARGIN : STATIC_MARGIN);
    }
  }

  /**
   * As que alcançam (x, z) no plano até `reach` — raios verticais e paredes curtas.
   * `minY`/`maxY` (SPEC-0307): descarta a esfera toda abaixo de `minY` ou toda acima
   * de `maxY` (ex.: o raio de chão, que só desce, passa `maxY` = altura da origem).
   */
  nearXZ(x: number, z: number, reach: number, out: Object3D[], minY = -Infinity, maxY = Infinity): Object3D[] {
    out.length = 0;
    for (let i = 0; i < this.meshes.length; i++) {
      const k = i * STRIDE;
      const sr = this.data[k + 3]!;
      const cy = this.data[k + 1]!;
      if (cy - sr > maxY || cy + sr < minY) continue;
      const r = sr + reach;
      const dx = this.data[k]! - x;
      const dz = this.data[k + 2]! - z;
      if (dx * dx + dz * dz <= r * r) out.push(this.meshes[i]!);
    }
    return out;
  }

  /** As que alcançam o ponto `p` (3D) até `reach` — o braço da câmera. */
  near(p: Vector3, reach: number, out: Object3D[]): Object3D[] {
    out.length = 0;
    for (let i = 0; i < this.meshes.length; i++) {
      const k = i * STRIDE;
      const r = this.data[k + 3]! + reach;
      const dx = this.data[k]! - p.x;
      const dy = this.data[k + 1]! - p.y;
      const dz = this.data[k + 2]! - p.z;
      if (dx * dx + dy * dy + dz * dz <= r * r) out.push(this.meshes[i]!);
    }
    return out;
  }
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
  for (let i = 0; i < meshes.length; i++) {
    const m = meshes[i]! as unknown as WithBvh;
    const tree = m.isInstancedMesh ? undefined : m.geometry?.boundsTree;
    if (tree && !tree.intersectsBox(box, _boxToMesh.copy(m.matrixWorld).invert())) continue;
    out.push(meshes[i]!);
  }
  return out;
}
