/**
 * Aderência arcade ao chão (SPEC-0259), com Rapier real.
 *
 * Cada propriedade arcade é comparada com o MESMO cenário sem aderência: sem o
 * controle negativo, um teste que passa não diria se foi a aderência ou o
 * próprio veículo de simulação que produziu o resultado.
 */
import { describe, it, expect } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import { RapierPhysics, type Vehicle } from '../../src/physics/RapierPhysics.js';
import { GroundAdhesion } from '../../src/physics/GroundAdhesion.js';

const STEP = 1 / 60;
const TWO_SECONDS = 120;
const RAMP_DEGREES = 10;
/** Meia-espessura das caixas usadas como chão. */
const SLAB = 0.5;

function makeVehicle(physics: RapierPhysics, position: { x: number; y: number; z: number }): Vehicle {
  return physics.createVehicle({
    position,
    chassisHalfExtents: { x: 1, y: 0.4, z: 2 },
    wheels: [
      { position: { x: -0.9, y: -0.3, z: 1.4 }, radius: 0.4, steering: true },
      { position: { x: 0.9, y: -0.3, z: 1.4 }, radius: 0.4, steering: true },
      { position: { x: -0.9, y: -0.3, z: -1.4 }, radius: 0.4, powered: true },
      { position: { x: 0.9, y: -0.3, z: -1.4 }, radius: 0.4, powered: true },
    ],
  });
}

/** Caixa fixa com o topo em y=0, opcionalmente inclinada em torno de X. */
function addSlab(physics: RapierPhysics, halfX: number, halfZ: number, pitchDeg = 0, centerZ = 0): Vector3 {
  const angle = (pitchDeg * Math.PI) / 180;
  const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), angle);
  // Normal do topo depois da rotação; o centro fica a SLAB abaixo do topo.
  const normal = new Vector3(0, 1, 0).applyQuaternion(q);
  const body = physics.world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(-normal.x * SLAB, -normal.y * SLAB, centerZ - normal.z * SLAB)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
  );
  physics.world.createCollider(RAPIER.ColliderDesc.cuboid(halfX, SLAB, halfZ), body);
  return normal;
}

/** Roda `steps` passos; com `adhesion`, aplica antes de cada `update`, como o sistema. */
function simulate(physics: RapierPhysics, vehicle: Vehicle, adhesion: GroundAdhesion | null, steps: number): void {
  for (let i = 0; i < steps; i++) {
    physics.advance(STEP, (step) => {
      adhesion?.apply(step);
      vehicle.update(step);
    });
  }
}

function position(vehicle: Vehicle): Vector3 {
  const t = vehicle.chassisTranslation();
  return new Vector3(t.x, t.y, t.z);
}

function up(vehicle: Vehicle): Vector3 {
  const r = vehicle.chassisRotation();
  return new Vector3(0, 1, 0).applyQuaternion(new Quaternion(r.x, r.y, r.z, r.w));
}

