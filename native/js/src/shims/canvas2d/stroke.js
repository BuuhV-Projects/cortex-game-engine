// Traço → polígonos (SPEC-0313). Cada segmento vira um quadrilátero; junções
// (miter/round/bevel) e pontas (butt/round/square) viram polígonos extras.
// Todos com orientação POSITIVA: preenchidos juntos com nonzero, a sobreposição
// é união (nada se cancela). Entrada/saída em pixels de dispositivo.
import { arcSegments } from './path.js';

const TAU = Math.PI * 2;
/** Pontos repetidos (mais perto que isso) não formam segmento. */
const SAME_POINT_EPSILON = 1e-9;

function signedArea(pts) {
  let area = 0;
  const n = pts.length >> 1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[2 * i] * pts[2 * j + 1] - pts[2 * j] * pts[2 * i + 1];
  }
  return area;
}

function pushPositive(out, pts) {
  if (signedArea(pts) < 0) {
    const flipped = [];
    for (let i = pts.length - 2; i >= 0; i -= 2) flipped.push(pts[i], pts[i + 1]);
    out.push({ pts: flipped });
  } else {
    out.push({ pts });
  }
}

function pushCircle(out, x, y, r) {
  const n = arcSegments(r, TAU);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (TAU * i) / n;
    pts.push(x + r * Math.cos(t), y + r * Math.sin(t));
  }
  out.push({ pts });
}

/** Remove pontos consecutivos repetidos. */
function dedupe(src) {
  const pts = [src[0], src[1]];
  for (let i = 2; i < src.length; i += 2) {
    const dx = src[i] - pts[pts.length - 2];
    const dy = src[i + 1] - pts[pts.length - 1];
    if (dx * dx + dy * dy > SAME_POINT_EPSILON) pts.push(src[i], src[i + 1]);
  }
  return pts;
}

/** Normal unitária do segmento i (do ponto i ao i+1). */
function segmentNormal(pts, i) {
  const dx = pts[2 * i + 2] - pts[2 * i];
  const dy = pts[2 * i + 3] - pts[2 * i + 1];
  const len = Math.hypot(dx, dy);
  return [-dy / len, dx / len, dx / len, dy / len];
}

function pushSegment(out, pts, i, hw) {
  const [nx, ny] = segmentNormal(pts, i);
  const ax = pts[2 * i];
  const ay = pts[2 * i + 1];
  const bx = pts[2 * i + 2];
  const by = pts[2 * i + 3];
  pushPositive(out, [ax + nx * hw, ay + ny * hw, bx + nx * hw, by + ny * hw, bx - nx * hw, by - ny * hw, ax - nx * hw, ay - ny * hw]);
}

/** Junção no ponto compartilhado entre o segmento `a` (que chega) e `b` (que sai). */
function pushJoin(out, pts, a, b, style) {
  const [n1x, n1y, d1x, d1y] = segmentNormal(pts, a);
  const [n2x, n2y, d2x, d2y] = segmentNormal(pts, b);
  const qx = pts[2 * b];
  const qy = pts[2 * b + 1];
  const { hw, join, miterLimit } = style;
  if (join === 'round') {
    pushCircle(out, qx, qy, hw);
    return;
  }
  const cross = d1x * d2y - d1y * d2x;
  if (cross === 0) return; // colinear: os quadriláteros já se encostam
  const s = cross > 0 ? -1 : 1; // lado de fora da curva
  const ax = qx + s * n1x * hw;
  const ay = qy + s * n1y * hw;
  const bx = qx + s * n2x * hw;
  const by = qy + s * n2y * hw;
  const dot = n1x * n2x + n1y * n2y;
  const miterRatio = 1 / Math.sqrt(Math.max(1e-12, (1 + dot) / 2));
  if (join === 'miter' && miterRatio <= miterLimit) {
    const k = (s * hw) / (1 + dot);
    pushPositive(out, [qx, qy, ax, ay, qx + (n1x + n2x) * k, qy + (n1y + n2y) * k, bx, by]);
    return;
  }
  pushPositive(out, [qx, qy, ax, ay, bx, by]); // bevel
}

