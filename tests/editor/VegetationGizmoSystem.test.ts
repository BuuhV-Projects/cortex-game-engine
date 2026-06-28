/**
 * Testes do VegetationGizmoSystem (src/editor/VegetationGizmoSystem.ts): caixa de
 * linhas em UMA instância (seleção individual) ou em TODAS (grupo), só no editor.
 */

import { describe, it, expect } from 'vitest';
import { Scene, Mesh, BoxGeometry, MeshBasicMaterial, LineSegments, Group } from 'three';
import { World } from '../../src/ecs/World.js';
import { Vegetation } from '../../src/scene/Vegetation.js';
import { VegetationGizmoSystem } from '../../src/editor/VegetationGizmoSystem.js';

function setup(active: boolean) {
  const scene = new Scene();
  const state = { active } as { active: boolean };
  const world = new World();
  const sys = new VegetationGizmoSystem(state as never, scene);
  world.addSystem(sys);
  const veg = new Vegetation(new Mesh(new BoxGeometry(1, 2, 1), new MeshBasicMaterial()));
  veg.setInstances([0, 0, 0, 0, 1, 5, 0, 5, 0, 1, -3, 0, 2, 0, 1]); // 3 árvores
  scene.add(veg.group);
  const group = scene.children.find((c) => c.name === '__editor_vegetation_gizmos') as Group;
  const lines = (): LineSegments => group.children[0] as LineSegments;
  const vertCount = (): number => (lines().geometry.getAttribute('position')?.count ?? 0);
  return { world, sys, veg, vegGroup: veg.group, group, vertCount };
}

describe('VegetationGizmoSystem', () => {
  it('uma instância → 24 vértices (12 arestas da caixa)', () => {
    const { world, sys, veg, vegGroup, group, vertCount } = setup(true);
    sys.show(veg, vegGroup, 0);
    world.tick(16);
    expect(group.visible).toBe(true);
    expect(vertCount()).toBe(24); // 12 arestas × 2
  });

  it('grupo inteiro (index -1) → caixa em todas (3× as arestas)', () => {
    const { world, sys, veg, vegGroup, vertCount } = setup(true);
    sys.show(veg, vegGroup, -1);
    world.tick(16);
    expect(vertCount()).toBe(24 * 3); // 3 instâncias
  });

  it('hide some o gizmo', () => {
    const { world, sys, veg, vegGroup, group } = setup(true);
    sys.show(veg, vegGroup, 0);
    world.tick(16);
    sys.hide();
    world.tick(16);
    expect(group.visible).toBe(false);
  });

  it('fica invisível fora do editor', () => {
    const { world, sys, veg, vegGroup, group } = setup(false);
    sys.show(veg, vegGroup, 0);
    world.tick(16);
    expect(group.visible).toBe(false);
  });
});
