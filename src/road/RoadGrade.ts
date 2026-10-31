/**
 * **Greide da estrada + corte e aterro no terreno** (ADR-0630, SPEC-0631 §2–3). A estrada
 * tem um greide próprio suavizado e o **terreno se adapta a ele**: corta onde o terreno
 * está acima, aterra onde está abaixo, com um talude nas laterais.
 *
 * Puro (sem three/ECS). O resultado da moldagem é um **delta** somado à base do terreno
 * ({@link Terrain.setRoadMolding}) — não destrutivo.
 */
import type { RoadSample, RoadVec3 } from './RoadSpline.js';

/** Inclinação máxima default do greide (25%: sobe a serra fazendo ladeira). */
export const ROAD_DEFAULT_MAX_SLOPE = 0.25;
/** Janela default da média móvel do greide (m). */
export const ROAD_DEFAULT_SMOOTH_METERS = 12;
/** O acostamento mínimo cobre tantas células da grade além da borda da pista. */
const SHOULDER_CELLS = 1.5;
const MIN_HALF_WIDTH = 0.05;

/** Opções do greide suavizado. */
export interface GradeOptions {
  /** Inclinação máxima (Δy / Δhorizontal). Default {@link ROAD_DEFAULT_MAX_SLOPE}. `0` = sem limite. */
  maxSlope?: number;
  /** Janela da média móvel em metros. Default {@link ROAD_DEFAULT_SMOOTH_METERS}. `0` = sem média. */
  smoothMeters?: number;
}

/** smoothstep clássico em [0,1]. */
function smoothstep(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

function horiz(a: RoadVec3, b: RoadVec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

/**
 * **Greide** da estrada: a partir da altura de referência sob cada amostra (`refY`, mesmo
 * tamanho de `samples` — a base do terreno ou o Y da curva), alisa por média móvel em
 * **metros** e limita a inclinação a `maxSlope` (passadas pra frente e pra trás; a média
 * das duas respeita o limite).
 *
 * @returns um Y por amostra. Com <2 amostras devolve `refY` como veio.
 * @example
 * const grade = smoothGrade(samples, terrainY, { maxSlope: 0.12 })
 */
export function smoothGrade(samples: readonly RoadSample[], refY: readonly number[], opts: GradeOptions = {}): number[] {
  const n = samples.length;
  if (n < 2) return refY.slice(0, n);
  const maxSlope = Math.max(0, opts.maxSlope ?? ROAD_DEFAULT_MAX_SLOPE);
  const half = Math.max(0, opts.smoothMeters ?? ROAD_DEFAULT_SMOOTH_METERS) / 2;

  const seg = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) seg[i] = horiz(samples[i]!.pos, samples[i - 1]!.pos);

  // (1) Média móvel por distância real (a tessellation é adaptativa: índices não são equiespaçados).
  const y = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let sum = refY[i]!;
    let w = 1;
    if (half > 0) {
      for (let k = i - 1, d = seg[i]!; k >= 0 && d <= half; d += seg[k]!, k--) {
        sum += refY[k]!;
        w++;
      }
      for (let k = i + 1, d = seg[k] ?? Infinity; k < n && d <= half; k++, d += seg[k] ?? Infinity) {
        sum += refY[k]!;
        w++;
      }
    }
    y[i] = sum / w;
  }

  // (2) Limite de inclinação nas duas direções; a média das duas passadas fica dentro do limite.
  if (maxSlope > 0) {
    const fwd = y.slice();
    for (let i = 1; i < n; i++) {
      const lim = maxSlope * seg[i]!;
      fwd[i] = Math.min(fwd[i - 1]! + lim, Math.max(fwd[i - 1]! - lim, fwd[i]!));
    }
    const bwd = y.slice();
    for (let i = n - 2; i >= 0; i--) {
      const lim = maxSlope * seg[i + 1]!;
      bwd[i] = Math.min(bwd[i + 1]! + lim, Math.max(bwd[i + 1]! - lim, bwd[i]!));
    }
    for (let i = 0; i < n; i++) y[i] = (fwd[i]! + bwd[i]!) / 2;
  }
  return y;
}

/** Um ponto do eixo em coords **locais do terreno** (XZ no plano, Y = greide). */
export interface GradePoint {
  x: number;
  z: number;
  y: number;
  /** No vão de uma ponte: o segmento entre dois pontos `bridge` só corta, nunca aterra (SPEC-0631 §3c). */
  bridge?: boolean;
}

