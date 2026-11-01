/**
 * SPEC-0651 — DecompressionStream do host: streams em JS (`streams.js`), inflate em C++ (`__cortexInflate`,
 * emulado aqui pelo zlib do Node). Cobre o caminho exato do `png16.ts` do Port Hollow.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import zlib from 'node:zlib';
// @ts-expect-error — shim JS do host, sem d.ts
import { installNetShims } from '../../native/js/src/shims/net.js';
// @ts-expect-error — shim JS do host, sem d.ts
import { installStreamShims } from '../../native/js/src/shims/streams.js';

type G = Record<string, unknown>;
const g = globalThis as G;
const GLOBALS = ['URL', 'Blob', 'Headers', 'Request', 'Response', 'fetch', 'AbortController', 'AbortSignal'];
const STREAM_GLOBALS = ['ReadableStream', 'WritableStream', 'DecompressionStream'];
const saved: G = {};

function hostInflate(bytes: Uint8Array, format: string): ArrayBuffer | null {
  try {
    const out = format === 'deflate' ? zlib.inflateSync(bytes) : format === 'deflate-raw' ? zlib.inflateRawSync(bytes) : zlib.gunzipSync(bytes);
    return new Uint8Array(out).buffer;
  } catch {
    return null;
  }
}

beforeEach(() => {
  for (const k of GLOBALS) saved[k] = g[k];
  // O Node tem streams nativos: some com eles para o install pôr os do host.
  for (const k of STREAM_GLOBALS) vi.stubGlobal(k, undefined);
  vi.stubGlobal('__cortexReadFile', () => new Uint8Array([1, 2, 3]).buffer);
  vi.stubGlobal('__cortexInflate', vi.fn(hostInflate));
  installNetShims();
  installStreamShims();
});

afterEach(() => {
  for (const k of GLOBALS) g[k] = saved[k];
  vi.unstubAllGlobals();
});

const TEXT = 'cortex cortex cortex!';
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

/** Mesmo código do `inflate` do `utils/png16.ts` do jogo. */
async function inflateLikeTheGame(z: Uint8Array, format = 'deflate'): Promise<Uint8Array> {
  const BlobH = g['Blob'] as typeof Blob;
  const DS = g['DecompressionStream'] as typeof DecompressionStream;
  const ResponseH = g['Response'] as typeof Response;
  const stream = new BlobH([z as BlobPart]).stream().pipeThrough(new DS(format as CompressionFormat));
  return new Uint8Array(await new ResponseH(stream).arrayBuffer());
}

describe('DecompressionStream do host (SPEC-0651)', () => {
  it('instala os streams do host quando o global falta', () => {
    expect(typeof g['ReadableStream']).toBe('function');
    expect(typeof g['DecompressionStream']).toBe('function');
  });

  it('descomprime pelo caminho do png16.ts (deflate)', async () => {
    const out = await inflateLikeTheGame(zlib.deflateSync(enc(TEXT)));
    expect(new TextDecoder().decode(out)).toBe(TEXT);
    // Uma travessia de ponte só, no close.
    expect(g['__cortexInflate']).toHaveBeenCalledTimes(1);
  });

  it('deflate-raw e gzip', async () => {
    expect(new TextDecoder().decode(await inflateLikeTheGame(zlib.deflateRawSync(enc(TEXT)), 'deflate-raw'))).toBe(TEXT);
    expect(new TextDecoder().decode(await inflateLikeTheGame(zlib.gzipSync(enc(TEXT)), 'gzip'))).toBe(TEXT);
  });

  it('dado inválido rejeita com TypeError', async () => {
    await expect(inflateLikeTheGame(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).rejects.toBeInstanceOf(TypeError);
  });

  it('formato desconhecido lança no construtor', () => {
    const DS = g['DecompressionStream'] as new (f: string) => unknown;
    expect(() => new DS('brotli')).toThrow(TypeError);
  });

  it('chunk que não é bytes erra o lado legível', async () => {
    const DS = g['DecompressionStream'] as new (f: string) => { readable: ReadableStream; writable: WritableStream };
    const ds = new DS('deflate');
    const writer = ds.writable.getWriter();
    await expect(writer.write('texto' as unknown as Uint8Array)).rejects.toBeInstanceOf(TypeError);
  });

  it('vários chunks, pull e async iteration', async () => {
    const RS = g['ReadableStream'] as typeof ReadableStream;
    const z = zlib.deflateSync(enc(TEXT));
    let at = 0;
    const source = new RS<Uint8Array>({
      pull(c) {
        if (at >= z.length) return c.close();
        c.enqueue(z.subarray(at, at + 4));
        at += 4;
      },
    });
    const DS = g['DecompressionStream'] as typeof DecompressionStream;
    const parts: Uint8Array[] = [];
    for await (const chunk of source.pipeThrough(new DS('deflate')) as unknown as AsyncIterable<Uint8Array>) parts.push(chunk);
    expect(new TextDecoder().decode(parts[0])).toBe(TEXT);
  });

  it('Response com a assinatura do navegador', async () => {
    const ResponseH = g['Response'] as typeof Response;
    const r = new ResponseH('{"a":1}', { status: 201 });
    expect(r.ok).toBe(true);
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ a: 1 });
    expect(new ResponseH(null, { status: 404 }).ok).toBe(false);
    expect(await new ResponseH().text()).toBe('');
  });

  it('fetch do host segue sem `body` (FileLoader do three não vira streaming)', async () => {
    const fetchH = g['fetch'] as (u: string) => Promise<Response>;
    const r = await fetchH('asset.bin');
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(r.url).toBe('asset.bin');
    expect(r.body).toBeUndefined();
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(new Uint8Array(await r.clone().arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
});
