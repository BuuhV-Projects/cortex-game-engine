import {
  Object3D,
  Group,
  Mesh,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  Euler,
  CylinderGeometry,
  ConeGeometry,
  PlaneGeometry,
  MeshStandardMaterial,
  DoubleSide,
  Color,
  type BufferGeometry,
  type Material,
} from 'three';

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

/**
 * **Vegetação instanciada** (ADR-0077): espalha muitas cópias de um modelo (árvore,
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
 */
export class Vegetation {
  /** Adicione à cena. Contém as {@link InstancedMesh} (uma por sub-malha do modelo). */
  readonly group = new Group();

  private readonly subs: { mesh: InstancedMesh; local: Matrix4 }[] = [];
  private instances: number[] = []; // plano: [x,y,z,rotY,scale] por instância
  private readonly capacity: number;

  // Escratch reusado no sync (evita alocar por instância).
  private readonly _m = new Matrix4();
  private readonly _t = new Matrix4();
  private readonly _q = new Quaternion();
  private readonly _e = new Euler();
  private readonly _p = new Vector3();
  private readonly _s = new Vector3();

  /** `capacity` = máximo de instâncias (buffer pré-alocado). Default 8192. */
  constructor(source: Object3D, capacity = 8192) {
    this.capacity = Math.max(1, capacity);
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
      inst.frustumCulled = false; // o bounding muda com o espalhamento; evita sumir
      (inst.userData as Record<string, unknown>)['cortexVegetationSub'] = true;
      this.subs.push({ mesh: inst, local });
      this.group.add(inst);
    });
  }

  /** Número de instâncias espalhadas. */
  get count(): number {
    return this.instances.length / FLOATS_PER_INSTANCE;
  }

  /** Substitui todas as instâncias (ex.: restaurar do overlay) e atualiza as malhas. */
  setInstances(flat: number[]): void {
    const max = this.capacity * FLOATS_PER_INSTANCE;
    this.instances = flat.length > max ? flat.slice(0, max) : flat.slice();
    this.sync();
  }

  /** Instâncias atuais no formato plano serializável (`[x,y,z,rotY,scale]`). */
  getInstances(): number[] {
    return this.instances.slice();
  }

  /** Adiciona uma instância. Retorna `false` se a capacidade estourou. */
  add(x: number, y: number, z: number, rotY: number, scale: number): boolean {
    if (this.count >= this.capacity) return false;
    this.instances.push(x, y, z, rotY, scale);
    this.sync();
    return true;
  }

  /**
   * Remove instâncias cujo XZ está dentro de `radius` de `(x,z)` (borracha do pincel).
   * Retorna quantas removeu.
   */
  removeNear(x: number, z: number, radius: number): number {
    const r2 = radius * radius;
    const kept: number[] = [];
    let removed = 0;
    for (let i = 0; i < this.instances.length; i += FLOATS_PER_INSTANCE) {
      const dx = this.instances[i]! - x;
      const dz = this.instances[i + 2]! - z;
      if (dx * dx + dz * dz <= r2) {
        removed++;
        continue;
      }
      kept.push(...this.instances.slice(i, i + FLOATS_PER_INSTANCE));
    }
    if (removed > 0) {
      this.instances = kept;
      this.sync();
    }
    return removed;
  }

  /** Reescreve as matrizes de instância de todas as sub-malhas a partir de `instances`. */
  private sync(): void {
    const n = this.count;
    for (const { mesh, local } of this.subs) {
      mesh.count = n;
      for (let i = 0; i < n; i++) {
        const b = i * FLOATS_PER_INSTANCE;
        this._p.set(this.instances[b]!, this.instances[b + 1]!, this.instances[b + 2]!);
        this._e.set(0, this.instances[b + 3]!, 0);
        this._q.setFromEuler(this._e);
        const sc = this.instances[b + 4]!;
        this._s.set(sc, sc, sc);
        this._t.compose(this._p, this._q, this._s); // T·R·S da instância
        this._m.multiplyMatrices(this._t, local); // por cima da transform local da sub-malha
        mesh.setMatrixAt(i, this._m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
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
