import { Box3, Matrix4, Sphere, type Intersection, type Object3D, type Ray, type Raycaster } from 'three';
import { rayMayHitSphere } from './instancedRaycast.js';

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

/** Floats por malha no índice: esfera (x, y, z, raio) e caixa (min x/y/z, máx x/y/z), já com a folga. */
const STRIDE = 10;
/** Floats guardados da varredura anterior: esfera (centro + raio), caixa em mundo SEM folga e giro/escala (3×3). */
const PREV_STRIDE = 19;
/** Onde começa o 3×3 da `matrixWorld` no registro guardado. */
const PREV_BASIS = 10;
/** Índices do 3×3 (giro/escala) nos `elements` de uma Matrix4. */
const BASIS = [0, 1, 2, 4, 5, 6, 8, 9, 10] as const;
/** Deslocamento da caixa dentro do registro de cada malha. */
const BOX = 4;

interface WithBox {
  isInstancedMesh?: boolean;
  boundingBox?: Box3 | null;
  computeBoundingBox?(): void;
  geometry?: { boundingBox: Box3 | null; computeBoundingBox(): void };
  matrixWorld: Object3D['matrixWorld'];
}

const tmpBox = new Box3();

/** Lado (m) da célula da grade XZ do índice (SPEC-0328). */
export const GRID_CELL = 8;
/** Malha cuja caixa cobre mais células que isto fica na lista "larga" (testada sempre). */
const MAX_CELLS_PER_MESH = 16;
/** Consulta que cobre mais células que isto varre a lista inteira (mais barato que a grade). */
const MAX_QUERY_CELLS = 64;
/** Chave da célula: `ix * GRID_KEY_SPAN + iz` (|iz| < metade do vão: ~260 km com células de 8 m). */
const GRID_KEY_SPAN = 65536;

/** Caixa alinhada aos eixos de `o` em mundo, ou `null` se não tiver geometria (SPEC-0323). */
export function worldBox(o: Object3D, out: Box3 = tmpBox): Box3 | null {
  const m = o as unknown as WithBox;
  if (m.isInstancedMesh) {
    if (!m.boundingBox) m.computeBoundingBox?.();
    return m.boundingBox ? out.copy(m.boundingBox).applyMatrix4(m.matrixWorld) : null;
  }
  const g = m.geometry;
  if (!g) return null;
  if (!g.boundingBox) g.computeBoundingBox();
  return g.boundingBox ? out.copy(g.boundingBox).applyMatrix4(m.matrixWorld) : null;
}

/**
 * Malhas + esferas e caixas em mundo, calculadas em {@link NearMeshIndex.rebuild} (junto
 * da varredura da cena). Uma malha só passa se a esfera E a caixa alcançam — as duas
 * contêm a geometria, e a caixa é bem mais justa em malha comprida (rua, fileira de
 * casas, célula fundida — SPEC-0323). Malha sem geometria entra sempre (não arrisca).
 */
export class NearMeshIndex {
  private meshes: readonly Object3D[] = [];
  private data = new Float32Array(0);
  /** Esfera e caixa em mundo de cada malha na varredura anterior (SPEC-0323). */
  private previous = new WeakMap<Object3D, Float32Array>();
  /** Grade XZ (SPEC-0328): célula → índices das malhas cuja caixa (com folga) a toca. */
  private readonly cells = new Map<number, number[]>();
  /** Malhas grandes demais pra grade (rua, célula fundida, sem geometria): entram em toda consulta. */
  private readonly wide: number[] = [];
  /** Índices da consulta atual e a marca de "já pego" por malha (sem repetir quem está em 2 células). */
  private readonly picked: number[] = [];
  private stamp = new Uint32Array(0);
  private query = 0;

