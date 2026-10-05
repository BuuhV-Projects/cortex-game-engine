import { Sphere, type Object3D, type Vector3 } from 'three';

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

/** Floats por malha no índice: centro x, y, z e raio (já com a folga). */
const STRIDE = 4;

/**
 * Malhas + esferas em mundo, calculadas em {@link NearMeshIndex.rebuild} (junto da
 * varredura da cena). Malha sem esfera entra sempre (raio infinito: não arrisca).
 */
export class NearMeshIndex {
  private meshes: readonly Object3D[] = [];
  private data = new Float32Array(0);

  /** Recalcula as esferas de `meshes` (chamar quando a lista é remontada). */
  rebuild(meshes: readonly Object3D[]): void {
    this.meshes = meshes;
    if (this.data.length < meshes.length * STRIDE) this.data = new Float32Array(meshes.length * STRIDE);
    for (let i = 0; i < meshes.length; i++) {
      const s = worldSphere(meshes[i]!);
      const k = i * STRIDE;
      this.data[k] = s?.center.x ?? 0;
      this.data[k + 1] = s?.center.y ?? 0;
      this.data[k + 2] = s?.center.z ?? 0;
      this.data[k + 3] = s ? s.radius + MOVING_MARGIN : Infinity;
    }
  }

  /** As que alcançam (x, z) no plano até `reach` — raios verticais e paredes curtas. */
  nearXZ(x: number, z: number, reach: number, out: Object3D[]): Object3D[] {
    out.length = 0;
    for (let i = 0; i < this.meshes.length; i++) {
      const k = i * STRIDE;
      const r = this.data[k + 3]! + reach;
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
