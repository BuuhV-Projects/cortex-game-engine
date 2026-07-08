/**
 * Loader de KTX2 (ADR-0108): o caminho NATIVO (host) — fetch → transcoder do
 * host → DataTexture — com o `__cortexTranscodeKtx2` e o `fetch` mockados. O
 * caminho browser (KTX2Loader/WASM) não é testado aqui (precisa de WebGL/WASM).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DataTexture } from 'three';
import { hasNativeKtx2, loadKtx2Native, loadKtx2 } from '../../src/core/loadKtx2.js';

const g = globalThis as Record<string, unknown>;

// Um "KTX2" fake de 4×2 px: o mock devolve RGBA direto (4*2*4 = 32 bytes).
function fakeTranscoder(width = 4, height = 2) {
  return vi.fn((bytes: Uint8Array) => {
    if (!bytes || bytes.byteLength === 0) return null;
    return { width, height, rgba: new Uint8Array(width * height * 4).fill(200).buffer };
  });
}

function mockFetch(bytes: Uint8Array, ok = true): void {
  g['fetch'] = vi.fn(async () => ({
    ok,
    status: ok ? 200 : 404,
    arrayBuffer: async () => bytes.buffer,
  }));
}

describe('loadKtx2 (caminho nativo)', () => {
  beforeEach(() => {
    delete g['__cortexTranscodeKtx2'];
    delete g['fetch'];
  });
  afterEach(() => {
    delete g['__cortexTranscodeKtx2'];
    delete g['fetch'];
  });

  it('hasNativeKtx2 reflete a presença do shim do host', () => {
    expect(hasNativeKtx2()).toBe(false);
    g['__cortexTranscodeKtx2'] = fakeTranscoder();
    expect(hasNativeKtx2()).toBe(true);
  });

  it('loadKtx2Native → DataTexture RGBA com as dimensões do transcode', async () => {
    g['__cortexTranscodeKtx2'] = fakeTranscoder(4, 2);
    mockFetch(new Uint8Array([1, 2, 3, 4]));
    const tex = await loadKtx2Native('t.ktx2');
    expect(tex).toBeInstanceOf(DataTexture);
    expect(tex.image.width).toBe(4);
    expect(tex.image.height).toBe(2);
    expect(tex.flipY).toBe(false); // convenção KTX2 (top-down)
    expect((tex.image.data as Uint8Array).length).toBe(4 * 2 * 4);
  });

  it('loadKtx2Native rejeita se o transcode falha (null)', async () => {
    g['__cortexTranscodeKtx2'] = vi.fn(() => null);
    mockFetch(new Uint8Array([1, 2, 3, 4]));
    await expect(loadKtx2Native('ruim.ktx2')).rejects.toThrow(/transcode falhou/);
  });

  it('loadKtx2Native rejeita em fetch !ok', async () => {
    g['__cortexTranscodeKtx2'] = fakeTranscoder();
    mockFetch(new Uint8Array([1]), false);
    await expect(loadKtx2Native('sumiu.ktx2')).rejects.toThrow(/não achei/);
  });

  it('loadKtx2 usa o caminho nativo quando o host tem o shim', async () => {
    const transcoder = fakeTranscoder(8, 8);
    g['__cortexTranscodeKtx2'] = transcoder;
    mockFetch(new Uint8Array([9, 9, 9]));
    const tex = await loadKtx2('assets/chao.ktx2');
    expect(tex).toBeInstanceOf(DataTexture);
    expect(transcoder).toHaveBeenCalledOnce();
    expect((tex as DataTexture).image.width).toBe(8);
  });
});
