/**
 * O cook converte JPG e fonte acima do teto do encoder WASM sem reduzir (SPEC-0750).
 *
 * O formato sai da assinatura e as dimensões do header (IHDR do PNG, SOF do JPG).
 * Dentro do teto (12.582.912 texels) o WASM encoda PNG e JPG; acima dele, o
 * basisu nativo (C++) encoda nas dimensões ORIGINAIS. As partes de header rodam
 * sempre; o encode pula sem o WASM ou sem o exe (fora do git, como em
 * encode-ktx2.test.ts).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  ERR_IMAGE_DECODE,
  ERR_IMAGE_FORMAT_UNKNOWN,
  detectImageFormat,
  readImageHeader,
  // @ts-expect-error — módulo .mjs do toolchain do export, sem .d.ts
} from '../../native/scripts/image-header.mjs';
import {
  encodeKtx2,
  ENCODER_MAX_SOURCE_TEXELS,
  ERR_NATIVE_ENCODER_MISSING,
  ERR_NOT_BLOCK_ALIGNED,
  outputBufferBytes,
  planEncode,
  // @ts-expect-error — módulo .mjs do toolchain do export, sem .d.ts
} from '../../native/scripts/encode-ktx2.mjs';
// @ts-expect-error — módulo .mjs do toolchain do export, sem .d.ts
import { basisuArgs, DEFAULT_BASISU_PATH } from '../../native/scripts/encode-ktx2-native.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const hasEncoder = fs.existsSync(path.join(repoRoot, 'native', 'tools', 'basis-encoder', 'basis_encoder.js'));
const hasNative = fs.existsSync(DEFAULT_BASISU_PATH);

const KTX2_MAGIC = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
const KTX2_WIDTH_OFFSET = 20;
const KTX2_HEIGHT_OFFSET = 24;
const RGB = 3;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// Campos do header KTX2 e do bloco básico do DFD (especificação KTX 2.0).
const KTX2_SUPERCOMPRESSION_OFFSET = 44;
const KTX2_SUPERCOMPRESSION_ZSTD = 2;
const KTX2_DFD_OFFSET_FIELD = 48;
/** dfdTotalSize (4) + vendor/tipo (4) + versão/tamanho (4) + colorModel (1) + colorPrimaries (1). */
const DFD_TRANSFER_FUNCTION_OFFSET = 14;
const KHR_DF_TRANSFER_SRGB = 2;
/** Lado acima do teto do WASM (3600² = 12.960.000 texels) e múltiplo de 4. */
const OVER_LIMIT_DIM = 3600;
const NATIVE_TIMEOUT_MS = 180_000;

/** RGB com degradê (o JPG não fica trivial). */
function gradientRgb(w: number, h: number): Buffer {
  const data = Buffer.alloc(w * h * RGB);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * RGB;
      data[o] = Math.round((x / Math.max(1, w - 1)) * 255);
      data[o + 1] = Math.round((y / Math.max(1, h - 1)) * 255);
      data[o + 2] = 96;
    }
  }
  return data;
}

const raw = (w: number, h: number) => sharp(gradientRgb(w, h), { raw: { width: w, height: h, channels: RGB } });
const makePng = async (w: number, h: number) => new Uint8Array(await raw(w, h).png({ compressionLevel: 1 }).toBuffer());
const makeJpeg = async (w: number, h: number, progressive = false) =>
  new Uint8Array(await raw(w, h).jpeg({ progressive }).toBuffer());

/** Só a assinatura + IHDR de um PNG `w`×`h` (o header basta pra planejar o encode). */
function pngHeaderOnly(w: number, h: number): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes.set(PNG_SIGNATURE);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR
  view.setUint32(16, w);
  view.setUint32(20, h);
  return bytes;
}

function header(ktx2: Uint8Array): { magic: boolean; width: number; height: number } {
  const view = new DataView(ktx2.buffer, ktx2.byteOffset);
  return {
    magic: KTX2_MAGIC.every((b, i) => ktx2[i] === b),
    width: view.getUint32(KTX2_WIDTH_OFFSET, true),
    height: view.getUint32(KTX2_HEIGHT_OFFSET, true),
  };
}

