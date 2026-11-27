/**
 * SPEC-0748 / ADR-0749 — o RGBA da imagem PNG/JPG se solta depois do upload
 * (copyExternalImageToTexture) e se refaz dos bytes comprimidos sob demanda.
 * O decoder nativo (__cortexDecodeImage) é simulado: os "bytes comprimidos"
 * são [largura, altura] e cada linha y do RGBA decodificado vale y.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// @ts-expect-error — shim JS do host, sem d.ts
import { installImageShims } from '../../native/js/src/shims/image.js';
// @ts-expect-error — shim JS do host, sem d.ts
import { installWebGpuExtras } from '../../native/js/src/shims/webgpu-extras.js';
import {
  formatImageReleaseStats,
  imageReleaseStats,
  RELEASE_DELAY_MS,
  SWEEP_INTERVAL_MS,
  sweepPendingReleases,
  wrapQueueRelease,
  // @ts-expect-error — shim JS do host, sem d.ts
} from '../../native/js/src/shims/image-pixels.js';

const BYTES_PER_PIXEL = 4;
const WIDTH = 2;
const HEIGHT = 3;

type Bitmap = {
  width: number;
  height: number;
  rgba: ArrayBuffer | null;
  close(): void;
  __cortexReleasePixels?: () => void;
};
type Queue = {
  copyExternalImageToTexture(src: { source: unknown }, dst: unknown, size: unknown): void;
  submit(): void;
};
type CreateBitmap = (source: unknown, options?: { imageOrientation?: string }) => Promise<Bitmap>;

const SAVED = ['createImageBitmap', 'ImageBitmap', 'Image', 'HTMLImageElement', '__cortexImageReleaseStats'];
const saved: Record<string, unknown> = {};
const g = globalThis as Record<string, unknown>;
let decodeCalls: number[] = [];
let uploads: Array<number[] | null> = [];
/** Relógio falso do performance.now: só cresce, entre testes também (a varredura guarda a última hora). */
let clock = 0;
const TEST_CLOCK_STEP_MS = 100_000;

function fakeDecode(bytes: ArrayBuffer) {
  const head = new Uint8Array(bytes);
  decodeCalls.push(bytes.byteLength);
  const width = head[0]!;
  const height = head[1]!;
  const rgba = new Uint8Array(width * height * BYTES_PER_PIXEL);
  for (let y = 0; y < height; y++) rgba.fill(y, y * width * BYTES_PER_PIXEL, (y + 1) * width * BYTES_PER_PIXEL);
  return { width, height, rgba: rgba.buffer };
}

/** Valor de cada linha do RGBA (a primeira componente do primeiro pixel). */
function rows(rgba: ArrayBuffer | null, width: number, height: number): number[] | null {
  if (!rgba) return null;
  const data = new Uint8Array(rgba);
  return Array.from({ length: height }, (_, y) => data[y * width * BYTES_PER_PIXEL]!);
}

/** Fila falsa que lê `source.rgba` como o nativo (getNamed, getter incluso). */
function fakeQueue(): Queue {
  return {
    copyExternalImageToTexture(src: { source: unknown }) {
      const image = src.source as Bitmap;
      uploads.push(rows(image.rgba, image.width, image.height));
    },
    submit() {},
  };
}

/** Upload e soltura na hora (sem esperar o prazo). */
function upload(queue: Queue, source: unknown): void {
  queue.copyExternalImageToTexture({ source }, {}, {});
  sweepPendingReleases(true);
}

const pixelsOf = (o: unknown): unknown => (o as { __pixels: unknown }).__pixels;

function compressed(width = WIDTH, height = HEIGHT): ArrayBuffer {
  return new Uint8Array([width, height]).buffer;
}

const createBitmap = (): CreateBitmap => g['createImageBitmap'] as CreateBitmap;

beforeEach(() => {
  for (const name of SAVED) saved[name] = g[name];
  decodeCalls = [];
  uploads = [];
  vi.stubGlobal('__cortexDecodeImage', fakeDecode);
  vi.stubGlobal('print', () => {});
  clock += TEST_CLOCK_STEP_MS;
  vi.stubGlobal('performance', { now: () => clock });
  installImageShims();
});

afterEach(() => {
  sweepPendingReleases(true);
  for (const name of SAVED) g[name] = saved[name];
  vi.unstubAllGlobals();
});

