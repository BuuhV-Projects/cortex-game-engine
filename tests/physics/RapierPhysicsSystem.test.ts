/**
 * TDD da integração Rapier↔ECS (ADR-0061): o RapierBodyComponent declara o corpo e
 * o RapierPhysicsSystem dá step + escreve direto no Object3D (pos+quaternion). O
 * sistema é síncrono (recebe o RapierPhysics já criado), então testa sem mocks.
 */
import { describe, it, expect } from 'vitest';
import { Mesh, BoxGeometry, MeshBasicMaterial } from 'three';
import { World } from '../../src/ecs/World.js';
import { Object3DComponent } from '../../src/components/Object3DComponent.js';
import { RapierPhysics } from '../../src/physics/RapierPhysics.js';
import { RapierBodyComponent } from '../../src/components/RapierBodyComponent.js';
import { RapierPhysicsSystem } from '../../src/systems/RapierPhysicsSystem.js';

function box(size: number, x: number, y: number, z: number): Mesh {
  const m = new Mesh(new BoxGeometry(size, size, size), new MeshBasicMaterial());
  m.position.set(x, y, z);
  return m;
}

describe('RapierPhysicsSystem (Rapier ↔ ECS)', () => {
  it('corpo dynamic cai e o Object3D ACOMPANHA até pousar no chão fixo', async () => {
    const physics = await RapierPhysics.create();
    const world = new World();
    world.addSystem(new RapierPhysicsSystem(physics));

    // chão fixo (via ECS): topo em y=0
    const floor = box(1, 0, -0.5, 0);
    floor.scale.set(20, 1, 20);
    const fe = world.createEntity();
    fe.addComponent(new Object3DComponent(floor));
    fe.addComponent(new RapierBodyComponent({ bodyType: 'fixed', shape: { kind: 'auto' } }));

    // caixa dynamic lá no alto
    const b = box(1, 0, 10, 0);
    const be = world.createEntity();
    be.addComponent(new Object3DComponent(b));
    be.addComponent(new RapierBodyComponent({ bodyType: 'dynamic', shape: { kind: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } } }));

    for (let i = 0; i < 240; i++) world.tick(16);

    expect(b.position.y).toBeCloseTo(0.5, 1); // topo do chão (0) + meia-altura (0.5)
    expect(floor.position.y).toBeCloseTo(-0.5, 5); // fixo não se mexe
  });

  it('shape "auto" deriva a caixa do bounds do mesh (respeita escala)', async () => {
    const physics = await RapierPhysics.create();
    const world = new World();
    world.addSystem(new RapierPhysicsSystem(physics));

    const floor = box(1, 0, -0.5, 0);
    floor.scale.set(20, 1, 20);
    const fe = world.createEntity();
    fe.addComponent(new Object3DComponent(floor));
    fe.addComponent(new RapierBodyComponent({ bodyType: 'fixed', shape: { kind: 'auto' } }));

    // cubo de lado 2 (meia-altura 1) no alto, shape auto
    const b = box(2, 0, 8, 0);
    const be = world.createEntity();
    be.addComponent(new Object3DComponent(b));
    be.addComponent(new RapierBodyComponent({ shape: { kind: 'auto' } })); // type default dynamic

    for (let i = 0; i < 240; i++) world.tick(16);
    expect(b.position.y).toBeCloseTo(1, 0); // meia-altura 1 pousada no topo do chão (0)
  });

  it('dois corpos dynamic colidem e empilham (não interpenetram)', async () => {
    const physics = await RapierPhysics.create();
    const world = new World();
    world.addSystem(new RapierPhysicsSystem(physics));

    const floor = box(1, 0, -0.5, 0);
    floor.scale.set(20, 1, 20);
    const fe = world.createEntity();
    fe.addComponent(new Object3DComponent(floor));
    fe.addComponent(new RapierBodyComponent({ bodyType: 'fixed', shape: { kind: 'auto' } }));

    const mk = (y: number): Mesh => {
      const m = box(1, 0, y, 0);
      const e = world.createEntity();
      e.addComponent(new Object3DComponent(m));
      e.addComponent(new RapierBodyComponent({ bodyType: 'dynamic', shape: { kind: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } } }));
      return m;
    };
    const a = mk(2);
    const c = mk(6);

    for (let i = 0; i < 400; i++) world.tick(16);
    expect(a.position.y).toBeCloseTo(0.5, 0); // a no chão
    expect(c.position.y).toBeGreaterThan(a.position.y + 0.8); // c empilhado em cima
  });
});
