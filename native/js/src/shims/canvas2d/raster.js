// Cobertura de polígonos por sub-scanline (SPEC-0313). Entrada: subcaminhos
// em pixels de dispositivo (fechados implicitamente). Saída: por linha de
// pixel, `emitRow(y, x0, x1, cov)` com cov[x] ∈ [0,1] em x0 ≤ x < x1.
//
// Antialias: SUBROWS sub-linhas verticais por pixel; na horizontal a
// cobertura de cada span é EXATA (fração do pixel nas pontas), acumulada por
// diferença — custo O(arestas + largura) por linha, sem laço por sub-pixel.

const SUBROWS = 4;
const SUB_WEIGHT = 1 / SUBROWS;

/** Arestas não horizontais, normalizadas com y0 < y1 e ordenadas por y0. */
function buildEdges(subpaths) {
  const edges = [];
  for (const sp of subpaths) {
    const p = sp.pts;
    const n = p.length >> 1;
    if (n < 2) continue;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      addEdge(edges, p[2 * i], p[2 * i + 1], p[2 * j], p[2 * j + 1]);
    }
  }
  edges.sort((a, b) => a.y0 - b.y0);
  return edges;
}

function addEdge(edges, xa, ya, xb, yb) {
  if (ya === yb || !isFinite(xa + ya + xb + yb)) return;
  const down = yb > ya;
  const x0 = down ? xa : xb;
  const y0 = down ? ya : yb;
  const y1 = down ? yb : ya;
  const x1 = down ? xb : xa;
  edges.push({ x0, y0, y1, slope: (x1 - x0) / (y1 - y0), dir: down ? 1 : -1 });
}

function isInside(winding, evenOdd) {
  return evenOdd ? (winding & 1) !== 0 : winding !== 0;
}

/** Scratch reaproveitado entre chamadas (cresce sob demanda). */
const scratch = { width: 0, cell: null, delta: null, cov: null, rowCov: null, xs: [], ws: [] };

function ensureScratch(width) {
  if (scratch.width >= width) return;
  scratch.width = width;
  scratch.cell = new Float32Array(width + 2);
  scratch.delta = new Float32Array(width + 2);
  scratch.cov = new Float32Array(width + 2);
  scratch.rowCov = new Float32Array(width + 2);
}

/** Soma o span [xa, xb) com peso de uma sub-linha. Devolve [minX, maxX] tocados. */
function accumulateSpan(xa, xb, width, bounds) {
  if (xa < 0) xa = 0;
  if (xb > width) xb = width;
  if (xb <= xa) return;
  const { cell, delta } = scratch;
  const ia = Math.floor(xa);
  const ib = Math.floor(xb);
  if (ia === ib) {
    cell[ia] += (xb - xa) * SUB_WEIGHT;
  } else {
    cell[ia] += (ia + 1 - xa) * SUB_WEIGHT;
    delta[ia + 1] += SUB_WEIGHT;
    delta[ib] -= SUB_WEIGHT;
    if (ib < width) cell[ib] += (xb - ib) * SUB_WEIGHT;
  }
  if (ia < bounds[0]) bounds[0] = ia;
  const last = ib < width ? ib : width - 1;
  if (last > bounds[1]) bounds[1] = last;
}

/** Cruzamentos da sub-linha `sy` com as arestas ativas, ordenados por x. */
function collectCrossings(active, sy) {
  const { xs, ws } = scratch;
  let count = 0;
  for (const e of active) {
    if (sy < e.y0 || sy >= e.y1) continue;
    const x = e.x0 + (sy - e.y0) * e.slope;
    let k = count++;
    while (k > 0 && xs[k - 1] > x) {
      xs[k] = xs[k - 1];
      ws[k] = ws[k - 1];
      k--;
    }
    xs[k] = x;
    ws[k] = e.dir;
  }
  return count;
}

function scanSubrow(active, sy, evenOdd, width, bounds) {
  const count = collectCrossings(active, sy);
  const { xs, ws } = scratch;
  let winding = 0;
  for (let i = 0; i < count - 1; i++) {
    winding += ws[i];
    if (isInside(winding, evenOdd)) accumulateSpan(xs[i], xs[i + 1], width, bounds);
  }
}

/** Resolve o acumulador da linha em cov[] e zera o scratch. */
function resolveRow(x0, x1) {
  const { cell, delta, cov } = scratch;
  let running = 0;
  for (let x = x0; x < x1; x++) {
    running += delta[x];
    const c = cell[x] + running;
    cov[x] = c > 1 ? 1 : c < 0 ? 0 : c;
    cell[x] = 0;
    delta[x] = 0;
  }
  delta[x1] = 0;
}

function updateActive(active, edges, next, y) {
  for (let i = active.length - 1; i >= 0; i--) {
    if (active[i].y1 <= y) active.splice(i, 1);
  }
  while (next.i < edges.length && edges[next.i].y0 < y + 1) active.push(edges[next.i++]);
}

/**
 * Rasteriza `subpaths` num alvo width×height chamando emitRow por linha com
 * cobertura. `evenOdd` escolhe a regra (default nonzero).
 */
export function rasterizePath(subpaths, evenOdd, width, height, emitRow) {
  const edges = buildEdges(subpaths);
  if (edges.length === 0) return;
  ensureScratch(width);
  let maxY = 0;
  for (const e of edges) if (e.y1 > maxY) maxY = e.y1;
  const yStart = Math.max(0, Math.floor(edges[0].y0));
  const yEnd = Math.min(height, Math.ceil(maxY));
  const active = [];
  const next = { i: 0 };
  const bounds = [0, 0];
  for (let y = yStart; y < yEnd; y++) {
    updateActive(active, edges, next, y);
    if (active.length === 0) continue;
    bounds[0] = width;
    bounds[1] = -1;
    for (let s = 0; s < SUBROWS; s++) scanSubrow(active, y + (s + 0.5) * SUB_WEIGHT, evenOdd, width, bounds);
    if (bounds[1] < bounds[0]) continue;
    const x1 = bounds[1] + 1;
    resolveRow(bounds[0], x1);
    emitRow(y, bounds[0], x1, scratch.cov);
  }
}

/**
 * Cobertura de retângulo alinhado [x0,x1)×[y0,y1) (px de dispositivo, fracionário)
 * — o caminho rápido do fillRect/clearRect. emitRow igual ao rasterizePath, com
 * `rowFull` = true quando a linha está inteira dentro (cobertura vertical 1).
 */
export function rasterizeRect(x0, y0, x1, y1, width, height, emitRow) {
  const cx0 = Math.max(0, x0);
  const cy0 = Math.max(0, y0);
  const cx1 = Math.min(width, x1);
  const cy1 = Math.min(height, y1);
  if (!(cx1 > cx0 && cy1 > cy0)) return;
  ensureScratch(width);
  const ix0 = Math.floor(cx0);
  const ix1 = Math.ceil(cx1);
  const { cov, rowCov } = scratch;
  for (let x = ix0; x < ix1; x++) cov[x] = Math.min(cx1, x + 1) - Math.max(cx0, x);
  for (let y = Math.floor(cy0); y < Math.ceil(cy1); y++) {
    const vy = Math.min(cy1, y + 1) - Math.max(cy0, y);
    if (vy >= 1) {
      emitRow(y, ix0, ix1, cov, true);
      continue;
    }
    for (let x = ix0; x < ix1; x++) rowCov[x] = cov[x] * vy;
    emitRow(y, ix0, ix1, rowCov, false);
  }
}
