/**
 * SPEC-0287: `loadKtx2Native` usa o transcode ASSÍNCRONO do host
 * (`__cortexTranscodeKtx2Async`, worker fora da thread JS) quando existe, cai no
 * síncrono em host antigo, transforma reject em erro e mantém a marcação
 * `cortexNativeKtx2` da SPEC-0286.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CompressedTexture } from 'three';
import { NATIVE_KTX2_FLAG, loadKtx2Native } from '../../src/core/loadKtx2.js';

const g = globalThis as Record<string, unknown>;
const SIZE = 8;
const BC7_BLOCK_BYTES = 16;
const LEVEL_COUNT = 2;

function bc7Result() {
  return {
    width: SIZE,
    height: SIZE,
    format: 'bc7' as const,
    levels: Array.from({ length: LEVEL_COUNT }, () => new ArrayBuffer(BC7_BLOCK_BYTES)),
  };
}

function resetHost(): void {
  delete g['__cortexTranscodeKtx2'];
  delete g['__cortexTranscodeKtx2Async'];
  delete g['fetch'];
}

describe('loadKtx2Native: transcode assíncrono (SPEC-0287)', () => {
  beforeEach(() => {
    resetHost();
    g['fetch'] = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }));
  });
  afterEach(resetHost);

  it('usa o async quando presente (e não toca no síncrono)', async () => {
    const sync = vi.fn(bc7Result);
    const async_ = vi.fn(async () => bc7Result());
    g['__cortexTranscodeKtx2'] = sync;
    g['__cortexTranscodeKtx2Async'] = async_;
    const tex = await loadKtx2Native('a.ktx2');
    expect(async_).toHaveBeenCalledOnce();
    expect(sync).not.toHaveBeenCalled();
    expect(tex).toBeInstanceOf(CompressedTexture);
    expect((tex as CompressedTexture).mipmaps).toHaveLength(LEVEL_COUNT);
  });

  it('cai no síncrono quando o host não tem o async', async () => {
    const sync = vi.fn(bc7Result);
    g['__cortexTranscodeKtx2'] = sync;
    const tex = await loadKtx2Native('b.ktx2');
    expect(sync).toHaveBeenCalledOnce();
    expect(tex).toBeInstanceOf(CompressedTexture);
  });

  it('reject do async vira Error com a URL', async () => {
    g['__cortexTranscodeKtx2'] = vi.fn(bc7Result);
    g['__cortexTranscodeKtx2Async'] = vi.fn(async () => {
      throw new Error('transcode falhou no host');
    });
    await expect(loadKtx2Native('ruim.ktx2')).rejects.toThrow(/ruim\.ktx2.*transcode falhou/);
  });

  it('mantém a marcação cortexNativeKtx2 (SPEC-0286) no caminho async', async () => {
    g['__cortexTranscodeKtx2'] = vi.fn(bc7Result);
    g['__cortexTranscodeKtx2Async'] = vi.fn(async () => bc7Result());
    const tex = await loadKtx2Native('c.ktx2');
    expect(tex.userData[NATIVE_KTX2_FLAG]).toBe(true);
  });
});
