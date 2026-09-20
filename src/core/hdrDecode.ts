/**
 * **Decodificador de Radiance HDR (`.hdr`) → half-float** (SPEC-0217).
 *
 * O `HDRLoader` do three faz, POR PIXEL, um `Math.pow(2, e - 128)` e quatro
 * `DataUtils.toHalfFloat` — ~10 M operações caras num equirect 2048×1024. Sem
 * JIT (Hermes, host nativo) isso custava 1,74 s no boot do kart-racer, contra
 * milissegundos de leitura do arquivo: o gargalo é a conversão, não o I/O.
 *
 * Aqui a conversão é uma tabela de 256 escalas (uma por expoente RGBE, já
 * dividida por 255) e um float→half inline por manipulação de bits, em laço
 * plano sobre o `Uint8Array`. O resultado é idêntico ao do three.
 *
 * O formato: cabeçalho de texto (`#?RADIANCE`), resolução em `-Y h +X w` e os
 * pixels em RGBE — cada scanline comprimida por RLE adaptativo, ou crua quando
 * a linha é estreita demais (< 8) ou larga demais (> 0x7fff).
 */

/** Assinatura que abre todo arquivo Radiance. */
const MAGIC = '#?';
/** Bytes do cabeçalho de uma scanline RLE adaptativa: 2, 2, hi, lo. */
const RLE_HEADER_BYTES = 4;
/** Marcador de scanline RLE adaptativa (os dois primeiros bytes). */
const RLE_MARKER = 2;
/** Acima deste valor o byte de contagem indica repetição, não cópia literal. */
const RLE_RUN_FLAG = 128;
/** Componentes por pixel (R, G, B, expoente). */
const RGBE_COMPONENTS = 4;
/** Largura mínima de scanline que admite RLE adaptativa. */
const MIN_RLE_WIDTH = 8;
/** Largura máxima de scanline que admite RLE adaptativa. */
const MAX_RLE_WIDTH = 0x7fff;
/** Maior valor representável em float16 — o three faz o mesmo clamp. */
const HALF_MAX = 65504;
/** Expoente RGBE de referência (o valor 128 é o expoente zero). */
const RGBE_EXPONENT_BIAS = 128;
/** Faixa de um byte: o mantissa RGBE é 0..255. */
const BYTE_RANGE = 255;
/** Quantidade de expoentes possíveis num byte. */
const EXPONENT_COUNT = 256;

/** Imagem decodificada, pronta pra virar `DataTexture` com `HalfFloatType`. */
export interface HdrImage {
  width: number;
  height: number;
  /** RGBA half-float entrelaçado, 4 valores por pixel. */
  data: Uint16Array;
}

/**
 * **Toda a conversão de um componente cabe numa tabela.** Um componente RGBE é
 * um par (byte da mantissa, byte do expoente) — 256×256 combinações, todas
 * conhecidas de antemão. Com a tabela pronta, o laço por pixel faz três
 * leituras de array e quatro escritas: sem `pow`, sem `min`, sem chamada de
 * função por componente.
 *
 * Construída sob demanda (128 KB, ~10 ms) na primeira imagem decodificada —
 * quem nunca carrega um `.hdr` não paga nada.
 */
let _halfByExponentAndByte: Uint16Array | null = null;

function halfTable(): Uint16Array {
  if (_halfByExponentAndByte) return _halfByExponentAndByte;
  const table = new Uint16Array(EXPONENT_COUNT * EXPONENT_COUNT);
  for (let e = 1; e < EXPONENT_COUNT; e++) {
    // Expoente 0 = pixel preto: a faixa inteira fica em zero (já é o default).
    const scale = Math.pow(2, e - RGBE_EXPONENT_BIAS) / BYTE_RANGE;
    const row = e * EXPONENT_COUNT;
    for (let byte = 0; byte < EXPONENT_COUNT; byte++) {
      table[row + byte] = toHalf(Math.min(byte * scale, HALF_MAX));
    }
  }
  _halfByExponentAndByte = table;
  return table;
}

// Conversão float→half sem chamada de função: um Float32Array e um Uint32Array
// sobre o MESMO buffer dão acesso aos bits do float (o mesmo truque do
// DataUtils do three, sem a tabela de 2048 entradas e sem a chamada por valor).
const _f32 = new Float32Array(1);
const _u32 = new Uint32Array(_f32.buffer);

/** Bits de mantissa que float32 tem a mais que half (23 − 10). */
const MANTISSA_SHIFT = 13;
/** Bits significativos da mantissa float32 com o bit implícito. */
const MANTISSA_BITS = 24;

/** `1.0` em half-float — o alfa é constante em toda a imagem. */
const HALF_ONE = 0x3c00;

/**
 * Converte um float32 positivo (já clampado a {@link HALF_MAX}) em half-float.
 *
 * Só precisa cobrir valores finitos e não-negativos: RGBE não representa
 * negativo nem NaN.
 */
