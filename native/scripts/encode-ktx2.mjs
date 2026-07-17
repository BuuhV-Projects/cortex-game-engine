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

/**
 * Encoda os bytes de uma imagem (PNG/JPG) num KTX2 (Uint8Array).
 *
 * Modos (ADR-0119):
 * - `uastc: true` (DEFAULT pra COR) — UASTC + RDO + supercompressão Zstd.
 *   ETC1S quantiza gradiente suave em bandas visíveis ("camadas" nos atlas de
 *   paleta+degradê dos kits estilizados — PSNR ~37 dB vs ~53 dB do UASTC); o
 *   RDO + Zstd segura o tamanho (rock 1024²: 1,37 MB cru → 383 KB).
 *   Requer o host com BASISD_SUPPORT_KTX2_ZSTD=1.
 * - `uastc: false` — ETC1S (menor; ok pra textura sem gradiente suave).
 * - `rdoScalar` — força do RDO no UASTC (padrão 1.0; maior = menor/pior).
 */
// Módulo WASM memoizado — inicializar a cada chamada custava ~2s por textura
// (o cook converte centenas em lote).
let modulePromise = null;
function getModule() {
  if (!modulePromise) {
    const BASIS = loadEncoderFactory();
    // print/printErr no-op: silencia o log verboso do emscripten (Slice:…, stats).
    modulePromise = BASIS({ locateFile: (p) => path.join(encoderDir, p), print: () => {}, printErr: () => {} }).then(
      (Module) => {
        Module.initializeBasis();
        return Module;
      },
    );
  }
  return modulePromise;
}

export async function encodeKtx2(imageBytes, { uastc = true, srgb = true, quality = 128, rdoScalar = 1.0 } = {}) {
  const Module = await getModule();
  const enc = new Module.BasisEncoder();
  try {
    enc.setCreateKTX2File(true);
    enc.setSliceSourceImage(0, imageBytes, 0, 0, true); // true = imagem PNG (decodifica interno)
    enc.setPerceptual(srgb); // sRGB p/ cor
    enc.setMipSRGB(srgb);
    enc.setMipGen(true); // mipmaps
    enc.setUASTC(uastc);
    if (uastc) {
      enc.setKTX2UASTCSupercompression(true); // Zstd no arquivo (o pak não comprime)
      enc.setPackUASTCFlags(1); // nível "faster": 6× mais rápido, mesma qualidade medida
      if (rdoScalar > 0) {
        enc.setRDOUASTC(true); // torna o UASTC compressível sem perda visível
        enc.setRDOUASTCQualityScalar(rdoScalar);
        // Dicionário menor: encode 1024² cai de ~15s pra ~2,6s mantendo 52 dB
        // (medido no atlas do kit) — o default 4096 só valia no encoder nativo.
        enc.setRDOUASTCDictSize(1024);
      }
    } else {
      enc.setQualityLevel(quality);
    }
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
    console.error('uso: node encode-ktx2.mjs <in.png> <out.ktx2> [--etc1s] [--linear] [-q N]');
    process.exit(1);
  }
  const qi = args.indexOf('-q');
  const quality = qi >= 0 ? Number(args[qi + 1]) : 128;
  const bytes = new Uint8Array(readFileSync(input));
  // Default = UASTC+RDO+Zstd (ADR-0119); --etc1s opta pelo formato antigo (menor).
  const ktx2 = await encodeKtx2(bytes, { uastc: !flags.has('--etc1s'), srgb: !flags.has('--linear'), quality });
  writeFileSync(output, ktx2);
  const pct = ((1 - ktx2.length / bytes.length) * 100).toFixed(0);
  console.log(`[ktx2] ${input} (${bytes.length}) → ${output} (${ktx2.length})  −${pct}%`);
}
