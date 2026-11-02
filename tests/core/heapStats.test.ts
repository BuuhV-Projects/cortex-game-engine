/**
 * Heap do Hermes no perf-trace (SPEC-0664): converte os bytes do `getInstrumentedStats` em MB e some fora do Hermes.
 */
import { describe, it, expect } from 'vitest';
import { readHeapStats } from '../../src/core/heapStats.js';

const MB = 1024 * 1024;

describe('readHeapStats (SPEC-0664)', () => {
  it('lê heap, alocado e memória externa em MB', () => {
    expect(readHeapStats({ js_heapSize: 296 * MB, js_allocatedBytes: 167 * MB, js_externalBytes: 1814 * MB })).toEqual({ heapMB: 296, allocMB: 167, externalMB: 1814 });
  });

  it('fora do Hermes não há amostra', () => {
    expect(readHeapStats(undefined)).toBeUndefined();
    expect(readHeapStats()).toBeUndefined(); // vitest roda no V8, sem HermesInternal
  });
});
