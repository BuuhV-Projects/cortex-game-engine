import {
  Object3D,
  Group,
  Mesh,
  InstancedMesh,
  Matrix4,
  Vector3,
  Box3,
  CylinderGeometry,
  ConeGeometry,
  PlaneGeometry,
  MeshStandardMaterial,
  DoubleSide,
  Color,
  type BufferGeometry,
  type Material,
} from 'three';
import { writeInstanceMatrices, type VegetationSub } from './vegetationMatrices.js';

/**
 * Uma instância espalhada: posição (XZ no terreno, Y = chão), rotação em Y (radianos)
 * e escala uniforme. Serializável como 5 números (`x,y,z,rotY,scale`) — compacto pra
 * milhares de instâncias no overlay.
 */
export interface VegetationInstance {
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
}

/** Campos por instância no formato plano serializável (`[x,y,z,rotY,scale]`). */
export const FLOATS_PER_INSTANCE = 5;

/** Floats por matriz de instância. */
const MATRIX_FLOATS = 16;
/**
 * Faixas de upload acumuladas por atributo antes de fundi-las numa só: malha fora de vista não sobe, e as faixas de
 * cada escrita se empilhariam até ela voltar (SPEC-0597).
 */
const MAX_UPDATE_RANGES = 32;

/**
 * Marca `[start, end)` para upload. Passou de {@link MAX_UPDATE_RANGES}, as faixas viram UMA que cobre todas — limpar
 * e subir o atributo inteiro não serve: a próxima faixa faria o `three` subir só ela e perder as anteriores.
 */
function addCoalescedRange(attr: InstancedMesh['instanceMatrix'], start: number, end: number): void {
  const ranges = attr.updateRanges;
  if (ranges.length >= MAX_UPDATE_RANGES) {
    let lo = start;
    let hi = end;
    for (let r = 0; r < ranges.length; r++) {
      const range = ranges[r]!;
      if (range.start < lo) lo = range.start;
      if (range.start + range.count > hi) hi = range.start + range.count;
    }
    attr.clearUpdateRanges();
    attr.addUpdateRange(lo, hi - lo);
  } else {
    attr.addUpdateRange(start, end - start);
  }
  attr.needsUpdate = true;
}

/**
 * **Vegetação instanciada** (SPEC-0077): espalha muitas cópias de um modelo (árvore,
 * grama, arbusto…) numa única malha por geometria via {@link InstancedMesh} — aguenta
 * milhares de instâncias com um draw call por sub-malha. As instâncias são **dado**
 * (`[x,y,z,rotY,scale]`), espalhadas pelo pincel do editor e persistidas no overlay.
 *
 * Recebe um `source` (o `Object3D` do `.glb` ou um placeholder de {@link makePlaceholderVegetation});
 * coleta cada sub-malha (geometria+material, com a transform relativa ao root) e cria
 * uma {@link InstancedMesh} por sub-malha. Cada instância aplica
 * `T(pos)·Ry(rot)·S(scale)` por cima da transform local da sub-malha (modelos com tronco
 * + copa separados mantêm o layout).
 *
 * @example
 * const veg = new Vegetation(treeObject)
 * scene.add(veg.group)
 * veg.add(10, 0, 5, 0, 1.2) // uma árvore em (10,5), escala 1.2
 *
 * @example
 * // Escrita sem cópia (SPEC-0675): o buffer do chamador vira o armazenamento.
 * const data = new Float32Array(1900 * FLOATS_PER_INSTANCE)
 * veg.adoptInstances(data, 0)
 * veg.writeInstances(0, cell) // só a faixa [0, cell.length/5) sobe
 */
export class Vegetation {
  /** Adicione à cena. Contém as {@link InstancedMesh} (uma por sub-malha do modelo). */
  readonly group = new Group();

  private readonly subs: VegetationSub[] = [];
  /** Array próprio (plano: `[x,y,z,rotY,scale]` por instância); é o armazenamento quando nada foi adotado. */
  private own: number[] = [];
  /**
   * Armazenamento atual: {@link own} ou o buffer adotado por {@link adoptInstances} (sem cópia). Vale para as
   * primeiras {@link count} instâncias.
   */
  private data: number[] | Float32Array | Float64Array = this.own;
  private instanceCount = 0;
  /** Instâncias escondidas pela estrada (SPEC-0631 §3b) — não mexe nas instâncias. */
  private hidden: Uint8Array | null = null;
  private readonly capacity: number;
  private _version = 0;

  /** `capacity` = máximo de instâncias (buffer pré-alocado). Default 8192. */
  constructor(source: Object3D, capacity = 8192) {
    this.capacity = Math.max(1, capacity);
    this.buildFrom(source);
  }

