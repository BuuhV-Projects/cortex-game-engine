/**
 * Progresso ao longo de uma rota fechada (ADR-0256).
 *
 * Porta do `raceMath` + `routeIndex` do kart-racer: projeção na rota, portais
 * de volta, distância e separação ao longo do circuito, amostragem e curvatura.
 * Tudo puro — nada aqui sabe o que é um carro, uma volta ou uma corrida; o jogo
 * decide as regras e usa isto para medir.
 *
 * Serve a qualquer percurso fechado: circuito de corrida, rota de patrulha,
 * trilho de câmera. A rota é uma lista de pontos no sentido de percurso; o
 * último liga de volta ao primeiro.
 *
 * Distâncias ao longo da rota são medidas no plano XZ; projeções e o ponto
 * mais próximo usam 3D (a rota pode passar por baixo de si mesma num viaduto).
 */

/** Ponto de rota. */
export interface RoutePoint {
  x: number;
  y: number;
  z: number;
}

/**
 * Portal de passagem (linha de chegada, checkpoint): um ponto da rota, a normal
 * horizontal no sentido de percurso e a meia-largura da pista.
 */
export interface RouteGate extends RoutePoint {
  nx: number;
  nz: number;
  halfWidth: number;
}

/** Posição contínua na rota: segmento `index` → `index + 1`, a `offset` metros do início dele. */
export interface RoutePosition {
  index: number;
  offset: number;
}

/**
 * Índice de uma rota: comprimento de cada segmento e distância acumulada até
 * cada ponto. Transforma "onde fica o ponto a N metros daqui?" de uma marcha
 * pela rota numa busca binária — no kart-racer (384 pontos) a IA fazia essa
 * pergunta dezenas de vezes por carro por frame.
 */
export interface RouteIndex {
  /**
   * `cumulative[i]` = distância do ponto 0 até o ponto `i`, no plano XZ. Tem
   * `route.length + 1` entradas: a última é o perímetro, o que deixa a busca
   * binária sem caso especial no segmento que fecha a rota.
   */
  readonly cumulative: Float64Array;
  /** `segments[i]` = comprimento do segmento `i` → `i + 1` (o último fecha). */
  readonly segments: Float64Array;
  /** Perímetro da rota fechada, em metros. */
  readonly length: number;
}

/**
 * Meia-janela da busca local de {@link nearestRoutePoint}, em pontos. Com
 * segmentos de ~1,7 m cobre ~20 m para cada lado — dezenas de vezes o que um
 * corpo anda num frame.
 */
const NEAREST_WINDOW = 12;
/**
 * Maior avanço entre duas amostras que ainda conta como passar pelo portal (m).
 * Acima disso é teleporte ou respawn, e não pode valer volta.
 */
const MAX_GATE_STEP_M = 12;
/** Diferença de altura máxima para o cruzamento valer (m) — viaduto por cima não conta. */
const GATE_HEIGHT_TOLERANCE_M = 2;
/** Meia-distância das amostras que definem a direção em {@link routeFrame} (m). */
const FRAME_SAMPLE_M = 1;
/** Menor vão aceito entre as amostras de {@link routeFrame} (m). */
const MIN_FRAME_SPAN_M = 0.001;
/** Perímetro abaixo do qual a rota é degenerada para {@link routeSeparation} (m). */
const MIN_ROUTE_LENGTH_M = 0.001;
/** Denominador mínimo de {@link routeCurvature}: pontos coincidentes = reta. */
const MIN_CURVATURE_DENOMINATOR = 1e-6;

const indices = new WeakMap<readonly RoutePoint[], RouteIndex>();

function buildIndex(route: readonly RoutePoint[]): RouteIndex {
  const segments = new Float64Array(route.length);
  const cumulative = new Float64Array(route.length + 1);
  let total = 0;
  for (let i = 0; i < route.length; i++) {
    const a = route[i]!;
    const b = route[(i + 1) % route.length]!;
    cumulative[i] = total;
    const segment = Math.hypot(b.x - a.x, b.z - a.z);
    segments[i] = segment;
    total += segment;
  }
  cumulative[route.length] = total;
  return { cumulative, segments, length: total };
}

/**
 * Índice da rota, calculado na primeira chamada e guardado num `WeakMap` com a
 * própria rota como chave.
 *
 * ⚠️ A rota é tratada como **imutável**: mudar os pontos depois da primeira
 * consulta deixa o índice velho. Para uma rota nova, passe um array novo.
 */
export function routeIndexOf(route: readonly RoutePoint[]): RouteIndex {
  let index = indices.get(route);
  if (!index) {
    index = buildIndex(route);
    indices.set(route, index);
  }
  return index;
}

