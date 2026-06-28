/**
 * Cobre o helper de picking do ObjectEditSystem usado no fallback de seleção de
 * modelos SKINADOS (o raycast preciso erra a malha animada → seleciona pela bbox).
 */

import { describe, it, expect } from 'vitest';
import { Group, Mesh, SkinnedMesh, BufferGeometry } from 'three';
import { hasSkinnedMesh } from '../../src/editor/ObjectEditSystem.js';

describe('hasSkinnedMesh', () => {
  it('é false numa subárvore só com malhas comuns', () => {
    const g = new Group();
    g.add(new Mesh(new BufferGeometry()));
    expect(hasSkinnedMesh(g)).toBe(false);
  });

  it('é true quando há uma SkinnedMesh em qualquer profundidade', () => {
    const root = new Group();
    const mid = new Group();
    mid.add(new SkinnedMesh(new BufferGeometry()));
    root.add(mid);
    expect(hasSkinnedMesh(root)).toBe(true);
  });
});
