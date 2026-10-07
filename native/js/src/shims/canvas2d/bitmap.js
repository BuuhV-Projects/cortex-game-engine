// Desenho de bitmap transformado (SPEC-0313): drawImage e a máscara do texto.
// Para cada pixel de dispositivo dentro do retângulo de destino, volta pro
// bitmap pela inversa e amostra (bilinear em alfa pré-multiplicado, ou
// vizinho mais próximo). Em modo máscara, só o alfa do bitmap conta e a cor
// vem da tinta (fillStyle).
import { invert } from './matrix.js';
import { blendColorRow, blendPixel, colorRow } from './composite.js';

const MAX_BYTE = 255;
const INV_BYTE = 1 / MAX_BYTE;
const PIXEL_CENTER = 0.5;
const TRANSLATION_EPSILON = 1e-6;

/** Escala 1 sem rotação (até erro de ponto flutuante). */
function isTranslation(m) {
  return Math.abs(m[0] - 1) < TRANSLATION_EPSILON && Math.abs(m[3] - 1) < TRANSLATION_EPSILON && m[1] === 0 && m[2] === 0;
}

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

const OPAQUE = 0xff;
const ALPHA_SHIFT = 24;
const CHANNEL = 0xff;
const SHIFT_G = 8;
const SHIFT_B = 16;
const ROUND = 0.5;

function packOpaque(r, g, b) {
  return ((OPAQUE << ALPHA_SHIFT) | (((b + ROUND) | 0) << SHIFT_B) | (((g + ROUND) | 0) << SHIFT_G) | ((r + ROUND) | 0)) >>> 0;
}

/**
 * Layout do `Float64Array` de parâmetros do blit — o MESMO que o
 * `__cortexBlitImage` do host lê (native/src/canvas2d/blit.h, ADR-0318):
 * caixa de destino, inversa (6), retângulo fonte, limites da amostra, alfa.
 */
export const BLIT_X0 = 0;
export const BLIT_Y0 = 1;
export const BLIT_X1 = 2;
export const BLIT_Y1 = 3;
export const BLIT_INV = 4;
/** Elementos da matriz afim (a, b, c, d, e, f). */
const AFFINE_ELEMENTS = 6;
export const BLIT_SX = 10;
export const BLIT_SY = 11;
export const BLIT_SW = 12;
export const BLIT_SH = 13;
export const BLIT_LX0 = 14;
export const BLIT_LY0 = 15;
export const BLIT_LX1 = 16;
export const BLIT_LY1 = 17;
export const BLIT_ALPHA = 18;
export const BLIT_PARAMS = 19;
const blitParams = new Float64Array(BLIT_PARAMS);

/**
 * Laço quente do drawImage sem tinta (radar/mapa redesenhados todo quadro no
 * host, ADR-0315): amostra e compõe NO MESMO laço, lendo/escrevendo uint32. Pixel
 * fora do clip nem é amostrado; vizinhança 100% opaca com cobertura 1 vira uma
 * escrita de uint32 (sem a divisão do alfa pré-multiplicado nem o blend). O resto
 * cai no amostrador genérico — mesmo resultado, só mais caro. No host o mesmo
 * laço roda em C++ (`__cortexBlitImage`, ADR-0318), pixel idêntico.
 */
