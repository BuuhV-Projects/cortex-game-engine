import { describe, it, expect } from 'vitest';
import { beginSection, endSection, setRenderSections } from '../../src/render/RenderSections.js';

describe('RenderSections (R1.6 phase 0, SPEC-0585)', () => {
  it('forwards begin/end to the profiler, and is a no-op without one', () => {
    const calls: string[] = [];
    setRenderSections({ begin: (n) => calls.push(`+${n}`), end: (n) => calls.push(`-${n}`) });
    beginSection('nativeEmit');
    endSection('nativeEmit');
    expect(calls).toEqual(['+nativeEmit', '-nativeEmit']);
    setRenderSections(null);
    beginSection('nativeEmit');
    expect(calls).toHaveLength(2);
  });

  it('?renderSectionSpin=<name> waits only inside that section (the known-answer case)', () => {
    const g = globalThis as unknown as { location?: { search: string } };
    const saved = g.location;
    g.location = { search: '?a=1&renderSectionSpin=nativeCull&b=2' };
    setRenderSections({ begin: () => undefined, end: () => undefined });
    const t0 = performance.now();
    beginSection('nativeEmit');
    const other = performance.now() - t0;
    const t1 = performance.now();
    beginSection('nativeCull');
    const spun = performance.now() - t1;
    expect(spun).toBeGreaterThanOrEqual(2);
    expect(other).toBeLessThan(1);
    g.location = saved;
    setRenderSections(null);
  });
});