  /**
   * Recalcula esferas e caixas (a caixa só de quem se mexeu: a da parada vem guardada —
   * transformar os 8 cantos de ~900 malhas a cada varredura custava mais que o ganho) de `meshes` (chamar quando a lista é remontada). A folga
   * é {@link MOVING_MARGIN} pra quem se mexeu desde o rebuild anterior (ou é nova) e
   * {@link STATIC_MARGIN} pra quem ficou parada (SPEC-0323).
   */
  rebuild(meshes: readonly Object3D[]): void {
    this.meshes = meshes;
    if (this.data.length < meshes.length * STRIDE) this.data = new Float32Array(meshes.length * STRIDE);
    const d = this.data;
    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i]!;
      const s = worldSphere(mesh);
      const k = i * STRIDE;
      if (!s) {
        d[k] = d[k + 1] = d[k + 2] = 0;
        d[k + 3] = Infinity;
        d[k + BOX] = d[k + BOX + 1] = d[k + BOX + 2] = -Infinity;
        d[k + BOX + 3] = d[k + BOX + 4] = d[k + BOX + 5] = Infinity;
        continue;
      }
      let prev = this.previous.get(mesh);
      const moved =
        !prev ||
        Math.abs(prev[0]! - s.center.x) > MOVE_EPSILON ||
        Math.abs(prev[1]! - s.center.y) > MOVE_EPSILON ||
        Math.abs(prev[2]! - s.center.z) > MOVE_EPSILON ||
        Math.abs(prev[3]! - s.radius) > MOVE_EPSILON ||
        turned(prev, mesh.matrixWorld.elements);
      if (!prev) this.previous.set(mesh, (prev = new Float32Array(PREV_STRIDE)));
      prev[0] = s.center.x;
      prev[1] = s.center.y;
      prev[2] = s.center.z;
      prev[3] = s.radius;
      if (moved) {
        // giro em volta do centro não muda a esfera, mas muda a caixa: o 3×3 entra no teste
        const e = mesh.matrixWorld.elements;
        for (let j = 0; j < BASIS.length; j++) prev[PREV_BASIS + j] = e[BASIS[j]]!;
        const wb = worldBox(mesh);
        if (wb) {
          prev[BOX] = wb.min.x;
          prev[BOX + 1] = wb.min.y;
          prev[BOX + 2] = wb.min.z;
          prev[BOX + 3] = wb.max.x;
          prev[BOX + 4] = wb.max.y;
          prev[BOX + 5] = wb.max.z;
        } else {
          prev[BOX] = prev[BOX + 1] = prev[BOX + 2] = -Infinity;
          prev[BOX + 3] = prev[BOX + 4] = prev[BOX + 5] = Infinity;
        }
      }
      const margin = moved ? MOVING_MARGIN : STATIC_MARGIN;
      d[k] = s.center.x;
      d[k + 1] = s.center.y;
      d[k + 2] = s.center.z;
      d[k + 3] = s.radius + margin;
      d[k + BOX] = prev[BOX]! - margin;
      d[k + BOX + 1] = prev[BOX + 1]! - margin;
      d[k + BOX + 2] = prev[BOX + 2]! - margin;
      d[k + BOX + 3] = prev[BOX + 3]! + margin;
      d[k + BOX + 4] = prev[BOX + 4]! + margin;
      d[k + BOX + 5] = prev[BOX + 5]! + margin;
    }
    this.buildGrid();
  }

  /** Distribui as malhas nas células da grade pela caixa (com folga) — SPEC-0328. */
  private buildGrid(): void {
    for (const [key, list] of this.cells) {
      if (list.length === 0) this.cells.delete(key); // vazia desde a anterior: some (o mapa não cresce sem fim)
      else list.length = 0;
    }
    this.wide.length = 0;
    if (this.stamp.length < this.meshes.length) this.stamp = new Uint32Array(this.meshes.length);
    const d = this.data;
    for (let i = 0; i < this.meshes.length; i++) {
      const b = i * STRIDE + BOX;
      const ix0 = Math.floor(d[b]! / GRID_CELL);
      const iz0 = Math.floor(d[b + 2]! / GRID_CELL);
      const ix1 = Math.floor(d[b + 3]! / GRID_CELL);
      const iz1 = Math.floor(d[b + 5]! / GRID_CELL);
      const n = (ix1 - ix0 + 1) * (iz1 - iz0 + 1);
      if (!(n <= MAX_CELLS_PER_MESH)) {
        this.wide.push(i); // também pega NaN/Infinity (sem geometria)
        continue;
      }
      for (let ix = ix0; ix <= ix1; ix++) {
        for (let iz = iz0; iz <= iz1; iz++) {
          const key = ix * GRID_KEY_SPAN + iz;
          let list = this.cells.get(key);
          if (!list) this.cells.set(key, (list = []));
          list.push(i);
        }
      }
    }
  }

  /**
   * Índices (crescentes, sem repetição) das malhas nas células que o retângulo XZ toca,
   * mais as largas; `null` = retângulo grande/infinito, varra todas (SPEC-0328).
   */
  private gather(minX: number, minZ: number, maxX: number, maxZ: number): number[] | null {
    const ix0 = Math.floor(minX / GRID_CELL);
    const iz0 = Math.floor(minZ / GRID_CELL);
    const ix1 = Math.floor(maxX / GRID_CELL);
    const iz1 = Math.floor(maxZ / GRID_CELL);
    if (!((ix1 - ix0 + 1) * (iz1 - iz0 + 1) <= MAX_QUERY_CELLS)) return null;
    const out = this.picked;
    out.length = 0;
    const stamp = this.stamp;
    const q = ++this.query;
    for (let j = 0; j < this.wide.length; j++) {
      stamp[this.wide[j]!] = q;
      out.push(this.wide[j]!);
    }
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const list = this.cells.get(ix * GRID_KEY_SPAN + iz);
        if (!list) continue;
        for (let j = 0; j < list.length; j++) {
          const i = list[j]!;
          if (stamp[i] === q) continue;
          stamp[i] = q;
          out.push(i);
        }
      }
    }
    // ordem da lista original: desempate igual ao da varredura linear
    for (let a = 1; a < out.length; a++) {
      const v = out[a]!;
      let c = a;
      while (c > 0 && out[c - 1]! > v) {
        out[c] = out[c - 1]!;
        c--;
      }
      out[c] = v;
    }
    return out;
  }

  /**
   * As que alcançam (x, z) no plano até `reach` — raios verticais e paredes curtas.
   * `minY`/`maxY` (SPEC-0307): descarta a malha toda abaixo de `minY` ou toda acima
   * de `maxY` (ex.: o raio de chão, que só desce, passa `maxY` = altura da origem).
   */
  nearXZ(x: number, z: number, reach: number, out: Object3D[], minY = -Infinity, maxY = Infinity): Object3D[] {
    out.length = 0;
    const d = this.data;
    const list = this.gather(x - reach, z - reach, x + reach, z + reach);
    const n = list ? list.length : this.meshes.length;
    for (let q = 0; q < n; q++) {
      const i = list ? list[q]! : q;
      const k = i * STRIDE;
      const b = k + BOX;
      if (d[b + 1]! > maxY || d[b + 4]! < minY) continue;
      if (d[b]! > x + reach || d[b + 3]! < x - reach || d[b + 2]! > z + reach || d[b + 5]! < z - reach) continue;
      const r = d[k + 3]! + reach;
      const dx = d[k]! - x;
      const dz = d[k + 2]! - z;
      if (dx * dx + dz * dz <= r * r) out.push(this.meshes[i]!);
    }
    return out;
  }

  /**
   * As que o SEGMENTO do raio cruza (SPEC-0328): caixa em mundo (com a folga) por slab
   * e esfera. Grava em `entry[i]` a distância em que o raio entra na caixa de `out[i]`
   * e devolve as duas listas ORDENADAS por ela (mais perto primeiro). Conservador: todo
   * acerto possível entre `near` e `far` está nas candidatas, e acontece a uma distância
   * >= a entrada da caixa dela. `ray.direction` tem que ser unitária (como no Raycaster).
   */
  alongRay(ray: Ray, near: number, far: number, out: Object3D[], entry: number[]): Object3D[] {
    out.length = 0;
    entry.length = 0;
    const d = this.data;
    const o = ray.origin;
    const v = ray.direction;
    // retângulo XZ do segmento (direção 0 no eixo: fica na origem, mesmo com `far` infinito)
    const ex = v.x === 0 ? o.x : o.x + v.x * far;
    const ez = v.z === 0 ? o.z : o.z + v.z * far;
    const list = this.gather(Math.min(o.x, ex), Math.min(o.z, ez), Math.max(o.x, ex), Math.max(o.z, ez));
    const n = list ? list.length : this.meshes.length;
    for (let q = 0; q < n; q++) {
      const i = list ? list[q]! : q;
      const k = i * STRIDE;
      const b = k + BOX;
      let t0 = near;
      let t1 = far;
      // slab por eixo; direção 0 = só confere se a origem está dentro da faixa
      if (v.x === 0) {
        if (o.x < d[b]! || o.x > d[b + 3]!) continue;
      } else {
        const ta = (d[b]! - o.x) / v.x;
        const tb = (d[b + 3]! - o.x) / v.x;
        t0 = Math.max(t0, Math.min(ta, tb));
        t1 = Math.min(t1, Math.max(ta, tb));
        if (t0 > t1) continue;
      }
      if (v.y === 0) {
        if (o.y < d[b + 1]! || o.y > d[b + 4]!) continue;
      } else {
        const ta = (d[b + 1]! - o.y) / v.y;
        const tb = (d[b + 4]! - o.y) / v.y;
        t0 = Math.max(t0, Math.min(ta, tb));
        t1 = Math.min(t1, Math.max(ta, tb));
        if (t0 > t1) continue;
      }
      if (v.z === 0) {
        if (o.z < d[b + 2]! || o.z > d[b + 5]!) continue;
      } else {
        const ta = (d[b + 2]! - o.z) / v.z;
        const tb = (d[b + 5]! - o.z) / v.z;
        t0 = Math.max(t0, Math.min(ta, tb));
        t1 = Math.min(t1, Math.max(ta, tb));
        if (t0 > t1) continue;
      }
      if (!rayMayHitSphere(o, v, far, d[k]!, d[k + 1]!, d[k + 2]!, d[k + 3]!)) continue;
      // inserção ordenada: a lista é curta (o que o raio cruza)
      let j = out.length;
      out.push(this.meshes[i]!);
      entry.push(t0);
      while (j > 0 && entry[j - 1]! > t0) {
        out[j] = out[j - 1]!;
        entry[j] = entry[j - 1]!;
        j--;
      }
      out[j] = this.meshes[i]!;
      entry[j] = t0;
    }
    return out;
  }
}

