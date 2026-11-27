/**
 * Fallback do cook quando o encoder basis NÃO está instalado (SPEC-0177).
 *
 * O encoder WASM não vive no git nem no `.exe` antigo do Studio; sem ele o
 * `encodeKtx2` lançava e o `catch { continue }` do ktx2-glb engolia POR
 * TEXTURA — o export terminava "ok" e sem um único KTX2, sem avisar ninguém.
 * Agora o erro é tipado: avisa uma vez e desiste do GLB.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Document } from '@gltf-transform/core';
import sharp from 'sharp';
import { ERR_BASIS_ENCODER_MISSING, ERR_NATIVE_ENCODER_MISSING } from '../../native/scripts/encode-ktx2.mjs';

const encodeKtx2 = vi.hoisted(() => vi.fn());
vi.mock('../../native/scripts/encode-ktx2.mjs', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  encodeKtx2,
}));

const { convertGlbTextures, resetKtx2GlbWarnings } = await import('../../native/scripts/ktx2-glb.mjs');

/** Acima do piso de 16 KB do cook — abaixo dele a textura seria pulada. */
const ABOVE_MIN_SOURCE_BYTES = 32 * 1024;

const RGB = 3;
const KTX2_FAKE_BYTES = 1024;

/** JPG liso de `dim`² (poucos KB: abaixo do piso antigo por bytes). */
async function jpegOf(dim: number): Promise<Uint8Array> {
  const data = Buffer.alloc(dim * dim * RGB, 200);
  return new Uint8Array(await sharp(data, { raw: { width: dim, height: dim, channels: RGB } }).jpeg().toBuffer());
}

function docWithTextures(count: number): Document {
  const doc = new Document();
  for (let i = 0; i < count; i++) {
    doc
      .createTexture(`tex${i}`)
      .setImage(new Uint8Array(ABOVE_MIN_SOURCE_BYTES))
      .setMimeType('image/png');
  }
  return doc;
}

describe('convertGlbTextures — encoder ausente', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    encodeKtx2.mockReset();
    resetKtx2GlbWarnings();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => warn.mockRestore());

  it('desiste do GLB na primeira textura e avisa (não tenta as demais)', async () => {
    const err = Object.assign(new Error('basis_encoder ausente'), { code: ERR_BASIS_ENCODER_MISSING });
    encodeKtx2.mockRejectedValue(err);

    const n = await convertGlbTextures(docWithTextures(3));

    expect(n).toBe(0);
    expect(encodeKtx2).toHaveBeenCalledTimes(1); // desistiu, não insistiu 3×
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/encoder basis ausente/);
  });

  it('falha de UMA textura pula só ela, avisa com GLB, índice, dimensões e motivo e conta (SPEC-0750)', async () => {
    encodeKtx2
      .mockRejectedValueOnce(Object.assign(new Error('formato de imagem desconhecido'), { code: 'ERR_IMAGE_FORMAT_UNKNOWN' }))
      .mockResolvedValue(new Uint8Array(1024));

    const stats: Record<string, unknown> = {};
    const doc = docWithTextures(3);
    const n = await convertGlbTextures(doc, undefined, { label: 'kit/a.glb', stats });

    expect(encodeKtx2).toHaveBeenCalledTimes(3);
    expect(n).toBe(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/kit\/a\.glb textura #0 \(0×0, image\/png\): formato de imagem desconhecido/);
    expect(stats).toEqual({ texKept: 1, texKeptReasons: { ERR_IMAGE_FORMAT_UNKNOWN: 1 } });
  });

  it('o piso é por texels: JPG pequeno em bytes mas de 256² converte, o de 32² não (SPEC-0750)', async () => {
    encodeKtx2.mockResolvedValue(new Uint8Array(KTX2_FAKE_BYTES));
    const doc = new Document();
    doc.createTexture('big').setImage(await jpegOf(256)).setMimeType('image/jpeg');
    doc.createTexture('tiny').setImage(await jpegOf(32)).setMimeType('image/jpeg');

    const n = await convertGlbTextures(doc);

    expect(n).toBe(1);
    expect(encodeKtx2).toHaveBeenCalledTimes(1); // o de 32² nem passa pelo encode
  });

  it('sem o basisu nativo, a textura grande fica com o original e conta o motivo; as outras seguem (SPEC-0750)', async () => {
    const missing = Object.assign(new Error('encoder nativo basisu ausente (rode native/scripts/build-basisu.ps1)'), {
      code: ERR_NATIVE_ENCODER_MISSING,
    });
    encodeKtx2.mockRejectedValueOnce(missing).mockResolvedValue(new Uint8Array(KTX2_FAKE_BYTES));
    const doc = new Document();
    const big = doc.createTexture('big').setImage(await jpegOf(256)).setMimeType('image/jpeg');
    const other = doc.createTexture('other').setImage(await jpegOf(128)).setMimeType('image/jpeg');
    const original = big.getImage();
    const stats: Record<string, unknown> = {};

    const n = await convertGlbTextures(doc, undefined, { label: 'npc.glb', stats });

    expect(n).toBe(1);
    expect(big.getMimeType()).toBe('image/jpeg');
    expect(big.getImage()).toBe(original);
    expect(other.getMimeType()).toBe('image/ktx2');
    expect(stats).toEqual({ texKept: 1, texKeptReasons: { ERR_NATIVE_ENCODER_MISSING: 1 } });
    expect(warn.mock.calls[0][0]).toMatch(/npc\.glb textura #0 \(256×256, image\/jpeg\): .*build-basisu\.ps1\) — mantém o original/);
  });

  it('o basisu nativo ausente avisa uma vez por processo e conta cada textura', async () => {
    resetKtx2GlbWarnings();
    const missing = Object.assign(new Error('basisu ausente (rode native/scripts/build-basisu.ps1)'), {
      code: ERR_NATIVE_ENCODER_MISSING,
    });
    encodeKtx2.mockRejectedValue(missing);
    const doc = new Document();
    for (const name of ['a', 'b', 'c']) doc.createTexture(name).setImage(await jpegOf(256)).setMimeType('image/jpeg');
    const stats: Record<string, unknown> = {};

    await convertGlbTextures(doc, undefined, { label: 'npc.glb', stats });
    await convertGlbTextures(doc, undefined, { label: 'npc2.glb', stats });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(stats).toEqual({ texKept: 6, texKeptReasons: { ERR_NATIVE_ENCODER_MISSING: 6 } });
  });

  it('avisa cada textura ANTES do encode, pro modal do export (SPEC-0699)', async () => {
    const seen: string[] = [];
    encodeKtx2.mockImplementation(async () => {
      seen.push('encode');
      return new Uint8Array(1024);
    });

    await convertGlbTextures(docWithTextures(2), (i: number, n: number) => seen.push(`tex ${i}/${n}`));

    expect(seen).toEqual(['tex 1/2', 'encode', 'tex 2/2', 'encode']);
  });
});
