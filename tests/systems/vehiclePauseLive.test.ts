/**
 * SPEC-0306: a pausa do VehicleControlSystem é lida ao vivo de `options.pauseWhen`.
 * O jogo troca a função depois do `setupVehicle` (menu de pausa) — antes a troca se
 * perdia e o carro seguia andando com o menu aberto.
 *
 * Rapier real + World real; o carro é empurrado por `autopilot` (sem input).
 */
import { describe, it, expect } from 'vitest';
import { Object3D, PerspectiveCamera } from 'three';
import { World } from '../../src/ecs/World.js';
import { VehicleControlSystem, type VehicleControlOptions } from '../../src/systems/VehicleControlSystem.js';
import { RapierPhysics } from '../../src/physics/RapierPhysics.js';
import type { GamepadManager } from '../../src/core/GamepadManager.js';

const FRAME_MS = 1000 / 60;
const SETTLE_FRAMES = 60;
const ACCEL_FRAMES = 90;
const PAUSED_FRAMES = 120;
const RESUME_FRAMES = 30;
const ENGINE_FORCE = 3000;
const MIN_SPEED = 1; // m/s: andando de verdade antes da pausa
const GROUND_HALF = 500;

describe('pausa do veículo lida ao vivo (SPEC-0306)', () => {
  it('trocar options.pauseWhen depois congela carro e física; ao voltar, segue de onde parou', async () => {
    const physics = await RapierPhysics.create();
    physics.addBody({
      type: 'fixed',
      position: { x: 0, y: -0.5, z: 0 },
      shape: { kind: 'box', halfExtents: { x: GROUND_HALF, y: 0.5, z: GROUND_HALF } },
    });
    const vehicle = physics.createVehicle({
      position: { x: 0, y: 1, z: 0 },
      chassisHalfExtents: { x: 1, y: 0.4, z: 2 },
      wheels: [
        { position: { x: -0.9, y: -0.3, z: 1.4 }, radius: 0.4, steering: true },
        { position: { x: 0.9, y: -0.3, z: 1.4 }, radius: 0.4, steering: true },
        { position: { x: -0.9, y: -0.3, z: -1.4 }, radius: 0.4, powered: true },
        { position: { x: 0.9, y: -0.3, z: -1.4 }, radius: 0.4, powered: true },
      ],
    });
    const gamepad = { getButtonValue: () => 0, getAxis: () => 0, isButtonDown: () => false };
    // como o setupVehicle: pausa original só do editor
    const options: VehicleControlOptions = { active: () => false, autopilot: () => true, pauseWhen: () => false };
    const world = new World();
    world.addSystem(
      new VehicleControlSystem(physics, vehicle, new Object3D(), new PerspectiveCamera(), gamepad as unknown as GamepadManager, undefined, options),
    );

    for (let i = 0; i < SETTLE_FRAMES; i++) world.tick(FRAME_MS);
    vehicle.setEngineForce(ENGINE_FORCE);
    vehicle.setBrake(0);
    for (let i = 0; i < ACCEL_FRAMES; i++) world.tick(FRAME_MS);
    const speedBefore = vehicle.forwardSpeed();
    expect(Math.abs(speedBefore)).toBeGreaterThan(MIN_SPEED);

    // o jogo embrulha a pausa DEPOIS de criar o sistema (menu de pausa)
    let menuOpen = true;
    const original = options.pauseWhen;
    options.pauseWhen = () => (original?.() ?? false) || menuOpen;

    const p0 = vehicle.chassisTranslation();
    for (let i = 0; i < PAUSED_FRAMES; i++) world.tick(FRAME_MS);
    expect(vehicle.chassisTranslation()).toEqual(p0);
    expect(vehicle.forwardSpeed()).toBe(speedBefore);

    menuOpen = false;
    world.tick(FRAME_MS);
    // velocidade preservada: o 1º quadro pós-pausa anda ~speed·dt, sem salto acumulado
    const firstStep = Math.hypot(vehicle.chassisTranslation().x - p0.x, vehicle.chassisTranslation().z - p0.z);
    const expectedStep = Math.abs(speedBefore) * (FRAME_MS / 1000);
    expect(firstStep).toBeGreaterThan(expectedStep * 0.5);
    expect(firstStep).toBeLessThan(expectedStep * 2);
    for (let i = 0; i < RESUME_FRAMES; i++) world.tick(FRAME_MS);
    expect(Math.hypot(vehicle.chassisTranslation().x - p0.x, vehicle.chassisTranslation().z - p0.z)).toBeGreaterThan(firstStep);

    physics.dispose();
  });
});
