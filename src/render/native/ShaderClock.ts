/**
 * Shader clock of the native renderer (R1.5, SPEC-0565, ADR-0566): seconds of game update — it
 * pauses with the game and freezes under `?parityFreeze` (the `Game._update` does not run), unlike
 * the TSL `time` (the renderer's clock). The native renderer copies it into `view.time`; the three
 * side of the same game material reads {@link shaderTime}, so both draw the same frame.
 *
 * Wraps at {@link SHADER_TIME_ROLLOVER_S} like Godot's `TIME` (`rendering/limits/time/time_rollover_secs`):
 * a float32 `sin(time * k)` keeps its precision, at the cost of one jump per lap.
 */
import { uniform } from 'three/tsl';

/** Seconds before the clock wraps to 0 (Godot's default rollover). */
export const SHADER_TIME_ROLLOVER_S = 3600;

/**
 * TSL uniform with the shader clock, for the three side of a game WGSL material.
 *
 * @example
 * material.positionNode = positionLocal.add(vec3(0, sin(positionLocal.x.add(shaderTime)), 0));
 */
export const shaderTime = uniform(0);

/** Advances the clock by one game update (called by the `Game`). */
export function advanceShaderTime(deltaSeconds: number): void {
  shaderTime.value = (shaderTime.value + deltaSeconds) % SHADER_TIME_ROLLOVER_S;
}
