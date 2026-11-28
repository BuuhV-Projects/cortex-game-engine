/**
 * SPEC-0753 — as corridas e as bordas da `AssetResidency`: o `request` de um residente acima do orçamento, duas
 * cargas chegando na mesma rodada de microtasks (o `fetch` síncrono do host nativo), o `acquire` no pedido, o
 * `sizeOf` que lança, o `onEvict` que chama a residência e a estimativa de bytes com atributo intercalado e morph.
 */

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { AssetResidency, estimateGltfBytes } from '../../src/core/AssetResidency.js';
import type { GLTF } from '../../src/core/AssetLoader.js';

/** Cada GLB pesa {@link UNIT}; o orçamento cabe um só. */
const UNIT = 60;
const BUDGET = 100;
const FLOAT_BYTES = 4;
const VEC3 = 3;
const STRIDE = 6;
const VERTS = 4;

function fakeGltf(): GLTF {
  return { scene: new THREE.Group(), animations: [] } as unknown as GLTF;
}

/** Loader que resolve na hora (como o host nativo) e anota cargas e solturas; `failing` rejeita. */
function instantLoader(failing: string[] = []) {
  const released: string[] = [];
  const loader = {
    loadGLTF: vi.fn((url: string) => (failing.includes(url) ? Promise.reject(new Error(`falhou ${url}`)) : Promise.resolve(fakeGltf()))),
    release: vi.fn((url: string) => {
      released.push(url);
      return true;
    }),
  };
  return { loader, released };
}

describe('AssetResidency: corridas (SPEC-0753)', () => {
  it('request de um residente acima do orçamento devolve o GLTF sem soltá-lo', async () => {
    const { loader, released } = instantLoader();
    const r = new AssetResidency({ budgetBytes: BUDGET, loader, sizeOf: () => UNIT });
    await r.hold('m', ['a.glb', 'b.glb']);
    r.unhold('m');
    r.acquire('a.glb');
    const b = await r.request('b.glb');
    expect(b).toBeDefined();
    expect(r.isResident('b.glb')).toBe(true);
    expect(released).toEqual([]);
  });

  it('duas cargas em paralelo com acquire no pedido: a segunda chegada não solta a primeira', async () => {
    const { loader, released } = instantLoader();
    const r = new AssetResidency({ budgetBytes: BUDGET, loader, sizeOf: () => UNIT });
    const [x, y] = await Promise.all([r.request('x.glb', { acquire: true }), r.request('y.glb', { acquire: true })]);
    expect(x && y).toBeTruthy();
    expect(r.isResident('x.glb') && r.isResident('y.glb')).toBe(true);
    expect(released).toEqual([]);
    expect(r.stats.overBudget).toBeGreaterThan(0);
    r.unref('x.glb');
    r.trim();
    expect(released).toEqual(['x.glb']);
  });

  it('o acquire do pedido é desfeito quando a carga falha', async () => {
    const { loader } = instantLoader(['z.glb']);
    const r = new AssetResidency({ budgetBytes: BUDGET, loader, sizeOf: () => UNIT });
    await expect(r.request('z.glb', { acquire: true })).rejects.toThrow('falhou z.glb');
    // sem contador preso: um unref a mais é o "sem acquire" (fica em zero), e a URL foi esquecida
    expect(r.isResident('z.glb')).toBe(false);
    expect(r.stats.resident).toBe(0);
    loader.loadGLTF.mockImplementation(() => Promise.resolve(fakeGltf()));
    await r.request('z.glb');
    expect(r.release('z.glb')).toBe(true);
  });

  it('acquire no pedido de um residente conta e o protege do trim', async () => {
    const { loader, released } = instantLoader();
    const r = new AssetResidency({ budgetBytes: BUDGET, loader, sizeOf: () => UNIT });
    await r.request('a.glb');
    await r.request('a.glb', { acquire: true });
    await r.request('b.glb');
    r.trim();
    expect(r.isResident('a.glb')).toBe(true);
    expect(released).toEqual(['b.glb']);
  });
});

describe('AssetResidency: bordas (SPEC-0753)', () => {
  it('sizeOf que lança rejeita a carga sem deixar residente fora da LRU', async () => {
    const { loader } = instantLoader();
    const r = new AssetResidency({ budgetBytes: BUDGET, loader, sizeOf: () => { throw new Error('sem tamanho'); } });
    await expect(r.request('a.glb')).rejects.toThrow('sem tamanho');
    expect(r.isResident('a.glb')).toBe(false);
    expect(r.stats).toMatchObject({ resident: 0, bytes: 0, loads: 0 });
  });

  it('o onEvict que pede outra URL não solta a mesma duas vezes', async () => {
    const { loader, released } = instantLoader();
    let r!: AssetResidency;
    const onEvict = vi.fn(() => {
      void r.request('c.glb');
    });
    r = new AssetResidency({ budgetBytes: BUDGET, loader, sizeOf: () => UNIT, onEvict });
    await r.request('a.glb');
    await r.request('b.glb');
    expect(released.filter((u) => u === 'a.glb')).toHaveLength(1);
    expect(onEvict).toHaveBeenCalledTimes(released.length);
    expect(r.isResident('a.glb')).toBe(false);
  });

  it('a estimativa conta o atributo intercalado uma vez e os alvos de morph', () => {
    const geometry = new THREE.BufferGeometry();
    const interleaved = new THREE.InterleavedBuffer(new Float32Array(VERTS * STRIDE), STRIDE);
    geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(interleaved, VEC3, 0));
    geometry.setAttribute('normal', new THREE.InterleavedBufferAttribute(interleaved, VEC3, VEC3));
    geometry.morphAttributes.position = [new THREE.BufferAttribute(new Float32Array(VERTS * VEC3), VEC3)];
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
    const expected = VERTS * STRIDE * FLOAT_BYTES + VERTS * VEC3 * FLOAT_BYTES;
    expect(estimateGltfBytes({ scene })).toBe(expected);
  });
});
