/**
 * Testes unitários para StoryState (src/narrative/StoryState.ts)
 * Cobre: get/set, has (truthy), hasAll, apply, serialização. Referência: ADR-0070.
 */

import { describe, it, expect } from 'vitest';
import { StoryState } from '../../src/narrative/StoryState.js';

describe('StoryState', () => {
  it('get/set guarda e devolve o valor cru', () => {
    const s = new StoryState();
    expect(s.get('x')).toBeUndefined();
    s.set('x', 'taguatinga');
    expect(s.get('x')).toBe('taguatinga');
  });

  it('has reflete truthy: true, número ≠ 0, string não vazia', () => {
    const s = new StoryState();
    s.set('a', true);
    s.set('b', false);
    s.set('c', 1);
    s.set('d', 0);
    s.set('e', 'sim');
    s.set('f', '');
    expect(s.has('a')).toBe(true);
    expect(s.has('b')).toBe(false);
    expect(s.has('c')).toBe(true);
    expect(s.has('d')).toBe(false);
    expect(s.has('e')).toBe(true);
    expect(s.has('f')).toBe(false);
    expect(s.has('inexistente')).toBe(false);
  });

  it('hasAll: true só quando todas ligadas; [] → true', () => {
    const s = new StoryState();
    s.set('p1', true);
    s.set('p2', true);
    expect(s.hasAll([])).toBe(true);
    expect(s.hasAll(['p1', 'p2'])).toBe(true);
    expect(s.hasAll(['p1', 'p3'])).toBe(false);
  });

  it('apply aplica um lote e ignora undefined', () => {
    const s = new StoryState();
    s.apply({ a: true, b: 2 });
    s.apply(undefined);
    expect(s.has('a')).toBe(true);
    expect(s.get('b')).toBe(2);
  });

  it('toJSON/fromJSON faz round-trip', () => {
    const s = new StoryState();
    s.set('falou_marlene', true);
    s.set('cidade', 'ceilandia');
    const json = s.toJSON();
    expect(json).toEqual({ falou_marlene: true, cidade: 'ceilandia' });

    const restored = StoryState.fromJSON(json);
    expect(restored.has('falou_marlene')).toBe(true);
    expect(restored.get('cidade')).toBe('ceilandia');

    expect(StoryState.fromJSON(null).toJSON()).toEqual({});
  });
});
