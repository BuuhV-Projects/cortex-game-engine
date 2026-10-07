// Tintas do canvas 2D (SPEC-0313): CanvasGradient (linear e radial de dois
// círculos) e a resolução de fillStyle/strokeStyle numa "tinta" que o
// compositor entende:
//   { solid: [r, g, b, a255] }                      — cor única
//   { shadeRow(y, x0, x1, out) }                    — cor por pixel (RGBA em out[x*4])
// O gradiente vive no espaço de usuário da hora do fill/stroke: o pixel de
// dispositivo volta pro usuário pela inversa da matriz corrente.
import { parseColor } from './color.js';
import { invert } from './matrix.js';

const LUT_SIZE = 256;
const LUT_MAX = LUT_SIZE - 1;
const MAX_BYTE = 255;
const PIXEL_CENTER = 0.5;

export class CanvasGradient {
  constructor(kind, params) {
    this.kind = kind;
    this.params = params;
    this.stops = [];
    this.lut = null;
  }

  addColorStop(offset, color) {
    if (!(offset >= 0 && offset <= 1)) throw new RangeError('IndexSizeError: offset fora de [0, 1]');
    const rgba = parseColor(color);
    if (!rgba) throw new SyntaxError('SyntaxError: cor inválida em addColorStop: ' + color);
    this.stops.push({ offset, rgba });
    this.lut = null;
  }

  /** Tabela de 256 cores (RGBA reto) — cacheada até o próximo addColorStop. */
  colorTable() {
    if (this.lut) return this.lut;
    const lut = new Uint8ClampedArray(LUT_SIZE * 4);
    const stops = this.stops.slice().sort((a, b) => a.offset - b.offset);
    for (let i = 0; i < LUT_SIZE; i++) writeStopColor(lut, i * 4, stops, i / LUT_MAX);
    this.lut = lut;
    return lut;
  }
}

function writeStopColor(out, at, stops, t) {
  let hi = 0;
  while (hi < stops.length && stops[hi].offset <= t) hi++;
  const a = stops[Math.max(0, hi - 1)].rgba;
  const b = stops[Math.min(stops.length - 1, hi)].rgba;
  const lo = stops[Math.max(0, hi - 1)].offset;
  const span = stops[Math.min(stops.length - 1, hi)].offset - lo;
  const k = span > 0 ? Math.min(1, Math.max(0, (t - lo) / span)) : 0;
  out[at] = a[0] + (b[0] - a[0]) * k;
  out[at + 1] = a[1] + (b[1] - a[1]) * k;
  out[at + 2] = a[2] + (b[2] - a[2]) * k;
  out[at + 3] = (a[3] + (b[3] - a[3]) * k) * MAX_BYTE;
}

function copyLut(lut, t, out, at) {
  const i = (t <= 0 ? 0 : t >= 1 ? LUT_MAX : Math.round(t * LUT_MAX)) * 4;
  out[at] = lut[i];
  out[at + 1] = lut[i + 1];
  out[at + 2] = lut[i + 2];
  out[at + 3] = lut[i + 3];
}

function linearPaint(gradient, inv) {
  const [x0, y0, x1, y1] = gradient.params;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return null; // gradiente degenerado não pinta (spec)
  const lut = gradient.colorTable();
  // t(px, py) é afim no pixel de dispositivo: t = A·px + B·py + C
  const A = (inv[0] * dx + inv[1] * dy) / len2;
  const B = (inv[2] * dx + inv[3] * dy) / len2;
  const C = ((inv[4] - x0) * dx + (inv[5] - y0) * dy) / len2;
  return {
    shadeRow(y, xa, xb, out) {
      let t = A * (xa + PIXEL_CENTER) + B * (y + PIXEL_CENTER) + C;
      for (let x = xa; x < xb; x++, t += A) copyLut(lut, t, out, x * 4);
    },
  };
}

/** Maior t com r(t) ≥ 0 tal que o ponto está no círculo t (cônico de dois círculos). */
function radialT(px, py, c) {
  const pdx = px - c.x0;
  const pdy = py - c.y0;
  const b = pdx * c.cdx + pdy * c.cdy + c.r0 * c.dr;
  const cc = pdx * pdx + pdy * pdy - c.r0 * c.r0;
  if (c.a === 0) {
    if (b === 0) return NaN;
    const t = cc / (2 * b);
    return c.r0 + t * c.dr >= 0 ? t : NaN;
  }
  const disc = b * b - c.a * cc;
  if (disc < 0) return NaN;
  const root = Math.sqrt(disc);
  const tBig = (b + root) / c.a;
  const tSmall = (b - root) / c.a;
  const hi = Math.max(tBig, tSmall);
  const lo = Math.min(tBig, tSmall);
  if (c.r0 + hi * c.dr >= 0) return hi;
  return c.r0 + lo * c.dr >= 0 ? lo : NaN;
}

function radialPaint(gradient, inv) {
  const [x0, y0, r0, x1, y1, r1] = gradient.params;
  const lut = gradient.colorTable();
  const cdx = x1 - x0;
  const cdy = y1 - y0;
  const dr = r1 - r0;
  const circles = { x0, y0, r0, cdx, cdy, dr, a: cdx * cdx + cdy * cdy - dr * dr };
  return {
    shadeRow(y, xa, xb, out) {
      const py = y + PIXEL_CENTER;
      for (let x = xa; x < xb; x++) {
        const px = x + PIXEL_CENTER;
        const ux = inv[0] * px + inv[2] * py + inv[4];
        const uy = inv[1] * px + inv[3] * py + inv[5];
        const t = radialT(ux, uy, circles);
        if (t === t) copyLut(lut, t, out, x * 4);
        else out[x * 4 + 3] = 0; // fora do cone: transparente
      }
    },
  };
}

/**
 * fillStyle/strokeStyle (já validado: [r,g,b,a] ou CanvasGradient) → tinta,
 * ou null quando não há nada a pintar (gradiente sem paradas/degenerado).
 */
export function resolvePaint(style, matrix) {
  if (!(style instanceof CanvasGradient)) {
    return { solid: [style[0], style[1], style[2], Math.round(style[3] * MAX_BYTE)] };
  }
  if (style.stops.length === 0) return null;
  const inv = invert(matrix);
  if (!inv) return null;
  return style.kind === 'linear' ? linearPaint(style, inv) : radialPaint(style, inv);
}
