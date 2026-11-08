// Texto do canvas 2D (SPEC-0313). A máscara vem do rasterizador do host
// (`__cortexRasterText(texto, px, origem, família)` → { width, height, rgba }
// com glifos brancos e cobertura no alfa — stb_truetype; Roboto Medium por
// padrão, ADR-0103, ou a família de `ctx.font` registrada por `loadUiFont`,
// ADR-0715). Aqui fica só a métrica e o posicionamento; quem compõe é o bitmap.js.

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
/** Direções da dilatação do strokeText (8 vizinhos + centro). */
const STROKE_TEXT_DIRECTIONS = 8;
/** Métrica vertical (em EM) da fonte padrão; as registradas vêm do host. */
const DEFAULT_METRICS = { ascent: ASCENT_EM, descent: DESCENT_EM };
const metricsCache = new Map();
/**
 * Máscaras guardadas (texto × tamanho): HUD/painéis redesenham o mesmo texto.
 * LRU por BYTES (SPEC-0321): um relógio a 92 px gera ~100 KB por string nova
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

/** "bold 22px Arial, sans-serif" → px (o peso é ignorado: cada arquivo é uma família). null = inválida. */
export function parseFontSize(font) {
  if (typeof font !== 'string') return null;
  const match = /(\d*\.?\d+)(px|pt)\b/.exec(font);
  if (!match) return null;
  const size = parseFloat(match[1]) * (match[2] === 'pt' ? PT_TO_PX : 1);
  return size > 0 ? size : null;
}

/**
 * Primeira família depois do tamanho, sem aspas: "600 22px 'Barlow', sans-serif"
 * → "Barlow". Família não registrada no host cai na Roboto lá no raster.
 */
export function parseFontFamily(font) {
  const match = /(\d*\.?\d+)(px|pt)(\s*\/\s*\S+)?\s*/.exec(String(font));
  if (!match) return '';
  const first = String(font).slice(match.index + match[0].length).split(',')[0].trim();
  return first.replace(/^(['"])(.*)\1$/, '$2');
}

/** { ascent, descent } em EM da família (host: `__cortexFontMetrics`), ou os da Roboto. */
export function fontMetrics(family) {
  if (!family) return DEFAULT_METRICS;
  const hit = metricsCache.get(family);
  if (hit) return hit;
  const query = globalThis.__cortexFontMetrics;
  // Não registrada = Roboto, guardado como o cache de máscara: registre a fonte
  // (loadUiFont) antes de desenhar com ela.
  const metrics = (typeof query === 'function' && query(family)) || DEFAULT_METRICS;
  metricsCache.set(family, metrics);
  return metrics;
}

export function defaultFontPx() {
  return DEFAULT_FONT_PX;
}

export function rasterAvailable() {
  return typeof globalThis.__cortexRasterText === 'function';
}

/** Máscara do texto no tamanho de dispositivo `px` ({ data, width, height }) ou null. */
export function rasterText(text, px, family = '') {
  if (!rasterAvailable() || text === '' || !(px > 0)) return null;
  const key = family + '|' + px + '|' + text;
  const hit = maskCache.get(key);
  if (hit !== undefined) {
    maskCache.delete(key); // volta pro fim: usado agora
    maskCache.set(key, hit);
    return hit;
  }
  const r = globalThis.__cortexRasterText(text, px, 'canvas', family);
  const mask = r && r.rgba ? { data: new Uint8Array(r.rgba), width: r.width, height: r.height } : null;
  rememberMask(key, mask);
  return mask;
}

/** Linha de base dentro da máscara (mesma conta do text_raster.cpp: ceil(ascent·escala)). */
export function maskBaseline(px, family = '') {
  return Math.ceil(fontMetrics(family).ascent * px);
}

/** Largura de avanço (px) da máscara rasterizada em `px`. */
export function maskAdvance(mask) {
  return mask.width - RASTER_PAD_WIDTH;
}

export function maskPadLeft() {
  return RASTER_PAD_LEFT;
}

/** Deslocamento da linha de base a partir do y pedido, por textBaseline. */
export function baselineShift(baseline, px, family = '') {
  const { ascent, descent } = fontMetrics(family);
  switch (baseline) {
    case 'top': return ascent * px;
    case 'hanging': return ascent * px * HANGING_RATIO;
    case 'middle': return ((ascent - descent) / 2) * px;
    case 'bottom':
    case 'ideographic': return -descent * px;
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
export function textWidth(text, px, family = '') {
  const key = family + '|' + px + '|' + text;
  const hit = measureCache.get(key);
  if (hit !== undefined) return hit;
  const mask = rasterText(text, px, family);
  const width = mask ? maskAdvance(mask) : 0;
  if (measureCache.size >= MEASURE_CACHE_LIMIT) measureCache.clear();
  measureCache.set(key, width);
  return width;
}

/** TextMetrics (subset fiel: largura + caixas da fonte). */
export function measure(text, px, align, baseline, family = '') {
  const width = textWidth(String(text), px, family);
  const shift = baselineShift(baseline, px, family);
  const { ascent, descent } = fontMetrics(family);
  const left = -alignShift(align, width);
  return {
    width,
    actualBoundingBoxLeft: left,
    actualBoundingBoxRight: width - left,
    actualBoundingBoxAscent: ascent * px - shift,
    actualBoundingBoxDescent: descent * px + shift,
    fontBoundingBoxAscent: ascent * px - shift,
    fontBoundingBoxDescent: descent * px + shift,
  };
}

/** Máscara do texto engordada em `radius` px (contorno do strokeText). */
export function dilateMask(mask, radius) {
  const r = Math.max(1, Math.round(radius));
  const width = mask.width + 2 * r;
  const height = mask.height + 2 * r;
  const data = new Uint8Array(width * height * 4);
  const offsets = [[0, 0]];
  for (let k = 0; k < STROKE_TEXT_DIRECTIONS; k++) {
    const t = (k * Math.PI * 2) / STROKE_TEXT_DIRECTIONS;
    offsets.push([Math.round(Math.cos(t) * r), Math.round(Math.sin(t) * r)]);
  }
  for (const [ox, oy] of offsets) {
    for (let y = 0; y < mask.height; y++) {
      for (let x = 0; x < mask.width; x++) {
        const a = mask.data[(y * mask.width + x) * 4 + 3];
        const j = ((y + r + oy) * width + (x + r + ox)) * 4 + 3;
        if (a > data[j]) data[j] = a;
      }
    }
  }
  return { data, width, height, pad: r };
}
