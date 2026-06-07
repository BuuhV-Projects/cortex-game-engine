import type { ColliderShape2D } from '../components/Collider2DComponent.js';

/** Vetor de separação mínima (MTV): normal unitária (de B pra A) + profundidade. */
export interface Separation {
  nx: number;
  ny: number;
  depth: number;
}

/** Forma normalizada pra colisão (o centro já é `Transform + offset`). */
export interface Shape2D {
  kind: ColliderShape2D;
  /** halfWidth — também o **raio** em circle/capsule. */
  hw: number;
  /** halfHeight. */
  hh: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Ponto mais próximo de (px,py) no segmento (x0,y0)–(x1,y1). */
function closestOnSegment(
  px: number, py: number, x0: number, y0: number, x1: number, y1: number,
): [number, number] {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return [x0, y0];
  const t = clamp(((px - x0) * dx + (py - y0) * dy) / len2, 0, 1);
  return [x0 + dx * t, y0 + dy * t];
}

/** Endpoints do "miolo" (segmento) de uma cápsula vertical (raio hw, meia-altura hh). */
function capsuleSegment(cx: number, cy: number, hw: number, hh: number): [number, number, number, number] {
  const segHalf = Math.max(hh - hw, 0);
  return [cx, cy - segHalf, cx, cy + segHalf];
}

/** Disco (cx,cy,r) vs AABB: MTV pra tirar o disco da caixa (normal box→disco). */
function discVsBox(
  cx: number, cy: number, r: number, bx: number, by: number, bhw: number, bhh: number,
): Separation | null {
  const qx = clamp(cx, bx - bhw, bx + bhw);
  const qy = clamp(cy, by - bhh, by + bhh);
  const dx = cx - qx;
  const dy = cy - qy;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r) return null;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    return { nx: dx / d, ny: dy / d, depth: r - d };
  }
  // Centro do disco DENTRO da caixa → empurra pela face mais próxima.
  const ox = bhw - Math.abs(cx - bx);
  const oy = bhh - Math.abs(cy - by);
  if (ox < oy) return { nx: cx < bx ? -1 : 1, ny: 0, depth: ox + r };
  return { nx: 0, ny: cy < by ? -1 : 1, depth: oy + r };
}

/** Disco vs disco: MTV (normal B→A). */
function discVsDisc(
  ax: number, ay: number, ra: number, bx: number, by: number, rb: number,
): Separation | null {
  const dx = ax - bx;
  const dy = ay - by;
  const d2 = dx * dx + dy * dy;
  const sum = ra + rb;
  if (d2 > sum * sum) return null;
  const d = Math.sqrt(d2);
  if (d > 1e-10) return { nx: dx / d, ny: dy / d, depth: sum - d };
  return { nx: 0, ny: 1, depth: sum }; // concêntricos → empurra pra cima
}

/** AABB vs AABB: MTV por menor penetração (normal B→A). */
function boxVsBox(
  ax: number, ay: number, ahw: number, ahh: number, bx: number, by: number, bhw: number, bhh: number,
): Separation | null {
  const px = ahw + bhw - Math.abs(ax - bx);
  if (px <= 0) return null;
  const py = ahh + bhh - Math.abs(ay - by);
  if (py <= 0) return null;
  if (px < py) return { nx: ax < bx ? -1 : 1, ny: 0, depth: px };
  return { nx: 0, ny: ay < by ? -1 : 1, depth: py };
}

/** Reduz circle/capsule ao disco mais próximo de um ponto de referência. */
function discAt(cx: number, cy: number, s: Shape2D, refX: number, refY: number): { x: number; y: number; r: number } {
  if (s.kind === 'capsule') {
    const [x0, y0, x1, y1] = capsuleSegment(cx, cy, s.hw, s.hh);
    const [qx, qy] = closestOnSegment(refX, refY, x0, y0, x1, y1);
    return { x: qx, y: qy, r: s.hw };
  }
  return { x: cx, y: cy, r: s.hw }; // circle
}

/**
 * Separação mínima (MTV) entre A e B no plano XY — **normal aponta de B pra A**,
 * `depth > 0`. `null` = sem sobreposição. Cobre box, circle e capsule em qualquer
 * combinação (capsule = disco varrido num segmento vertical → reduzido ao disco
 * mais próximo do outro shape). Usado pelo {@link PlatformerPhysicsSystem} pra
 * resolver colisão com formas não-box.
 */
export function penetrate(
  ax: number, ay: number, a: Shape2D, bx: number, by: number, b: Shape2D,
): Separation | null {
  const aBox = a.kind === 'box';
  const bBox = b.kind === 'box';
  if (aBox && bBox) return boxVsBox(ax, ay, a.hw, a.hh, bx, by, b.hw, b.hh);
  if (aBox && !bBox) {
    const db = discAt(bx, by, b, ax, ay);
    const s = discVsBox(db.x, db.y, db.r, ax, ay, a.hw, a.hh); // normal A→B
    return s ? { nx: -s.nx, ny: -s.ny, depth: s.depth } : null;
  }
  if (!aBox && bBox) {
    const da = discAt(ax, ay, a, bx, by);
    return discVsBox(da.x, da.y, da.r, bx, by, b.hw, b.hh); // normal B→A ✓
  }
  // Ambos redondos: reduz cada um ao disco mais próximo do centro do outro
  // (1 refino melhora capsule–capsule).
  const dbApprox = discAt(bx, by, b, ax, ay);
  const da = discAt(ax, ay, a, dbApprox.x, dbApprox.y);
  const db = discAt(bx, by, b, da.x, da.y);
  return discVsDisc(da.x, da.y, da.r, db.x, db.y, db.r);
}
