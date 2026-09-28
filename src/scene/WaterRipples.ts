import { Vector4 } from 'three';

export const WATER_RIPPLE_CAPACITY = 8;
export const WATER_RIPPLE_LIFETIME = 3;
export const WATER_RIPPLE_SPEED = 2.5;
export const WATER_RIPPLE_MAX_STRENGTH = 1;

/** Pool fixo: x/z do centro, idade em segundos e intensidade. */
export class WaterRipples {
  readonly values: Vector4[] = [];
  private nextIndex = 0;

  constructor() {
    for (let index = 0; index < WATER_RIPPLE_CAPACITY; index++) {
      this.values.push(new Vector4(0, 0, 0, 0));
    }
  }

  add(x: number, z: number, strength: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(strength) || strength < 0) {
      throw new RangeError('Water ripple coordinates and strength must be finite; strength must be nonnegative.');
    }
    this.values[this.nextIndex].set(x, z, 0, Math.min(strength, WATER_RIPPLE_MAX_STRENGTH));
    this.nextIndex = (this.nextIndex + 1) % WATER_RIPPLE_CAPACITY;
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    for (const ripple of this.values) {
      if (ripple.w === 0) continue;
      ripple.z += deltaSeconds;
      if (ripple.z >= WATER_RIPPLE_LIFETIME) ripple.w = 0;
    }
  }
}