/**
 * Segmento que contém a distância `target` (medida do ponto 0, já em
 * `[0, length)`): o último ponto cuja distância acumulada não passa do alvo.
 * Pontos repetidos (segmento de comprimento zero) nunca são escolhidos.
 */
export function segmentAt(index: RouteIndex, target: number): number {
  const { cumulative } = index;
  let low = 0;
  let high = cumulative.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (cumulative[middle]! <= target) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}

/** Distância `d` trazida para `[0, length)` num circuito fechado. */
export function wrapDistance(length: number, d: number): number {
  if (!(length > 0)) return 0;
  const wrapped = d % length;
  return wrapped < 0 ? wrapped + length : wrapped;
}

/**
 * Cruzou o portal de `from` para `to`, no sentido de percurso, dentro da largura
 * e da altura da pista? Varrido (não perde a passagem entre frames) e só para a
 * frente (voltar de ré pela linha não conta).
 *
 * @example
 * if (crossesGate(previousPosition, carPosition, finishLine)) lap++;
 */
export function crossesGate(from: RoutePoint, to: RoutePoint, gate: RouteGate): boolean {
  const before = (from.x - gate.x) * gate.nx + (from.z - gate.z) * gate.nz;
  const after = (to.x - gate.x) * gate.nx + (to.z - gate.z) * gate.nz;
  if (before >= 0 || after < 0 || after - before > MAX_GATE_STEP_M) return false;
  const t = -before / (after - before);
  const x = from.x + (to.x - from.x) * t - gate.x;
  const z = from.z + (to.z - from.z) * t - gate.z;
  const y = from.y + (to.y - from.y) * t;
  return Math.abs(x * gate.nz - z * gate.nx) <= gate.halfWidth && Math.abs(y - gate.y) < GATE_HEIGHT_TOLERANCE_M;
}

/**
 * Índice do ponto de rota mais próximo (3D).
 *
 * Com `seed` (o resultado da consulta anterior do MESMO corpo) varre só uma
 * janela em torno dele. Se o melhor da janela cair na borda, a semente ficou
 * velha (respawn, teleporte) e a varredura completa é feita.
 */
export function nearestRoutePoint(position: RoutePoint, route: readonly RoutePoint[], seed = -1): number {
  const count = route.length;
  if (seed >= 0 && count > NEAREST_WINDOW * 2 + 1) {
    let best = Infinity;
    let offset = 0;
    for (let step = -NEAREST_WINDOW; step <= NEAREST_WINDOW; step++) {
      const p = route[(seed + step + count) % count]!;
      const distance = (p.x - position.x) ** 2 + (p.z - position.z) ** 2 + (p.y - position.y) ** 2;
      if (distance < best) {
        best = distance;
        offset = step;
      }
    }
    if (Math.abs(offset) < NEAREST_WINDOW) return (seed + offset + count) % count;
  }
  let best = Infinity;
  let index = 0;
  for (let i = 0; i < count; i++) {
    const p = route[i]!;
    const distance = (p.x - position.x) ** 2 + (p.z - position.z) ** 2 + (p.y - position.y) ** 2;
    if (distance < best) {
      best = distance;
      index = i;
    }
  }
  return index;
}

/**
 * Fração `[0, 1]` percorrida do setor `start` → `end`, projetando só nos
 * segmentos DO setor — uma curva vizinha da pista não pode dar progresso.
 */
export function sectorProgress(position: RoutePoint, route: readonly RoutePoint[], start: number, end: number): number {
  let best = Infinity;
  let travelled = 0;
  let projected = 0;
  for (let i = start, visited = 0; i !== end && visited < route.length; visited++) {
    const next = (i + 1) % route.length;
    const a = route[i]!;
    const b = route[next]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const lengthSquared = dx * dx + dy * dy + dz * dz;
    const length = Math.sqrt(lengthSquared);
    const t =
      lengthSquared > 0
        ? Math.max(0, Math.min(1, ((position.x - a.x) * dx + (position.y - a.y) * dy + (position.z - a.z) * dz) / lengthSquared))
        : 0;
    const distance = (position.x - a.x - t * dx) ** 2 + (position.y - a.y - t * dy) ** 2 + (position.z - a.z - t * dz) ** 2;
    if (distance < best) {
      best = distance;
      projected = travelled + t * length;
    }
    travelled += length;
    i = next;
  }
  return travelled > 0 ? projected / travelled : 0;
}

/**
 * Projeta `position` num dos dois segmentos que tocam o ponto `nearest` (ver
 * {@link nearestRoutePoint}). O `offset` é horizontal, compatível com
 * {@link sampleRoute} e {@link routeSeparation}.
 */