describe('image-header — formato e dimensões pelo header', () => {
  it('reconhece PNG e JPG pelos bytes, não pelo mimeType', async () => {
    expect(detectImageFormat(await makePng(8, 8))).toBe('png');
    expect(detectImageFormat(await makeJpeg(8, 8))).toBe('jpeg');
    expect(detectImageFormat(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBeNull(); // RIFF (WebP)
  });

  it('PNG pelo IHDR, JPG baseline e progressivo pelo SOF', async () => {
    expect(readImageHeader(await makePng(40, 24))).toEqual({ format: 'png', width: 40, height: 24 });
    expect(readImageHeader(await makeJpeg(40, 24))).toEqual({ format: 'jpeg', width: 40, height: 24 });
    expect(readImageHeader(await makeJpeg(40, 24, true))).toEqual({ format: 'jpeg', width: 40, height: 24 });
  });

  it('o SOF é achado depois de FF de enchimento, TEM, APP e DHT', () => {
    const jpg = new Uint8Array([
      0xff, 0xd8, // SOI
      0xff, 0xff, 0xff, 0x01, // enchimento + TEM (sem tamanho)
      0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, // APP0 de 4 bytes
      0xff, 0xc4, 0x00, 0x03, 0x00, // DHT (C4 não é SOF)
      0xff, 0xff, 0xc2, 0x00, 0x08, 0x08, 0x01, 0x10, 0x02, 0x00, 0x01, // SOF2: 272 de altura, 512 de largura
    ]);
    expect(readImageHeader(jpg)).toEqual({ format: 'jpeg', width: 512, height: 272 });
  });

  it('JPG sem SOF dá ERR_IMAGE_DECODE; formato desconhecido, o motivo com a assinatura', () => {
    expect(() => readImageHeader(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]))).toThrow(
      expect.objectContaining({ code: ERR_IMAGE_DECODE }),
    );
    expect(() => readImageHeader(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0]))).toThrow(
      expect.objectContaining({ code: ERR_IMAGE_FORMAT_UNKNOWN, message: expect.stringMatching(/52 49 46 46/) }),
    );
  });
});

describe('encode-ktx2 — plano do encode (sem redução)', () => {
  it('dentro do teto vai pro WASM; acima, pro basisu nativo nas mesmas dimensões', () => {
    expect(planEncode(pngHeaderOnly(2048, 2048))).toEqual({ format: 'png', width: 2048, height: 2048, encoder: 'wasm' });
    expect(4096 * 4096).toBeGreaterThan(ENCODER_MAX_SOURCE_TEXELS);
    expect(planEncode(pngHeaderOnly(4096, 4096))).toEqual({ format: 'png', width: 4096, height: 4096, encoder: 'native' });
  });

  it('dimensão fora dos blocos 4×4 dá ERR_NOT_BLOCK_ALIGNED', async () => {
    expect(() => planEncode(pngHeaderOnly(30, 32))).toThrow(expect.objectContaining({ code: ERR_NOT_BLOCK_ALIGNED }));
    await expect(encodeKtx2(pngHeaderOnly(64, 66))).rejects.toMatchObject({ code: ERR_NOT_BLOCK_ALIGNED });
  });

  it('sem o basisu nativo, a fonte acima do teto dá ERR_NATIVE_ENCODER_MISSING com a instrução', async () => {
    const missing = path.join(os.tmpdir(), 'cortex-sem-basisu', 'basisu.exe');
    await expect(encodeKtx2(pngHeaderOnly(4096, 4096), { basisuPath: missing })).rejects.toMatchObject({
      code: ERR_NATIVE_ENCODER_MISSING,
      message: expect.stringMatching(/build-basisu\.ps1/),
    });
  });

  it('os argumentos do basisu repetem os parâmetros do WASM', () => {
    const color = basisuArgs({ uastc: true, srgb: true, quality: 128, rdoScalar: 1 }, 'in.png', 'out.ktx2');
    expect(color).toEqual(expect.arrayContaining(['-ktx2', '-mipmap', '-srgb', '-uastc', '-uastc_rdo_l', '1', '-uastc_rdo_d', '1024']));
    expect(color.slice(color.indexOf('-uastc_level'), color.indexOf('-uastc_level') + 2)).toEqual(['-uastc_level', '1']);
    expect(color.slice(-4)).toEqual(['-file', 'in.png', '-output_file', 'out.ktx2']);
    const data = basisuArgs({ uastc: true, srgb: false, quality: 128, rdoScalar: 0 }, 'a', 'b');
    expect(data).toContain('-linear');
    expect(data).not.toContain('-uastc_rdo_l');
    expect(basisuArgs({ uastc: false, srgb: true, quality: 200, rdoScalar: 1 }, 'a', 'b')).toEqual(
      expect.arrayContaining(['-etc1s', '-q', '200']),
    );
  });

  it('o buffer de saída do WASM cresce com a textura e cabe o UASTC com mips', () => {
    const texels = 2048 * 2048;
    expect(outputBufferBytes(2048, 2048)).toBeGreaterThan(Math.ceil((texels * 4) / 3));
    expect(outputBufferBytes(256, 256)).toBeLessThan(outputBufferBytes(2048, 2048));
  });
});

