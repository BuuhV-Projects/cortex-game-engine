/**
 * SPEC-0648: a queda de um quadro longo (100 ms) não atravessa o chão — o raio de chão sai de
 * onde os pés estavam antes da queda.
 */
import { describe, it, expect } from 'vitest';
import { Object3D, Mesh, BoxGeometry, MeshBasicMaterial } from 'three';
import { World } from '../../src/ecs/World.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { CharacterBodyComponent } from '../../src/components/CharacterBodyComponent.js';
import { CharacterPhysicsSystem } from '../../src/systems/CharacterPhysicsSystem.js';

/** Calçada (topo em 0) sobre um terreno 1,5 m abaixo, como o patamar das quadras do Port Hollow. */
function setup(): { world: World; t: TransformComponent; c: CharacterBodyComponent } {
  const scene = new Object3D();
  const walk = new Mesh(new BoxGeometry(10, 0.2, 10), new MeshBasicMaterial());
  walk.position.y = -0.1;
  const terrain = new Mesh(new BoxGeometry(40, 1, 40), new MeshBasicMaterial());
  terrain.position.y = -2;
  scene.add(walk, terrain);
  scene.updateMatrixWorld(true);
  const world = new World();
  world.addSystem(new CharacterPhysicsSystem([scene]));
  const e = world.createEntity();
  const t = new TransformComponent(0, 0.3, 0);
  const c = new CharacterBodyComponent({ footOffset: 0 });
  e.addComponent(t);
  e.addComponent(c);
  return { world, t, c };
}

describe('SPEC-0648: queda de quadro longo pousa na superfície cruzada', () => {
  it('descendo a 9 m/s num quadro de 100 ms (queda > stepHeight) pousa na calçada, não no terreno', () => {
    const { world, t, c } = setup();
    c.velocityY = -9;
    world.tick(100);
    expect(t.y).toBeCloseTo(0, 6);
    expect(c.grounded).toBe(true);
  });

  it('o mesmo pulo a 16 ms pousa no mesmo lugar', () => {
    const { world, t, c } = setup();
    c.velocityY = -9;
    for (let i = 0; i < 10; i++) world.tick(16);
    expect(t.y).toBeCloseTo(0, 6);
  });
});