export function blitImage(surface, src, p, clip, smooth) {
  const sd = src.data;
  const s32 = src.u32 || new Uint32Array(sd.buffer, sd.byteOffset, (sd.byteLength / 4) | 0);
  const sw = src.width;
  const d = surface.data;
  const d32 = surface.u32;
  const dw = surface.width;
  const b = { x0: p[BLIT_X0], y0: p[BLIT_Y0], x1: p[BLIT_X1], y1: p[BLIT_Y1] };
  const inv = [p[BLIT_INV], p[BLIT_INV + 1], p[BLIT_INV + 2], p[BLIT_INV + 3], p[BLIT_INV + 4], p[BLIT_INV + 5]];
  const rect = { sx: p[BLIT_SX], sy: p[BLIT_SY] };
  const lim = { x0: p[BLIT_LX0], y0: p[BLIT_LY0], x1: p[BLIT_LX1], y1: p[BLIT_LY1] };
  const alpha = p[BLIT_ALPHA];
  const uMax = rect.sx + p[BLIT_SW];
  const vMax = rect.sy + p[BLIT_SH];
  const one = [0, 0, 0, 0];
  for (let y = b.y0; y < b.y1; y++) {
    const py = y + PIXEL_CENTER;
    const base = y * dw;
    let u = inv[0] * (b.x0 + PIXEL_CENTER) + inv[2] * py + inv[4];
    let v = inv[1] * (b.x0 + PIXEL_CENTER) + inv[3] * py + inv[5];
    for (let x = b.x0; x < b.x1; x++, u += inv[0], v += inv[1]) {
      if (u < rect.sx || u >= uMax || v < rect.sy || v >= vMax) continue;
      let c = alpha;
      if (clip) {
        const m = clip[base + x];
        if (m === 0) continue;
        c *= m * INV_BYTE;
      }
      if (smooth) {
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
        const p00 = s32[ya * sw + xa];
        const p10 = s32[ya * sw + xb];
        const p01 = s32[yb * sw + xa];
        const p11 = s32[yb * sw + xb];
        if ((p00 & p10 & p01 & p11) >>> ALPHA_SHIFT === OPAQUE) {
          const w00 = (1 - tx) * (1 - ty);
          const w10 = tx * (1 - ty);
          const w01 = (1 - tx) * ty;
          const w11 = tx * ty;
          const r = (p00 & CHANNEL) * w00 + (p10 & CHANNEL) * w10 + (p01 & CHANNEL) * w01 + (p11 & CHANNEL) * w11;
          const g = ((p00 >>> SHIFT_G) & CHANNEL) * w00 + ((p10 >>> SHIFT_G) & CHANNEL) * w10 + ((p01 >>> SHIFT_G) & CHANNEL) * w01 + ((p11 >>> SHIFT_G) & CHANNEL) * w11;
          const bl = ((p00 >>> SHIFT_B) & CHANNEL) * w00 + ((p10 >>> SHIFT_B) & CHANNEL) * w10 + ((p01 >>> SHIFT_B) & CHANNEL) * w01 + ((p11 >>> SHIFT_B) & CHANNEL) * w11;
          if (c >= 1) d32[base + x] = packOpaque(r, g, bl);
          else blendPixel(d, (base + x) * 4, r, g, bl, c);
          continue;
        }
        sampleBilinear(src, u, v, lim, one, 0);
      } else {
        let sx = Math.floor(u);
        let sy = Math.floor(v);
        if (sx < lim.x0) sx = lim.x0; else if (sx > lim.x1) sx = lim.x1;
        if (sy < lim.y0) sy = lim.y0; else if (sy > lim.y1) sy = lim.y1;
        const p = s32[sy * sw + sx];
        const a = p >>> ALPHA_SHIFT;
        if (a === 0) continue; // transparente: nada a compor
        if (a === OPAQUE && c >= 1) {
          d32[base + x] = p;
          continue;
        }
        one[0] = p & CHANNEL;
        one[1] = (p >>> SHIFT_G) & CHANNEL;
        one[2] = (p >>> SHIFT_B) & CHANNEL;
        one[3] = a;
      }
      const sa = c * one[3] * INV_BYTE;
      if (sa > 0) blendPixel(d, (base + x) * 4, one[0], one[1], one[2], sa);
    }
  }
}

/**
 * Desenha `src` ({ data, width, height }, RGBA reto) no alvo.
 * opts = { rect: {sx,sy,sw,sh} (px da fonte), matrix (px da fonte → dispositivo),
 *          smooth, alpha, clip, tint (tinta → modo máscara) }
 */
export function drawBitmap(surface, src, opts) {
  const { rect, alpha, clip, tint } = opts;
  let { matrix, smooth } = opts;
  // Só translação (texto e cópias 1:1): alinha ao pixel e amostra sem bilinear —
  // mesmo resultado numa translação inteira, ~4× menos trabalho por pixel.
  if (isTranslation(matrix)) {
    matrix = [1, 0, 0, 1, Math.round(matrix[4]), Math.round(matrix[5])];
    smooth = false;
  }
  const inv = invert(matrix);
  if (!inv || !(rect.sw > 0 && rect.sh > 0)) return null;
  const b = deviceBounds(matrix, rect, surface.width, surface.height);
  const lim = {
    x0: Math.max(0, Math.floor(rect.sx)),
    y0: Math.max(0, Math.floor(rect.sy)),
    x1: Math.min(src.width, Math.ceil(rect.sx + rect.sw)) - 1,
    y1: Math.min(src.height, Math.ceil(rect.sy + rect.sh)) - 1,
  };
  if (!tint) {
    const p = blitParams;
    p[BLIT_X0] = b.x0;
    p[BLIT_Y0] = b.y0;
    p[BLIT_X1] = b.x1;
    p[BLIT_Y1] = b.y1;
    for (let k = 0; k < AFFINE_ELEMENTS; k++) p[BLIT_INV + k] = inv[k];
    p[BLIT_SX] = rect.sx;
    p[BLIT_SY] = rect.sy;
    p[BLIT_SW] = rect.sw;
    p[BLIT_SH] = rect.sh;
    p[BLIT_LX0] = lim.x0;
    p[BLIT_LY0] = lim.y0;
    p[BLIT_LX1] = lim.x1;
    p[BLIT_LY1] = lim.y1;
    p[BLIT_ALPHA] = alpha;
    const native = globalThis.__cortexBlitImage;
    // false = o host recusou os argumentos: o laço JS faz (mesmo resultado)
    if (typeof native !== 'function' || !native(surface.data, surface.width, src.data, src.width, p, clip || null, !!smooth)) blitImage(surface, src, p, clip, smooth);
    return b;
  }
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
  return b; // caixa tocada (a sombra usa pra não varrer o canvas inteiro)
}