export function projectOnRoute(position: RoutePoint, route: readonly RoutePoint[], nearest: number): RoutePosition {
  let best = Infinity;
  let index = nearest;
  let offset = 0;
  const previous = (nearest + route.length - 1) % route.length;
  for (let k = 0; k < 2; k++) {
    const start = k === 0 ? previous : nearest;
    const a = route[start]!;
    const b = route[(start + 1) % route.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const lengthSquared = dx * dx + dy * dy + dz * dz;
    const t =
      lengthSquared > 0
        ? Math.max(0, Math.min(1, ((position.x - a.x) * dx + (position.y - a.y) * dy + (position.z - a.z) * dz) / lengthSquared))
        : 0;
    const distance = (position.x - a.x - dx * t) ** 2 + (position.y - a.y - dy * t) ** 2 + (position.z - a.z - dz * t) ** 2;
    if (distance < best) {
      best = distance;
      index = start;
      offset = Math.hypot(dx, dz) * t;
    }
  }
  return { index, offset };
}

/**
 * Ponto a `distance` metros (pode ser negativo) do ponto `index`, ao longo da
 * rota, dando a volta no circuito.
 *
 * @param out recicla o ponto devolvido — passe um buffer ao amostrar em laço.
 */
export function sampleRoute(route: readonly RoutePoint[], index: number, distance: number, out?: RoutePoint): RoutePoint {
  const table = routeIndexOf(route);
  const point = out ?? { x: 0, y: 0, z: 0 };
  if (!(table.length > 0)) {
    const only = route[index]!;
    point.x = only.x;
    point.y = only.y;
    point.z = only.z;
    return point;
  }
  const target = wrapDistance(table.length, table.cumulative[index]! + distance);
  const segment = segmentAt(table, target);
  const span = table.segments[segment]!;
  const a = route[segment]!;
  const b = route[(segment + 1) % route.length]!;
  const t = span > 0 ? (target - table.cumulative[segment]!) / span : 0;
  point.x = a.x + (b.x - a.x) * t;
  point.y = a.y + (b.y - a.y) * t;
  point.z = a.z + (b.z - a.z) * t;
  return point;
}

/** Curvatura horizontal (1/raio, em 1/m) do círculo pelos três pontos. `0` = reta. */
export function routeCurvature(a: RoutePoint, b: RoutePoint, c: RoutePoint): number {
  const ab = Math.hypot(b.x - a.x, b.z - a.z);
  const bc = Math.hypot(c.x - b.x, c.z - b.z);
  const ac = Math.hypot(c.x - a.x, c.z - a.z);
  const denominator = ab * bc * ac;
  return denominator > MIN_CURVATURE_DENOMINATOR
    ? (2 * Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x))) / denominator
    : 0;
}

const frameBefore: RoutePoint = { x: 0, y: 0, z: 0 };
const frameAfter: RoutePoint = { x: 0, y: 0, z: 0 };

/**
 * Quadro local da pista a `distance` metros de `index`: o ponto e a direção
 * horizontal unitária `(dx, dz)` de percurso. A lateral é `(-dz, dx)`.
 *
 * @param out recicla o ponto devolvido.
 */
export function routeFrame(
  route: readonly RoutePoint[],
  index: number,
  distance: number,
  out?: RoutePoint,
): { point: RoutePoint; dx: number; dz: number } {
  const point = sampleRoute(route, index, distance, out);
  const before = sampleRoute(route, index, distance - FRAME_SAMPLE_M, frameBefore);
  const after = sampleRoute(route, index, distance + FRAME_SAMPLE_M, frameAfter);
  const length = Math.max(MIN_FRAME_SPAN_M, Math.hypot(after.x - before.x, after.z - before.z));
  return { point, dx: (after.x - before.x) / length, dz: (after.z - before.z) / length };
}

/**
 * Distância COM SINAL de `from` até `to` ao longo do circuito, pelo caminho
 * mais curto — atravessa a linha de chegada sem saltar um perímetro inteiro.
 * Positivo = `to` está à frente.
 *
 * @example
 * // Quem está na frente, e por quantos metros:
 * const gap = routeSeparation(route, me, rival);
 */
export function routeSeparation(route: readonly RoutePoint[], from: RoutePosition, to: RoutePosition): number {
  const table = routeIndexOf(route);
  const length = table.length;
  if (length < MIN_ROUTE_LENGTH_M) return 0;
  const distance = table.cumulative[to.index]! + to.offset - (table.cumulative[from.index]! + from.offset);
  return distance - Math.round(distance / length) * length;
}