describe('bitmap soltável (SPEC-0748)', () => {
  it('decodifica na hora e o getter devolve os pixels sem decodificar de novo', async () => {
    const bitmap = await createBitmap()(compressed());
    expect([bitmap.width, bitmap.height]).toEqual([WIDTH, HEIGHT]);
    expect(rows(bitmap.rgba, WIDTH, HEIGHT)).toEqual([0, 1, 2]);
    expect(rows(bitmap.rgba, WIDTH, HEIGHT)).toEqual([0, 1, 2]);
    expect(decodeCalls).toHaveLength(1);
  });

  it('solta no upload e conta os bytes soltos', async () => {
    const queue = wrapQueueRelease(fakeQueue()) as Queue;
    const bitmap = await createBitmap()(compressed());
    const before = { ...imageReleaseStats };
    upload(queue, bitmap);
    expect(uploads).toEqual([[0, 1, 2]]);
    expect(pixelsOf(bitmap)).toBeNull();
    expect(imageReleaseStats.released - before.released).toBe(1);
    expect(imageReleaseStats.releasedBytes - before.releasedBytes).toBe(WIDTH * HEIGHT * BYTES_PER_PIXEL);
  });

  it('ler rgba depois de solto decodifica de novo e conta o redecode', async () => {
    const queue = wrapQueueRelease(fakeQueue()) as Queue;
    const bitmap = await createBitmap()(compressed());
    upload(queue, bitmap);
    const before = imageReleaseStats.redecodes;
    upload(queue, bitmap);
    expect(uploads).toEqual([[0, 1, 2], [0, 1, 2]]);
    expect(decodeCalls).toHaveLength(2);
    expect(imageReleaseStats.redecodes - before).toBe(1);
  });

  it('o redecode repete a inversão do flipY', async () => {
    const queue = wrapQueueRelease(fakeQueue()) as Queue;
    const bitmap = await createBitmap()(compressed(), { imageOrientation: 'flipY' });
    expect(rows(bitmap.rgba, WIDTH, HEIGHT)).toEqual([2, 1, 0]);
    upload(queue, bitmap);
    expect(rows(bitmap.rgba, WIDTH, HEIGHT)).toEqual([2, 1, 0]);
    expect(decodeCalls).toHaveLength(2);
  });

  it('atribuir rgba torna o bitmap não soltável', async () => {
    const queue = wrapQueueRelease(fakeQueue()) as Queue;
    const bitmap = await createBitmap()(compressed());
    const own = new Uint8Array(WIDTH * HEIGHT * BYTES_PER_PIXEL).fill(7).buffer;
    bitmap.rgba = own;
    upload(queue, bitmap);
    expect(bitmap.rgba).toBe(own);
    expect(decodeCalls).toHaveLength(1);
  });

  it('close solta pixels e bytes: rgba vira null sem redecode', async () => {
    const bitmap = await createBitmap()(compressed());
    bitmap.close();
    expect(bitmap.rgba).toBeNull();
    expect(decodeCalls).toHaveLength(1);
  });

  it('vista parcial vira cópia só do trecho', async () => {
    const big = new Uint8Array(64);
    big.set([WIDTH, HEIGHT], 10);
    const bitmap = await createBitmap()(big.subarray(10, 12));
    expect(decodeCalls).toEqual([2]);
    expect(rows(bitmap.rgba, WIDTH, HEIGHT)).toEqual([0, 1, 2]);
  });

  it('createImageBitmap de outro bitmap solto passa direto sem decodificar', async () => {
    const queue = wrapQueueRelease(fakeQueue()) as Queue;
    const first = await createBitmap()(compressed());
    upload(queue, first);
    const second = await createBitmap()(first);
    expect(decodeCalls).toHaveLength(1);
    expect(rows(second.rgba, WIDTH, HEIGHT)).toEqual([0, 1, 2]);
    expect(decodeCalls).toHaveLength(2);
  });
});

describe('fila embrulhada (SPEC-0748)', () => {
  it('fonte sem __cortexReleasePixels (canvas) não muda', () => {
    const queue = wrapQueueRelease(fakeQueue()) as Queue;
    const canvas = { width: WIDTH, height: HEIGHT, rgba: fakeDecode(compressed()).rgba };
    const pixels = canvas.rgba;
    upload(queue, canvas);
    expect(canvas.rgba).toBe(pixels);
  });

  it('embrulhar duas vezes não solta em dobro', async () => {
    const queue = wrapQueueRelease(wrapQueueRelease(fakeQueue())) as Queue;
    const bitmap = await createBitmap()(compressed());
    const before = imageReleaseStats.released;
    upload(queue, bitmap);
    expect(imageReleaseStats.released - before).toBe(1);
  });

  it('o requestDevice do host devolve a fila embrulhada', async () => {
    const queue = fakeQueue();
    vi.stubGlobal('navigator', {
      gpu: { requestAdapter: async () => ({ requestDevice: async () => ({ queue }) }) },
    });
    installWebGpuExtras();
    const nav = g['navigator'] as { gpu: { requestAdapter(): Promise<{ requestDevice(): Promise<{ queue: Queue }> }> } };
    const device = await (await nav.gpu.requestAdapter()).requestDevice();
    const bitmap = await createBitmap()(compressed());
    upload(device.queue, bitmap);
    expect(pixelsOf(bitmap)).toBeNull();
  });

  it('formata os contadores', () => {
    expect(formatImageReleaseStats()).toMatch(/^img-solto=\d+\/\d+\.\dMB img-redecode=\d+ pendentes=\d+$/);
    expect(g['__cortexImageReleaseStats']).toBe(imageReleaseStats);
  });
});

