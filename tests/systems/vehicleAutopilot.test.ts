import { describe, expect, it, vi } from 'vitest';

/**
 * SPEC-0223: com `autopilot`, um `active()` falso deixa de estacionar o carro —
 * as forças escritas por quem dirige (IA, replay) sobrevivem ao substep.
 */
type Forces = { engine: number[]; brake: number[] };

/** Reproduz a decisão do `VehicleControlSystem` para o ramo não-dirigindo. */
function applyIdleBranch(
  options: { active?: () => boolean; autopilot?: () => boolean; maxBrake?: number },
  forces: Forces,
): void {
  const driving = options.active?.() ?? true;
  if (driving) return;
  if (!(options.autopilot?.() ?? false)) {
    forces.engine.push(0);
    forces.brake.push(options.maxBrake ?? 50);
  }
}

describe('autopilot do VehicleControlSystem (SPEC-0223)', () => {
  it('estaciona quando active() é falso e não há autopilot', () => {
    const forces: Forces = { engine: [], brake: [] };
    applyIdleBranch({ active: () => false, maxBrake: 65 }, forces);
    expect(forces.engine).toEqual([0]);
    expect(forces.brake).toEqual([65]);
  });

  it('não escreve nada quando autopilot está ligado', () => {
    const forces: Forces = { engine: [], brake: [] };
    applyIdleBranch({ active: () => false, autopilot: () => true, maxBrake: 65 }, forces);
    expect(forces.engine).toEqual([]);
    expect(forces.brake).toEqual([]);
  });

  it('autopilot é ignorado enquanto active() for verdadeiro', () => {
    const forces: Forces = { engine: [], brake: [] };
    applyIdleBranch({ active: () => true, autopilot: () => true }, forces);
    expect(forces.engine).toEqual([]);
    expect(forces.brake).toEqual([]);
  });

  it('é consultado a cada substep, não capturado uma vez', () => {
    const autopilot = vi.fn(() => false);
    const forces: Forces = { engine: [], brake: [] };
    const options = { active: () => false, autopilot, maxBrake: 50 };
    applyIdleBranch(options, forces);
    autopilot.mockReturnValue(true);
    applyIdleBranch(options, forces);
    expect(autopilot).toHaveBeenCalledTimes(2);
    expect(forces.engine).toEqual([0]);
  });
});
