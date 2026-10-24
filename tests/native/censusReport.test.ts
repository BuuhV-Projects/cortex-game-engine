import { describe, it, expect } from 'vitest';
import { aggregateCensus, parseCounts } from '../../native/scripts/perf/census-report.mjs';

describe('census-report (SPEC-0505)', () => {
  it('parses labels that contain ":" and "+"', () => {
    expect(parseCounts('lambert+fog=3;refused:node:colorNode=1')).toEqual([
      ['lambert+fog', 3],
      ['refused:node:colorNode', 1],
    ]);
  });

  it('sums samples and computes coverage over drawn (skip excluded) objects', () => {
    const r = aggregateCensus([
      { rendererCensus: { objects: 4, covered: 2, refused: 1, skip: 1, classes: 'lambert+fog=2;refused:wireframe=1;skip=1' } },
      { cpu: { render: 1 } },
      { rendererCensus: { objects: 4, covered: 3, refused: 0, skip: 1, classes: 'lambert+fog=3;skip=1' } },
    ]);
    expect(r).toMatchObject({ samples: 2, objects: 8, covered: 5, refused: 1, skip: 2 });
    expect(r.coveragePct).toBeCloseTo((100 * 5) / 6);
    expect(r.coveredClasses).toEqual([['lambert+fog', 5]]);
    expect(r.refusals).toEqual([['refused:wireframe', 1]]);
  });
});