  /** (Re)constrói as {@link InstancedMesh} a partir do `source` (modelo .glb ou placeholder). */
  private buildFrom(source: Object3D): void {
    source.updateWorldMatrix(true, true);
    const rootInv = new Matrix4().copy(source.matrixWorld).invert();
    source.traverse((o) => {
      if (!(o as Mesh).isMesh) return;
      const m = o as Mesh;
      const geo = m.geometry as BufferGeometry;
      const mat = m.material as Material | Material[];
      // Transform da sub-malha relativa ao root do modelo (mantém o layout multi-mesh).
      const local = new Matrix4().multiplyMatrices(rootInv, m.matrixWorld);
      const inst = new InstancedMesh(geo, Array.isArray(mat) ? mat[0]! : mat, this.capacity);
      inst.count = 0;
      inst.castShadow = m.castShadow;
      inst.receiveShadow = m.receiveShadow;
      // Culling LIGADO (SPEC-0299): o `sync()` recalcula a esfera das instâncias reais
      // a cada mudança, então dividir a vegetação em nós por célula corta o que sai de vista.
      inst.frustumCulled = true;
      // Raycast LIGADO pro editor poder SELECIONAR a vegetação. A física não a testa
      // (usa só terreno/solid/groundMeshes; a colisão é por cilindro/`trunks`), então
      // não há custo de raycast de floresta no chão. `cortexVegetationSub` a mantém
      // fora dos raycasts da física.
      (inst.userData as Record<string, unknown>)['cortexVegetationSub'] = true;
      this.subs.push({ mesh: inst, local });
      this.group.add(inst);
    });
  }

  /**
   * **Troca o modelo** mantendo o grupo (mesmo `Object3D` na cena) e as instâncias —
   * descarta as {@link InstancedMesh} atuais, reconstrói a partir do `source` novo e
   * reaplica o espalhamento. Usado pelo editor pra trocar placeholder → `.glb` real.
   */
  setSource(source: Object3D): void {
    for (const { mesh } of this.subs) {
      this.group.remove(mesh);
      mesh.dispose();
    }
    this.subs.length = 0;
    this.buildFrom(source);
    this.sync(); // reaplica as instâncias atuais no modelo novo
  }

  /**
   * Sobe a cada mudança das instâncias (ou da máscara de escondidas / do modelo): quem guarda uma cópia
   * derivada delas — os troncos do {@link CharacterPhysicsSystem} — só relê quando muda (SPEC-0674).
   */
  get version(): number {
    return this._version;
  }

  /** Número de instâncias espalhadas. */
  get count(): number {
    return this.instanceCount;
  }

  /**
   * O armazenamento atual (`[x,y,z,rotY,scale]` por instância), **só leitura** e válido para as primeiras
   * {@link count} instâncias — sem a cópia de {@link getInstances} (SPEC-0675).
   */
  get instanceData(): Readonly<ArrayLike<number>> {
    return this.data;
  }

  /** Substitui todas as instâncias (ex.: restaurar do overlay) e atualiza as malhas. Copia `flat`. */
  setInstances(flat: ArrayLike<number>): void {
    const n = Math.min(this.capacity, Math.floor(flat.length / FLOATS_PER_INSTANCE));
    const own = this.own;
    own.length = n * FLOATS_PER_INSTANCE;
    for (let k = 0; k < own.length; k++) own[k] = flat[k]!;
    this.data = own;
    this.instanceCount = n;
    this.hidden = null; // índices mudaram: a estrada recalcula a máscara
    this.sync();
  }

  /**
   * Substitui todas as instâncias **sem copiar** (SPEC-0675): `data` vira o armazenamento. Quem chama não muta
   * `data` sem avisar por {@link syncInstances} (ou escrever por {@link writeInstances}). Zera a máscara da estrada.
   *
   * @param data - `[x,y,z,rotY,scale]` por instância.
   * @param count - Instâncias válidas em `data` (default: todas que cabem); limitado à capacidade.
   */
  adoptInstances(data: Float32Array | Float64Array | number[], count = Math.floor(data.length / FLOATS_PER_INSTANCE)): void {
    this.data = data;
    this.instanceCount = Math.max(0, Math.min(count, this.capacity, Math.floor(data.length / FLOATS_PER_INSTANCE)));
    this.hidden = null;
    this.sync();
  }