describe('soltura com prazo (SPEC-0748, ADR-0749)', () => {
  it('um clone que sobe dentro do prazo reaproveita os pixels, sem redecode', async () => {
    const queue = wrapQueueRelease(fakeQueue()) as Queue;
    const bitmap = await createBitmap()(compressed());
    queue.copyExternalImageToTexture({ source: bitmap }, {}, {});
    clock += RELEASE_DELAY_MS / 2;
    queue.submit();
    queue.copyExternalImageToTexture({ source: bitmap }, {}, {});
    expect(uploads).toEqual([[0, 1, 2], [0, 1, 2]]);
    expect(decodeCalls).toHaveLength(1);
    expect(pixelsOf(bitmap)).not.toBeNull();
  });

  it('o submit solta só depois do prazo sem upload novo', async () => {
    const queue = wrapQueueRelease(fakeQueue()) as Queue;
    const bitmap = await createBitmap()(compressed());
    queue.copyExternalImageToTexture({ source: bitmap }, {}, {});
    expect(imageReleaseStats.pending).toBeGreaterThan(0);
    clock += SWEEP_INTERVAL_MS;
    queue.submit();
    expect(pixelsOf(bitmap)).not.toBeNull();
    clock += RELEASE_DELAY_MS;
    queue.submit();
    expect(pixelsOf(bitmap)).toBeNull();
    expect(imageReleaseStats.pending).toBe(0);
  });

  it('cada objeto conta uma vez em img-solto, mesmo soltando de novo', async () => {
    const queue = wrapQueueRelease(fakeQueue()) as Queue;
    const bitmap = await createBitmap()(compressed());
    const before = { ...imageReleaseStats };
    upload(queue, bitmap);
    upload(queue, bitmap);
    expect(imageReleaseStats.released - before.released).toBe(1);
    expect(imageReleaseStats.releasedBytes - before.releasedBytes).toBe(WIDTH * HEIGHT * BYTES_PER_PIXEL);
    expect(imageReleaseStats.redecodes - before.redecodes).toBe(1);
  });

  it('createImageBitmap de fonte soltável leva a posse dos pixels', async () => {
    const first = await createBitmap()(compressed());
    const pixels = pixelsOf(first);
    const second = await createBitmap()(first);
    expect(pixelsOf(second)).toBe(pixels);
    expect(pixelsOf(first)).toBeNull();
    expect(decodeCalls).toHaveLength(1);
  });
});

describe('Image fake com cache de bytes (SPEC-0748)', () => {
  function load(url: string): Promise<Bitmap> {
    const ImageCtor = g['Image'] as new () => Bitmap & { src: string; onload: (() => void) | null };
    const image = new ImageCtor();
    return new Promise((resolve) => {
      image.onload = () => resolve(image);
      image.src = url;
    });
  }

  it('a 2ª carga da mesma URL não decodifica até ler rgba', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, arrayBuffer: async () => compressed() }));
    vi.stubGlobal('fetch', fetchSpy);
    const url = 'img-' + Math.random() + '.png';
    const first = await load(url);
    expect(rows(first.rgba, WIDTH, HEIGHT)).toEqual([0, 1, 2]);
    expect(decodeCalls).toHaveLength(1);
    const second = await load(url);
    expect([second.width, second.height]).toEqual([WIDTH, HEIGHT]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(decodeCalls).toHaveLength(1);
    expect(rows(second.rgba, WIDTH, HEIGHT)).toEqual([0, 1, 2]);
    expect(decodeCalls).toHaveLength(2);
  });

  it('o Image fake se solta no upload e se refaz', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, arrayBuffer: async () => compressed() }));
    const queue = wrapQueueRelease(fakeQueue()) as Queue;
    const image = await load('img-' + Math.random() + '.png');
    upload(queue, image);
    expect(pixelsOf(image)).toBeNull();
    expect(rows(image.rgba, WIDTH, HEIGHT)).toEqual([0, 1, 2]);
  });
});
