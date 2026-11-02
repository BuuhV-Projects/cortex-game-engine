/**
 * Tamanho do heap do Hermes para o perf-trace (SPEC-0664). O teto do heap conta a memória EXTERNA (ArrayBuffers de
 * geometria e textura, ADR-0663): `externalMB` perto dele é o sinal de que o coletor vai rodar sem parar.
 */

/** Megabytes do heap do Hermes numa amostra. */
export interface HeapStats {
  heapMB: number;
  allocMB: number;
  externalMB: number;
}

const BYTES_PER_MB = 1024 * 1024;

type InstrumentedStats = Record<string, number | undefined>;

/** O heap do Hermes agora, ou `undefined` fora dele (navegador, Studio, testes). */
export function readHeapStats(stats: InstrumentedStats | undefined = hermesStats()): HeapStats | undefined {
  if (!stats) return undefined;
  const mb = (key: string): number => Math.round((stats[key] ?? 0) / BYTES_PER_MB);
  return { heapMB: mb('js_heapSize'), allocMB: mb('js_allocatedBytes'), externalMB: mb('js_externalBytes') };
}

function hermesStats(): InstrumentedStats | undefined {
  return (globalThis as { HermesInternal?: { getInstrumentedStats?: () => InstrumentedStats } }).HermesInternal?.getInstrumentedStats?.();
}
