/**
 * Testes do CharacterColliderGizmoSystem (src/editor/CharacterColliderGizmoSystem.ts):
 * desenha a cápsula 3D do CharacterBody no modo editor, ancorada nos pés.
 */

import { describe, it, expect } from 'vitest';
import { Scene, Mesh, Group } from 'three';
import { World } from '../../src/ecs/World.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { CharacterBodyComponent } from '../../src/components/CharacterBodyComponent.js';
import { Object3DComponent } from '../../src/components/Object3DComponent.js';
import { CharacterColliderGizmoSystem } from '../../src/editor/CharacterColliderGizmoSystem.js';

function setup(active: boolean) {
  const scene = new Scene();
  const state = { active } as { active: boolean };
  const world = new World();
  world.addSystem(new CharacterColliderGizmoSystem(state as never, scene));
  const e = world.createEntity();
  e.addComponent(new TransformComponent(3, 1, -2, 0));
  e.addComponent(new CharacterBodyComponent({ radius: 0.4, height: 1.8, footOffset: 0 }));
  const playerObj = new Mesh();
  e.addComponent(new Object3DComponent(playerObj));
  const group = scene.children.find((c) => c.name === '__editor_character_gizmos') as Group;
  return { world, e, group, state, playerObj };
}

describe('CharacterColliderGizmoSystem', () => {
  it('cria uma cápsula (mesh) por CharacterBody no modo editor', () => {
    const { world, group } = setup(true);
    world.tick(16);
    expect(group.visible).toBe(true);
    expect(group.children).toHaveLength(1);
    expect(group.children[0]).toBeInstanceOf(Mesh);
  });

  it('posiciona a cápsula no centro (pés + meia altura) seguindo o Transform', () => {
    const { world, group } = setup(true);
    world.tick(16);
    const mesh = group.children[0] as Mesh;
    // feetY = t.y - footOffset = 1; centro = 1 + height/2 = 1.9
    expect(mesh.position.x).toBeCloseTo(3, 5);
    expect(mesh.position.y).toBeCloseTo(1.9, 5);
    expect(mesh.position.z).toBeCloseTo(-2, 5);
  });

  it('fica invisível fora do modo editor', () => {
    const { world, group } = setup(false);
    world.tick(16);
    expect(group.visible).toBe(false);
  });

  it('aponta a cápsula como proxy de clique pro personagem (cortexPickProxy)', () => {
    const { world, group, playerObj } = setup(true);
    world.tick(16);
    expect((group.children[0] as Mesh).userData['cortexPickProxy']).toBe(playerObj);
  });

  it('marca o grupo/cápsula como editorInternal (fora do outliner/export)', () => {
    const { world, group } = setup(true);
    world.tick(16);
    expect(group.userData['editorInternal']).toBe(true);
    expect((group.children[0] as Mesh).userData['editorInternal']).toBe(true);
  });
});
