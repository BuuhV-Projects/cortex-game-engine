/**
 * Política de encode do cook (ADR-0119): cor → UASTC + RDO + supercompressão
 * Zstd (ETC1S bandava os atlas de gradiente dos kits); ETC1S segue disponível
 * por opção. Valida direto no header KTX2 (offset 44 = supercompressionScheme:
 * 0 none, 1 BasisLZ/ETC1S, 2 Zstandard).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { encodeKtx2 } from '../../native/scripts/encode-ktx2.mjs';

// O encoder WASM não vive no git (native/tools/ é gitignorado): vem do
// fetch-deps.ps1 / fetch-basis-encoder.mjs. Sem ele (clone limpo), a suíte
// PULA em vez de quebrar o `yarn test`; o CI baixa o encoder antes de rodar
// (step "Fetch basis encoder" nos workflows), então lá ela roda de verdade.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const hasEncoder = fs.existsSync(path.join(repoRoot, 'native', 'tools', 'basis-encoder', 'basis_encoder.js'));

const KTX2_MAGIC = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
const SCHEME_OFFSET = 44;
const SCHEME_BASISLZ = 1;
const SCHEME_ZSTD = 2;

/** PNG 64×64 com degradê vertical (o caso que bandava em ETC1S). */
async function gradientPng(): Promise<Uint8Array> {
  const w = 64;
  const raw = Buffer.alloc(w * w * 3);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      raw[i] = Math.round((y / (w - 1)) * 255);
      raw[i + 1] = 128;
      raw[i + 2] = 255 - raw[i];
    }
  }
  return new Uint8Array(await sharp(raw, { raw: { width: w, height: w, channels: 3 } }).png().toBuffer());
}

function scheme(ktx2: Uint8Array): number {
  return new DataView(ktx2.buffer, ktx2.byteOffset).getUint32(SCHEME_OFFSET, true);
}

describe.runIf(hasEncoder)('encodeKtx2 (política ADR-0119)', () => {
  it('default (cor) = UASTC com supercompressão Zstd', async () => {
    const ktx2 = await encodeKtx2(await gradientPng());
    for (let i = 0; i < KTX2_MAGIC.length; i++) expect(ktx2[i]).toBe(KTX2_MAGIC[i]);
    expect(scheme(ktx2)).toBe(SCHEME_ZSTD); // requer o host com BASISD_SUPPORT_KTX2_ZSTD=1
  });

  it('linear sem RDO (normal map) também sai Zstd', async () => {
    const ktx2 = await encodeKtx2(await gradientPng(), { srgb: false, rdoScalar: 0 });
    expect(scheme(ktx2)).toBe(SCHEME_ZSTD);
  });

  it('uastc: false ainda produz ETC1S (BasisLZ) — opção de tamanho', async () => {
    const ktx2 = await encodeKtx2(await gradientPng(), { uastc: false });
    expect(scheme(ktx2)).toBe(SCHEME_BASISLZ);
  });
}, 60_000);
