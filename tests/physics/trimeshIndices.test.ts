/**
 * Índices do `addTrimeshFromObject` (SPEC-0661): typed → typed, sem `Uint32Array.from`.
 *
 * O que estes testes travam: os índices que chegam ao `addTrimesh` são os da geometria (Uint16 vira Uint32 com
 * os mesmos valores) e, sem índice, 0..n−1. No Hermes, o `Uint32Array.from` montava um array JS do tamanho da
 * malha e estourava o heap do export do DDD 00 ao montar o chão dos carros.
 */
import { describe, it, expect, vi } from 'vitest';
import { BoxGeometry, Mesh, MeshBasicMaterial } from 'three';
import { RapierPhysics } from '../../src/physics/RapierPhysics.js';

describe('addTrimeshFromObject (SPEC-0661)', () => {
  it('passa os índices da geometria e 0..n−1 sem índice', async () => {
    const physics = await RapierPhysics.create();
    try {
      const spy = vi.spyOn(physics, 'addTrimesh');
      const indexed = new BoxGeometry();
      physics.addTrimeshFromObject(new Mesh(indexed, new MeshBasicMaterial()));
      const plain = new BoxGeometry().toNonIndexed();
      physics.addTrimeshFromObject(new Mesh(plain, new MeshBasicMaterial()));

      const [, first] = spy.mock.calls[0]!;
      expect(first).toBeInstanceOf(Uint32Array);
      expect([...first]).toEqual([...indexed.index!.array]);
      const [, second] = spy.mock.calls[1]!;
      expect([...second]).toEqual(Array.from({ length: plain.attributes['position']!.count }, (_, i) => i));
    } finally {
      physics.dispose();
    }
  });
});