/** O 3×3 (giro/escala) mudou desde o guardado? */
function turned(prev: Float32Array, e: ArrayLike<number>): boolean {
  for (let j = 0; j < BASIS.length; j++) if (Math.abs(prev[PREV_BASIS + j]! - e[BASIS[j]]!) > MOVE_EPSILON) return true;
  return false;
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

const _alongCand: Object3D[] = [];
const _alongEntry: number[] = [];
const _meshHits: Intersection[] = [];

/**
 * O acerto mais próximo do `raycaster` entre as malhas de `index` (SPEC-0328) — mesmo
 * resultado que `intersectObjects(lista, false)` filtrado por `skip` e lido no 1º, mas
 * só testa o que o raio cruza, mais perto primeiro, e para quando a próxima malha entra
 * além do melhor acerto. Respeita `layers` (como o `intersectObjects`). Ligue
 * `raycaster.firstHitOnly` pra árvore BVH parar no 1º triângulo.
 * @param skip Descarta o acerto (ex.: o próprio personagem).
 */
export function firstHit(
  raycaster: Raycaster,
  index: NearMeshIndex,
  skip?: (o: Object3D) => boolean,
): Intersection | null {
  const cand = index.alongRay(raycaster.ray, raycaster.near, raycaster.far, _alongCand, _alongEntry);
  let best: Intersection | null = null;
  for (let i = 0; i < cand.length; i++) {
    if (best && _alongEntry[i]! > best.distance) break; // nada daqui pra frente acerta antes
    const o = cand[i]!;
    if (!o.layers.test(raycaster.layers)) continue;
    _meshHits.length = 0;
    o.raycast(raycaster, _meshHits);
    for (let h = 0; h < _meshHits.length; h++) {
      const hit = _meshHits[h]!;
      if ((best === null || hit.distance < best.distance) && !(skip && skip(hit.object))) best = hit;
    }
  }
  _meshHits.length = 0;
  return best;
}
