// Golden de paridade do blit do canvas 2D (ADR-0318): roda o laço JS do
// drawImage (bitmap.js) em casos fixos e grava native/tests/blit_golden.h com
// as entradas e a saída esperada. O cortex_host_tests confere o C++ byte a byte
// contra este arquivo; o vitest (tests/native/blitGolden.test.ts) confere que o
// JS ainda gera o mesmo arquivo.
//
//   node native/scripts/gen-blit-golden.mjs     (regrava o header)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { blitImage, drawBitmap } from '../js/src/shims/canvas2d/bitmap.js';
import { createSurface } from '../js/src/shims/canvas2d/surface.js';

export const GOLDEN_PATH = fileURLToPath(new URL('../tests/blit_golden.h', import.meta.url));

const BYTES_PER_PIXEL = 4;
const MAX_BYTE = 255;
const SEED = 0x2d2d2d;
const LCG_A = 1664525;
const LCG_C = 1013904223;
const UINT32 = 0x100000000;
const BYTES_PER_LINE = 24;

/** PRNG determinístico (LCG 32 bits) — mesmo arquivo em qualquer máquina. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, LCG_A) + LCG_C) >>> 0;
    return s / UINT32;
  };
}

/** Pixels de teste: maioria opaca, um bloco transparente e um semitransparente. */
function pattern(w, h, rand, opaqueOnly) {
  const data = new Uint8ClampedArray(w * h * BYTES_PER_PIXEL);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * BYTES_PER_PIXEL;
      data[i] = rand() * MAX_BYTE;
      data[i + 1] = rand() * MAX_BYTE;
      data[i + 2] = rand() * MAX_BYTE;
      let a = MAX_BYTE;
      if (!opaqueOnly && x < w / 3 && y < h / 3) a = 0;
      else if (!opaqueOnly && x > (2 * w) / 3 && y > h / 2) a = (rand() * MAX_BYTE) | 0;
      data[i + 3] = a;
    }
  }
  return data;
}

function rotScale(angle, scale, tx, ty) {
  const c = Math.cos(angle) * scale;
  const s = Math.sin(angle) * scale;
  return [c, s, -s, c, tx, ty];
}

const CASES = [
  { name: 'girado_bilinear', matrix: rotScale(0.7, 1.3, 9.3, -2.1), smooth: true, alpha: 1 },
  { name: 'girado_bilinear_clip', matrix: rotScale(-0.4, 1.1, 4.2, 3.7), smooth: true, alpha: 1, clip: true },
  { name: 'girado_alfa', matrix: rotScale(2.1, 0.9, 20.5, 14.2), smooth: true, alpha: 0.6 },
  { name: 'girado_nearest', matrix: rotScale(0.3, 1.6, 2.5, -4.4), smooth: false, alpha: 1, clip: true },
  { name: 'reduzido', matrix: rotScale(1.2, 0.45, 12.1, 3.3), smooth: true, alpha: 1 },
  { name: 'translacao', matrix: [1, 0, 0, 1, 3.4, 2.6], smooth: true, alpha: 0.8 },
  { name: 'recorte_fonte', matrix: rotScale(-1.1, 2.2, 11.7, 16.9), smooth: true, alpha: 1, rect: { sx: 2.5, sy: 1.25, sw: 9.5, sh: 7.75 } },
  { name: 'fonte_opaca', matrix: rotScale(0.9, 1.4, 10.2, -1.8), smooth: true, alpha: 1, opaque: true },
];
const DST_W = 29;
const DST_H = 23;
const SRC_W = 17;
const SRC_H = 13;

/** Roda cada caso pelo drawBitmap real e captura o que ele entrega ao blit. */
export function buildGoldenCases() {
  const rand = rng(SEED);
  const out = [];
  const saved = globalThis.__cortexBlitImage;
  try {
    for (const k of CASES) {
      const src = { data: pattern(SRC_W, SRC_H, rand, k.opaque), width: SRC_W, height: SRC_H };
      const surface = createSurface(DST_W, DST_H);
      surface.data.set(pattern(DST_W, DST_H, rand, false));
      const dstBefore = surface.data.slice();
      let clip = null;
      if (k.clip) {
        clip = new Uint8Array(DST_W * DST_H);
        for (let i = 0; i < clip.length; i++) clip[i] = rand() < 0.2 ? 0 : rand() < 0.5 ? MAX_BYTE : (rand() * MAX_BYTE) | 0;
      }
      let captured = null;
      globalThis.__cortexBlitImage = (d, dw, s, sw, p, c, smooth) => {
        captured = { p: Array.from(p), smooth };
        blitImage({ data: d, u32: new Uint32Array(d.buffer, d.byteOffset, d.length / BYTES_PER_PIXEL), width: dw }, { data: s, width: sw }, p, c, smooth);
        return true; // como o host: "feito"
      };
      const rect = k.rect ?? { sx: 0, sy: 0, sw: SRC_W, sh: SRC_H };
      drawBitmap(surface, src, { rect, matrix: k.matrix, smooth: k.smooth, alpha: k.alpha, clip, tint: null });
      out.push({ name: k.name, src: src.data, dstBefore, clip, expected: surface.data, ...captured });
    }
  } finally {
    globalThis.__cortexBlitImage = saved;
  }
  return out;
}

function bytes(name, arr) {
  const lines = [];
  for (let i = 0; i < arr.length; i += BYTES_PER_LINE) lines.push('  ' + Array.from(arr.subarray(i, i + BYTES_PER_LINE)).join(','));
  return `static const unsigned char ${name}[] = {\n${lines.join(',\n')}\n};\n`;
}

/** Texto do header (determinístico). */
export function buildGoldenHeader() {
  const cases = buildGoldenCases();
  let h = '// GERADO por native/scripts/gen-blit-golden.mjs (ADR-0318) — NÃO edite à mão.\n';
  h += '// Entradas e saída esperada do laço JS do drawImage; o C++ tem que bater byte a byte.\n';
  h += '#pragma once\n\nnamespace blit_golden {\n\n';
  h += `constexpr int kDstW = ${DST_W};\nconstexpr int kDstH = ${DST_H};\nconstexpr int kSrcW = ${SRC_W};\nconstexpr int kSrcH = ${SRC_H};\n\n`;
  cases.forEach((c, i) => {
    h += bytes(`c${i}_src`, c.src) + bytes(`c${i}_before`, c.dstBefore) + bytes(`c${i}_expected`, c.expected);
    if (c.clip) h += bytes(`c${i}_clip`, c.clip);
  });
  h += '\nstruct Case {\n  const char* name;\n  bool smooth;\n  double params[19];\n  const unsigned char* src;\n  const unsigned char* before;\n  const unsigned char* clip;\n  const unsigned char* expected;\n};\n\n';
  h += 'static const Case kCases[] = {\n';
  cases.forEach((c, i) => {
    const p = c.p.map((v) => (Number.isInteger(v) ? `${v}.0` : v.toPrecision(17))).join(', ');
    h += `  {"${c.name}", ${c.smooth}, {${p}}, c${i}_src, c${i}_before, ${c.clip ? `c${i}_clip` : 'nullptr'}, c${i}_expected},\n`;
  });
  h += '};\n\n}  // namespace blit_golden\n';
  return h;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(GOLDEN_PATH, buildGoldenHeader());
  console.log(`[blit-golden] ${GOLDEN_PATH}`);
}
