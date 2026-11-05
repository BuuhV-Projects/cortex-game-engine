/**
 * Cache de buffer por FONTE no NativeGeometryStore e a visão do passe de sombra (ADR-0692): variantes de semantics
 * reaproveitam o buffer, troca de array refaz e avisa, `shadowBuffers` com passo/deslocamento e recusa de formato,
 * e a ordem do provedor nativo (store → three → upload).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Uint16BufferAttribute,
} from 'three';
import { NativeGeometryStore } from '../../../src/render/native/NativeGeometryStore.js';
import { NativeShadowSource } from '../../../src/render/native/NativeShadowSource.js';
import { POSITION_FORMAT_REFUSAL, type ShadowUvSlot } from '../../../src/render/ShadowGeometrySource.js';
import type { GeometryLike, NativeRendererHost } from '../../../src/render/native/nativeRendererShared.js';

/** Floats de um vértice intercalado: posição (3) + normal (3) + uv (2). */
const INTERLEAVED_STRIDE = 8;
const NORMAL_OFFSET = 3;
const UV_OFFSET = 6;
const FLOAT_BYTES = 4;

function fakeDevice() {
  let next = 0;
  const created: { id: number; size: number; usage: number }[] = [];
  const device = {
    created,
    createBuffer: vi.fn((d: { size: number; usage: number }) => {
      const buffer = { id: next++, size: d.size, usage: d.usage };
      created.push(buffer);
      return buffer;
    }),
    queue: { writeBuffer: vi.fn() },
  };
  return device;
}

function fakeHost(threeBuffers = new Map<object, unknown>()): NativeRendererHost {
  return {
    backend: {
      device: null,
      get: (o: unknown) => (threeBuffers.has(o as object) ? { buffer: threeBuffers.get(o as object) } : {}),
      utils: {} as never,
    },
    _textures: { updateTexture: vi.fn(), updateSampler: vi.fn() },
  } as unknown as NativeRendererHost;
}

/** Geometria indexada com atributos separados (position, normal, uv). */
function plainGeometry(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  g.setAttribute('normal', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  g.setIndex(new Uint16BufferAttribute([0, 1, 2], 1));
  return g;
}

/** Geometria intercalada como a do cook do export (posição, normal e UV no mesmo bloco). */
function interleavedGeometry(): BufferGeometry {
  const g = new BufferGeometry();
  const block = new InterleavedBuffer(new Float32Array(INTERLEAVED_STRIDE * 3), INTERLEAVED_STRIDE);
  g.setAttribute('position', new InterleavedBufferAttribute(block, 3, 0));
  g.setAttribute('normal', new InterleavedBufferAttribute(block, 3, NORMAL_OFFSET));
  g.setAttribute('uv', new InterleavedBufferAttribute(block, 2, UV_OFFSET));
  return g;
}

const asLike = (g: BufferGeometry) => g as unknown as GeometryLike;

describe('NativeGeometryStore — cache por fonte (ADR-0692)', () => {
  it('duas variantes de semantics sobre a mesma geometria fazem um createBuffer por fonte', () => {
    const device = fakeDevice();
    const store = new NativeGeometryStore(device, fakeHost());
    const g = plainGeometry();
    const depth = store.geometry(asLike(g), ['position']);
    const main = store.geometry(asLike(g), ['position', 'normal', 'uv']);
    if (typeof depth === 'string' || typeof main === 'string') throw new Error('recusou');
    // position, índice, normal, uv: uma vez cada.
    expect(device.createBuffer).toHaveBeenCalledTimes(4);
    expect(main.buffers[0]).toBe(depth.buffers[0]);
    expect(main.index).toBe(depth.index);
  });

  it('o passe de sombra e o desenho principal dividem o buffer (sem re-upload)', () => {
    const device = fakeDevice();
    const store = new NativeGeometryStore(device, fakeHost());
    const g = plainGeometry();
    const shadow = store.shadowBuffers(asLike(g), true);
    if (!shadow || typeof shadow === 'string') throw new Error('sem buffers');
    const main = store.geometry(asLike(g), ['position']);
    if (typeof main === 'string') throw new Error('recusou');
    expect(main.buffers[0]).toBe(shadow.vertexBuffer);
    expect(main.index).toBe(shadow.indexBuffer);
    expect(device.createBuffer).toHaveBeenCalledTimes(2);
  });

  it('fonte com array trocado refaz o buffer e avisa os ouvintes', () => {
    const device = fakeDevice();
    const store = new NativeGeometryStore(device, fakeHost());
    const g = plainGeometry();
    const before = store.shadowBuffers(asLike(g), true) as { vertexBuffer: unknown };
    const replaced = vi.fn();
    store.onBufferReplaced(replaced);
    const position = g.getAttribute('position') as BufferAttribute;
    position.array = new Float32Array([0, 0, 0, 2, 0, 0, 0, 2, 0]);
    // Sem upload, o array novo não está no store: `null` (o provedor tenta o three e depois sobe).
    expect(store.shadowBuffers(asLike(g), false)).toBeNull();
    const after = store.shadowBuffers(asLike(g), true) as { vertexBuffer: unknown };
    expect(after.vertexBuffer).not.toBe(before.vertexBuffer);
    expect(replaced).toHaveBeenCalledWith(position);
  });

  it('version que mudou reescreve o mesmo buffer, sem refazer', () => {
    const device = fakeDevice();
    const store = new NativeGeometryStore(device, fakeHost());
    const g = plainGeometry();
    const first = store.shadowBuffers(asLike(g), true) as { vertexBuffer: unknown };
    const writes = device.queue.writeBuffer.mock.calls.length;
    g.getAttribute('position').needsUpdate = true;
    const again = store.shadowBuffers(asLike(g), false) as { vertexBuffer: unknown };
    expect(again.vertexBuffer).toBe(first.vertexBuffer);
    expect(device.queue.writeBuffer.mock.calls.length).toBe(writes + 1);
  });

  it('shadowBuffers de atributo simples: passo 12, deslocamento 0, índice uint16 com padding', () => {
    const device = fakeDevice();
    const store = new NativeGeometryStore(device, fakeHost());
    const b = store.shadowBuffers(asLike(plainGeometry()), true);
    expect(b).toMatchObject({ vertexStride: 12, vertexOffset: 0, indexCount: 3, vertexCount: 0, indexIs32Bit: false });
    // 3 índices uint16 = 6 bytes, arredondados para 8 (writeBuffer pede múltiplo de 4).
    expect(device.created[1]!.size).toBe(8);
  });

  it('shadowBuffers intercalado: passo do bloco e deslocamento da posição', () => {
    const store = new NativeGeometryStore(fakeDevice(), fakeHost());
    const b = store.shadowBuffers(asLike(interleavedGeometry()), true);
    expect(b).toMatchObject({ vertexStride: INTERLEAVED_STRIDE * FLOAT_BYTES, vertexOffset: 0, vertexCount: 3, indexBuffer: null });
  });

  it('posição fora de float32x3 é recusa permanente, com motivo próprio', () => {
    const store = new NativeGeometryStore(fakeDevice(), fakeHost());
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Int16Array([0, 0, 0, 1, 0, 0]), 3, true));
    expect(store.shadowBuffers(asLike(g), true)).toBe(POSITION_FORMAT_REFUSAL);
  });

  it('uvSlot intercalado aponta o bloco com passo e deslocamento do uv', () => {
    const store = new NativeGeometryStore(fakeDevice(), fakeHost());
    const g = interleavedGeometry();
    const slot: ShadowUvSlot = { buffer: null, stride: 0, offset: 0 };
    expect(store.uvSlot(asLike(g), false, slot)).toBe(false);
    expect(store.uvSlot(asLike(g), true, slot)).toBe(true);
    expect(slot).toMatchObject({ stride: INTERLEAVED_STRIDE * FLOAT_BYTES, offset: UV_OFFSET * FLOAT_BYTES });
    // A posição divide o bloco: o passe de sombra acha o mesmo buffer sem subir de novo.
    const b = store.shadowBuffers(asLike(g), false) as { vertexBuffer: unknown };
    expect(b.vertexBuffer).toBe(slot.buffer);
  });
});

