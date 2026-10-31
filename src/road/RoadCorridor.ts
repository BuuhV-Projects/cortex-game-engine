/**
 * **Corredor da estrada** (SPEC-0631 §3b): responde "o ponto (x, z) está a menos de
 * `radius` do eixo?" em O(1) médio. Os segmentos do eixo vão para uma grade de hash com
 * célula de `2·radius`; a consulta olha só a célula do ponto e as 8 vizinhas. Puro.
 */

/** Ponto do eixo no plano (XZ). */
export interface CorridorPoint {
  x: number;
  z: number;
}

/** Célula da grade = este múltiplo do raio (o vizinho imediato cobre todo o alcance). */
const CELL_PER_RADIUS = 2;
const NEIGHBORS = [-1, 0, 1];

/** Índice espacial do eixo de uma estrada. Ver {@link RoadCorridor.contains}. */
export class RoadCorridor {
  private readonly cell: number;
  private readonly r2: number;
  private readonly buckets = new Map<string, number[]>();

  /**
   * @param centerline eixo da estrada (≥2 pontos)
   * @param radius distância máxima ao eixo considerada "dentro" (m)
   * @example
   * const c = new RoadCorridor(eixo, 4 + 2)
   * c.contains(10, 3) // true se a árvore cai na pista ou na faixa livre
   */
  constructor(private readonly centerline: readonly CorridorPoint[], radius: number) {
    this.r2 = radius * radius;
    this.cell = Math.max(radius, Number.EPSILON) * CELL_PER_RADIUS;
    for (let s = 1; s < centerline.length; s++) {
      const a = centerline[s - 1]!;
      const b = centerline[s]!;
      const i0 = Math.floor(Math.min(a.x, b.x) / this.cell);
      const i1 = Math.floor(Math.max(a.x, b.x) / this.cell);
      const j0 = Math.floor(Math.min(a.z, b.z) / this.cell);
      const j1 = Math.floor(Math.max(a.z, b.z) / this.cell);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const k = `${i},${j}`;
          const list = this.buckets.get(k);
          if (list) list.push(s);
          else this.buckets.set(k, [s]);
        }
      }
    }
  }

  /** `true` se `(x, z)` está a até `radius` de algum segmento do eixo. */
  contains(x: number, z: number): boolean {
    const ci = Math.floor(x / this.cell);
    const cj = Math.floor(z / this.cell);
    for (const di of NEIGHBORS) {
      for (const dj of NEIGHBORS) {
        const list = this.buckets.get(`${ci + di},${cj + dj}`);
        if (!list) continue;
        for (const s of list) if (this.dist2(x, z, s) <= this.r2) return true;
      }
    }
    return false;
  }

  private dist2(x: number, z: number, s: number): number {
    const a = this.centerline[s - 1]!;
    const b = this.centerline[s]!;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz;
    let t = len2 > 0 ? ((x - a.x) * abx + (z - a.z) * abz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - (a.x + abx * t);
    const dz = z - (a.z + abz * t);
    return dx * dx + dz * dz;
  }
}
