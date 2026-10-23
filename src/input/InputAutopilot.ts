/**
 * **InputAutopilot** — a scripted virtual Xbox controller for performance
 * measurement (SPEC-0414, ADR-0415). It replaces `navigator.getGamepads` with a
 * function that returns one virtual `standard` pad, so every game reads it
 * through the same path as the real controller (GamepadManager, InputActions or
 * raw `getGamepads`), in the Studio and in the native host alike.
 *
 * Off by default: the {@link Game} only creates one when the query has
 * `?autopilot=<profile>`.
 *
 * @example
 * const pilot = new InputAutopilot(BUILTIN_AUTOPILOT_PROFILES.walk!);
 * const uninstall = pilot.install();
 * // per frame, before gamepad.poll():
 * pilot.step(dt);
 */
import {
  GP_A, GP_B, GP_X, GP_Y, GP_LB, GP_RB, GP_LT, GP_RT, GP_BACK, GP_START, GP_L3, GP_R3,
  GP_DPAD_UP, GP_DPAD_DOWN, GP_DPAD_LEFT, GP_DPAD_RIGHT,
  GP_AXIS_LEFT_X, GP_AXIS_LEFT_Y, GP_AXIS_RIGHT_X, GP_AXIS_RIGHT_Y,
} from './padLayout.js';
import { AUTOPILOT_PROFILES } from './autopilotProfiles.js';

/** Shortest step: a step shorter than a frame could be skipped and its press never reach the game. */
export const MIN_STEP_S = 0.1;

/**
 * Most right-stick-Y seconds a profile may accumulate either way (pitch drift from the game's
 * default camera). Built-in profiles stay at 0: yaw-only camera turns (SPEC-0414).
 */
export const MAX_PITCH_STICK_S = 0.3;

/** Query key that turns the autopilot on. */
export const AUTOPILOT_QUERY_KEY = 'autopilot';

const BUTTONS: Record<string, number> = {
  A: GP_A, B: GP_B, X: GP_X, Y: GP_Y, LB: GP_LB, RB: GP_RB, LT: GP_LT, RT: GP_RT,
  BACK: GP_BACK, START: GP_START, L3: GP_L3, R3: GP_R3,
  UP: GP_DPAD_UP, DOWN: GP_DPAD_DOWN, LEFT: GP_DPAD_LEFT, RIGHT: GP_DPAD_RIGHT,
};
const AXES: Record<string, number> = {
  leftX: GP_AXIS_LEFT_X, leftY: GP_AXIS_LEFT_Y, rightX: GP_AXIS_RIGHT_X, rightY: GP_AXIS_RIGHT_Y,
};
const BUTTON_COUNT = GP_DPAD_RIGHT + 1;
const AXIS_COUNT = GP_AXIS_RIGHT_Y + 1;
const PAD_SLOTS = 4;

/** One step of a profile: hold these buttons/axes for `s` seconds. */
export interface AutopilotStep {
  s: number;
  buttons?: string[];
  axes?: Record<string, number>;
}

/** A profile: steps played in a loop. */
export interface AutopilotProfile {
  steps: AutopilotStep[];
}

/** Profiles shipped with the engine (`autopilotProfiles.ts`). */
export const BUILTIN_AUTOPILOT_PROFILES: Readonly<Record<string, AutopilotProfile>> = AUTOPILOT_PROFILES;

/** Throws with the offending step when `profile` is not a valid {@link AutopilotProfile}. */
export function validateAutopilotProfile(profile: AutopilotProfile): void {
  if (!Array.isArray(profile?.steps) || profile.steps.length === 0) throw new Error('autopilot: perfil sem passos');
  profile.steps.forEach((step, i) => {
    const where = `autopilot: passo ${i}`;
    if (!(typeof step.s === 'number' && step.s >= MIN_STEP_S)) throw new Error(`${where}: duração ${step.s} (mínimo ${MIN_STEP_S} s)`);
    for (const b of step.buttons ?? []) if (!(b in BUTTONS)) throw new Error(`${where}: botão desconhecido '${b}'`);
    for (const [axis, v] of Object.entries(step.axes ?? {})) {
      if (!(axis in AXES)) throw new Error(`${where}: eixo desconhecido '${axis}'`);
      if (!(typeof v === 'number' && Math.abs(v) <= 1)) throw new Error(`${where}: eixo ${axis}=${v} fora de -1..1`);
    }
  });
}

