/** SPEC-0655 — carro parado dorme: a regra de repouso do VehicleArcadeSystem. */
import { describe, it, expect } from 'vitest';
import { REST_SPEED, REST_STEPS, atRest, nextRestSteps, type RestingVehicle } from '../../src/physics/VehicleRest.js';

function car(over: Partial<{ force: number; speed: number; spin: number; grounded: boolean[] }> = {}): RestingVehicle {
  const { force = 0, speed = 0, spin = 0, grounded = [true, true, true, true] } = over;
  return {
    engineForce: force,
    wheelCount: grounded.length,
    linvelSquared: () => speed * speed,
    angvelSquared: () => spin * spin,
    wheelIsInContact: (i) => grounded[i]!,
  };
}

describe('VehicleRest (SPEC-0655)', () => {
  it('parado, sem motor e com as rodas no chão está em repouso', () => {
    expect(atRest(car())).toBe(true);
  });

  it('motor, velocidade, giro ou roda no ar tiram do repouso', () => {
    expect(atRest(car({ force: 1 }))).toBe(false);
    expect(atRest(car({ speed: REST_SPEED * 2 }))).toBe(false);
    expect(atRest(car({ spin: 1 }))).toBe(false);
    expect(atRest(car({ grounded: [true, true, false, true] }))).toBe(false);
  });

  it('conta subpassos seguidos e zera fora do repouso', () => {
    let steps = 0;
    for (let i = 0; i < REST_STEPS; i++) steps = nextRestSteps(steps, car());
    expect(steps).toBe(REST_STEPS);
    expect(nextRestSteps(steps, car({ force: 1 }))).toBe(0);
  });
});
