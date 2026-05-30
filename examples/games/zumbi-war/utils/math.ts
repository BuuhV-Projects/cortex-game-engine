export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}
