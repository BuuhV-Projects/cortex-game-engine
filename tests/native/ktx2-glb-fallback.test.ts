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
import { ERR_BASIS_ENCODER_MISSING } from '../../native/scripts/encode-ktx2.mjs';

const encodeKtx2 = vi.hoisted(() => vi.fn());
vi.mock('../../native/scripts/encode-ktx2.mjs', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  encodeKtx2,
}));

const { convertGlbTextures } = await import('../../native/scripts/ktx2-glb.mjs');

/** Acima do piso de 16 KB do cook — abaixo dele a textura seria pulada. */
const ABOVE_MIN_SOURCE_BYTES = 32 * 1024;

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

  it('falha de UMA textura (formato incomum) segue pulando só ela', async () => {
    encodeKtx2
      .mockRejectedValueOnce(new Error('formato não suportado'))
      .mockResolvedValue(new Uint8Array(1024));

    const doc = docWithTextures(3);
    const n = await convertGlbTextures(doc);

    expect(encodeKtx2).toHaveBeenCalledTimes(3);
    expect(n).toBe(2);
    expect(warn).not.toHaveBeenCalled();
  });
});