/** Descritor da grade do terreno (espelha {@link Terrain}: plano XZ centrado na origem local). */
export interface HeightfieldGrid {
  /** Largura (X) em metros. */
  width: number;
  /** Profundidade (Z) em metros. */
  depth: number;
  /** Segmentos por lado (grade `(resolution+1)²`). */
  resolution: number;
  /** Heightmap **base** (row-major, `(res+1)²`). */
  base: ArrayLike<number>;
}

/**
 * **Molda o terreno à estrada**: para cada vértice perto do eixo, a altura-alvo é o
 * greide no **platô** (`halfWidth` + acostamento ≥ 1,5 célula — a borda da pista nunca
 * cai no talude), um `smoothstep` do greide até a base no **talude**, e a base fora.
 *
 * Vértice cujo segmento mais próximo é de **ponte** (as duas pontas com `bridge`) só é
 * cortado (delta ≤ 0): o vale embaixo fica, a encosta acima da pista sai (SPEC-0631 §3c).
 *
 * Custo O(segmentos × células perto de cada segmento) + O(vértices): cada segmento só
 * visita a caixa dele ± alcance.
 *
 * @returns o **delta** (alvo − base) por vértice; tudo 0 com <2 pontos no eixo.
 * @example
 * const delta = moldHeightfield(grid, centerline, 4, 6)
 * terrain.setRoadMolding(delta)
 */
export function moldHeightfield(
  grid: HeightfieldGrid,
  centerline: readonly GradePoint[],
  halfWidth: number,
  taludeWidth: number,
): Float32Array {
  const res = grid.resolution;
  const n = res + 1;
  const delta = new Float32Array(n * n);
  if (centerline.length < 2) return delta;
  const cellX = grid.width / res;
  const cellZ = grid.depth / res;
  const flat = Math.max(MIN_HALF_WIDTH, halfWidth) + Math.max(cellX, cellZ) * SHOULDER_CELLS;
  const talude = Math.max(0, taludeWidth);
  const reach = flat + talude;
  const reach2 = reach * reach;

  const bestD2 = new Float64Array(n * n).fill(Infinity);
  const bestY = new Float64Array(n * n);
  const bestCutOnly = new Uint8Array(n * n);
  const toI = (x: number): number => (x / grid.width + 0.5) * res;
  const toJ = (z: number): number => (z / grid.depth + 0.5) * res;

  for (let s = 1; s < centerline.length; s++) {
    const a = centerline[s - 1]!;
    const b = centerline[s]!;
    const i0 = Math.max(0, Math.ceil(toI(Math.min(a.x, b.x) - reach)));
    const i1 = Math.min(res, Math.floor(toI(Math.max(a.x, b.x) + reach)));
    const j0 = Math.max(0, Math.ceil(toJ(Math.min(a.z, b.z) - reach)));
    const j1 = Math.min(res, Math.floor(toJ(Math.max(a.z, b.z) + reach)));
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz;
    const cutOnly = a.bridge === true && b.bridge === true ? 1 : 0;
    for (let j = j0; j <= j1; j++) {
      const lz = (j / res - 0.5) * grid.depth;
      for (let i = i0; i <= i1; i++) {
        const lx = (i / res - 0.5) * grid.width;
        let t = len2 > 0 ? ((lx - a.x) * abx + (lz - a.z) * abz) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = lx - (a.x + abx * t);
        const dz = lz - (a.z + abz * t);
        const d2 = dx * dx + dz * dz;
        const idx = j * n + i;
        if (d2 < bestD2[idx]!) {
          bestD2[idx] = d2;
          bestY[idx] = a.y + (b.y - a.y) * t;
          bestCutOnly[idx] = cutOnly;
        }
      }
    }
  }

  for (let idx = 0; idx < n * n; idx++) {
    const d2 = bestD2[idx]!;
    if (d2 > reach2) continue;
    const d = Math.sqrt(d2);
    const base = grid.base[idx]!;
    const y = bestY[idx]!;
    const target = d <= flat || talude === 0 ? y : y + (base - y) * smoothstep((d - flat) / talude);
    delta[idx] = bestCutOnly[idx] ? Math.min(0, target - base) : target - base;
  }
  return delta;
}

/**
 * Combina deltas de **várias estradas** na mesma grade: vence o de **maior módulo** em
 * cada vértice (o corte fundo de uma não é apagado pelo talude suave de outra).
 *
 * @returns `null` se a lista está vazia.
 */
export function mergeDeltas(deltas: readonly Float32Array[]): Float32Array | null {
  if (deltas.length === 0) return null;
  const out = new Float32Array(deltas[0]!.length);
  for (const d of deltas) {
    for (let i = 0; i < out.length; i++) if (Math.abs(d[i]!) > Math.abs(out[i]!)) out[i] = d[i]!;
  }
  return out;
}
