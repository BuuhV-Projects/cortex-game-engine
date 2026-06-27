/**
 * **Greide da estrada + moldagem do terreno** (ADR-0072 Fase 2). Inverte a relação
 * da Fase 1: em vez da pista se deformar acompanhando cada bossa do relevo (toalha
 * jogada por cima), a estrada tem um **greide próprio suavizado** e o **terreno se
 * adapta a ele** — *cut & fill* (corta morro acima da pista, aterra vale abaixo) com
 * uma faixa de **talude** nas laterais pra a transição não virar um paredão.
 *
 * Puro (sem three/ECS) — testável isolado. O {@link buildScene} amostra a altura do
 * terreno sob a spline, gera o greide ({@link smoothGrade}) e usa
 * {@link moldHeightfield} pra calcular o **delta** de altura do terreno (não-
 * destrutivo: somado à base autorada a cada build, ver {@link Terrain}).
 */
import type { RoadSample, Vec3 } from './RoadSpline.js';

/** Opções do greide suavizado. */
export interface GradeOptions {
  /**
   * Inclinação **máxima** do greide (Δaltura / Δhorizontal). Default `0.08` (8% —
   * limite confortável pra estrada). O greide nunca sobe/desce mais íngreme que isso,
   * cortando/aterrando o terreno pra compensar.
   */
  maxSlope?: number;
  /**
   * Janela da média móvel em **metros** (alisa bossas pequenas antes do clamp de
   * inclinação). Default `12`. Maior = greide mais reto (mais cut & fill); menor =
   * acompanha mais o relevo.
   */
  smoothMeters?: number;
}

/** smoothstep clássico (0→0, 1→1, derivadas 0 nas pontas). */
function smoothstep(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

/** Distância horizontal (XZ) entre duas amostras. */
function horiz(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

/**
 * **Greide suavizado** da estrada: dado o perfil de altura do terreno sob cada
 * amostra da spline (`terrainY`, mesmo tamanho de `samples`), devolve um Y por
 * amostra que (1) **alisa** bossas pequenas por média móvel e (2) **limita a
 * inclinação** a `maxSlope` (passes pra frente e pra trás). O resultado é o perfil
 * que a pista segue e ao qual o terreno será moldado.
 *
 * Puro/determinístico. Se `samples` tem <2 pontos, devolve `terrainY` como veio.
 */
export function smoothGrade(samples: RoadSample[], terrainY: number[], opts: GradeOptions = {}): number[] {
  const n = samples.length;
  if (n < 2) return terrainY.slice(0, n);
  const maxSlope = Math.max(0, opts.maxSlope ?? 0.08);
  const smoothMeters = Math.max(0, opts.smoothMeters ?? 12);

  // Distância acumulada (pra janela em metros + clamp de inclinação por segmento).
  const segLen: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) segLen[i] = horiz(samples[i]!.pos, samples[i - 1]!.pos);

  // (1) Média móvel por janela de `smoothMeters` (em distância real, não em índice —
  // a tessellation é adaptativa, então índices não são equiespaçados).
  const half = smoothMeters / 2;
  const y = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    if (half <= 0) { y[i] = terrainY[i]!; continue; }
    let sum = terrainY[i]!, w = 1;
    let d = 0;
    for (let k = i - 1; k >= 0; k--) { d += segLen[k + 1]!; if (d > half) break; sum += terrainY[k]!; w++; }
    d = 0;
    for (let k = i + 1; k < n; k++) { d += segLen[k]!; if (d > half) break; sum += terrainY[k]!; w++; }
    y[i] = sum / w;
  }

  // (2) Clamp de inclinação: forward (sobe limitado a partir do vizinho anterior) e
  // backward (idem ao contrário); o min dos dois mantém o greide ENTRE os limites,
  // sem estourar a rampa em nenhuma direção.
  if (maxSlope > 0) {
    const fwd = y.slice();
    for (let i = 1; i < n; i++) {
      const cap = fwd[i - 1]! + maxSlope * segLen[i]!;
      const flo = fwd[i - 1]! - maxSlope * segLen[i]!;
      fwd[i] = Math.min(cap, Math.max(flo, fwd[i]!));
    }
    const bwd = y.slice();
    for (let i = n - 2; i >= 0; i--) {
      const cap = bwd[i + 1]! + maxSlope * segLen[i + 1]!;
      const flo = bwd[i + 1]! - maxSlope * segLen[i + 1]!;
      bwd[i] = Math.min(cap, Math.max(flo, bwd[i]!));
    }
    // Média das duas passes: ambas respeitam o limite; a média também (limite é convexo).
    for (let i = 0; i < n; i++) y[i] = (fwd[i]! + bwd[i]!) / 2;
  }
  return y;
}