describe('NativeShadowSource — ordem store → three → upload (ADR-0692)', () => {
  it('prefere o buffer do three quando o store não tem e não sobe nada', () => {
    const g = plainGeometry();
    const three = new Map<object, unknown>([
      [g.getAttribute('position'), { three: 'vertices' }],
      [g.index!, { three: 'indices' }],
    ]);
    const device = fakeDevice();
    const source = new NativeShadowSource(new NativeGeometryStore(device, fakeHost(three)), fakeHost(three));
    expect(source.buffers(g, true)).toMatchObject({ vertexBuffer: { three: 'vertices' }, indexBuffer: { three: 'indices' } });
    expect(device.createBuffer).not.toHaveBeenCalled();
  });

  it('sem three nem store: só sobe com upload, e conta os bytes', () => {
    const g = plainGeometry();
    const device = fakeDevice();
    const source = new NativeShadowSource(new NativeGeometryStore(device, fakeHost()), fakeHost());
    expect(source.buffers(g, false)).toBeNull();
    expect(source.buffers(g, true)).toMatchObject({ vertexStride: 12, indexCount: 3 });
    // 36 bytes de posição + 8 do índice com padding.
    expect(source.uploadedBytes).toBe(44);
    // Daí em diante vem do store, sem subir de novo.
    expect(source.buffers(g, false)).not.toBeNull();
    expect(device.createBuffer).toHaveBeenCalledTimes(2);
  });

  it('textura ausente sobe pelo caminho do material nativo', () => {
    const map = { version: 1 };
    const data = new Map<unknown, Record<string, unknown>>();
    const host = {
      backend: { get: (o: unknown) => data.get(o) ?? {} },
      _textures: {
        updateTexture: vi.fn((t: unknown) => data.set(t, { texture: { gpu: 'mapa' }, version: 1 })),
        updateSampler: vi.fn(),
      },
    } as unknown as NativeRendererHost;
    const source = new NativeShadowSource(new NativeGeometryStore(fakeDevice(), host), host);
    expect(source.texture(map)).toEqual({ gpu: 'mapa' });
    expect(host._textures.updateTexture).toHaveBeenCalledTimes(1);
    // Com a textura em dia, não paga o upload de novo.
    source.texture(map);
    expect(host._textures.updateTexture).toHaveBeenCalledTimes(1);
  });
});
