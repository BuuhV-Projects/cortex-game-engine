/**
 * Motos (SPEC-0735 / ADR-0734): raio por roda, inclinação só visual e estado do piloto.
 *
 * O que trava: cada roda gira com o próprio raio (antes todas usavam o da roda 0);
 * a inclinação gira só o nó visual, pela guinada do corpo, e o corpo do Rapier sai
 * igual a uma simulação sem inclinação; sem a opção, nada muda.
 */
import { describe, it, expect } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { Object3D, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { VehicleControlSystem, type VehicleControlOptions } from '../../src/systems/VehicleControlSystem.js';
import { VehicleArcadeSystem } from '../../src/systems/VehicleArcadeSystem.js';
import { ArcadeVehicleComponent } from '../../src/components/ArcadeVehicleComponent.js';
import { Object3DComponent } from '../../src/components/Object3DComponent.js';
import { World } from '../../src/ecs/World.js';
import { RapierPhysics } from '../../src/physics/RapierPhysics.js';
import { VehicleLean } from '../../src/physics/VehicleLean.js';

const ONE_SECOND_MS = 1000;
const FRAME_MS = 1000 / 60;
const SPEED = 6;
const YAW_LEFT = 1;

/** Veículo de mentira: velocidade, guinada e rodas fixas; registra o giro pedido de cada roda. */
function fakeVehicle(radii: number[], yawRate = 0) {
  const spins: number[] = [];
  return {
    spins,
    wheels: radii.map((radius) => ({ position: { x: 0, y: 0, z: 0 }, radius })),
    forwardSpeed: () => SPEED,
    body: { angvel: () => ({ x: 0, y: yawRate, z: 0 }), rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }) },
    chassisTranslation: () => ({ x: 0, y: 0, z: 0 }),
    chassisRotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
    wheelLocalTransform: (i: number, _p: Vector3, _q: Quaternion, spin: number) => {
      spins[i] = spin;
    },
    setEngineForce: () => {},
    setBrake: () => {},
    setSteering: () => {},
  };
}

/** Sistema do jogador sem input (autopilot) nem passo de física. */
function control(vehicle: ReturnType<typeof fakeVehicle>, car: Object3D, options: VehicleControlOptions = {}) {
  return new VehicleControlSystem(
    {} as never, vehicle as never, car, new PerspectiveCamera(), { getAxis: () => 0 } as never, undefined,
    { stepPhysics: false, active: () => false, autopilot: () => true, ...options },
  );
}

/** Moto com um nó visual filho chamado `Body`. */
function moto() {
  const car = new Object3D();
  const body = new Object3D();
  body.name = 'Body';
  car.add(body);
  return { car, body };
}

describe('VehicleLean (ADR-0734)', () => {
  it('curva à esquerda tomba para a esquerda (+X), limitada a maxLean', () => {
    const lean = new VehicleLean(new Object3D(), { maxLean: 0.3, leanRate: 1000 });
    lean.update(fakeVehicle([], YAW_LEFT) as never, 1);
    expect(lean.angle).toBeCloseTo(-0.3);
  });

  it('sem curva fica de pé; a suavização aproxima aos poucos', () => {
    const still = new VehicleLean(new Object3D());
    still.update(fakeVehicle([], 0) as never, 1);
    expect(still.angle).toBe(0);
    const slow = new VehicleLean(new Object3D(), { maxLean: 1, leanRate: 1 });
    slow.update(fakeVehicle([], YAW_LEFT) as never, 0.1);
    const equilibrium = -Math.atan((SPEED * YAW_LEFT) / 9.81);
    expect(slow.angle).toBeCloseTo(equilibrium * 0.1);
  });

  it('preserva a rotação de base do nó', () => {
    const node = new Object3D();
    node.rotation.y = 1;
    const base = node.quaternion.clone();
    const lean = new VehicleLean(node, { leanRate: 1000 });
    lean.update(fakeVehicle([], YAW_LEFT) as never, 1);
    const expected = base.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), lean.angle));
    expect(node.quaternion.angleTo(expected)).toBeCloseTo(0);
  });
});