/** Minimal shape of the `Gamepad` the engine reads. */
interface VirtualPad {
  id: string;
  index: number;
  connected: boolean;
  mapping: 'standard';
  timestamp: number;
  buttons: { pressed: boolean; value: number }[];
  axes: number[];
}

export class InputAutopilot {
  /** Seconds of one full loop of the profile. */
  readonly cycleS: number;
  private readonly _steps: AutopilotStep[];
  private _index = 0;
  private _left: number;
  private readonly _pad: VirtualPad = {
    id: 'cortex-autopilot (STANDARD GAMEPAD)',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    buttons: Array.from({ length: BUTTON_COUNT }, () => ({ pressed: false, value: 0 })),
    axes: new Array<number>(AXIS_COUNT).fill(0),
  };
  private readonly _slots: (VirtualPad | null)[] = Array.from({ length: PAD_SLOTS }, (_, i) => (i === 0 ? this._pad : null));

  constructor(profile: AutopilotProfile, readonly profileName = '') {
    validateAutopilotProfile(profile);
    this._steps = profile.steps;
    this.cycleS = this._steps.reduce((sum, step) => sum + step.s, 0);
    this._left = this._steps[0]!.s;
    this._apply();
  }

  /** Index of the step being played. */
  get stepIndex(): number {
    return this._index;
  }

  /** The virtual pad as `navigator.getGamepads()` returns it. */
  getGamepads(): readonly (VirtualPad | null)[] {
    return this._slots;
  }

  /** Advances the script by `dt` seconds of game clock. */
  step(dt: number): void {
    this._pad.timestamp += dt;
    this._left -= dt;
    if (this._left > 0) return;
    while (this._left <= 0) {
      this._index = (this._index + 1) % this._steps.length;
      this._left += this._steps[this._index]!.s;
    }
    this._apply();
  }

  /**
   * Replaces `navigator.getGamepads` with the virtual pad (real pads hidden).
   * Returns the function that puts the original back.
   */
  install(nav: { getGamepads?: () => unknown } = globalThis.navigator): () => void {
    const original = nav.getGamepads;
    nav.getGamepads = () => this._slots;
    return () => {
      nav.getGamepads = original;
    };
  }

  private _apply(): void {
    const step = this._steps[this._index]!;
    for (const b of this._pad.buttons) {
      b.pressed = false;
      b.value = 0;
    }
    this._pad.axes.fill(0);
    for (const name of step.buttons ?? []) {
      const b = this._pad.buttons[BUTTONS[name]!]!;
      b.pressed = true;
      b.value = 1;
    }
    for (const [name, v] of Object.entries(step.axes ?? {})) this._pad.axes[AXES[name]!] = v;
  }
}

/**
 * Builds the autopilot asked by `?autopilot=<profile>`, or `null` without it.
 * Throws on an unknown profile: a dead round beats a parked one labelled "moving".
 */
export function autopilotFromQuery(search: string): InputAutopilot | null {
  const name = new URLSearchParams(search).get(AUTOPILOT_QUERY_KEY);
  if (!name) return null;
  const profile = BUILTIN_AUTOPILOT_PROFILES[name];
  if (!profile) {
    throw new Error(`autopilot: perfil desconhecido '${name}' (há: ${Object.keys(BUILTIN_AUTOPILOT_PROFILES).join(', ')})`);
  }
  return new InputAutopilot(profile, name);
}