/** Um ponto do eixo da estrada em coords **locais do terreno** (XZ no plano, Y = greide). */
export interface GradePoint {
  x: number;
  z: number;
  y: number;
}

/** Descritor da grade do terreno (espelha {@link Terrain}: plano XZ centrado). */
export interface HeightfieldGrid {
  /** Largura (X) em unidades de mundo. */
  width: number;
  /** Profundidade (Z) em unidades de mundo. */
  depth: number;
  /** Segmentos por lado (grade `(resolution+1)²`). */
  resolution: number;
  /** Heightmap base autorado (row-major, `(res+1)²`). */
  base: ArrayLike<number>;
}

/** Projeta `(px,pz)` no segmento `a→b`; devolve distância² e o Y interpolado no pé. */
function projectToSegment(px: number, pz: number, a: GradePoint, b: GradePoint): { d2: number; y: number } {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  let t = len2 > 0 ? ((px - a.x) * abx + (pz - a.z) * abz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = a.x + abx * t;
  const cz = a.z + abz * t;
  const dx = px - cx;
  const dz = pz - cz;
  return { d2: dx * dx + dz * dz, y: a.y + (b.y - a.y) * t };
}

/**
 * **Molda o terreno à estrada** (cut & fill + talude). Para cada vértice da grade,
 * acha o ponto mais próximo do eixo da pista (`centerline`, coords locais com Y =
 * greide) e calcula a altura-alvo:
 * - dentro de `halfWidth` (sob a pista) → **greide** (corta/aterra até a pista);
 * - dentro de `halfWidth + taludeWidth` (talude) → `smoothstep` do greide → base;
 * - fora → base (delta 0).
 *
 * Devolve o **delta** (`alvo − base`) por vértice — somado à base pelo {@link Terrain}
 * (não-destrutivo). Acumule deltas de várias estradas com {@link mergeDeltas}.
 *
 * Puro. `centerline` com <2 pontos = nenhuma moldagem (delta tudo 0).
 */
export function moldHeightfield(
  grid: HeightfieldGrid,
  centerline: GradePoint[],
  halfWidth: number,
  taludeWidth: number,
): Float32Array {
  const res = grid.resolution;
  const n = res + 1;
  const delta = new Float32Array(n * n);
  if (centerline.length < 2) return delta;
  const half = Math.max(0.05, halfWidth);
  const talude = Math.max(0, taludeWidth);
  const reach = half + talude;
  const reach2 = reach * reach;

  for (let j = 0; j < n; j++) {
    const lz = (j / res - 0.5) * grid.depth;
    for (let i = 0; i < n; i++) {
      const lx = (i / res - 0.5) * grid.width;
      // Ponto mais próximo do eixo (menor distância²) + greide no pé da projeção.
      let bestD2 = Infinity;
      let bestY = 0;
      for (let s = 1; s < centerline.length; s++) {
        const r = projectToSegment(lx, lz, centerline[s - 1]!, centerline[s]!);
        if (r.d2 < bestD2) { bestD2 = r.d2; bestY = r.y; }
      }
      if (bestD2 > reach2) continue; // fora do alcance: base intacta
      const idx = j * n + i;
      const baseY = grid.base[idx]!;
      const d = Math.sqrt(bestD2);
      let targetY: number;
      if (d <= half) {
        targetY = bestY; // sob a pista: cravado no greide
      } else {
        // Talude: t=0 na borda da pista (greide) → t=1 na borda externa (base).
        const t = (d - half) / talude;
        targetY = bestY + (baseY - bestY) * smoothstep(t);
      }
      delta[idx] = targetY - baseY;
    }
  }
  return delta;
}

/**
 * Combina deltas de **várias estradas** num só (mesma grade). Em sobreposição, vence o
 * de **maior magnitude** (a estrada que mais mexe no terreno manda — evita que um
 * talude suave de uma cancele o corte profundo de outra).
 */
export function mergeDeltas(deltas: Float32Array[]): Float32Array | null {
  if (deltas.length === 0) return null;
  const out = new Float32Array(deltas[0]!.length);
  for (const d of deltas) {
    for (let i = 0; i < out.length; i++) {
      if (Math.abs(d[i]!) > Math.abs(out[i]!)) out[i] = d[i]!;
    }
  }
  return out;
}
