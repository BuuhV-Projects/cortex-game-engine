/**
 * Cálculo de passos do `RapierPhysics.advance` (SPEC-0671, ADR-0672): passos
 * iguais de no máximo 1/60 s, no máximo `maxSteps` por quadro, excedente
 * descartado.
 */
import { describe, it, expect } from 'vitest';
import { physicsSubsteps } from '../../src/physics/physicsSubsteps.js';
import { MAX_PHYSICS_STEP_S, MAX_PHYSICS_STEPS, RapierPhysics } from '../../src/physics/RapierPhysics.js';

const STEP = 1 / 60;

describe('physicsSubsteps', () => {
  it('dt 1/60 exato é um passo de 1/60', () => {
    expect(physicsSubsteps(STEP, STEP, 3)).toEqual({ steps: 1, step: STEP });
  });

  it('abaixo do teto anda o dt inteiro em passos iguais ≤ 1/60', () => {
    const { steps, step } = physicsSubsteps(0.04, STEP, 3);
    expect(steps).toBe(3);
    expect(steps * step).toBeCloseTo(0.04, 12);
    expect(step).toBeLessThanOrEqual(STEP);
  });

  it('acima do teto para em maxSteps passos de 1/60 e descarta o resto', () => {
    const { steps, step } = physicsSubsteps(0.1, STEP, 3);
    expect(steps).toBe(3);
    expect(step).toBeCloseTo(STEP, 12);
  });

  it('o teto é configurável', () => {
    expect(physicsSubsteps(0.1, STEP, 6).steps).toBe(6);
    expect(physicsSubsteps(0.1, STEP, 1)).toEqual({ steps: 1, step: STEP });
  });

  it('dt zero, negativo ou NaN, ou teto < 1, não avança', () => {
    for (const dt of [0, -0.01, Number.NaN]) expect(physicsSubsteps(dt, STEP, 3)).toEqual({ steps: 0, step: 0 });
    expect(physicsSubsteps(0.02, STEP, 0)).toEqual({ steps: 0, step: 0 });
  });

  it('o RapierPhysics usa o teto padrão de 3 e respeita o do jogo', async () => {
    expect(MAX_PHYSICS_STEPS).toBe(3);
    expect(MAX_PHYSICS_STEP_S).toBe(STEP);
    const physics = await RapierPhysics.create();
    expect(physics.maxStepsPerFrame).toBe(3);
    expect(physics.advance(0.1)).toBe(3);
    physics.maxStepsPerFrame = 5;
    expect(physics.advance(0.1)).toBe(5);
    physics.dispose();
  });
});
