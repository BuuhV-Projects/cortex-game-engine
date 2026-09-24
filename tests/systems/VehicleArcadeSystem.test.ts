/**
 * Frota de carros no mesmo mundo (SPEC-0259), com Rapier e ECS reais.
 *
 * O defeito que motivou o sistema: com vários carros, os da IA davam
 * `vehicle.update` fora do passo do mundo. Aqui o mundo anda UMA vez por passo,
 * não importa quantos carros existam.
 */
import { describe, it, expect, vi } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { Object3D } from 'three';
import { World } from '../../src/ecs/World.js';
import { Object3DComponent } from '../../src/components/Object3DComponent.js';
import { ArcadeVehicleComponent } from '../../src/components/ArcadeVehicleComponent.js';
import { VehicleArcadeSystem } from '../../src/systems/VehicleArcadeSystem.js';
import { RapierPhysics, type Vehicle } from '../../src/physics/RapierPhysics.js';
import { GroundAdhesion } from '../../src/physics/GroundAdhesion.js';

const FRAME_MS_30FPS = 1000 / 30;
const CAR_SPACING = 6;
const SLAB = 0.5;

function makeVehicle(physics: RapierPhysics, x: number): Vehicle {
  return physics.createVehicle({
    position: { x, y: 1, z: 0 },
    chassisHalfExtents: { x: 1, y: 0.4, z: 2 },
    wheels: [
      { position: { x: -0.9, y: -0.3, z: 1.4 }, radius: 0.4, steering: true },
      { position: { x: 0.9, y: -0.3, z: 1.4 }, radius: 0.4, steering: true },
      { position: { x: -0.9, y: -0.3, z: -1.4 }, radius: 0.4, powered: true },
      { position: { x: 0.9, y: -0.3, z: -1.4 }, radius: 0.4, powered: true },
    ],
  });
}

async function fleet(cars: number, withAdhesion = true) {
  const physics = await RapierPhysics.create();
  const ground = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -SLAB, 0));
  physics.world.createCollider(RAPIER.ColliderDesc.cuboid(60, SLAB, 60), ground);
  const world = new World();
  const entries = [];
  for (let i = 0; i < cars; i++) {
    const vehicle = makeVehicle(physics, i * CAR_SPACING);
    const object = new Object3D();
    const adhesion = withAdhesion ? new GroundAdhesion(physics, vehicle) : null;
    world
      .createEntity()
      .addComponent(new Object3DComponent(object))
      .addComponent(new ArcadeVehicleComponent(vehicle, adhesion));
    entries.push({ vehicle, object, adhesion });
  }
  const stepSpy = vi.spyOn(physics, 'step');
  world.addSystem(new VehicleArcadeSystem(physics));
  return { world, physics, entries, stepSpy };
}

describe('VehicleArcadeSystem', () => {
  it('o mundo anda uma vez por passo, com 1 ou 6 carros', async () => {
    for (const cars of [1, 6]) {
      const { world, stepSpy } = await fleet(cars);
      world.tick(FRAME_MS_30FPS); // 30 fps = 2 passos de 1/60
      expect(stepSpy, `${cars} carro(s)`).toHaveBeenCalledTimes(2);
    }
  });

  it('cada carro faz update em todo passo, antes do mundo andar', async () => {
    const { world, entries, physics } = await fleet(3);
    const order: string[] = [];
    vi.spyOn(physics, 'step').mockImplementation(function (this: RapierPhysics) {
      order.push('world');
      this.world.step();
    });
    entries.forEach(({ vehicle }, i) => {
      const real = vehicle.update.bind(vehicle);
      vi.spyOn(vehicle, 'update').mockImplementation((dt) => {
        order.push(`car${i}`);
        real(dt);
      });
    });
    world.tick(FRAME_MS_30FPS);
    expect(order).toEqual(['car0', 'car1', 'car2', 'world', 'car0', 'car1', 'car2', 'world']);
  });

  it('escreve a pose do chassi na malha de cada carro', async () => {
    const { world, entries } = await fleet(2);
    for (let i = 0; i < 30; i++) world.tick(1000 / 60);
    for (const { vehicle, object } of entries) {
      const t = vehicle.chassisTranslation();
      expect(object.position.x).toBeCloseTo(t.x, 6);
      expect(object.position.y).toBeCloseTo(t.y, 6);
      expect(object.position.z).toBeCloseTo(t.z, 6);
    }
  });

  it('aplica a aderência de cada carro', async () => {
    const { world, entries } = await fleet(2);
    for (let i = 0; i < 60; i++) world.tick(1000 / 60);
    for (const { adhesion } of entries) expect(adhesion!.grounded).toBe(true);
  });

  it('carro sem aderência ainda anda no passo compartilhado', async () => {
    const { world, entries, stepSpy } = await fleet(2, false);
    const update = vi.spyOn(entries[0]!.vehicle, 'update');
    world.tick(1000 / 60);
    expect(update).toHaveBeenCalledTimes(1);
    expect(stepSpy).toHaveBeenCalledTimes(1);
  });
});
