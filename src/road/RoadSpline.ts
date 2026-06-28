/**
 * **Spline de estrada** (Road Architect → Cortex, ADR-0072). Catmull-Rom pelos nós
 * de controle: amostra **posição + tangente** ao longo da curva pra a malha da pista
 * (ribbon) seguir suavemente. Puro (sem three/editor) — testável isolado.
 *
 * Catmull-Rom passa por TODOS os pontos de controle (diferente de Bézier), o que é o
 * comportamento esperado de uma estrada: os nós que você coloca são pontos da pista.
 */

/** `[x, y, z]`. */
export type Vec3 = [number, number, number];

/** Uma amostra da spline: posição no mundo + tangente (direção da pista, unitária). */
export interface RoadSample {
  pos: Vec3;
  tangent: Vec3;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * Catmull-Rom num segmento p1→p2 (com vizinhos p0/p3), no parâmetro `t∈[0,1]`.
 * Retorna posição e tangente (derivada, normalizada).
 */
function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): RoadSample {
  const t2 = t * t;
  const t3 = t2 * t;
  const pos: Vec3 = [0, 0, 0];
  const tan: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const a = p0[i]!,
      b = p1[i]!,
      c = p2[i]!,
      d = p3[i]!;
    // Catmull-Rom padrão (tensão 0.5).
    pos[i] = 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    tan[i] = 0.5 * ((-a + c) + 2 * (2 * a - 5 * b + 4 * c - d) * t + 3 * (-a + 3 * b - 3 * c + d) * t2);
  }
  return { pos, tangent: norm(tan) };
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Subdivisões **adaptativas** de um segmento: mais onde a curva dobra mais (pra não
 * ficar facetada/"tremida") e o suficiente pra acompanhar o terreno em trechos longos.
 * - `byLen`: ~1 amostra a cada 2 m (segue o relevo em retas longas).
 * - `byCurve`: `curveDensity` amostras por **90°** de curvatura no segmento.
 * Resultado: reta longa = poucas faces; curva fechada = muitas. Limitado a [2, 64].
 */
function segmentSteps(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, curveDensity: number): number {
  const segLen = Math.hypot(...(sub(p2, p1) as Vec3));
  const t1 = norm(sub(p2, p0)); // tangente ~ em p1
  const t2 = norm(sub(p3, p1)); // tangente ~ em p2
  const bend = Math.acos(Math.max(-1, Math.min(1, dot(t1, t2)))); // 0..π (quanto dobra)
  const byLen = Math.ceil(segLen / 3); // ~1 amostra/3m em reta (curvas ganham +pelo byCurve)
  const byCurve = Math.ceil((bend / (Math.PI / 2)) * curveDensity);
  return Math.max(2, Math.min(256, Math.max(byLen, byCurve)));
}

/**
 * Amostra a spline que passa pelos `nodes` (≥2) com **tessellation adaptativa**:
 * `curveDensity` = amostras por **90° de curvatura** (default 16) — curvas fechadas
 * ganham mais faces (sem facetar), retas usam poucas (1 a cada ~2 m, pra seguir o
 * terreno). Os extremos são duplicados (clamp) pra começar/terminar nos nós das pontas.
 *
 * @returns lista de {@link RoadSample} do início ao fim (inclui os dois extremos).
 */
export function sampleSpline(nodes: Vec3[], curveDensity = 16): RoadSample[] {
  if (nodes.length < 2) {
    // Degenerado: 0/1 nó — devolve o que dá (tangente +Z arbitrária).
    return nodes.map((p) => ({ pos: [p[0], p[1], p[2]] as Vec3, tangent: [0, 0, 1] as Vec3 }));
  }
  const out: RoadSample[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const p0 = nodes[i - 1] ?? nodes[i]!; // clamp nos extremos
    const p1 = nodes[i]!;
    const p2 = nodes[i + 1]!;
    const p3 = nodes[i + 2] ?? nodes[i + 1]!;
    const steps = segmentSteps(p0, p1, p2, p3, curveDensity);
    // Inclui t=0 do 1º segmento; nos seguintes começa em t=1/steps pra não duplicar o nó.
    const startK = i === 0 ? 0 : 1;
    for (let k = startK; k <= steps; k++) {
      out.push(catmullRom(p0, p1, p2, p3, k / steps));
    }
  }
  return out;
}

/** Comprimento aproximado da spline (soma das distâncias entre amostras). */
export function splineLength(samples: RoadSample[]): number {
  let len = 0;
  for (let i = 1; i < samples.length; i++) len += Math.hypot(...(sub(samples[i]!.pos, samples[i - 1]!.pos) as Vec3));
  return len;
}
