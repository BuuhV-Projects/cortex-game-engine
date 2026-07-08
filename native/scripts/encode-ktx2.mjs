// Encoder PNG/JPG → KTX2 (Basis) via basis_encoder WASM (ADR-0108, pipeline M2).
// Roda no Node, sem instalar nada — o .wasm fica em native/tools/basis-encoder/
// (baixado pelo fetch-deps). É ferramenta de BUILD (converter assets), não vai
// pro runtime.
//
// Uso: node native/scripts/encode-ktx2.mjs <in.png> <out.ktx2> [--uastc] [--linear] [-q N]
//   ETC1S (default) = menor; --uastc = maior qualidade/tamanho.
//   --linear pra normal maps / dados (sem sRGB). -q 1..255 (qualidade ETC1S).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const encoderDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'basis-encoder');

// O glue do emscripten não expõe a factory via require() no Node 24; carregamos
// com module controlado (mesmo efeito de um require que funciona).
function loadEncoderFactory() {
  const src = readFileSync(path.join(encoderDir, 'basis_encoder.js'), 'utf8');
  const m = { exports: {} };
  new Function('module', 'exports', 'require', '__dirname', src)(m, m.exports, require, encoderDir);
  if (typeof m.exports !== 'function') throw new Error('basis_encoder: factory não encontrada');
  return m.exports;
}

/** Encoda os bytes de uma imagem (PNG/JPG) num KTX2 (Uint8Array). */
export async function encodeKtx2(imageBytes, { uastc = false, srgb = true, quality = 128 } = {}) {
  const BASIS = loadEncoderFactory();
  const Module = await BASIS({ locateFile: (p) => path.join(encoderDir, p) });
  Module.initializeBasis();
  const enc = new Module.BasisEncoder();
  try {
    enc.setCreateKTX2File(true);
    enc.setSliceSourceImage(0, imageBytes, 0, 0, true); // true = imagem PNG (decodifica interno)
    enc.setPerceptual(srgb); // sRGB p/ cor
    enc.setMipSRGB(srgb);
    enc.setMipGen(true); // mipmaps
    enc.setUASTC(uastc); // false = ETC1S (menor)
    if (!uastc) enc.setQualityLevel(quality);
    // Buffer de saída generoso (o encode devolve o tamanho real usado).
    const out = new Uint8Array(1024 * 1024 * 24);
    const len = enc.encode(out);
    if (!len) throw new Error('encode: falhou (0 bytes)');
    return out.slice(0, len);
  } finally {
    enc.delete();
  }
}

// CLI (só quando executado direto, não quando importado)
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('-')));
  const [input, output] = args.filter((a) => !a.startsWith('-'));
  if (!input || !output) {
    console.error('uso: node encode-ktx2.mjs <in.png> <out.ktx2> [--uastc] [--linear] [-q N]');
    process.exit(1);
  }
  const qi = args.indexOf('-q');
  const quality = qi >= 0 ? Number(args[qi + 1]) : 128;
  const bytes = new Uint8Array(readFileSync(input));
  const ktx2 = await encodeKtx2(bytes, { uastc: flags.has('--uastc'), srgb: !flags.has('--linear'), quality });
  writeFileSync(output, ktx2);
  const pct = ((1 - ktx2.length / bytes.length) * 100).toFixed(0);
  console.log(`[ktx2] ${input} (${bytes.length}) → ${output} (${ktx2.length})  −${pct}%`);
}
