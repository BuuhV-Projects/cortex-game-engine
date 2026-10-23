/**
 * SPEC-0393 — `World.contactPairsWith` / `contactPair` no adaptador do Rapier
 * nativo. Sem eles o `hasContact` do DDD 61 lançava no 1º tick e o laço morria.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
// @ts-expect-error — host JS shim, typed as any
import { World } from '../../native/js/src/shims/rapier-compat.js';

const g = globalThis as { __rapierNative?: unknown };
const SCRATCH_SIZE = 16;
const ME = 500;
/** More pairs than one scratch page. */
const OTHERS = Array.from({ length: 20 }, (_, i) => 1000 + i);
/** (c1=ME, c2=other) manifolds: point distances; Rapier stores the pair as (other, ME). */
const MANIFOLDS = [[-0.002, 0.004], [0.3]];

let scratch: Float64Array;

beforeEach(() => {
  scratch = new Float64Array(SCRATCH_SIZE);
  g.__rapierNative = {
    worldNew: () => 1,
    worldScratch: () => scratch.buffer,
    worldContactPairsWith: (_w: number, collider: number, start: number) => {
      if (collider !== ME) return 0;
      const page = OTHERS.slice(start, start + SCRATCH_SIZE);
      page.forEach((h, i) => { scratch[i] = h; });
      return page.length;
    },
    worldContactPair: (_w: number, c1: number, _c2: number, m: number) => {
      const manifold = MANIFOLDS[m];
      if (!manifold) return -1;
      scratch[0] = c1 === ME ? 1 : 0;
      manifold.forEach((d, i) => { scratch[1 + i] = d; });
      return manifold.length;
    },
  };
});

afterEach(() => {
  delete g.__rapierNative;
});

describe('rapier-compat: contatos do narrow-phase (SPEC-0393)', () => {
  it('contactPairsWith pagina o scratch e sobrevive a consultas dentro do callback', () => {
    const world = new World({ x: 0, y: -9.81, z: 0 });
    const seen: number[] = [];
    world.contactPairsWith({ handle: ME }, (other: { handle: number }) => {
      seen.push(other.handle);
      world.contactPair({ handle: ME }, other, () => {}); // sobrescreve o scratch
    });
    expect(seen).toEqual(OTHERS);
  });

  it('contactPair chama uma vez por manifold, com distâncias e flipped', () => {
    const world = new World({ x: 0, y: -9.81, z: 0 });
    const got: { dists: number[]; flipped: boolean }[] = [];
    world.contactPair({ handle: ME }, { handle: OTHERS[0] }, (m: { numContacts(): number; contactDist(i: number): number }, flipped: boolean) => {
      const dists = [];
      for (let j = 0; j < m.numContacts(); j++) dists.push(m.contactDist(j));
      got.push({ dists, flipped });
    });
    expect(got).toEqual([
      { dists: MANIFOLDS[0], flipped: true },
      { dists: MANIFOLDS[1], flipped: true },
    ]);
  });

  it('o padrão do hasContact do DDD 61 detecta o toque (dist <= 0.01)', () => {
    const world = new World({ x: 0, y: -9.81, z: 0 });
    let touching = false;
    world.contactPairsWith({ handle: ME }, (other: { handle: number }) => {
      world.contactPair({ handle: ME }, other, (m: { numContacts(): number; contactDist(i: number): number }) => {
        for (let j = 0; j < m.numContacts(); j++) if (m.contactDist(j) <= 0.01) touching = true;
      });
    });
    expect(touching).toBe(true);
  });
});
