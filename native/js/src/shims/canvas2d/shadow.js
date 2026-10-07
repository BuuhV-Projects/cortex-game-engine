// Sombra do canvas 2D (SPEC-0313). A operação é desenhada numa camada
// transparente; o alfa da camada, borrado e deslocado, vira a sombra
// (shadowColor) composta ANTES da camada. Blur = 3 passes de caixa por eixo,
// que aproximam a gaussiana de σ = shadowBlur / 2 (definição da spec).

const MAX_BYTE = 255;
const INV_BYTE = 1 / MAX_BYTE;
const BOX_PASSES = 3;
const BLUR_TO_SIGMA = 0.5;

export function shadowActive(state) {
  const c = state.shadowRgba;
  return c[3] > 0 && (state.shadowBlur > 0 || state.shadowOffsetX !== 0 || state.shadowOffsetY !== 0);
}

/** Raio da caixa cujos 3 passes dão a variância de σ². */
function boxRadius(sigma) {
  const width = Math.sqrt((12 * sigma * sigma) / BOX_PASSES + 1);
  return Math.max(0, Math.round((width - 1) / 2));
}

/** Blur de caixa 1D, in-place, em `n` linhas de `len` amostras com passo `step`. */
function boxBlur(values, tmp, len, lines, lineStride, step, radius) {
  const norm = 1 / (2 * radius + 1);
  for (let line = 0; line < lines; line++) {
    const base = line * lineStride;
    for (let i = 0; i < len; i++) tmp[i] = values[base + i * step];
    let sum = 0;
    for (let i = -radius; i <= radius; i++) sum += i >= 0 && i < len ? tmp[i] : 0;
    for (let i = 0; i < len; i++) {
      values[base + i * step] = sum * norm;
      const out = i - radius;
      const inn = i + radius + 1;
      if (out >= 0) sum -= tmp[out];
      if (inn < len) sum += tmp[inn];
    }
  }
}

function blurAlpha(alpha, width, height, sigma) {
  const radius = boxRadius(sigma);
  if (radius === 0) return;
  const tmp = new Float32Array(Math.max(width, height));
  for (let p = 0; p < BOX_PASSES; p++) {
    boxBlur(alpha, tmp, width, height, width, 1, radius);
    boxBlur(alpha, tmp, height, width, 1, width, radius);
  }
}

/**
 * Compõe a sombra da camada `layer` (surface) no alvo `surface`.
 * Offsets em px de dispositivo (a spec não aplica o transform na sombra).
 */
export function compositeShadow(surface, layer, state, clip) {
  const { width, height } = surface;
  const alpha = new Float32Array(width * height);
  const src = layer.data;
  for (let i = 0; i < alpha.length; i++) alpha[i] = src[i * 4 + 3] * INV_BYTE;
  blurAlpha(alpha, width, height, state.shadowBlur * BLUR_TO_SIGMA);
  const [r, g, b, ca] = state.shadowRgba;
  const ox = Math.round(state.shadowOffsetX);
  const oy = Math.round(state.shadowOffsetY);
  const d = surface.data;
  for (let y = 0; y < height; y++) {
    const sy = y - oy;
    if (sy < 0 || sy >= height) continue;
    for (let x = 0; x < width; x++) {
      const sx = x - ox;
      if (sx < 0 || sx >= width) continue;
      let sa = alpha[sy * width + sx] * ca;
      if (clip) sa *= clip[y * width + x] * INV_BYTE;
      if (sa <= 0) continue;
      const i = (y * width + x) * 4;
      const da = d[i + 3] * INV_BYTE;
      const keep = da * (1 - sa);
      const oa = sa + keep;
      d[i] = (r * sa + d[i] * keep) / oa;
      d[i + 1] = (g * sa + d[i + 1] * keep) / oa;
      d[i + 2] = (b * sa + d[i + 2] * keep) / oa;
      d[i + 3] = oa * MAX_BYTE;
    }
  }
}