function toHalf(value: number): number {
  _f32[0] = value;
  const bits = _u32[0]!;
  const exponent = (bits >> 23) & 0xff;
  const mantissa = bits & 0x7fffff;
  if (exponent === 0) return 0; // zero ou subnormal em float32: vira zero
  const half = exponent - 127 + 15; // rebase do expoente (127 → 15)
  if (half <= 0) {
    // Subnormal em half: desloca a mantissa (com o bit implícito) pra direita.
    // ARMADILHA: em JS o `>>` usa só os 5 bits BAIXOS do deslocamento, então
    // `x >> 32` é `x >> 0` — devolveria a mantissa inteira como se fosse um
    // half, e o valor ~0 viraria um número enorme com o bit de sinal aceso. O
    // numerador cabe em 24 bits, então qualquer deslocamento acima disso já é
    // zero de qualquer forma: corta antes de chegar perto do limite.
    const shift = 1 - half + MANTISSA_SHIFT;
    if (shift > MANTISSA_BITS) return 0;
    return (mantissa | 0x800000) >> shift;
  }
  if (half >= 0x1f) return 0x7bff; // estouro: maior finito (o clamp já evita)
  return (half << 10) | (mantissa >> MANTISSA_SHIFT);
}

/** Lê o cabeçalho de texto e devolve onde começam os pixels + a resolução. */
function readHeader(bytes: Uint8Array): { width: number; height: number; offset: number } {
  const magic = String.fromCharCode(bytes[0]!, bytes[1]!);
  if (magic !== MAGIC) throw new Error('hdrDecode: não é um arquivo Radiance (#?)');

  let pos = 0;
  let line = '';
  let width = 0;
  let height = 0;
  // O cabeçalho termina numa linha vazia; a linha SEGUINTE traz a resolução.
  while (pos < bytes.length) {
    const byte = bytes[pos++]!;
    if (byte !== 0x0a) {
      line += String.fromCharCode(byte);
      continue;
    }
    const resolution = /^\s*-Y\s+(\d+)\s+\+X\s+(\d+)\s*$/.exec(line);
    if (resolution) {
      height = Number(resolution[1]);
      width = Number(resolution[2]);
      break;
    }
    line = '';
  }
  if (width <= 0 || height <= 0) throw new Error('hdrDecode: resolução ausente (esperado "-Y h +X w")');
  return { width, height, offset: pos };
}

/**
 * Decodifica uma scanline RLE adaptativa para `line` (planar: RRR…GGG…BBB…EEE…).
 *
 * @returns A posição logo após a scanline na fonte.
 */
function readRleScanline(bytes: Uint8Array, start: number, width: number, line: Uint8Array): number {
  let pos = start;
  for (let channel = 0; channel < RGBE_COMPONENTS; channel++) {
    let x = 0;
    const end = (channel + 1) * width;
    let write = channel * width;
    while (x < width) {
      const count = bytes[pos++]!;
      if (count > RLE_RUN_FLAG) {
        // Repetição: um valor repetido (count - 128) vezes.
        const repeat = count - RLE_RUN_FLAG;
        const value = bytes[pos++]!;
        if (write + repeat > end) throw new Error('hdrDecode: repetição estoura a scanline');
        for (let i = 0; i < repeat; i++) line[write++] = value;
        x += repeat;
      } else {
        // Literal: `count` bytes copiados como estão.
        if (count === 0 || write + count > end) throw new Error('hdrDecode: literal inválido na scanline');
        for (let i = 0; i < count; i++) line[write++] = bytes[pos++]!;
        x += count;
      }
    }
  }
  return pos;
}

/**
 * Decodifica um `.hdr` inteiro em RGBA half-float.
 *
 * @param buffer - O arquivo cru, como veio do `fetch`/pak.
 * @returns Resolução + `Uint16Array` RGBA pronto pra `DataTexture`.
 */
export function decodeHdr(buffer: ArrayBuffer | Uint8Array): HdrImage {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const { width, height, offset } = readHeader(bytes);

  const table = halfTable();
  const data = new Uint16Array(width * height * RGBE_COMPONENTS);
  const line = new Uint8Array(width * RGBE_COMPONENTS);
  let pos = offset;

  for (let y = 0; y < height; y++) {
    const adaptive =
      width >= MIN_RLE_WIDTH &&
      width <= MAX_RLE_WIDTH &&
      bytes[pos] === RLE_MARKER &&
      bytes[pos + 1] === RLE_MARKER &&
      ((bytes[pos + 2]! << 8) | bytes[pos + 3]!) === width;

    if (adaptive) {
      pos = readRleScanline(bytes, pos + RLE_HEADER_BYTES, width, line);
      // Planar → pixel: os quatro canais da linha viram RGBA half.
      let out = y * width * RGBE_COMPONENTS;
      const green = width;
      const blue = width * 2;
      const exponent = width * 3;
      for (let x = 0; x < width; x++) {
        const row = line[exponent + x]! * EXPONENT_COUNT;
        data[out] = table[row + line[x]!]!;
        data[out + 1] = table[row + line[green + x]!]!;
        data[out + 2] = table[row + line[blue + x]!]!;
        data[out + 3] = HALF_ONE;
        out += RGBE_COMPONENTS;
      }
    } else {
      // Scanline crua: os pixels vêm entrelaçados, sem compressão.
      let out = y * width * RGBE_COMPONENTS;
      for (let x = 0; x < width; x++) {
        const row = bytes[pos + 3]! * EXPONENT_COUNT;
        data[out] = table[row + bytes[pos]!]!;
        data[out + 1] = table[row + bytes[pos + 1]!]!;
        data[out + 2] = table[row + bytes[pos + 2]!]!;
        data[out + 3] = HALF_ONE;
        pos += RGBE_COMPONENTS;
        out += RGBE_COMPONENTS;
      }
    }
  }

  return { width, height, data };
}
