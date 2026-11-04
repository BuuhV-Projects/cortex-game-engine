/**
 * `TerrainCollisionSystem` com a classificação guardada (SPEC-0674): corpo, componente ou terreno que muda depois do
 * 1º passo é visto no passo seguinte; terreno movido/escalado dá a mesma altura que o `worldToLocal` de antes.
 */
import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { World } from '../../src/ecs/World.js';
import { Terrain } from '../../src/scene/Terrain.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { KinematicBodyComponent } from '../../src/components/KinematicBodyComponent.js';
import { PlatformerBodyComponent } from '../../src/components/PlatformerBodyComponent.js';
import { TerrainComponent } from '../../src/components/TerrainComponent.js';
import { TerrainCollisionSystem } from '../../src/systems/TerrainCollisionSystem.js';
import { structureVersion } from '../../src/ecs/structureVersion.js';

function setup() {
  const world = new World();
  world.addSystem(new TerrainCollisionSystem());
  const terrain = new Terrain({ size: 20, resolution: 20 });
  terrain.sculpt(0, 0, 8, 3);
  const te = world.createEntity();
  te.addComponent(new TerrainComponent(terrain, terrain.mesh));
  return { world, terrain, te };
}

describe('TerrainCollisionSystem — classificação guardada (SPEC-0674)', () => {
  it('a versão do ECS sobe ao criar/destruir entidade e ao pôr/tirar componente', () => {
    const world = new World();
    const v0 = structureVersion();
    const e = world.createEntity();
    const v1 = structureVersion();
    expect(v1).toBeGreaterThan(v0);
    e.addComponent(new TransformComponent());
    const v2 = structureVersion();
    expect(v2).toBeGreaterThan(v1);
    e.removeComponent(KinematicBodyComponent); // não tinha: não muda
    expect(structureVersion()).toBe(v2);
    e.removeComponent(TransformComponent);
    expect(structureVersion()).toBeGreaterThan(v2);
    const v3 = structureVersion();
    world.destroyEntity(e);
    expect(structureVersion()).toBeGreaterThan(v3);
  });

  it('corpo criado depois do 1º passo é aterrado', () => {
    const { world, terrain } = setup();
    world.tick(16); // classifica: sem corpos
    const e = world.createEntity();
    const t = new TransformComponent(0, -5, 0);
    e.addComponent(t);
    e.addComponent(new KinematicBodyComponent());
    world.tick(16);
    expect(t.y).toBeCloseTo(terrain.heightAt(0, 0)!);
  });

  it('componente de corpo ADICIONADO a entidade existente passa a contar; REMOVIDO, deixa de contar', () => {
    const { world, terrain } = setup();
    const e = world.createEntity();
    const t = new TransformComponent(0, -5, 0);
    e.addComponent(t);
    world.tick(16);
    expect(t.y).toBe(-5); // sem corpo: não mexe
    const pb = new PlatformerBodyComponent();
    pb.vy = -3;
    e.addComponent(pb);
    world.tick(16);
    expect(t.y).toBeCloseTo(terrain.heightAt(0, 0)!);
    expect(pb.grounded).toBe(true);
    expect(pb.vy).toBe(0);
    e.removeComponent(PlatformerBodyComponent);
    t.y = -5;
    world.tick(16);
    expect(t.y).toBe(-5);
  });

  it('terreno movido, girado e escalado: a mesma altura que worldToLocal/localToWorld', () => {
    const { world, terrain } = setup();
    const e = world.createEntity();
    const t = new TransformComponent(3, -50, 2);
    e.addComponent(t);
    e.addComponent(new KinematicBodyComponent());
    world.tick(16);
    terrain.mesh.position.set(2, 1, -1);
    terrain.mesh.rotation.y = 0.6;
    terrain.mesh.scale.set(1.5, 2, 1.5);
    t.y = -50;
    world.tick(16);
    const v = terrain.mesh.worldToLocal(new Vector3(3, 0, 2));
    const local = new Vector3(v.x, terrain.heightAt(v.x, v.z)!, v.z);
    expect(t.y).toBe(terrain.mesh.localToWorld(local).y);
  });

  it('terreno destruído some do passo seguinte', () => {
    const { world, te } = setup();
    const e = world.createEntity();
    const t = new TransformComponent(0, -5, 0);
    e.addComponent(t);
    e.addComponent(new KinematicBodyComponent());
    world.tick(16);
    world.destroyEntity(te);
    t.y = -5;
    world.tick(16);
    expect(t.y).toBe(-5);
  });
});
