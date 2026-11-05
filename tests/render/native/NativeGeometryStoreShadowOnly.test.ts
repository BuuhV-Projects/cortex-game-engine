/**
 * Cópias que só o passe de sombra usa no NativeGeometryStore (ADR-0692): seguem a `version` e a troca de array,
 * passam para a cópia do three quando ela aparece, e o refresh do desenho principal escreve com o padding de 4 bytes
 * sem reescrever o buffer compartilhado duas vezes. Geometria ainda sem dados fica pendente (`null`), não recusada.
 */
import { describe, expect, it, vi } from 'vitest';
import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute } from 'three';
import { NativeGeometryStore } from '../../../src/render/native/NativeGeometryStore.js';
import type { GeometryLike, NativeRendererHost } from '../../../src/render/native/nativeRendererShared.js';

/** 3 índices uint16 = 6 bytes, arredondados para 8 (writeBuffer pede múltiplo de 4). */
const PADDED_INDEX_BYTES = 8;
const INDEX_BYTES = 6;

function fakeDevice() {
  let next = 0;
  return {
    createBuffer: vi.fn((d: { size: number; usage: number }) => ({ id: next++, size: d.size, usage: d.usage })),
    queue: { writeBuffer: vi.fn() },
  };
}

function fakeHost(threeBuffers = new Map<object, unknown>()): NativeRendererHost {
  return {
    backend: { get: (o: unknown) => (threeBuffers.has(o as object) ? { buffer: threeBuffers.get(o as object) } : {}) },
    _textures: {},
  } as unknown as NativeRendererHost;
}

function triangle(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  g.setIndex(new Uint16BufferAttribute([0, 1, 2], 1));
  return g;
}

const asLike = (g: BufferGeometry) => g as unknown as GeometryLike;

describe('NativeGeometryStore — cópias só da sombra (ADR-0692)', () => {
  it('needsUpdate numa fonte só da sombra reescreve o buffer; sem mudança, nada', () => {
    const device = fakeDevice();
    const store = new NativeGeometryStore(device, fakeHost());
    const g = triangle();
    const b = store.shadowBuffers(asLike(g), true) as { vertexBuffer: unknown };
    const writes = device.queue.writeBuffer.mock.calls.length;
    store.refreshShadowSources();
    expect(device.queue.writeBuffer.mock.calls.length).toBe(writes);
    g.getAttribute('position').needsUpdate = true;
    store.refreshShadowSources();
    expect(device.queue.writeBuffer.mock.calls.length).toBe(writes + 1);
    expect(device.queue.writeBuffer.mock.calls.at(-1)![0]).toBe(b.vertexBuffer);
  });

  it('depois que o desenho principal toma a fonte, o refresh da sombra não escreve', () => {
    const device = fakeDevice();
    const store = new NativeGeometryStore(device, fakeHost());
    const g = triangle();
    store.shadowBuffers(asLike(g), true);
    store.geometry(asLike(g), ['position']);
    const writes = device.queue.writeBuffer.mock.calls.length;
    g.getAttribute('position').needsUpdate = true;
    store.refreshShadowSources();
    expect(device.queue.writeBuffer.mock.calls.length).toBe(writes);
  });

  it('attr.array trocado sobe de novo e avisa os ouvintes', () => {
    const device = fakeDevice();
    const store = new NativeGeometryStore(device, fakeHost());
    const g = triangle();
    const before = store.shadowBuffers(asLike(g), true) as { vertexBuffer: unknown };
    const replaced = vi.fn();
    store.onBufferReplaced(replaced);
    const position = g.getAttribute('position') as BufferAttribute;
    position.array = new Float32Array([0, 0, 0, 2, 0, 0, 0, 2, 0]);
    store.refreshShadowSources();
    expect(replaced).toHaveBeenCalledWith(position);
    const after = store.shadowBuffers(asLike(g), false) as { vertexBuffer: unknown };
    expect(after.vertexBuffer).not.toBe(before.vertexBuffer);
  });

  it('quando o three ganha a cópia dele, a do store sai e os ouvintes ouvem', () => {
    const three = new Map<object, unknown>();
    const store = new NativeGeometryStore(fakeDevice(), fakeHost(three));
    const g = triangle();
    store.shadowBuffers(asLike(g), true);
    const replaced = vi.fn();
    store.onBufferReplaced(replaced);
    three.set(g.getAttribute('position'), { three: 'vertices' });
    three.set(g.index!, { three: 'indices' });
    store.refreshShadowSources();
    expect(replaced).toHaveBeenCalledWith(g.getAttribute('position'));
    expect(replaced).toHaveBeenCalledWith(g.index);
    expect(store.shadowBuffers(asLike(g), false)).toBeNull();
  });

  it('forgetShadowSources para de acompanhar a geometria descartada', () => {
    const device = fakeDevice();
    const store = new NativeGeometryStore(device, fakeHost());
    const g = triangle();
    store.shadowBuffers(asLike(g), true);
    store.forgetShadowSources(asLike(g));
    const writes = device.queue.writeBuffer.mock.calls.length;
    g.getAttribute('position').needsUpdate = true;
    store.refreshShadowSources();
    expect(device.queue.writeBuffer.mock.calls.length).toBe(writes);
  });

  it('refreshGeometry de índice uint16 ímpar escreve com padding e não reescreve pela sombra', () => {
    const device = fakeDevice();
    const store = new NativeGeometryStore(device, fakeHost());
    const g = triangle();
    const geo = store.geometry(asLike(g), ['position']);
    if (typeof geo === 'string') throw new Error('recusou');
    const index = g.index!;
    (index.array as Uint16Array).set([2, 1, 0]);
    index.needsUpdate = true;
    expect(store.refreshGeometry(asLike(g), geo)).toBe(true);
    const last = device.queue.writeBuffer.mock.calls.at(-1)!;
    const data = last[2] as Uint8Array;
    expect(last[0]).toBe(geo.index);
    expect(data.byteLength).toBe(PADDED_INDEX_BYTES);
    expect([...data.subarray(0, INDEX_BYTES)]).toEqual([...new Uint8Array(index.array.buffer, 0, INDEX_BYTES)]);
    const writes = device.queue.writeBuffer.mock.calls.length;
    store.shadowBuffers(asLike(g), false);
    expect(device.queue.writeBuffer.mock.calls.length).toBe(writes);
  });

  it('sem position ou vazia: pendente (null), sem subir nada', () => {
    const device = fakeDevice();
    const store = new NativeGeometryStore(device, fakeHost());
    expect(store.shadowBuffers(asLike(new BufferGeometry()), true)).toBeNull();
    const empty = new BufferGeometry();
    empty.setAttribute('position', new Float32BufferAttribute([], 3));
    expect(store.shadowBuffers(asLike(empty), true)).toBeNull();
    expect(device.createBuffer).not.toHaveBeenCalled();
  });
});