  /**
   * Escreve a faixa de instâncias `[first, first+count)` e atualiza **só ela** (SPEC-0675): matrizes, faixa de upload
   * do `instanceMatrix` e a esfera de culling, que só cresce (encolhe na próxima escrita inteira). A faixa passando do
   * total sobe o total; o vão entre o total antigo e `first` fica com escala 0 (invisível) no array próprio. Mantém a
   * máscara da estrada. Com buffer adotado, escreve nele.
   *
   * @param first - Índice da primeira instância.
   * @param flat - `[x,y,z,rotY,scale]` por instância.
   * @param count - Instâncias a escrever (default: todas de `flat`).
   * @throws RangeError se a faixa passa da capacidade (ou do tamanho do buffer adotado).
   */
  writeInstances(first: number, flat: ArrayLike<number>, count = Math.floor(flat.length / FLOATS_PER_INSTANCE)): void {
    const end = first + count;
    const data = this.data;
    const growsOwn = data === this.own;
    if (first < 0 || count < 0 || end > this.capacity || (!growsOwn && end * FLOATS_PER_INSTANCE > data.length)) {
      throw new RangeError(`Vegetation.writeInstances: faixa [${first}, ${end}) fora da capacidade`);
    }
    const old = this.instanceCount;
    if (growsOwn && end > old) {
      const own = this.own;
      own.length = end * FLOATS_PER_INSTANCE;
      own.fill(0, old * FLOATS_PER_INSTANCE, first * FLOATS_PER_INSTANCE);
    }
    const base = first * FLOATS_PER_INSTANCE;
    const n = count * FLOATS_PER_INSTANCE;
    for (let k = 0; k < n; k++) data[base + k] = flat[k]!;
    this.instanceCount = Math.max(old, end);
    this.syncRange(Math.min(first, old), end);
  }

  /**
   * Atualiza a faixa `[first, first+count)` depois que o chamador mutou o buffer adotado no lugar (SPEC-0675).
   * Limitada ao total atual.
   */
  syncInstances(first: number, count: number): void {
    const from = Math.max(0, first);
    const to = Math.min(this.instanceCount, first + count);
    if (to > from) this.syncRange(from, to);
  }

  /**
   * **Esconde instâncias** sem apagá-las (SPEC-0631 §3b: árvore no corredor da estrada).
   * `hidden[i] = 1` desenha a instância `i` com escala 0 (some do desenho, da sombra e do
   * raycast); {@link getInstances} continua com todas. `null` mostra todas de novo.
   */
  setHidden(hidden: Uint8Array | null): void {
    if (!hidden && !this.hidden) return;
    this.hidden = hidden;
    this.sync();
  }

  /** Instâncias atuais no formato plano serializável (`[x,y,z,rotY,scale]`). */
  getInstances(): number[] {
    const n = this.instanceCount * FLOATS_PER_INSTANCE;
    const out = new Array<number>(n);
    for (let k = 0; k < n; k++) out[k] = this.data[k]!;
    return out;
  }

  /** Adiciona uma instância. Retorna `false` se a capacidade estourou. */
  add(x: number, y: number, z: number, rotY: number, scale: number): boolean {
    if (this.count >= this.capacity) return false;
    this.ownData().push(x, y, z, rotY, scale);
    this.instanceCount++;
    this.sync();
    return true;
  }

  /**
   * Remove instâncias cujo XZ está dentro de `radius` de `(x,z)` (borracha do pincel).
   * Retorna quantas removeu.
   */
  removeNear(x: number, z: number, radius: number): number {
    const r2 = radius * radius;
    const instances = this.ownData();
    const kept: number[] = [];
    let removed = 0;
    for (let i = 0; i < instances.length; i += FLOATS_PER_INSTANCE) {
      const dx = instances[i]! - x;
      const dz = instances[i + 2]! - z;
      if (dx * dx + dz * dz <= r2) {
        removed++;
        continue;
      }
      kept.push(...instances.slice(i, i + FLOATS_PER_INSTANCE));
    }
    if (removed > 0) {
      this.own = kept;
      this.data = kept;
      this.instanceCount = kept.length / FLOATS_PER_INSTANCE;
      this.hidden = null; // índices mudaram: a estrada recalcula a máscara
      this.sync();
    }
    return removed;
  }

  /** Transform da instância `i` (`[x,y,z,rotY,scale]`), ou `null` se fora de faixa. */
  instanceAt(i: number): { x: number; y: number; z: number; rotY: number; scale: number } | null {
    const b = i * FLOATS_PER_INSTANCE;
    if (b < 0 || i >= this.instanceCount) return null;
    const d = this.data;
    return { x: d[b]!, y: d[b + 1]!, z: d[b + 2]!, rotY: d[b + 3]!, scale: d[b + 4]! };
  }

