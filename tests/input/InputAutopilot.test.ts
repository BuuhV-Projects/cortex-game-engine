/**
 * Tests for the measurement autopilot (src/input/InputAutopilot.ts) — SPEC-0414.
 * Deterministic script, invalid profiles refused, off without the query, and the
 * virtual pad reaching InputActions through the real GamepadManager.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BUILTIN_AUTOPILOT_PROFILES,
  InputAutopilot,
  autopilotFromQuery,
  validateAutopilotProfile,
  type AutopilotProfile,
} from '../../src/input/InputAutopilot.js';
import { GamepadManager } from '../../src/core/GamepadManager.js';
import { InputActions } from '../../src/input/InputActions.js';
import { GP_A, GP_AXIS_LEFT_Y, GP_RT } from '../../src/input/padLayout.js';
import type { InputManager } from '../../src/core/InputManager.js';

const PROFILE: AutopilotProfile = {
  steps: [
    { s: 1, axes: { leftY: -1 } },
    { s: 0.2, buttons: ['A'] },
    { s: 0.5 },
    { s: 1, buttons: ['RT'] },
  ],
};
const FRAME_S = 1 / 60;

/** Pad state after each frame, for `seconds` of play. */
function trace(pilot: InputAutopilot, seconds: number, dt: number): string[] {
  const out: string[] = [];
  for (let t = 0; t < seconds; t += dt) {
    pilot.step(dt);
    const pad = pilot.getGamepads()[0]!;
    out.push(`${pilot.stepIndex}:${pad.axes.join(',')}:${pad.buttons.map((b) => (b.pressed ? 1 : 0)).join('')}`);
  }
  return out;
}

describe('InputAutopilot', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('plays the steps in a loop by game clock', () => {
    const pilot = new InputAutopilot(PROFILE);
    expect(pilot.cycleS).toBeCloseTo(2.7);
    const pad = pilot.getGamepads()[0]!;
    expect(pad.axes[GP_AXIS_LEFT_Y]).toBe(-1);
    pilot.step(1.05);
    expect(pad.buttons[GP_A]!.pressed).toBe(true);
    expect(pad.axes[GP_AXIS_LEFT_Y]).toBe(0);
    pilot.step(0.2);
    expect(pad.buttons[GP_A]!.pressed).toBe(false);
    pilot.step(0.5);
    expect(pad.buttons[GP_RT]!.value).toBe(1);
    pilot.step(1); // wraps to step 0
    expect(pilot.stepIndex).toBe(0);
  });

  it('is deterministic: same clock, same sequence', () => {
    expect(trace(new InputAutopilot(PROFILE), 6, FRAME_S)).toEqual(trace(new InputAutopilot(PROFILE), 6, FRAME_S));
  });

  it('refuses invalid profiles', () => {
    expect(() => validateAutopilotProfile({ steps: [] })).toThrow(/sem passos/);
    expect(() => validateAutopilotProfile({ steps: [{ s: 0.01 }] })).toThrow(/passo 0: duração/);
    expect(() => validateAutopilotProfile({ steps: [{ s: 1 }, { s: 1, buttons: ['Z'] }] })).toThrow(/passo 1: botão/);
    expect(() => validateAutopilotProfile({ steps: [{ s: 1, axes: { up: 1 } }] })).toThrow(/eixo desconhecido/);
    expect(() => validateAutopilotProfile({ steps: [{ s: 1, axes: { leftX: 2 } }] })).toThrow(/fora de -1..1/);
    expect(() => autopilotFromQuery('?autopilot=nope')).toThrow(/perfil desconhecido 'nope'/);
  });

  it('built-in profiles are valid and walk returns to where it started', () => {
    for (const profile of Object.values(BUILTIN_AUTOPILOT_PROFILES)) validateAutopilotProfile(profile);
    // every left-stick displacement of `walk` has its opposite: net zero over a loop
    const net = { leftX: 0, leftY: 0 };
    for (const step of BUILTIN_AUTOPILOT_PROFILES.walk!.steps) {
      net.leftX += (step.axes?.leftX ?? 0) * step.s;
      net.leftY += (step.axes?.leftY ?? 0) * step.s;
    }
    expect(net.leftX).toBeCloseTo(0);
    expect(net.leftY).toBeCloseTo(0);
  });

  it('is off without the query', () => {
    expect(autopilotFromQuery('')).toBeNull();
    expect(autopilotFromQuery('?spawn=setorO&drive=1')).toBeNull();
    expect(autopilotFromQuery('?spawn=setorO&autopilot=walk')!.profileName).toBe('walk');
  });

  it('reaches InputActions through navigator.getGamepads and uninstalls', () => {
    const real = () => [];
    vi.stubGlobal('navigator', { getGamepads: real });
    const pilot = new InputAutopilot(PROFILE);
    const uninstall = pilot.install();
    const gamepad = new GamepadManager();
    const input = { isKeyDown: () => false, isButtonDown: () => false } as unknown as InputManager;
    const actions = new InputActions(input, gamepad);
    gamepad.poll();
    actions.poll();
    expect(actions.isDown('moveForward')).toBe(true);
    pilot.step(1.05);
    gamepad.poll();
    actions.poll();
    expect(actions.pressed('jump')).toBe(true);
    uninstall();
    expect(navigator.getGamepads).toBe(real);
  });
});
