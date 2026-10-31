/**
 * **Fita da pista** (ADR-0630, SPEC-0631 §4) a partir das amostras da spline. Para cada
 * amostra, uma linha de vértices atravessando a largura (lateral = up × tangente);
 * linhas consecutivas viram quads. UV: U atravessa a largura (0..1); V corre ao longo
 * do comprimento **por distância real** (a textura tila sem esticar nas curvas).
 *
 * A pista é **plana na largura**: todos os vértices de uma linha ficam no mesmo Y (o
 * greide daquela amostra, ver {@link smoothGrade}).
 */
import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { RoadSample, RoadVec3 } from './RoadSpline.js';

/** Metros de pista por repetição da textura (V). */
export const ROAD_DEFAULT_TILE_METERS = 8;
/** Largura máxima de uma coluna da grade da fita (m). */
const MAX_COLUMN_METERS = 1.5;
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 16;
/** Meia-largura mínima (evita fita degenerada). */
const MIN_HALF_WIDTH = 0.05;

/** Dados crus da fita (flat arrays) + índices dos triângulos. */
export interface RoadRibbon {
  positions: number[];
  uvs: number[];
  normals: number[];
  indices: number[];
}

/** Colunas da grade na largura: uma a cada ~1,5 m, entre 2 e 16. */
export function roadColumns(width: number): number {
  return Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, Math.round(width / MAX_COLUMN_METERS)));
}

/**
 * Gera a fita. `gradeY[i]` (opcional) é o Y da linha `i`; sem ele, usa o Y da amostra.
 * `lift` soma ao Y (a pista fica um tico acima do platô do terreno).
 *
 * @param samples amostras da spline ({@link sampleSpline})
 * @param width largura total (m)
 * @param tileMeters metros por repetição da textura no comprimento
 * @example
 * const r = roadRibbon(sampleSpline(pts), 8, 8, undefined, grade, 0.05)
 */
export function roadRibbon(
  samples: readonly RoadSample[],
  width: number,
  tileMeters = ROAD_DEFAULT_TILE_METERS,
  gradeY?: readonly number[],
  lift = 0,
): RoadRibbon {
  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const half = Math.max(MIN_HALF_WIDTH, width / 2);
  const cols = roadColumns(width);
  const perRow = cols + 1;
  const tile = tileMeters > 0 ? tileMeters : ROAD_DEFAULT_TILE_METERS;

  let dist = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    if (i > 0) {
      const p = samples[i - 1]!.pos;
      dist += Math.hypot(s.pos[0] - p[0], s.pos[2] - p[2]);
    }
    // Lateral horizontal = up × tangente (mão direita → triângulos virados pra +Y).
    const lx = s.tangent[2];
    const lz = -s.tangent[0];
    const ll = Math.hypot(lx, lz) || 1;
    const right: RoadVec3 = [lx / ll, 0, lz / ll];
    const y = (gradeY?.[i] ?? s.pos[1]) + lift;
    for (let j = 0; j <= cols; j++) {
      const f = j / cols;
      const off = (f - 0.5) * half * 2;
      positions.push(s.pos[0] + right[0] * off, y, s.pos[2] + right[2] * off);
      normals.push(0, 1, 0);
      uvs.push(f, dist / tile);
    }
  }
  for (let i = 0; i < samples.length - 1; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * perRow + j;
      const b = a + 1;
      const c = a + perRow;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return { positions, uvs, normals, indices };
}

/** Converte um {@link RoadRibbon} numa `BufferGeometry` (normais recalculadas da superfície). */
export function ribbonToGeometry(r: RoadRibbon): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(r.positions, 3));
  g.setAttribute('normal', new Float32BufferAttribute(r.normals, 3));
  g.setAttribute('uv', new Float32BufferAttribute(r.uvs, 2));
  g.setIndex(r.indices);
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