function pushCap(out, pts, atStart, style) {
  const { hw, cap } = style;
  if (cap === 'butt') return;
  const n = pts.length >> 1;
  const i = atStart ? 0 : n - 2;
  const [nx, ny, dx, dy] = segmentNormal(pts, i);
  const px = atStart ? pts[0] : pts[2 * n - 2];
  const py = atStart ? pts[1] : pts[2 * n - 1];
  if (cap === 'round') {
    pushCircle(out, px, py, hw);
    return;
  }
  const ox = (atStart ? -dx : dx) * hw;
  const oy = (atStart ? -dy : dy) * hw;
  pushPositive(out, [px + nx * hw, py + ny * hw, px + nx * hw + ox, py + ny * hw + oy, px - nx * hw + ox, py - ny * hw + oy, px - nx * hw, py - ny * hw]);
}

function strokePolyline(out, src, closed, style) {
  const pts = dedupe(src);
  if (closed && pts.length > 4) {
    const dx = pts[0] - pts[pts.length - 2];
    const dy = pts[1] - pts[pts.length - 1];
    if (dx * dx + dy * dy > SAME_POINT_EPSILON) pts.push(pts[0], pts[1]);
  }
  const segments = (pts.length >> 1) - 1;
  if (segments < 1) return; // ponta de comprimento zero: nada (ponytail: browser desenha pontas round/square)
  for (let i = 0; i < segments; i++) pushSegment(out, pts, i, style.hw);
  for (let i = 1; i < segments; i++) pushJoin(out, pts, i - 1, i, style);
  if (closed && segments > 1) {
    pushJoin(out, pts, segments - 1, 0, style);
    return;
  }
  pushCap(out, pts, true, style);
  pushCap(out, pts, false, style);
}

/** Corta a polilinha em traços (pattern já em px de dispositivo). */
function dashPieces(pts, closed, pattern, offset) {
  const src = closed ? pts.concat([pts[0], pts[1]]) : pts;
  const total = pattern.reduce((a, b) => a + b, 0);
  const pieces = [];
  let index = 0;
  let left = pattern[0];
  let skip = ((offset % total) + total) % total;
  while (skip >= left) {
    skip -= left;
    index = (index + 1) % pattern.length;
    left = pattern[index];
  }
  left -= skip;
  let current = index % 2 === 0 ? [src[0], src[1]] : null;
  for (let i = 0; i + 3 < src.length; i += 2) {
    let ax = src[i];
    let ay = src[i + 1];
    const bx = src[i + 2];
    const by = src[i + 3];
    let segLen = Math.hypot(bx - ax, by - ay);
    while (segLen > left) {
      const t = left / segLen;
      ax += (bx - ax) * t;
      ay += (by - ay) * t;
      segLen -= left;
      if (current) {
        current.push(ax, ay);
        pieces.push(current);
        current = null;
      } else {
        current = [ax, ay];
      }
      index = (index + 1) % pattern.length;
      left = pattern[index];
    }
    left -= segLen;
    if (current) current.push(bx, by);
  }
  if (current && current.length >= 4) pieces.push(current);
  return pieces;
}

/**
 * Subcaminhos → polígonos do traço. style = { hw (meia largura, px dispositivo),
 * cap, join, miterLimit, dash (px dispositivo, já com tamanho par), dashOffset }.
 */
export function strokeToPolygons(subpaths, style) {
  const out = [];
  const dashed = style.dash.length > 0 && style.dash.some((v) => v > 0);
  for (const sp of subpaths) {
    if (sp.pts.length < 4) continue;
    if (!dashed) {
      strokePolyline(out, sp.pts, sp.closed, style);
      continue;
    }
    for (const piece of dashPieces(sp.pts, sp.closed, style.dash, style.dashOffset)) {
      strokePolyline(out, piece, false, style);
    }
  }
  return out;
}
