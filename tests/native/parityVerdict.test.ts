import { describe, it, expect } from 'vitest';
import { parityVerdict, PARITY_MAX_PCT } from '../../native/scripts/perf/parity-verdict.mjs';

const W = 100;
const H = 100;
function frame(fill: (i: number) => number): { path: string; width: number; height: number; buffer: Uint8Array } {
  const buffer = new Uint8Array(W * H * 4);
  for (let i = 0; i < buffer.length; i++) buffer[i] = fill(i);
  return { path: 'synthetic', width: W, height: H, buffer };
}
const flat = (): ReturnType<typeof frame> => frame(() => 100);
/** Same frame with the first `pixels` pixels shifted by `by` in every channel. */
const shifted = (pixels: number, by: number): ReturnType<typeof frame> => frame((i) => (i < pixels * 4 ? 100 + by : 100));

describe('parityVerdict (SPEC-0525)', () => {
  it('passes identical frames', () => {
    expect(parityVerdict([flat(), flat(), flat(), flat()])).toMatchObject({ pass: true, noise: 0, diffMax: 0 });
  });

  it('fails a difference that alternates with the path (the planted case)', () => {
    const v = parityVerdict([flat(), shifted(50, 8), flat(), shifted(50, 8)]);
    expect(v).toMatchObject({ pass: false, noise: 0, diffMax: 8 });
    expect(v.diffPct).toBeGreaterThan(PARITY_MAX_PCT);
  });

  it('passes noise that also shows between frames of the same path', () => {
    expect(parityVerdict([flat(), shifted(50, 3), shifted(50, 3), flat()]).pass).toBe(true);
  });

  it('fails a short capture', () => {
    expect(parityVerdict([flat(), flat(), flat()])).toMatchObject({ pass: false });
  });
});
