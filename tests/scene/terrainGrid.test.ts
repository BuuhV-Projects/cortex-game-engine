/**
 * Paridade da grade do terreno em arrays planos (SPEC-0729 §2): índice, normais e esfera iguais bit a bit aos do
 * caminho genérico do three (`setIndex(number[])`, `computeVertexNormals`, `computeBoundingSphere`).
 */
import { describe, it, expect } from 'vitest';
import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Sphere } from 'three';
import { gridBoundingSphere, gridIndex, gridNormals } from '../../src/scene/terrainGrid.js';
import { Terrain } from '../../src/scene/Terrain.js';

/** Resoluções testadas: a mínima, pequenas, a padrão e uma que passa do Uint16 (301² > 65.535). */
const RESOLUTIONS = [1, 4, 65, 300];
const SIZE = 40;
const AMPLITUDE = 7;

/** Gerador determinístico (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** O índice como o Terrain montava antes (number[], ordem a,c,b,b,c,d). */
function legacyIndex(res: number): number[] {
  const n = res + 1;
  const out: number[] = [];
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const a = j * n + i;
      const c = (j + 1) * n + i;
      out.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  return out;
}

/** Posições de uma grade `res` com alturas aleatórias (semente). */
function gridPositions(res: number, seed: number): Float32Array {
  const n = res + 1;
  const next = rng(seed);
  const out = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const o = (j * n + i) * 3;
      out[o] = (i / res - 0.5) * SIZE;
      out[o + 1] = (next() - 0.5) * 2 * AMPLITUDE;
      out[o + 2] = (j / res - 0.5) * SIZE;
    }
  }
  return out;
}

/** Geometria do caminho genérico do three com as mesmas posições. */
function threeGeometry(positions: Float32Array, res: number): BufferGeometry {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions.slice(), 3));
  geo.setIndex(legacyIndex(res));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Primeiro índice em que os dois arrays diferem bit a bit (`-1` se iguais). O `toEqual` em arrays de ~270 mil floats
 * passa do tempo do teste; os bits iguais são o critério da SPEC.
 */
type Typed = ArrayLike<number> & { buffer: ArrayBufferLike; byteOffset: number; byteLength: number };
function firstBitDiff(a: Typed, b: Typed): number {
  if (a.length !== b.length || a.constructor !== b.constructor) return 0;
  const va = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const vb = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  for (let i = 0; i < va.length; i++) if (va[i] !== vb[i]) return i;
  return -1;
}

/** Confere normais e esfera de uma geometria contra o three recalculado numa cópia das posições. */
function expectThreeParity(geo: BufferGeometry, res: number): void {
  const positions = geo.getAttribute('position').array as Float32Array;
  const ref = threeGeometry(positions, res);
  const normals = geo.getAttribute('normal').array as Float32Array;
  expect(firstBitDiff(normals, ref.getAttribute('normal').array as Float32Array)).toBe(-1);
  expect(geo.boundingSphere!.center.toArray()).toEqual(ref.boundingSphere!.center.toArray());
  expect(geo.boundingSphere!.radius).toBe(ref.boundingSphere!.radius);
  expect(firstBitDiff(geo.index!.array as Uint32Array, ref.index!.array as Uint32Array)).toBe(-1);
}

