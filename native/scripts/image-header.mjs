// Cabeçalho de imagem para o cook (SPEC-0750): o formato sai da ASSINATURA dos
// bytes (não do mimeType do GLB) e as dimensões do header (IHDR do PNG, segmento
// SOF do JPG), sem decodificar nada. O encode fica com o basis (WASM, que lê PNG e
// JPG) ou com o basisu nativo acima do teto do WASM (ADR-0751).
// Ferramenta de BUILD (roda no Node), não vai pro runtime.

/** Erro tipado de imagem que o cook não lê (o aviso agrupa pelo `code`). */
export const ERR_IMAGE_FORMAT_UNKNOWN = 'ERR_IMAGE_FORMAT_UNKNOWN';
export const ERR_IMAGE_DECODE = 'ERR_IMAGE_DECODE';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8];
/** Quantos bytes da assinatura entram na mensagem de formato desconhecido. */
const SIGNATURE_PREVIEW_BYTES = 4;

// PNG: assinatura (8) + chunk IHDR [tamanho u32][tipo 4][largura u32][altura u32]…
const IHDR_WIDTH_OFFSET = 16;
const IHDR_HEIGHT_OFFSET = 20;
const IHDR_MIN_BYTES = 24;

// JPG: segmentos [FF][marcador][tamanho u16 BE, inclui os 2 bytes][dados].
const JPEG_MARKER_PREFIX = 0xff;
const JPEG_SOI_BYTES = 2;
const JPEG_SEGMENT_LENGTH_BYTES = 2;
/** Marcadores sem tamanho: TEM (01), RST0..RST7 (D0..D7) e SOI (D8). */
const JPEG_TEM = 0x01;
const JPEG_RST_FIRST = 0xd0;
const JPEG_RST_LAST = 0xd7;
const JPEG_SOI = 0xd8;
const JPEG_EOI = 0xd9;
const JPEG_SOS = 0xda;
/** SOF0..SOF15 são C0..CF, menos DHT (C4), JPG (C8) e DAC (CC), que não são quadro. */
const JPEG_SOF_FIRST = 0xc0;
const JPEG_SOF_LAST = 0xcf;
const JPEG_NOT_SOF = new Set([0xc4, 0xc8, 0xcc]);
// Dentro do SOF (a partir do byte depois do tamanho): precisão (1), altura u16, largura u16.
const SOF_HEIGHT_OFFSET = 1;
const SOF_WIDTH_OFFSET = 3;
const SOF_MIN_BYTES = 5;

const startsWith = (bytes, sig) => bytes.length >= sig.length && sig.every((b, i) => bytes[i] === b);

/** 'png' | 'jpeg' | null, pela assinatura dos bytes. */
export function detectImageFormat(bytes) {
  if (startsWith(bytes, PNG_SIGNATURE)) return 'png';
  if (startsWith(bytes, JPEG_SIGNATURE)) return 'jpeg';
  return null;
}

/** Erro de formato desconhecido com os primeiros bytes em hex (o motivo do aviso). */
export function unknownFormatError(bytes) {
  const head = Array.from(bytes.subarray(0, SIGNATURE_PREVIEW_BYTES), (b) => b.toString(16).padStart(2, '0')).join(' ');
  return Object.assign(new Error(`formato de imagem desconhecido (assinatura ${head || 'vazia'}; só PNG e JPG)`), {
    code: ERR_IMAGE_FORMAT_UNKNOWN,
  });
}

const decodeError = (msg) => Object.assign(new Error(msg), { code: ERR_IMAGE_DECODE });

const viewOf = (bytes) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** Largura e altura de um PNG pelo IHDR. */
export function pngSize(bytes) {
  if (bytes.length < IHDR_MIN_BYTES) throw decodeError('PNG truncado (sem IHDR)');
  const view = viewOf(bytes);
  return { width: view.getUint32(IHDR_WIDTH_OFFSET), height: view.getUint32(IHDR_HEIGHT_OFFSET) };
}

const isStandalone = (marker) =>
  marker === JPEG_TEM || marker === JPEG_SOI || (marker >= JPEG_RST_FIRST && marker <= JPEG_RST_LAST);
const isSof = (marker) => marker >= JPEG_SOF_FIRST && marker <= JPEG_SOF_LAST && !JPEG_NOT_SOF.has(marker);

/**
 * Largura e altura de um JPG pelo primeiro segmento SOF (baseline, progressivo,
 * sem perda…). Percorre os segmentos pelo tamanho de cada um, pula os FF de
 * enchimento e os marcadores sem tamanho; chegar ao SOS, ao EOI ou ao fim sem
 * SOF dá erro com o motivo.
 */
export function jpegSize(bytes) {
  const view = viewOf(bytes);
  let p = JPEG_SOI_BYTES;
  while (p < bytes.length) {
    if (bytes[p] !== JPEG_MARKER_PREFIX) throw decodeError(`JPG corrompido (byte ${p} fora de um marcador)`);
    while (p < bytes.length && bytes[p] === JPEG_MARKER_PREFIX) p++; // FF de enchimento
    if (p >= bytes.length) break;
    const marker = bytes[p++];
    if (isStandalone(marker)) continue;
    if (marker === JPEG_EOI || marker === JPEG_SOS) break;
    if (p + JPEG_SEGMENT_LENGTH_BYTES > bytes.length) break;
    const length = view.getUint16(p);
    if (length < JPEG_SEGMENT_LENGTH_BYTES) throw decodeError(`JPG corrompido (segmento ${marker.toString(16)} de tamanho ${length})`);
    if (isSof(marker)) {
      const body = p + JPEG_SEGMENT_LENGTH_BYTES;
      if (body + SOF_MIN_BYTES > bytes.length) break;
      return { width: view.getUint16(body + SOF_WIDTH_OFFSET), height: view.getUint16(body + SOF_HEIGHT_OFFSET) };
    }
    p += length;
  }
  throw decodeError('JPG sem segmento SOF (dimensões ilegíveis)');
}

/** `{ format, width, height }` pela assinatura e pelo header; formato desconhecido lança com o motivo. */
export function readImageHeader(bytes) {
  const format = detectImageFormat(bytes);
  if (format === 'png') return { format, ...pngSize(bytes) };
  if (format === 'jpeg') return { format, ...jpegSize(bytes) };
  throw unknownFormatError(bytes);
}
