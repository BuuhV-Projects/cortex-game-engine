/**
 * Passo do veículo independente do fps (ADR-0257).
 *
 * Antes: um `physics.step()` por frame com o timestep padrão do Rapier (1/60),
 * então a física andava 1,25 s por segundo real a 75 fps. Com teto de fps isso
 * viraria mudança de jogabilidade (a 37,5 fps o carro andaria na metade).
 *
 * Exercita o sistema real, com física e veículo falsos que só registram.
 */
import { describe, it, expect, vi } from 'vitest';
import { Object3D, PerspectiveCamera } from 'three';
import { VehicleControlSystem } from '../../src/systems/VehicleControlSystem.js';
import type { RapierPhysics, Vehicle } from '../../src/physics/RapierPhysics.js';
import type { GamepadManager } from '../../src/core/GamepadManager.js';

const RAPIER_DEFAULT_TIMESTEP = 1 / 60;

function setup() {
  const stepped: number[] = [];
  const world = { timestep: RAPIER_DEFAULT_TIMESTEP };
  const physics = { world, step: vi.fn(() => stepped.push(world.timestep)) };
  const vehicle = {
    wheels: [],
    update: vi.fn(),
    keepUpright: vi.fn(),
    setEngineForce: vi.fn(),
    setBrake: vi.fn(),
    setSteering: vi.fn(),
    forwardSpeed: () => 0,
    chassisTranslation: () => ({ x: 0, y: 0, z: 0 }),
    chassisRotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
  };
  const gamepad = { getButtonValue: () => 0, getAxis: () => 0, isButtonDown: () => false };
  const system = new VehicleControlSystem(
    physics as unknown as RapierPhysics,
    vehicle as unknown as Vehicle,
    new Object3D(),
    new PerspectiveCamera(),
    gamepad as unknown as GamepadManager,
    undefined,
    { active: () => false }, // estacionado: sem entrada, sem câmera
  );
  return { system, stepped, world, vehicle };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('passo do VehicleControlSystem (ADR-0257)', () => {
  it('a física anda o mesmo tempo que o relógio, a qualquer fps', () => {
    for (const fps of [30, 37.5, 50, 60, 75, 144]) {
      const { system, stepped } = setup();
      const frames = Math.round(fps); // um segundo
      for (let i = 0; i < frames; i++) system.update([], 1000 / fps);
      expect(sum(stepped), `a ${fps} fps`).toBeCloseTo(frames / fps, 9);
    }
  });

  it('a 75 fps todo frame dá exatamente um passo — nenhum frame parado', () => {
    const { system, stepped } = setup();
    for (let i = 0; i < 75; i++) system.update([], 1000 / 75);
    expect(stepped).toHaveLength(75);
  });

  it('nenhum passo passa de 1/60 s (limite de estabilidade da suspensão)', () => {
    const { system, stepped } = setup();
    system.update([], 100); // pior caso: o teto de delta do GameLoop
    expect(stepped.length).toBe(6);
    for (const dt of stepped) expect(dt).toBeLessThanOrEqual(RAPIER_DEFAULT_TIMESTEP + 1e-12);
  });

  it('a 60 fps exatos é um passo de 1/60, como antes', () => {
    const { system, stepped } = setup();
    system.update([], 1000 / 60);
    expect(stepped).toEqual([RAPIER_DEFAULT_TIMESTEP]);
  });

  it('veículo e anti-capotamento usam o mesmo subpasso da física', () => {
    const { system, vehicle } = setup();
    system.update([], 1000 / 30);
    expect(vehicle.update.mock.calls.map((c) => c[0])).toEqual([1 / 60, 1 / 60]);
    expect(vehicle.keepUpright.mock.calls.map((c) => c[2])).toEqual([1 / 60, 1 / 60]);
  });

  it('restaura o timestep do mundo (pode ser compartilhado)', () => {
    const { system, world } = setup();
    system.update([], 1000 / 75);
    expect(world.timestep).toBe(RAPIER_DEFAULT_TIMESTEP);
  });

  it('dt zero não avança a física', () => {
    const { system, stepped } = setup();
    system.update([], 0);
    expect(stepped).toHaveLength(0);
  });
});
