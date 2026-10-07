// Caminho do canvas 2D (SPEC-0313). Como no browser, cada ponto é
// transformado pela matriz corrente NO MOMENTO da chamada; curvas viram
// polilinha já em pixels de dispositivo. Subcaminho = { pts: [x0,y0,x1,y1…], closed }.

/** Erro máximo (px de dispositivo) entre a curva e a polilinha. */
const FLATTEN_TOLERANCE = 0.1;
const MIN_ARC_SEGMENTS = 4;
const MAX_ARC_SEGMENTS = 512;
const MIN_CURVE_SEGMENTS = 2;
const MAX_CURVE_SEGMENTS = 128;
const TAU = Math.PI * 2;

/** Segmentos pra um arco de raio `radiusPx` e varredura `sweep` dentro da tolerância. */
export function arcSegments(radiusPx, sweep) {
  if (!(radiusPx > FLATTEN_TOLERANCE)) return MIN_ARC_SEGMENTS;
  const step = 2 * Math.acos(1 - FLATTEN_TOLERANCE / radiusPx);
  const n = Math.ceil(Math.abs(sweep) / step);
  return Math.max(MIN_ARC_SEGMENTS, Math.min(MAX_ARC_SEGMENTS, n));
}

/** Varredura do arc()/ellipse() conforme a spec do canvas (com o caso do círculo inteiro). */
export function arcSweep(start, end, ccw) {
  if (!ccw) {
    if (end - start >= TAU) return TAU;
    return (((end - start) % TAU) + TAU) % TAU;
  }
  if (start - end >= TAU) return -TAU;
  return -((((start - end) % TAU) + TAU) % TAU);
}

/**
 * Fator do raio que dá ao polígono a MESMA área do círculo (√(passo/sen passo)).
 * Sem isso o polígono inscrito encolhe tudo ~⅔ da tolerância pra dentro.
 */
function chordAreaCompensation(step) {
  return step > 0 ? Math.sqrt(step / Math.sin(step)) : 1;
}

function curveSegments(lengthPx) {
  const n = Math.ceil(Math.sqrt(lengthPx / FLATTEN_TOLERANCE));
  return Math.max(MIN_CURVE_SEGMENTS, Math.min(MAX_CURVE_SEGMENTS, n));
}

export class Path {
  constructor() {
    this.subpaths = [];
    this.current = null;
  }

  reset() {
    this.subpaths = [];
    this.current = null;
  }

  hasCurrentPoint() {
    return this.current !== null && this.current.pts.length > 0;
  }

  lastPoint() {
    const pts = this.current.pts;
    return [pts[pts.length - 2], pts[pts.length - 1]];
  }

  moveToDevice(x, y) {
    this.current = { pts: [x, y], closed: false };
    this.subpaths.push(this.current);
  }

  lineToDevice(x, y) {
    if (!this.hasCurrentPoint()) {
      this.moveToDevice(x, y);
      return;
    }
    this.current.pts.push(x, y);
  }

  moveTo(m, x, y) {
    this.moveToDevice(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]);
  }

  lineTo(m, x, y) {
    this.lineToDevice(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]);
  }

  closePath() {
    if (!this.hasCurrentPoint()) return;
    this.current.closed = true;
    const [x, y] = [this.current.pts[0], this.current.pts[1]];
    this.moveToDevice(x, y);
  }

  rect(m, x, y, w, h) {
    this.moveTo(m, x, y);
    this.lineTo(m, x + w, y);
    this.lineTo(m, x + w, y + h);
    this.lineTo(m, x, y + h);
    this.closePath();
  }

  /** ellipse() completo; arc() é o caso rx = ry, rotação 0. */
  ellipse(m, cx, cy, rx, ry, rotation, start, end, ccw) {
    if (rx < 0 || ry < 0) throw new RangeError('IndexSizeError: raio negativo');
    const sweep = arcSweep(start, end, ccw);
    const scaleDev = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    const n = arcSegments(Math.max(rx, ry) * scaleDev, sweep);
    const k = chordAreaCompensation(Math.abs(sweep) / n);
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);
    for (let i = 0; i <= n; i++) {
      const t = start + (sweep * i) / n;
      const ex = rx * k * Math.cos(t);
      const ey = ry * k * Math.sin(t);
      this.lineTo(m, cx + ex * cosR - ey * sinR, cy + ex * sinR + ey * cosR);
    }
  }

  quadraticCurveTo(m, cpx, cpy, x, y) {
    if (!this.hasCurrentPoint()) this.moveTo(m, cpx, cpy);
    const [x0, y0] = this.lastPoint();
    const x1 = m[0] * cpx + m[2] * cpy + m[4];
    const y1 = m[1] * cpx + m[3] * cpy + m[5];
    const x2 = m[0] * x + m[2] * y + m[4];
    const y2 = m[1] * x + m[3] * y + m[5];
    const n = curveSegments(Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      this.lineToDevice(u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2);
    }
  }

  bezierCurveTo(m, c1x, c1y, c2x, c2y, x, y) {
    if (!this.hasCurrentPoint()) this.moveTo(m, c1x, c1y);
    const [x0, y0] = this.lastPoint();
    const x1 = m[0] * c1x + m[2] * c1y + m[4];
    const y1 = m[1] * c1x + m[3] * c1y + m[5];
    const x2 = m[0] * c2x + m[2] * c2y + m[4];
    const y2 = m[1] * c2x + m[3] * c2y + m[5];
    const x3 = m[0] * x + m[2] * y + m[4];
    const y3 = m[1] * x + m[3] * y + m[5];
    const n = curveSegments(
      Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2),
    );
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const d = t * t * t;
      this.lineToDevice(a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3);
    }
  }
}
