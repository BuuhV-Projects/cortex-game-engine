/**
 * SPEC-0687 — carro com pose externa fora do passo do VehicleArcadeSystem: o sistema não roda o controlador, não lê
 * o corpo e não escreve a malha; de volta a 'physics', a malha recebe a pose do corpo no mesmo quadro.
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
const FRAME_MS_60FPS = 1000 / 60;
const CAR_SPACING = 6;
const SLAB = 0.5;
const SETTLE_FRAMES = 30;
const SLEEP_TRIES = 90;
const MARK = 123;

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

async function fleet(cars: number) {
  const physics = await RapierPhysics.create();
  const ground = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -SLAB, 0));
  physics.world.createCollider(RAPIER.ColliderDesc.cuboid(60, SLAB, 60), ground);
  const world = new World();
  const entries = [];
  for (let i = 0; i < cars; i++) {
    const vehicle = makeVehicle(physics, i * CAR_SPACING);
    const object = new Object3D();
    const component = new ArcadeVehicleComponent(vehicle, new GroundAdhesion(physics, vehicle));
    world.createEntity().addComponent(new Object3DComponent(object)).addComponent(component);
    entries.push({ vehicle, object, component });
  }
  world.addSystem(new VehicleArcadeSystem(physics));
  return { world, physics, entries };
}

describe('VehicleArcadeSystem com poseOwner (SPEC-0687)', () => {
  it("carro 'external' fica fora do controlador, da leitura do corpo e da malha", async () => {
    const { world, entries } = await fleet(2);
    const { vehicle, object, component } = entries[0]!;
    vehicle.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    component.poseOwner = 'external';
    object.position.set(MARK, MARK, MARK);
    const update = vi.spyOn(vehicle, 'update');
    const translation = vi.spyOn(vehicle.body, 'translation');
    const rotation = vi.spyOn(vehicle.body, 'rotation');
    const sleeping = vi.spyOn(vehicle.body, 'isSleeping');
    vehicle.body.setNextKinematicTranslation({ x: 3, y: 1, z: 4 });
    world.tick(FRAME_MS_30FPS);
    expect(update).not.toHaveBeenCalled();
    expect(translation).not.toHaveBeenCalled();
    expect(rotation).not.toHaveBeenCalled();
    expect(sleeping).not.toHaveBeenCalled();
    expect(object.position.x).toBe(MARK);
    // o corpo andou no mundo mesmo assim (o Rapier avança todos)
    expect(vehicle.body.translation().x).toBeCloseTo(3, 5);
  });

  it("o carro 'physics' do lado segue igual ao caminho antigo", async () => {
    const { world, entries } = await fleet(2);
    entries[0]!.component.poseOwner = 'external';
    for (let i = 0; i < SETTLE_FRAMES; i++) world.tick(FRAME_MS_60FPS);
    const { vehicle, object } = entries[1]!;
    const t = vehicle.chassisTranslation();
    expect(object.position.x).toBeCloseTo(t.x, 6);
    expect(object.position.y).toBeCloseTo(t.y, 6);
    expect(object.position.z).toBeCloseTo(t.z, 6);
  });

  it("de volta a 'physics', a malha recebe a pose do corpo no mesmo quadro", async () => {
    const { world, entries } = await fleet(1);
    const { vehicle, object, component } = entries[0]!;
    vehicle.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    component.poseOwner = 'external';
    vehicle.body.setNextKinematicTranslation({ x: 5, y: 1, z: -2 });
    world.tick(FRAME_MS_30FPS);
    expect(object.position.x).toBe(0);
    vehicle.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    component.poseOwner = 'physics';
    world.tick(FRAME_MS_60FPS);
    const t = vehicle.chassisTranslation();
    expect(object.position.x).toBeCloseTo(t.x, 6);
    expect(object.position.z).toBeCloseTo(t.z, 6);
  });

  it("dormindo, voltar a 'physics' copia a pose uma vez", async () => {
    const { world, entries } = await fleet(1);
    const { vehicle, object, component } = entries[0]!;
    vehicle.setBrake(50);
    for (let i = 0; i < SLEEP_TRIES && !vehicle.body.isSleeping(); i++) world.tick(FRAME_MS_30FPS);
    expect(vehicle.body.isSleeping()).toBe(true);
    component.poseOwner = 'external';
    object.position.set(MARK, MARK, MARK);
    world.tick(FRAME_MS_30FPS);
    expect(object.position.x).toBe(MARK);
    component.poseOwner = 'physics';
    world.tick(FRAME_MS_30FPS);
    expect(object.position.x).toBeCloseTo(vehicle.chassisTranslation().x, 6);
    // e depois não copia de novo enquanto dorme
    object.position.set(MARK, MARK, MARK);
    world.tick(FRAME_MS_30FPS);
    expect(object.position.x).toBe(MARK);
  });

  it('atribuir o mesmo dono não sobe a versão; trocar sobe', async () => {
    const { entries } = await fleet(1);
    const { component } = entries[0]!;
    const before = ArcadeVehicleComponent.poseOwnerVersion;
    component.poseOwner = 'physics';
    expect(ArcadeVehicleComponent.poseOwnerVersion).toBe(before);
    component.poseOwner = 'external';
    expect(ArcadeVehicleComponent.poseOwnerVersion).toBe(before + 1);
  });

  it('carro criado depois entra na lista (a query muda de identidade)', async () => {
    const { world, physics } = await fleet(1);
    world.tick(FRAME_MS_60FPS);
    const vehicle = makeVehicle(physics, -CAR_SPACING);
    const object = new Object3D();
    world.createEntity().addComponent(new Object3DComponent(object)).addComponent(new ArcadeVehicleComponent(vehicle));
    const update = vi.spyOn(vehicle, 'update');
    world.tick(FRAME_MS_60FPS);
    expect(update).toHaveBeenCalledTimes(1);
    expect(object.position.x).toBeCloseTo(vehicle.chassisTranslation().x, 6);
  });

  it("a leitura do corpo cai só pelos 'external' (contagem)", async () => {
    const { world, entries } = await fleet(4);
    for (const { vehicle } of entries) vehicle.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    entries[0]!.component.poseOwner = 'external';
    entries[1]!.component.poseOwner = 'external';
    const reads = entries.map(({ vehicle }) => vi.spyOn(vehicle.body, 'translation'));
    world.tick(FRAME_MS_60FPS);
    expect(reads.map((r) => r.mock.calls.length)).toEqual([0, 0, 1, 1]);
  });
});
