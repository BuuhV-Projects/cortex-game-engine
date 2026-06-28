/**
 * Testes do CharacterColliderGizmoSystem (src/editor/CharacterColliderGizmoSystem.ts):
 * cápsula de LINHAS (contorno limpo) do CharacterBody no editor, ancorada nos pés,
 * puramente visual (raycast desligado).
 */

import { describe, it, expect } from 'vitest';
import { Scene, LineSegments, Group } from 'three';
import { World } from '../../src/ecs/World.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { CharacterBodyComponent } from '../../src/components/CharacterBodyComponent.js';
import { CharacterColliderGizmoSystem } from '../../src/editor/CharacterColliderGizmoSystem.js';

function setup(active: boolean) {
  const scene = new Scene();
  const state = { active } as { active: boolean };
  const world = new World();
  world.addSystem(new CharacterColliderGizmoSystem(state as never, scene));
  const e = world.createEntity();
  e.addComponent(new TransformComponent(3, 1, -2, 0));
  e.addComponent(new CharacterBodyComponent({ radius: 0.4, height: 1.8, footOffset: 0 }));
  const group = scene.children.find((c) => c.name === '__editor_character_gizmos') as Group;
  return { world, e, group, state };
}

describe('CharacterColliderGizmoSystem', () => {
  it('cria uma cápsula de linhas por CharacterBody no modo editor', () => {
    const { world, group } = setup(true);
    world.tick(16);
    expect(group.visible).toBe(true);
    expect(group.children).toHaveLength(1);
    expect(group.children[0]).toBeInstanceOf(LineSegments);
  });

  it('posiciona a cápsula no centro (pés + meia altura) seguindo o Transform', () => {
    const { world, group } = setup(true);
    world.tick(16);
    const obj = group.children[0] as LineSegments;
    expect(obj.position.x).toBeCloseTo(3, 5);
    expect(obj.position.y).toBeCloseTo(1.9, 5); // feetY(1) + height/2(0.9)
    expect(obj.position.z).toBeCloseTo(-2, 5);
  });

  it('é puramente visual: raycast desligado (não clicável)', () => {
    const { world, group } = setup(true);
    world.tick(16);
    const obj = group.children[0] as LineSegments;
    const hits: unknown[] = [];
    obj.raycast({} as never, hits as never);
    expect(hits).toHaveLength(0);
  });

  it('fica invisível fora do modo editor', () => {
    const { world, group } = setup(false);
    world.tick(16);
    expect(group.visible).toBe(false);
  });

  it('marca grupo/cápsula como editorInternal (fora do outliner/export/seleção)', () => {
    const { world, group } = setup(true);
    world.tick(16);
    expect(group.userData['editorInternal']).toBe(true);
    expect((group.children[0] as LineSegments).userData['editorInternal']).toBe(true);
  });
});
