// Desenho de bitmap transformado (SPEC-0313): drawImage e a máscara do texto.
// Para cada pixel de dispositivo dentro do retângulo de destino, volta pro
// bitmap pela inversa e amostra (bilinear em alfa pré-multiplicado, ou
// vizinho mais próximo). Em modo máscara, só o alfa do bitmap conta e a cor
// vem da tinta (fillStyle).
import { invert } from './matrix.js';
import { blendColorRow, colorRow } from './composite.js';

const MAX_BYTE = 255;
const INV_BYTE = 1 / MAX_BYTE;
const PIXEL_CENTER = 0.5;

/** Caixa de dispositivo (inteira, presa ao alvo) do retângulo fonte transformado. */
function deviceBounds(m, r, width, height) {
  const xs = [];
  const ys = [];
  for (const [u, v] of [[r.sx, r.sy], [r.sx + r.sw, r.sy], [r.sx, r.sy + r.sh], [r.sx + r.sw, r.sy + r.sh]]) {
    xs.push(m[0] * u + m[2] * v + m[4]);
    ys.push(m[1] * u + m[3] * v + m[5]);
  }
  return {
    x0: Math.max(0, Math.floor(Math.min(...xs))),
    y0: Math.max(0, Math.floor(Math.min(...ys))),
    x1: Math.min(width, Math.ceil(Math.max(...xs))),
    y1: Math.min(height, Math.ceil(Math.max(...ys))),
  };
}

function sampleNearest(src, u, v, lim, out, j) {
  let x = Math.floor(u);
  let y = Math.floor(v);
  if (x < lim.x0) x = lim.x0; else if (x > lim.x1) x = lim.x1;
  if (y < lim.y0) y = lim.y0; else if (y > lim.y1) y = lim.y1;
  const i = (y * src.width + x) * 4;
  const d = src.data;
  out[j] = d[i];
  out[j + 1] = d[i + 1];
  out[j + 2] = d[i + 2];
  out[j + 3] = d[i + 3];
}

/** Bilinear em alfa pré-multiplicado (sem franja escura nas bordas transparentes). */
function sampleBilinear(src, u, v, lim, out, j) {
  const fx = u - PIXEL_CENTER;
  const fy = v - PIXEL_CENTER;
  let xa = Math.floor(fx);
  let ya = Math.floor(fy);
  const tx = fx - xa;
  const ty = fy - ya;
  let xb = xa + 1;
  let yb = ya + 1;
  if (xa < lim.x0) xa = lim.x0; else if (xa > lim.x1) xa = lim.x1;
  if (xb < lim.x0) xb = lim.x0; else if (xb > lim.x1) xb = lim.x1;
  if (ya < lim.y0) ya = lim.y0; else if (ya > lim.y1) ya = lim.y1;
  if (yb < lim.y0) yb = lim.y0; else if (yb > lim.y1) yb = lim.y1;
  const d = src.data;
  const w = src.width;
  const i00 = (ya * w + xa) * 4;
  const i10 = (ya * w + xb) * 4;
  const i01 = (yb * w + xa) * 4;
  const i11 = (yb * w + xb) * 4;
  const w00 = (1 - tx) * (1 - ty) * d[i00 + 3];
  const w10 = tx * (1 - ty) * d[i10 + 3];
  const w01 = (1 - tx) * ty * d[i01 + 3];
  const w11 = tx * ty * d[i11 + 3];
  const a = w00 + w10 + w01 + w11;
  out[j + 3] = a;
  if (a <= 0) return;
  const inv = 1 / a;
  out[j] = (d[i00] * w00 + d[i10] * w10 + d[i01] * w01 + d[i11] * w11) * inv;
  out[j + 1] = (d[i00 + 1] * w00 + d[i10 + 1] * w10 + d[i01 + 1] * w01 + d[i11 + 1] * w11) * inv;
  out[j + 2] = (d[i00 + 2] * w00 + d[i10 + 2] * w10 + d[i01 + 2] * w01 + d[i11 + 2] * w11) * inv;
}

/** Aplica a tinta (cor/gradiente) sobre o alfa da máscara amostrada. */
function tintRow(paint, y, x0, x1, colors, tintColors) {
  if (paint.solid) {
    const [r, g, b, a] = paint.solid;
    for (let x = x0; x < x1; x++) {
      const j = x * 4;
      colors[j] = r;
      colors[j + 1] = g;
      colors[j + 2] = b;
      colors[j + 3] = colors[j + 3] * a * INV_BYTE;
    }
    return;
  }
  paint.shadeRow(y, x0, x1, tintColors);
  for (let x = x0; x < x1; x++) {
    const j = x * 4;
    colors[j] = tintColors[j];
    colors[j + 1] = tintColors[j + 1];
    colors[j + 2] = tintColors[j + 2];
    colors[j + 3] = colors[j + 3] * tintColors[j + 3] * INV_BYTE;
  }
}

let tintScratch = new Uint8ClampedArray(0);

/**
 * Desenha `src` ({ data, width, height }, RGBA reto) no alvo.
 * opts = { rect: {sx,sy,sw,sh} (px da fonte), matrix (px da fonte → dispositivo),
 *          smooth, alpha, clip, tint (tinta → modo máscara) }
 */
export function drawBitmap(surface, src, opts) {
  const { rect, matrix, smooth, alpha, clip, tint } = opts;
  const inv = invert(matrix);
  if (!inv || !(rect.sw > 0 && rect.sh > 0)) return;
  const b = deviceBounds(matrix, rect, surface.width, surface.height);
  const lim = {
    x0: Math.max(0, Math.floor(rect.sx)),
    y0: Math.max(0, Math.floor(rect.sy)),
    x1: Math.min(src.width, Math.ceil(rect.sx + rect.sw)) - 1,
    y1: Math.min(src.height, Math.ceil(rect.sy + rect.sh)) - 1,
  };
  const uMax = rect.sx + rect.sw;
  const vMax = rect.sy + rect.sh;
  const sample = smooth ? sampleBilinear : sampleNearest;
  const colors = colorRow(surface.width);
  if (tint && !tint.solid && tintScratch.length < surface.width * 4) tintScratch = new Uint8ClampedArray(surface.width * 4);
  for (let y = b.y0; y < b.y1; y++) {
    const py = y + PIXEL_CENTER;
    let u = inv[0] * (b.x0 + PIXEL_CENTER) + inv[2] * py + inv[4];
    let v = inv[1] * (b.x0 + PIXEL_CENTER) + inv[3] * py + inv[5];
    for (let x = b.x0; x < b.x1; x++, u += inv[0], v += inv[1]) {
      const j = x * 4;
      if (u < rect.sx || u >= uMax || v < rect.sy || v >= vMax) colors[j + 3] = 0;
      else sample(src, u, v, lim, colors, j);
    }
    if (tint) tintRow(tint, y, b.x0, b.x1, colors, tintScratch);
    blendColorRow(surface, y, b.x0, b.x1, colors, null, alpha, clip);
  }
}
