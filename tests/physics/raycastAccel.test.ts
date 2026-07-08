/**
 * BVH de raycast (three-mesh-bvh) — trava dois invariantes do fix de perf da
 * colisão do Character (ADR/perf: props detalhados derrubavam o FPS no Hermes):
 *   1. CORREÇÃO: o raycast acelerado bate com o raycast padrão (mesmo hit) —
 *      acelerar NÃO pode mudar o comportamento da colisão.
 *   2. THRESHOLD: só geometria acima de `MIN_BVH_TRIS` ganha a árvore; malha
 *      pequena é pulada (montar a árvore não compensa).
 */
import { describe, it, expect } from 'vitest';
import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  Raycaster,
  SphereGeometry,
  Vector3,
} from 'three';
import { ensureBoundsTree, MIN_BVH_TRIS } from '../../src/physics/raycastAccel.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('raycastAccel — BVH de colisão do Character', () => {
  it('acelera geometria HIGH-POLY e o hit bate com o raycast padrão', () => {
    // Esfera bem subdividida: ~8k triângulos (>> MIN_BVH_TRIS).
    const geo = new SphereGeometry(1, 64, 64);
    const tris = geo.index ? geo.index.count / 3 : 0;
    expect(tris).toBeGreaterThan(MIN_BVH_TRIS);

    const mesh = new Mesh(geo);
    mesh.updateMatrixWorld(true);
    const ray = new Raycaster(new Vector3(0, 0, 5), new Vector3(0, 0, -1));

    // Sem árvore → o raycast (já com o patch) cai no caminho padrão.
    const before = ray.intersectObject(mesh, true);
    expect(before.length).toBeGreaterThan(0);

    ensureBoundsTree(mesh);
    expect((geo as any).boundsTree).toBeDefined(); // árvore construída

    const after = ray.intersectObject(mesh, true); // agora via BVH
    expect(after.length).toBe(before.length);
    // Mesmo ponto de impacto (frente da esfera, z≈1).
    expect(after[0]!.point.z).toBeCloseTo(before[0]!.point.z, 5);
    expect(after[0]!.point.z).toBeCloseTo(1, 4);
  });

  it('PULA geometria pequena (não vale montar a árvore)', () => {
    const geo = new BufferGeometry();
    geo.setAttribute(
      'position',
      new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3), // 1 triângulo
    );
    ensureBoundsTree(new Mesh(geo));
    expect((geo as any).boundsTree).toBeUndefined();
    expect((geo.userData as any)['_cortexBvhSkip']).toBe(true);
  });
});