describe('VehicleControlSystem — rodas e inclinação (SPEC-0735)', () => {
  it('cada roda gira com o próprio raio', () => {
    const vehicle = fakeVehicle([0.3, 0.3, 0.6, 0.6]);
    const wheels = [0, 1, 2, 3].map(() => new Object3D());
    control(vehicle, new Object3D(), { wheelObjects: wheels }).update([], ONE_SECOND_MS);
    expect(vehicle.spins[0]).toBeCloseTo(SPEED / 0.3);
    expect(vehicle.spins[2]).toBeCloseTo(SPEED / 0.6);
  });

  it('lean pelo nome gira só o nó filho', () => {
    const { car, body } = moto();
    control(fakeVehicle([], YAW_LEFT), car, { lean: { object: 'Body', leanRate: 1000 } }).update([], ONE_SECOND_MS);
    expect(body.rotation.z).toBeLessThan(0);
    expect(car.quaternion.equals(new Quaternion())).toBe(true);
  });

  it('sem a opção, ou com a própria raiz, nada inclina', () => {
    const { car, body } = moto();
    control(fakeVehicle([], YAW_LEFT), car).update([], ONE_SECOND_MS);
    expect(body.rotation.z).toBe(0);
    control(fakeVehicle([], YAW_LEFT), car, { lean: { object: car } }).update([], ONE_SECOND_MS);
    expect(car.quaternion.equals(new Quaternion())).toBe(true);
  });

  it('expõe ré e freio do quadro', () => {
    const vehicle = { ...fakeVehicle([]), forwardSpeed: () => 0 };
    const brake = { value: (a: string) => (a === 'brake' ? 1 : 0), axis: () => 0, isDown: () => false };
    const system = control(vehicle as never, new Object3D(), { active: () => true, actions: brake as never });
    system.update([], FRAME_MS);
    expect(system.reversing).toBe(true);
    expect(system.braking).toBe(false);
    expect(system.throttleLevel).toBe(0);
  });
});

describe('VehicleArcadeSystem — inclinação da frota (SPEC-0735)', () => {
  /** Uma moto girando para a esquerda, com ou sem `lean`; devolve o nó e o corpo depois de 10 quadros. */
  async function spin(withLean: boolean) {
    const physics = await RapierPhysics.create();
    const ground = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(60, 0.5, 60), ground);
    const vehicle = physics.createVehicle({
      position: { x: 0, y: 1, z: 0 },
      chassisHalfExtents: { x: 0.3, y: 0.4, z: 1 },
      wheels: [
        { position: { x: -0.05, y: -0.3, z: 0.8 }, radius: 0.32, steering: true },
        { position: { x: 0.05, y: -0.3, z: 0.8 }, radius: 0.32, steering: true },
        { position: { x: -0.05, y: -0.3, z: -0.8 }, radius: 0.35, powered: true },
        { position: { x: 0.05, y: -0.3, z: -0.8 }, radius: 0.35, powered: true },
      ],
    });
    vehicle.body.setLinvel({ x: 0, y: 0, z: SPEED }, true);
    vehicle.body.setAngvel({ x: 0, y: YAW_LEFT, z: 0 }, true);
    const { car, body } = moto();
    const component = new ArcadeVehicleComponent(vehicle);
    if (withLean) component.lean = new VehicleLean(body);
    const world = new World();
    world.createEntity().addComponent(new Object3DComponent(car)).addComponent(component);
    world.addSystem(new VehicleArcadeSystem(physics));
    for (let i = 0; i < 10; i++) world.tick(FRAME_MS);
    return { body, translation: vehicle.body.translation(), rotation: vehicle.body.rotation() };
  }

  it('inclina o nó visual e deixa o corpo igual a uma simulação sem lean', async () => {
    const leaning = await spin(true);
    const plain = await spin(false);
    expect(leaning.body.rotation.z).toBeLessThan(0);
    expect(plain.body.rotation.z).toBe(0);
    expect(leaning.translation).toEqual(plain.translation);
    expect(leaning.rotation).toEqual(plain.rotation);
  });
});
