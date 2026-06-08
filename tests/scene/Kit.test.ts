/**
 * Testes do manifesto de kit (src/scene/Kit.ts) — vocabulário do design system
 * (ADR-0053): parse do kit.json, lookup de asset/âncora, math do attach e ordem
 * topológica (com detecção de ciclo / alvo ausente).
 */
import { describe, it, expect } from 'vitest';
import {
  parseKit,
  kitAssetFor,
  kitAnchor,
  resolveAttachPosition,
  attachResolveOrder,
  type KitDefinition,
} from '../../src/scene/Kit.js';

const KIT: KitDefinition = {
  version: 1,
  name: 'test-kit',
  module: 2,
  theme: 'forest',
  assets: {
    'assets/island.glb': {
      role: 'ground',
      tags: ['terrain', 'L'],
      size: [12, 3, 8],
      collider: { shape: 'heightfield', solid: true },
      anchors: {
        top: { at: [0, 3, 0], kind: 'surface', dir: [0, 1, 0] },
        edge_right: { at: [6, 3, 0], kind: 'connect', dir: [1, 0, 0] },
      },
    },
    'assets/bridge.glb': {
      role: 'connector',
      collider: { shape: 'heightfield', oneWay: true },
      anchors: { a: { at: [-2.5, 0, 0], kind: 'connect', dir: [-1, 0, 0] } },
    },
  },
};

describe('parseKit', () => {
  it('aceita um kit válido', () => {
    expect(parseKit(KIT)).not.toBeNull();
  });
  it('rejeita role inválido', () => {
    const bad = { ...KIT, assets: { 'a.glb': { role: 'spaceship' } } };
    expect(parseKit(bad)).toBeNull();
  });
  it('rejeita version diferente de 1', () => {
    expect(parseKit({ ...KIT, version: 2 })).toBeNull();
  });
  it('rejeita objeto não-kit', () => {
    expect(parseKit({ foo: 'bar' })).toBeNull();
    expect(parseKit(null)).toBeNull();
  });
});

describe('kitAssetFor', () => {
  it('casa pela chave exata', () => {
    expect(kitAssetFor(KIT, 'assets/island.glb')?.role).toBe('ground');
  });
  it('casa pelo basename (prefixo diferente)', () => {
    expect(kitAssetFor(KIT, 'models/island.glb')?.role).toBe('ground');
    expect(kitAssetFor(KIT, 'island.glb')?.role).toBe('ground');
  });
  it('retorna undefined quando não acha / sem kit', () => {
    expect(kitAssetFor(KIT, 'nope.glb')).toBeUndefined();
    expect(kitAssetFor(undefined, 'island.glb')).toBeUndefined();
  });
  it('procura em múltiplos kits', () => {
    expect(kitAssetFor([{ ...KIT, assets: {} }, KIT], 'bridge.glb')?.role).toBe('connector');
  });
});

describe('kitAnchor', () => {
  it('acha âncora nomeada', () => {
    expect(kitAnchor(KIT, 'assets/island.glb', 'edge_right')?.at).toEqual([6, 3, 0]);
  });
  it('undefined p/ âncora/asset inexistente', () => {
    expect(kitAnchor(KIT, 'assets/island.glb', 'nope')).toBeUndefined();
    expect(kitAnchor(KIT, 'nope.glb', 'top')).toBeUndefined();
  });
});

describe('resolveAttachPosition', () => {
  it('alinha socket deste à âncora do alvo (translação)', () => {
    // alvo em (10,0,0), âncora do alvo local (6,3,0) → mundo (16,3,0);
    // socket deste local (-2.5,0,0) → pos = (18.5, 3, 0)
    expect(resolveAttachPosition([10, 0, 0], [6, 3, 0], [-2.5, 0, 0])).toEqual([18.5, 3, 0]);
  });
  it('aplica offset', () => {
    expect(resolveAttachPosition([0, 0, 0], [0, 0, 0], [0, 0, 0], [1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe('attachResolveOrder', () => {
  const exists = (ids: string[]) => (id: string) => ids.includes(id);

  it('ordena alvo antes (cadeia)', () => {
    // c→b→a (a é base, sem attach mas existe)
    const items = [
      { id: 'c', to: 'b' },
      { id: 'b', to: 'a' },
    ];
    const order = attachResolveOrder(items, exists(['a', 'b', 'c']));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
    expect(order).toEqual(['b', 'c']); // 'a' não tem attach → fora da ordem
  });

  it('lança em ciclo', () => {
    const items = [
      { id: 'x', to: 'y' },
      { id: 'y', to: 'x' },
    ];
    expect(() => attachResolveOrder(items, exists(['x', 'y']))).toThrow(/ciclo/);
  });

  it('lança em alvo inexistente', () => {
    const items = [{ id: 'a', to: 'ghost' }];
    expect(() => attachResolveOrder(items, exists(['a']))).toThrow(/inexistente/);
  });
});