  /** Remove a instância `i` (seleção individual no editor). Retorna `true` se removeu. */
  removeAt(i: number): boolean {
    const b = i * FLOATS_PER_INSTANCE;
    if (b < 0 || i >= this.instanceCount) return false;
    this.ownData().splice(b, FLOATS_PER_INSTANCE);
    this.instanceCount--;
    this.hidden = null; // índices mudaram: a estrada recalcula a máscara
    this.sync();
    return true;
  }

  /** Bounding box do MODELO em escala 1 (união das sub-malhas) — p/ gizmos de seleção. */
  modelBounds(out: Box3): Box3 {
    out.makeEmpty();
    const tmp = new Box3();
    for (const { mesh, local } of this.subs) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      tmp.copy(mesh.geometry.boundingBox!).applyMatrix4(local);
      out.union(tmp);
    }
    if (out.isEmpty()) out.set(new Vector3(-0.5, 0, -0.5), new Vector3(0.5, 1, 0.5));
    return out;
  }

  /**
   * As edições do editor (`add`/`removeNear`/`removeAt`) mexem no array próprio: com buffer adotado, copia as
   * instâncias válidas para ele antes.
   */
  private ownData(): number[] {
    const n = this.instanceCount * FLOATS_PER_INSTANCE;
    if (this.data !== this.own) {
      const own: number[] = new Array<number>(n);
      for (let k = 0; k < n; k++) own[k] = this.data[k]!;
      this.own = own;
      this.data = own;
    }
    this.own.length = n;
    return this.own;
  }

  /** Reescreve as matrizes de instância de todas as sub-malhas e refaz a esfera de culling do zero. */
  private sync(): void {
    this._version++; // os troncos do personagem relêem (SPEC-0674)
    const n = this.instanceCount;
    for (const { mesh } of this.subs) {
      mesh.count = n;
      // Escrita inteira: sobe o atributo todo, não as faixas que sobraram de escritas parciais.
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.needsUpdate = true;
      // Único ponto (com a faixa) que escreve instanceMatrix/count: a esfera de culling segue as instâncias.
      if (mesh.boundingSphere) mesh.boundingSphere.makeEmpty();
    }
    writeInstanceMatrices(this.subs, this.data, this.hidden, 0, n);
  }

  /** Reescreve as instâncias `[from, to)` e sobe só a faixa; a esfera cresce para cobri-las (SPEC-0675). */
  private syncRange(from: number, to: number): void {
    this._version++; // escrita por faixa também muda as instâncias (SPEC-0674)
    for (const { mesh } of this.subs) {
      mesh.count = this.instanceCount;
      addCoalescedRange(mesh.instanceMatrix, from * MATRIX_FLOATS, to * MATRIX_FLOATS);
    }
    writeInstanceMatrices(this.subs, this.data, this.hidden, from, to - from);
  }

  /** Libera as geometrias/materiais das instâncias. */
  dispose(): void {
    for (const { mesh } of this.subs) mesh.dispose();
  }
}

/**
 * Modelo **placeholder** procedural de vegetação (até ter `.glb` reais). `tree` = tronco
 * (cilindro marrom) + copa (cone verde); `grass` = dois quads cruzados verdes. Centrado
 * na base (Y=0 no chão) pra assentar no terreno. Troque por um `.glb` quando tiver arte.
 */
export function makePlaceholderVegetation(kind: 'tree' | 'grass' = 'tree'): Object3D {
  const root = new Group();
  if (kind === 'grass') {
    const mat = new MeshStandardMaterial({ color: new Color(0x5a8f3c), side: DoubleSide, roughness: 1, metalness: 0 });
    const geo = new PlaneGeometry(0.8, 0.8);
    for (let k = 0; k < 2; k++) {
      const blade = new Mesh(geo, mat);
      blade.position.y = 0.4;
      blade.rotation.y = (k * Math.PI) / 2;
      root.add(blade);
    }
    return root;
  }
  // Árvore: tronco + copa.
  const trunk = new Mesh(
    new CylinderGeometry(0.18, 0.26, 2, 8),
    new MeshStandardMaterial({ color: new Color(0x6b4a2b), roughness: 1, metalness: 0 }),
  );
  trunk.position.y = 1;
  trunk.castShadow = true;
  const crown = new Mesh(
    new ConeGeometry(1.3, 3, 9),
    new MeshStandardMaterial({ color: new Color(0x3f7d3a), roughness: 1, metalness: 0 }),
  );
  crown.position.y = 3.2;
  crown.castShadow = true;
  root.add(trunk, crown);
  return root;
}