describe('terrainGrid', () => {
  it.each(RESOLUTIONS)('gridIndex(%i) é o índice de antes, no tipo que o setIndex do three escolheria', (res) => {
    const idx = gridIndex(res);
    const ref = new BufferGeometry().setIndex(legacyIndex(res)).index!.array;
    expect(idx.constructor).toBe(ref.constructor);
    expect(firstBitDiff(idx, ref as typeof idx)).toBe(-1);
  });

  it('gridIndex usa Uint32 a partir de 65.535 como maior índice e devolve cópias', () => {
    expect(gridIndex(254)).toBeInstanceOf(Uint16Array); // 255² − 1 = 65.024
    expect(gridIndex(255)).toBeInstanceOf(Uint32Array); // 256² − 1 = 65.535
    const a = gridIndex(4);
    const b = gridIndex(4);
    expect(a).not.toBe(b);
    expect(a.buffer).not.toBe(b.buffer);
    a[0] = 99;
    expect(gridIndex(4)[0]).toBe(0);
  });

  it.each(RESOLUTIONS)('gridNormals(%i) é idêntico ao computeVertexNormals', (res) => {
    const positions = gridPositions(res, res * 31 + 7);
    const ref = threeGeometry(positions, res);
    const normals = new Float32Array(positions.length).fill(5); // lixo: tem de ser zerado
    gridNormals(positions, gridIndex(res), normals);
    expect(firstBitDiff(normals, ref.getAttribute('normal').array as Float32Array)).toBe(-1);
    if (res <= 4) expect(normals).toEqual(ref.getAttribute('normal').array); // e o toEqual nas pequenas
  });

  it('gridNormals de grade plana dá +Y', () => {
    const positions = new Float32Array(gridPositions(4, 1)).map((v, i) => (i % 3 === 1 ? 0 : v));
    const normals = new Float32Array(positions.length);
    gridNormals(positions, gridIndex(4), normals);
    for (let o = 0; o < normals.length; o += 3) expect([normals[o], normals[o + 1], normals[o + 2]]).toEqual([0, 1, 0]);
  });

  it.each(RESOLUTIONS)('gridBoundingSphere(%i) é idêntica ao computeBoundingSphere', (res) => {
    const positions = gridPositions(res, res + 101);
    const ref = threeGeometry(positions, res).boundingSphere!;
    const target = new Sphere();
    const sphere = gridBoundingSphere(positions, target);
    expect(sphere).toBe(target);
    expect(sphere.center.toArray()).toEqual(ref.center.toArray());
    expect(sphere.radius).toBe(ref.radius);
  });

  it('gridBoundingSphere sem vértices é a da caixa vazia do three', () => {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(0), 3));
    geo.computeBoundingSphere();
    const sphere = gridBoundingSphere(new Float32Array(0));
    expect(sphere.center.toArray()).toEqual(geo.boundingSphere!.center.toArray());
    expect(sphere.radius).toBe(geo.boundingSphere!.radius);
  });
});

describe('Terrain com a grade plana', () => {
  it.each(RESOLUTIONS)('construído com alturas, esculpido e moldado bate com o three (res %i)', (res) => {
    const n = res + 1;
    const next = rng(res * 7 + 3);
    const heights = Float32Array.from({ length: n * n }, () => (next() - 0.5) * AMPLITUDE);
    const t = new Terrain({ size: [SIZE, SIZE * 0.75], resolution: res, heights });
    const geo = t.mesh.geometry;
    expectThreeParity(geo, res);

    expect(t.sculpt(1, -2, SIZE, 3)).toBe(true);
    expectThreeParity(geo, res);

    const delta = Float32Array.from({ length: n * n }, () => (next() - 0.5) * 2);
    const normalAttr = geo.getAttribute('normal');
    const version = normalAttr.version;
    t.setRoadMolding(delta);
    expect(geo.getAttribute('normal')).toBe(normalAttr); // atributo reaproveitado
    expect(normalAttr.version).toBeGreaterThan(version); // needsUpdate como o three
    expectThreeParity(geo, res);
    const pos = geo.getAttribute('position');
    expect(pos.getY(n + 1)).toBe(Math.fround(t.getHeights()[n + 1]! + delta[n + 1]!));

    t.setRoadMolding(null);
    expectThreeParity(geo, res);
  });

  it('o índice de cada terreno é um buffer próprio', () => {
    const a = new Terrain({ resolution: 8 });
    const b = new Terrain({ resolution: 8 });
    expect(a.mesh.geometry.index!.array.buffer).not.toBe(b.mesh.geometry.index!.array.buffer);
  });
});