describe.runIf(hasEncoder)('encodeKtx2 pelo WASM com PNG e JPG (SPEC-0750)', () => {
  it('JPG baseline e progressivo viram KTX2 com as dimensões da fonte', async () => {
    expect(header(await encodeKtx2(await makeJpeg(64, 32)))).toEqual({ magic: true, width: 64, height: 32 });
    expect(header(await encodeKtx2(await makeJpeg(64, 32, true)))).toEqual({ magic: true, width: 64, height: 32 });
  });

  it('PNG pequeno segue pelo decoder do basis', async () => {
    expect(header(await encodeKtx2(await makePng(32, 32)))).toEqual({ magic: true, width: 32, height: 32 });
  });

  it('formato desconhecido rejeita com o motivo (não "0 bytes")', async () => {
    await expect(encodeKtx2(new Uint8Array(64))).rejects.toMatchObject({ code: ERR_IMAGE_FORMAT_UNKNOWN });
  });
});

describe.runIf(hasNative)('encodeKtx2 pelo basisu nativo acima do teto (SPEC-0750)', () => {
  it(
    'PNG de 3600² vira KTX2 de 3600² (sem reduzir) e o temporário sai',
    async () => {
      const tmpBefore = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('cortex-basisu-'));
      const ktx2 = await encodeKtx2(await makePng(OVER_LIMIT_DIM, OVER_LIMIT_DIM), { srgb: false, rdoScalar: 0 });
      expect(header(ktx2)).toEqual({ magic: true, width: OVER_LIMIT_DIM, height: OVER_LIMIT_DIM });
      const tmpAfter = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('cortex-basisu-'));
      expect(tmpAfter.sort()).toEqual(tmpBefore.sort());
    },
    NATIVE_TIMEOUT_MS,
  );

  it(
    'a cor (padrão: sRGB com RDO) sai com transfer function sRGB no DFD e Zstd',
    async () => {
      const ktx2 = await encodeKtx2(await makePng(OVER_LIMIT_DIM, OVER_LIMIT_DIM));
      const view = new DataView(ktx2.buffer, ktx2.byteOffset, ktx2.byteLength);
      expect(header(ktx2)).toEqual({ magic: true, width: OVER_LIMIT_DIM, height: OVER_LIMIT_DIM });
      expect(view.getUint32(KTX2_SUPERCOMPRESSION_OFFSET, true)).toBe(KTX2_SUPERCOMPRESSION_ZSTD);
      const dfd = view.getUint32(KTX2_DFD_OFFSET_FIELD, true);
      expect(ktx2[dfd + DFD_TRANSFER_FUNCTION_OFFSET]).toBe(KHR_DF_TRANSFER_SRGB);
    },
    NATIVE_TIMEOUT_MS,
  );
});
