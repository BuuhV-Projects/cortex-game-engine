// Texto do canvas 2D (SPEC-0313). A máscara vem do rasterizador do host
// (`__cortexRasterText(texto, px)` → { width, height, rgba } com glifos
// brancos e cobertura no alfa — stb_truetype + Roboto Medium, ADR-0103).
// Aqui fica só a métrica e o posicionamento; quem compõe é o bitmap.js.

/** Métrica vertical da Roboto-Medium.ttf (`hhea`/`head`) — conferida por teste contra o .ttf. */
export const FONT_UNITS_PER_EM = 2048;
export const FONT_ASCENDER = 2146;
export const FONT_DESCENDER = -555;
const ASCENT_EM = FONT_ASCENDER / FONT_UNITS_PER_EM;
const DESCENT_EM = -FONT_DESCENDER / FONT_UNITS_PER_EM;
/** O raster nativo deixa 1 px de folga à esquerda e soma 2 px na largura. */
const RASTER_PAD_LEFT = 1;
const RASTER_PAD_WIDTH = 2;
/** `hanging` aproximado como no Chromium (80% do ascent). */
const HANGING_RATIO = 0.8;
const PT_TO_PX = 4 / 3;
const DEFAULT_FONT_PX = 10;
const MEASURE_CACHE_LIMIT = 512;
/**
 * Máscaras guardadas (texto × tamanho): HUD/painéis redesenham o mesmo texto.
 * LRU por BYTES (SPEC-0320): um relógio a 92 px gera ~100 KB por string nova
 * — limitar por contagem deixava o teto variar 100× com o tamanho da fonte, e
 * o `clear()` total re-rasterizava tudo no quadro seguinte.
 */
export const MASK_CACHE_MAX_BYTES = 8 * 1024 * 1024;
/** Teto de entradas: máscara `null` (sem fonte) tem 0 byte e não pesaria no LRU. */
const MASK_CACHE_MAX_ENTRIES = 1024;
const maskCache = new Map();
let maskCacheBytes = 0;

/** Bytes de máscara retidos pelo cache (telemetria/teste). */
export function maskCacheSize() {
  return { entries: maskCache.size, bytes: maskCacheBytes };
}

function maskBytes(mask) {
  return mask ? mask.data.byteLength : 0;
}

function rememberMask(key, mask) {
  maskCache.set(key, mask);
  maskCacheBytes += maskBytes(mask);
  // Map itera na ordem de inserção: o primeiro é o usado há mais tempo.
  for (const [oldKey, oldMask] of maskCache) {
    const fits = maskCacheBytes <= MASK_CACHE_MAX_BYTES && maskCache.size <= MASK_CACHE_MAX_ENTRIES;
    if (fits || oldKey === key) break;
    maskCache.delete(oldKey);
    maskCacheBytes -= maskBytes(oldMask);
  }
}

/** "bold 22px Arial, sans-serif" → px (família e peso ignorados: fonte única). null = inválida. */
export function parseFontSize(font) {
  if (typeof font !== 'string') return null;
  const match = /(\d*\.?\d+)(px|pt)\b/.exec(font);
  if (!match) return null;
  const size = parseFloat(match[1]) * (match[2] === 'pt' ? PT_TO_PX : 1);
  return size > 0 ? size : null;
}

export function defaultFontPx() {
  return DEFAULT_FONT_PX;
}

export function rasterAvailable() {
  return typeof globalThis.__cortexRasterText === 'function';
}

/** Máscara do texto no tamanho de dispositivo `px` ({ data, width, height }) ou null. */
export function rasterText(text, px) {
  if (!rasterAvailable() || text === '' || !(px > 0)) return null;
  const key = px + '|' + text;
  const hit = maskCache.get(key);
  if (hit !== undefined) {
    maskCache.delete(key); // volta pro fim: usado agora
    maskCache.set(key, hit);
    return hit;
  }
  const r = globalThis.__cortexRasterText(text, px, 'canvas');
  const mask = r && r.rgba ? { data: new Uint8Array(r.rgba), width: r.width, height: r.height } : null;
  rememberMask(key, mask);
  return mask;
}

/** Linha de base dentro da máscara (mesma conta do text_raster.cpp: ceil(ascent·escala)). */
export function maskBaseline(px) {
  return Math.ceil(ASCENT_EM * px);
}

/** Largura de avanço (px) da máscara rasterizada em `px`. */
export function maskAdvance(mask) {
  return mask.width - RASTER_PAD_WIDTH;
}

export function maskPadLeft() {
  return RASTER_PAD_LEFT;
}

/** Deslocamento da linha de base a partir do y pedido, por textBaseline. */
export function baselineShift(baseline, px) {
  switch (baseline) {
    case 'top': return ASCENT_EM * px;
    case 'hanging': return ASCENT_EM * px * HANGING_RATIO;
    case 'middle': return ((ASCENT_EM - DESCENT_EM) / 2) * px;
    case 'bottom':
    case 'ideographic': return -DESCENT_EM * px;
    default: return 0; // alphabetic
  }
}

/** Deslocamento horizontal do início do texto, por textAlign (direção ltr). */
export function alignShift(align, width) {
  if (align === 'center') return -width / 2;
  if (align === 'right' || align === 'end') return -width;
  return 0;
}

const measureCache = new Map();

/** Largura do texto em px de usuário no tamanho `px` (0 sem rasterizador). */
export function textWidth(text, px) {
  const key = px + '|' + text;
  const hit = measureCache.get(key);
  if (hit !== undefined) return hit;
  const mask = rasterText(text, px);
  const width = mask ? maskAdvance(mask) : 0;
  if (measureCache.size >= MEASURE_CACHE_LIMIT) measureCache.clear();
  measureCache.set(key, width);
  return width;
}

/** TextMetrics (subset fiel: largura + caixas da fonte). */
export function measure(text, px, align, baseline) {
  const width = textWidth(String(text), px);
  const shift = baselineShift(baseline, px);
  const left = -alignShift(align, width);
  return {
    width,
    actualBoundingBoxLeft: left,
    actualBoundingBoxRight: width - left,
    actualBoundingBoxAscent: ASCENT_EM * px - shift,
    actualBoundingBoxDescent: DESCENT_EM * px + shift,
    fontBoundingBoxAscent: ASCENT_EM * px - shift,
    fontBoundingBoxDescent: DESCENT_EM * px + shift,
  };
}
