// Sombra do canvas 2D (SPEC-0313). A operação é desenhada numa camada
// transparente; o alfa da camada, borrado e deslocado, vira a sombra
// (shadowColor) composta ANTES da camada. Blur = 3 passes de caixa por eixo,
// que aproximam a gaussiana de σ = shadowBlur / 2 (definição da spec).
// Todo o trabalho fica na CAIXA do que foi desenhado (+ alcance do blur e do
// deslocamento) — texto com brilho num painel grande não borra o painel todo.

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

/** Blur de caixa 1D, in-place, em `lines` linhas de `len` amostras com passo `step`. */
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

/** Caixa [x0,y0,x1,y1) dos pixels não transparentes da camada, ou null. */
export function paintedBox(layer) {
  const { width, height, u32 } = layer;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    const base = y * width;
    for (let x = 0; x < width; x++) {
      if (u32[base + x] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/** Zera a caixa da camada (mantém a invariante "camada limpa" sem varrer tudo). */
export function clearBox(layer, box) {
  for (let y = box.y0; y < box.y1; y++) layer.u32.fill(0, y * layer.width + box.x0, y * layer.width + box.x1);
}

/**
 * Compõe a sombra da camada `layer` (desenho em `box`) no alvo `surface`.
 * Offsets em px de dispositivo (a spec não aplica o transform na sombra).
 */
export function compositeShadow(surface, layer, state, clip, box) {
  const { width, height } = surface;
  const radius = boxRadius(state.shadowBlur * BLUR_TO_SIGMA);
  const reach = radius * BOX_PASSES;
  const ox = Math.round(state.shadowOffsetX);
  const oy = Math.round(state.shadowOffsetY);
  // região da sombra (em coordenadas da camada) = caixa + alcance do blur
  const rx0 = Math.max(0, box.x0 - reach);
  const ry0 = Math.max(0, box.y0 - reach);
  const rx1 = Math.min(width, box.x1 + reach);
  const ry1 = Math.min(height, box.y1 + reach);
  const rw = rx1 - rx0;
  const rh = ry1 - ry0;
  const alpha = new Float32Array(rw * rh);
  const src = layer.data;
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) alpha[y * rw + x] = src[((ry0 + y) * width + rx0 + x) * 4 + 3] * INV_BYTE;
  }
  if (radius > 0) {
    const tmp = new Float32Array(Math.max(rw, rh));
    for (let p = 0; p < BOX_PASSES; p++) {
      boxBlur(alpha, tmp, rw, rh, rw, 1, radius);
      boxBlur(alpha, tmp, rh, rw, 1, rw, radius);
    }
  }
  const [r, g, b, ca] = state.shadowRgba;
  const d = surface.data;
  for (let y = 0; y < rh; y++) {
    const ty = ry0 + y + oy;
    if (ty < 0 || ty >= height) continue;
    for (let x = 0; x < rw; x++) {
      const tx = rx0 + x + ox;
      if (tx < 0 || tx >= width) continue;
      let sa = alpha[y * rw + x] * ca;
      if (clip) sa *= clip[ty * width + tx] * INV_BYTE;
      if (sa <= 0) continue;
      const i = (ty * width + tx) * 4;
      const keep = d[i + 3] * INV_BYTE * (1 - sa);
      const oa = sa + keep;
      d[i] = (r * sa + d[i] * keep) / oa;
      d[i + 1] = (g * sa + d[i + 1] * keep) / oa;
      d[i + 2] = (b * sa + d[i + 2] * keep) / oa;
      d[i + 3] = oa * MAX_BYTE;
    }
  }
}
