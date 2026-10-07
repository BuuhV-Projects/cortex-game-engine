// Composição `source-over` numa linha do buffer (SPEC-0313). O buffer guarda
// RGBA com alfa NÃO pré-multiplicado (o formato do getImageData e do upload).
// A cobertura final de um pixel = cov[x] · globalAlpha · clip[x]/255.
//
// surface = { width, height, data: Uint8ClampedArray, u32: Uint32Array }

const MAX_BYTE = 255;
const INV_BYTE = 1 / MAX_BYTE;
const SHIFT_G = 8;
const SHIFT_B = 16;
const SHIFT_A = 24;

/** RGBA → uint32 little-endian (o layout do Uint32Array sobre o buffer). */
export function packColor(r, g, b, a) {
  return ((a << SHIFT_A) | (b << SHIFT_B) | (g << SHIFT_G) | r) >>> 0;
}

/** Linha de cor por pixel reaproveitada (gradiente/imagem). */
let rowColors = new Uint8ClampedArray(0);

export function colorRow(width) {
  if (rowColors.length < width * 4) rowColors = new Uint8ClampedArray(width * 4);
  return rowColors;
}

export function blendPixel(d, i, r, g, b, sa) {
  if (sa >= 1) {
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = MAX_BYTE;
    return;
  }
  const da = d[i + 3] * INV_BYTE;
  const keep = da * (1 - sa);
  const oa = sa + keep;
  if (oa <= 0) return;
  const inv = 1 / oa;
  d[i] = (r * sa + d[i] * keep) * inv;
  d[i + 1] = (g * sa + d[i + 1] * keep) * inv;
  d[i + 2] = (b * sa + d[i + 2] * keep) * inv;
  d[i + 3] = oa * MAX_BYTE;
}

/** Miolo [a, b) da linha com cobertura 1 — preenchido por Uint32Array.fill. */
function fullInterior(cov, x0, x1) {
  const a = cov[x0] >= 1 ? x0 : x0 + 1;
  const b = cov[x1 - 1] >= 1 ? x1 : x1 - 1;
  return [a, b];
}

function blendSolidRow(surface, y, x0, x1, color, cov, rowFull, alpha, clip) {
  const d = surface.data;
  const [r, g, b, a] = color;
  const base = y * surface.width;
  const opaque = a === MAX_BYTE && alpha >= 1 && !clip;
  let skipA = x1;
  let skipB = x1;
  if (opaque && rowFull && x1 - x0 > 2) {
    const [ia, ib] = fullInterior(cov, x0, x1);
    if (ib > ia) {
      surface.u32.fill(packColor(r, g, b, a), base + ia, base + ib);
      skipA = ia;
      skipB = ib;
    }
  }
  const k = a * INV_BYTE * alpha;
  for (let x = x0; x < x1; x++) {
    if (x === skipA) {
      x = skipB - 1;
      continue;
    }
    let c = cov[x] * k;
    if (clip) c *= clip[base + x] * INV_BYTE;
    if (c > 0) blendPixel(d, (base + x) * 4, r, g, b, c);
  }
}

function blendShadedRow(surface, y, x0, x1, colors, cov, alpha, clip) {
  const d = surface.data;
  const base = y * surface.width;
  for (let x = x0; x < x1; x++) {
    const j = x * 4;
    let c = (cov ? cov[x] : 1) * colors[j + 3] * INV_BYTE * alpha;
    if (clip) c *= clip[base + x] * INV_BYTE;
    if (c > 0) blendPixel(d, (base + x) * 4, colors[j], colors[j + 1], colors[j + 2], c);
  }
}

/**
 * Compõe a tinta na linha y, pixels [x0, x1), com cobertura cov (ou null = 1).
 * `rowFull` = linha toda coberta na vertical (habilita o fill de uint32).
 */
export function blendRow(surface, y, x0, x1, paint, cov, rowFull, alpha, clip) {
  if (paint.solid) {
    blendSolidRow(surface, y, x0, x1, paint.solid, cov, rowFull, alpha, clip);
    return;
  }
  const colors = colorRow(surface.width);
  paint.shadeRow(y, x0, x1, colors);
  blendShadedRow(surface, y, x0, x1, colors, cov, alpha, clip);
}

/** Linha de cores já pronta (amostragem de imagem) — cov opcional. */
export function blendColorRow(surface, y, x0, x1, colors, cov, alpha, clip) {
  blendShadedRow(surface, y, x0, x1, colors, cov, alpha, clip);
}

/** clearRect: apaga proporcional à cobertura (respeita o clip, como no browser). */
export function eraseRow(surface, y, x0, x1, cov, rowFull, clip) {
  const d = surface.data;
  const base = y * surface.width;
  if (rowFull && !clip) {
    const [a, b] = fullInterior(cov, x0, x1);
    if (b > a) surface.u32.fill(0, base + a, base + b);
  }
  for (let x = x0; x < x1; x++) {
    let c = cov[x];
    if (clip) c *= clip[base + x] * INV_BYTE;
    if (c <= 0) continue;
    const i = (base + x) * 4 + 3;
    d[i] = c >= 1 ? 0 : d[i] * (1 - c);
    if (d[i] === 0) d[i - 3] = d[i - 2] = d[i - 1] = 0;
  }
}
