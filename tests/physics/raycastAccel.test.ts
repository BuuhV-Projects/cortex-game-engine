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
import { CROSSED_MIN_BVH_TRIS, ensureBoundsTree, MIN_BVH_TRIS, SPREAD_BVH_RADIUS } from '../../src/physics/raycastAccel.js';

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
    expect((geo.userData as any)['_cortexBvhSkip']).toBe(MIN_BVH_TRIS);
  });
});

describe('raycastAccel — a árvore não altera a geometria (SPEC-0304)', () => {
  it('geometria SEM índice continua sem índice e o raio acerta igual', () => {
    const geo = new SphereGeometry(1, 64, 64).toNonIndexed();
    expect(geo.index).toBeNull();
    const mesh = new Mesh(geo);
    mesh.updateMatrixWorld(true);
    const ray = new Raycaster(new Vector3(0.1, 0.2, 5), new Vector3(0, 0, -1));
    const before = ray.intersectObject(mesh, false)[0]!.point.clone();
    ensureBoundsTree(mesh);
    expect((geo as any).boundsTree).toBeDefined();
    expect(geo.index).toBeNull(); // o modo padrão criava um índice aqui
    expect(ray.intersectObject(mesh, false)[0]!.point.distanceTo(before)).toBeLessThan(1e-6);
  });

  it('geometria COM índice: o índice fica idêntico (não é reordenado)', () => {
    const geo = new SphereGeometry(1, 64, 64);
    const copy = Array.from(geo.index!.array);
    ensureBoundsTree(new Mesh(geo));
    expect(Array.from(geo.index!.array)).toEqual(copy);
  });
});

describe('raycastAccel — raycast sobrescrito não ganha árvore (SPEC-0308)', () => {
  it('Mesh com raycast no-op fica sem árvore', () => {
    const mesh = new Mesh(new SphereGeometry(1, 64, 64));
    mesh.raycast = (): void => {};
    ensureBoundsTree(mesh);
    expect((mesh.geometry as any).boundsTree).toBeUndefined();
  });

  it('Mesh com o raycast padrão (patch) continua ganhando a árvore', () => {
    const mesh = new Mesh(new SphereGeometry(1, 64, 64));
    ensureBoundsTree(mesh);
    expect((mesh.geometry as any).boundsTree).toBeDefined();
  });
});

describe('raycastAccel — embrulho do raycast continua com árvore (SPEC-0308)', () => {
  it('raycast sobrescrito que repassa (ray, out) ao padrão mantém a árvore e acerta', () => {
    const mesh = new Mesh(new SphereGeometry(1, 64, 64));
    const proto = Mesh.prototype.raycast;
    mesh.raycast = function (this: Mesh, ray, out): void { proto.call(this, ray, out); };
    ensureBoundsTree(mesh);
    expect((mesh.geometry as any).boundsTree).toBeDefined();
    mesh.updateMatrixWorld(true);
    const hits = new Raycaster(new Vector3(0, 0, 5), new Vector3(0, 0, -1)).intersectObject(mesh);
    expect(hits[0]!.point.z).toBeCloseTo(1, 4);
  });
});

describe('raycastAccel — malha pequena ESPALHADA ganha árvore (SPEC-0320)', () => {
  /** Dois triângulos pequenos, um em cada ponta de um vão largo (fusão estática). */
  function spread(): Mesh {
    const d = SPREAD_BVH_RADIUS * 4;
    const geo = new BufferGeometry();
    geo.setAttribute(
      'position',
      new Float32BufferAttribute([-d, 0, -d, -d, 0, -d + 1, -d + 1, 0, -d, d, 0, d, d, 0, d + 1, d + 1, 0, d], 3),
    );
    return new Mesh(geo);
  }

  it('poucos triângulos espalhados ganham a árvore e o hit bate com o padrão', () => {
    const mesh = spread();
    mesh.updateMatrixWorld(true);
    const d = SPREAD_BVH_RADIUS * 4;
    const ray = new Raycaster(new Vector3(d + 0.2, 5, d + 0.2), new Vector3(0, -1, 0));
    const before = ray.intersectObject(mesh, false);
    expect(before.length).toBe(1);
    ensureBoundsTree(mesh);
    expect((mesh.geometry as any).boundsTree).toBeDefined();
    const after = ray.intersectObject(mesh, false);
    expect(after.length).toBe(1);
    expect(after[0]!.point.distanceTo(before[0]!.point)).toBeLessThan(1e-6);
    // e o raio que passa no vão continua sem acertar nada
    expect(new Raycaster(new Vector3(0, 5, 0), new Vector3(0, -1, 0)).intersectObject(mesh, false)).toEqual([]);
  });

  it('pequena e COMPACTA continua sem árvore', () => {
    const geo = new SphereGeometry(SPREAD_BVH_RADIUS / 4, 8, 6); // < MIN_BVH_TRIS e raio pequeno
    ensureBoundsTree(new Mesh(geo));
    expect((geo as any).boundsTree).toBeUndefined();
  });
});

describe('raycastAccel — corte menor pra quem o raio cruza (SPEC-0328)', () => {
  it('recusada no corte padrão, ganha árvore com CROSSED_MIN_BVH_TRIS; menor que ele continua sem', () => {
    const bus = new Mesh(new SphereGeometry(3, 12, 10)); // ~200 tris, raio 3 m: "pequena e compacta"
    ensureBoundsTree(bus);
    expect((bus.geometry as any).boundsTree).toBeUndefined();
    ensureBoundsTree(bus, CROSSED_MIN_BVH_TRIS);
    expect((bus.geometry as any).boundsTree).toBeDefined();
    const tiny = new Mesh(new SphereGeometry(1, 4, 3)); // < 64 tris
    ensureBoundsTree(tiny, CROSSED_MIN_BVH_TRIS);
    expect((tiny.geometry as any).boundsTree).toBeUndefined();
    expect((tiny.geometry.userData as any)['_cortexBvhSkip']).toBe(CROSSED_MIN_BVH_TRIS);
  });
});