describe('GroundAdhesion', () => {
  it('assenta no chão plano com a normal para cima', async () => {
    const physics = await RapierPhysics.create();
    addSlab(physics, 30, 30);
    const vehicle = makeVehicle(physics, { x: 0, y: 1, z: 0 });
    const adhesion = new GroundAdhesion(physics, vehicle);
    simulate(physics, vehicle, adhesion, TWO_SECONDS);
    expect(adhesion.grounded).toBe(true);
    expect(adhesion.groundNormal.y).toBeGreaterThan(0.999);
    expect(position(vehicle).y).toBeGreaterThan(0.5);
    expect(position(vehicle).y).toBeLessThan(1.1);
  });

  it('parado na rampa não escorrega — sem aderência, escorrega', async () => {
    const slide = async (withAdhesion: boolean): Promise<number> => {
      const physics = await RapierPhysics.create();
      addSlab(physics, 30, 30, RAMP_DEGREES);
      const vehicle = makeVehicle(physics, { x: 0, y: 1.1, z: 0 });
      const adhesion = withAdhesion ? new GroundAdhesion(physics, vehicle) : null;
      simulate(physics, vehicle, adhesion, TWO_SECONDS / 4); // assenta
      // Zera a velocidade trazida da queda: o que se mede é a gravidade
      // acelerando o carro rampa abaixo, não inércia (que o arcade conserva,
      // como conservaria num plano).
      vehicle.reset();
      const start = position(vehicle);
      simulate(physics, vehicle, adhesion, TWO_SECONDS);
      return position(vehicle).distanceTo(start);
    };
    const control = await slide(false);
    const arcade = await slide(true);
    // O controle prova que a rampa derruba o carro de simulação; sem isto,
    // "não escorregou" poderia ser só atrito.
    expect(control).toBeGreaterThan(0.5);
    expect(arcade).toBeLessThan(0.1);
  });

  it('alinha o chassi com a rampa', async () => {
    const physics = await RapierPhysics.create();
    const rampNormal = addSlab(physics, 30, 30, RAMP_DEGREES);
    const vehicle = makeVehicle(physics, { x: 0, y: 1.1, z: 0 });
    const adhesion = new GroundAdhesion(physics, vehicle);
    simulate(physics, vehicle, adhesion, TWO_SECONDS / 2);
    expect(adhesion.grounded).toBe(true);
    expect(adhesion.groundNormal.dot(rampNormal)).toBeGreaterThan(0.999);
    expect(up(vehicle).dot(rampNormal)).toBeGreaterThan(0.999);
  });

  it('solta o carro na borda: sai da plataforma e cai', async () => {
    const physics = await RapierPhysics.create();
    // Plataforma curta: o carro nasce perto da borda +z e anda para ela.
    addSlab(physics, 10, 4, 0, -2);
    const vehicle = makeVehicle(physics, { x: 0, y: 1, z: 0 });
    const adhesion = new GroundAdhesion(physics, vehicle);
    simulate(physics, vehicle, adhesion, TWO_SECONDS / 4);
    expect(adhesion.grounded).toBe(true);
    vehicle.setEngineForce(4000);
    simulate(physics, vehicle, adhesion, TWO_SECONDS);
    expect(adhesion.grounded).toBe(false);
    expect(position(vehicle).y).toBeLessThan(-1);
  });

  it('parede não é chão: rampa acima de minNormalY solta', async () => {
    const physics = await RapierPhysics.create();
    addSlab(physics, 30, 30, RAMP_DEGREES);
    const vehicle = makeVehicle(physics, { x: 0, y: 1.1, z: 0 });
    // cos(10°) = 0,985: exigir 0,99 torna esta rampa "íngreme demais".
    const adhesion = new GroundAdhesion(physics, vehicle, { minNormalY: 0.99 });
    simulate(physics, vehicle, adhesion, TWO_SECONDS / 2);
    expect(adhesion.grounded).toBe(false);
  });
});

describe('Vehicle.wheelFilterGroups', () => {
  /** InteractionGroups: 16 bits altos = pertence a; 16 baixos = enxerga. */
  const groups = (memberships: number, filter: number): number => ((memberships << 16) | filter) >>> 0;
  const GROUND = 0x0002;
  const ALL = 0xffff;

  async function wheelsTouch(wheelGroups: number | undefined): Promise<boolean> {
    const physics = await RapierPhysics.create();
    const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -SLAB, 0));
    physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(30, SLAB, 30).setCollisionGroups(groups(GROUND, ALL)),
      body,
    );
    const vehicle = makeVehicle(physics, { x: 0, y: 1, z: 0 });
    vehicle.wheelFilterGroups = wheelGroups;
    simulate(physics, vehicle, null, TWO_SECONDS / 4);
    return vehicle.wheelIsInContact(0);
  }

  it('sem filtro as rodas apoiam no chão', async () => {
    expect(await wheelsTouch(undefined)).toBe(true);
  });

  it('com filtro que exclui o grupo do chão as rodas não o enxergam', async () => {
    expect(await wheelsTouch(groups(ALL, ALL & ~GROUND))).toBe(false);
  });
});

describe('RapierPhysics.advance', () => {
  it('anda o tempo pedido em passos iguais de no máximo 1/60', async () => {
    const physics = await RapierPhysics.create();
    const seen: number[] = [];
    const steps = physics.advance(0.05, (step) => seen.push(step));
    expect(steps).toBe(3);
    expect(seen.reduce((a, b) => a + b, 0)).toBeCloseTo(0.05, 12);
    for (const s of seen) expect(s).toBeLessThanOrEqual(1 / 60 + 1e-12);
  });

  it('não avança com dt zero', async () => {
    const physics = await RapierPhysics.create();
    expect(physics.advance(0)).toBe(0);
  });
});
