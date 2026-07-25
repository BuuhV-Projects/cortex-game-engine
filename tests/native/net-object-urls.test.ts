/**
 * TDR-0004 — object URLs do shim de rede (ADR-0153): o GLTFLoader cria `blob:`
 * pra texturas embutidas; sem revoke/despejo os bytes ficavam retidos no Map.
 * `__cortexClearObjectUrls` é o despejo que o `clearSceneAssetCaches` aciona.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// @ts-expect-error — shim JS do host, sem d.ts
import { installNetShims } from '../../native/js/src/shims/net.js';

// installNetShims sobrescreve globals (URL/Blob/fetch…) — restaura no fim.
const saved: Record<string, unknown> = {};
const GLOBALS = ['URL', 'Blob', 'Headers', 'Request', 'Response', 'fetch', 'AbortController', 'AbortSignal'];

beforeEach(() => {
  for (const g of GLOBALS) saved[g] = (globalThis as Record<string, unknown>)[g];
  vi.stubGlobal('__cortexReadFile', () => null);
  installNetShims();
});

afterEach(() => {
  for (const g of GLOBALS) (globalThis as Record<string, unknown>)[g] = saved[g];
  vi.unstubAllGlobals();
});

describe('object URLs do host (ADR-0153/TDR-0004)', () => {
  it('createObjectURL registra, revoke remove, clear despeja tudo', async () => {
    const g = globalThis as Record<string, unknown>;
    const URLLite = g['URL'] as {
      createObjectURL(b: unknown): string;
      revokeObjectURL(k: string): void;
    };
    const BlobLite = g['Blob'] as new (parts: unknown[]) => unknown;

    const blobA = new BlobLite([new Uint8Array(4)]);
    const blobB = new BlobLite([new Uint8Array(4)]);
    const a = URLLite.createObjectURL(blobA);
    const b = URLLite.createObjectURL(blobB);
    expect(a).not.toBe(b);
    expect(a.startsWith('blob:')).toBe(true);

    // fetch resolve o blob: registrado…
    const fetchLite = g['fetch'] as (u: string) => Promise<{ ok: boolean }>;
    expect((await fetchLite(a)).ok).toBe(true);

    // …revoke tira UM; clear despeja o resto (SPEC-0152).
    URLLite.revokeObjectURL(a);
    expect((await fetchLite(a)).ok).toBe(false);
    const clear = g['__cortexClearObjectUrls'] as () => void;
    expect(typeof clear).toBe('function');
    clear();
    expect((await fetchLite(b)).ok).toBe(false);
  });
});
