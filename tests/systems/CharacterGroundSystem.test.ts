/**
 * Testes do CharacterGroundSystem: o personagem cai e fica EM CIMA de qualquer
 * mesh embaixo (raycast pra baixo) — chão = o próprio mesh, sem collider manual.
 */
import { describe, it, expect } from 'vitest';
import { Object3D, Mesh, BoxGeometry, MeshBasicMaterial } from 'three';
import { World } from '../../src/ecs/World.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { Object3DComponent } from '../../src/components/Object3DComponent.js';
import { CharacterBodyComponent } from '../../src/components/CharacterBodyComponent.js';
import { CharacterPhysicsSystem } from '../../src/systems/CharacterPhysicsSystem.js';
import { CharacterGroundSystem } from '../../src/systems/CharacterGroundSystem.js';

describe('CharacterGroundSystem', () => {
  function sceneWithFloor(topY: number): Object3D {
    const scene = new Object3D();
    const floor = new Mesh(new BoxGeometry(20, 1, 20), new MeshBasicMaterial());
    floor.position.y = topY - 0.5; // topo do box em topY
    scene.add(floor);
    scene.updateMatrixWorld(true);
    return scene;
  }

  it('o personagem cai e pousa em cima do mesh (chão = o próprio mesh)', () => {
    const scene = sceneWithFloor(0);
    const world = new World();
    world.addSystem(new CharacterPhysicsSystem());
    world.addSystem(new CharacterGroundSystem([scene]));
    const e = world.createEntity();
    const t = new TransformComponent(0, 5, 0);
    const c = new CharacterBodyComponent();
    e.addComponent(t);
    e.addComponent(c);

    for (let i = 0; i < 120; i++) world.tick(16);
    expect(t.y).toBeCloseTo(0); // pousou no topo do mesh
    expect(c.grounded).toBe(true);
  });

  it('ignora o próprio mesh do personagem (não se apoia em si)', () => {
    const scene = sceneWithFloor(0);
    const world = new World();
    world.addSystem(new CharacterPhysicsSystem());
    world.addSystem(new CharacterGroundSystem([scene]));
    // o mesh do personagem fica NA cena e cobre os pés — não pode contar como chão
    const selfMesh = new Mesh(new BoxGeometry(1, 2, 1), new MeshBasicMaterial());
    scene.add(selfMesh);
    const e = world.createEntity();
    const t = new TransformComponent(0, 5, 0);
    e.addComponent(t);
    e.addComponent(new Object3DComponent(selfMesh));
    e.addComponent(new CharacterBodyComponent());
    // sincroniza o mesh do personagem à posição (como o Object3DSyncSystem faria)
    world.tick(16);
    selfMesh.position.set(t.x, t.y, t.z);
    selfMesh.updateMatrixWorld(true);

    for (let i = 0; i < 120; i++) {
      world.tick(16);
      selfMesh.position.set(t.x, t.y, t.z);
      selfMesh.updateMatrixWorld(true);
    }
    expect(t.y).toBeCloseTo(0); // pousou no FLOOR, não no próprio mesh
  });
});
