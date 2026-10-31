/**
 * **Spline de estrada** (ADR-0630, SPEC-0631). Catmull-Rom pelos pontos de controle:
 * amostra **posição + tangente** ao longo da curva pra a fita da pista seguir suave.
 * Puro (sem three/editor) — testável isolado.
 *
 * Catmull-Rom passa por TODOS os pontos (diferente de Bézier): os pontos que o jogo ou
 * o editor colocam são pontos da pista.
 */

/** `[x, y, z]` em metros. */
export type RoadVec3 = [number, number, number];

/** Uma amostra da spline: posição no mundo + tangente (direção da pista, unitária). */
export interface RoadSample {
  pos: RoadVec3;
  tangent: RoadVec3;
  /** Parâmetro na curva: índice do ponto de controle + fração do segmento (`2.5` = meio de 2→3). */
  t?: number;
}

/** Amostras por 90° de curvatura (default de {@link sampleSpline}). */
export const ROAD_DEFAULT_CURVE_DENSITY = 16;
/** Em reta, uma amostra a cada tantos metros (acompanha o relevo em trechos longos). */
const METERS_PER_STRAIGHT_SAMPLE = 3;
/** Limites de subdivisões por segmento entre dois pontos. */
const MIN_SEGMENT_STEPS = 2;
const MAX_SEGMENT_STEPS = 256;
/** Tensão padrão da Catmull-Rom uniforme. */
const CATMULL_TENSION = 0.5;
const QUARTER_TURN = Math.PI / 2;

function sub(a: RoadVec3, b: RoadVec3): RoadVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function norm(v: RoadVec3): RoadVec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function dot(a: RoadVec3, b: RoadVec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Catmull-Rom no segmento p1→p2 (vizinhos p0/p3), parâmetro `t∈[0,1]`. */
function catmullRom(p0: RoadVec3, p1: RoadVec3, p2: RoadVec3, p3: RoadVec3, t: number): RoadSample {
  const t2 = t * t;
  const t3 = t2 * t;
  const pos: RoadVec3 = [0, 0, 0];
  const tan: RoadVec3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const a = p0[i]!;
    const b = p1[i]!;
    const c = p2[i]!;
    const d = p3[i]!;
    pos[i] = CATMULL_TENSION * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    tan[i] = CATMULL_TENSION * (-a + c + 2 * (2 * a - 5 * b + 4 * c - d) * t + 3 * (-a + 3 * b - 3 * c + d) * t2);
  }
  return { pos, tangent: norm(tan) };
}

/**
 * Subdivisões **adaptativas** de um segmento: o maior entre "uma a cada ~3 m" (reta
 * longa segue o terreno) e "`curveDensity` por 90° de dobra" (curva fechada não faceta).
 */
function segmentSteps(p0: RoadVec3, p1: RoadVec3, p2: RoadVec3, p3: RoadVec3, curveDensity: number): number {
  const segLen = Math.hypot(...sub(p2, p1));
  const bend = Math.acos(Math.max(-1, Math.min(1, dot(norm(sub(p2, p0)), norm(sub(p3, p1))))));
  const byLen = Math.ceil(segLen / METERS_PER_STRAIGHT_SAMPLE);
  const byCurve = Math.ceil((bend / QUARTER_TURN) * curveDensity);
  return Math.max(MIN_SEGMENT_STEPS, Math.min(MAX_SEGMENT_STEPS, Math.max(byLen, byCurve)));
}

/**
 * Amostra a spline que passa pelos `points` (≥2) com **tessellation adaptativa**
 * (`curveDensity` amostras por 90° de curva). Pontas presas no primeiro/último ponto.
 *
 * @returns amostras do início ao fim (inclui os dois extremos). Com <2 pontos devolve
 * os pontos como vieram (tangente +Z).
 * @example
 * const s = sampleSpline([[0, 0, 0], [0, 0, 30], [20, 0, 60]])
 * s[0].pos // [0, 0, 0]
 */
export function sampleSpline(points: readonly RoadVec3[], curveDensity = ROAD_DEFAULT_CURVE_DENSITY): RoadSample[] {
  if (points.length < 2) return points.map((p) => ({ pos: [p[0], p[1], p[2]], tangent: [0, 0, 1] }));
  const out: RoadSample[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? points[i + 1]!;
    const steps = segmentSteps(p0, p1, p2, p3, curveDensity);
    // t=0 só no 1º segmento; os seguintes começam em 1/steps (não duplica o ponto).
    for (let k = i === 0 ? 0 : 1; k <= steps; k++) {
      const sample = catmullRom(p0, p1, p2, p3, k / steps);
      sample.t = i + k / steps;
      out.push(sample);
    }
  }
  return out;
}

/** Comprimento aproximado da spline (soma das distâncias entre amostras), em metros. */
export function splineLength(samples: readonly RoadSample[]): number {
  let len = 0;
  for (let i = 1; i < samples.length; i++) len += Math.hypot(...sub(samples[i]!.pos, samples[i - 1]!.pos));
  return len;
}
