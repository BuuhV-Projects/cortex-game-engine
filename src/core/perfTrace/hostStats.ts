/**
 * Leitores das funções que o host nativo expõe para o perf-trace: contadores da ponte NAPI
 * (`__cortexNapiStats`, SPEC-0225), coletor (`__cortexGcStats`, SPEC-0264) e bytes alocados pelo Hermes
 * (`__cortexAllocatedBytes`, SPEC-0688). Fora do host (navegador, Studio, testes) todos devolvem `null`.
 */
import type { GcTotals } from '../PerfTrace.js';

const BYTES_PER_MB = 1024 * 1024;

type HostGlobals = {
  __cortexNapiStats?: () => Record<string, number>;
  __cortexGcStats?: () => GcTotals;
  __cortexAllocatedBytes?: () => number;
};

function host(): HostGlobals {
  return globalThis as HostGlobals;
}

/** Contadores do último frame fechado do host, ou `null` no browser. */
export function napiStats(): Record<string, number> | null {
  const fn = host().__cortexNapiStats;
  if (typeof fn !== 'function') return null;
  try {
    return fn();
  } catch {
    return null;
  }
}

/**
 * Milissegundos gastos dentro da ponte NAPI no último frame fechado do host
 * (SPEC-0225), sem arredondar, ou `null` no browser, onde não há ponte.
 */
export function napiBridgeMs(): number | null {
  const ms = napiStats()?.ms;
  return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
}

/** Totais do coletor agora, ou `undefined` fora do host. */
export function readGcTotals(): GcTotals | undefined {
  return host().__cortexGcStats?.();
}

/**
 * O leitor barato de bytes alocados pelo Hermes desde o boot (um número, sem objeto), ou `null` em host
 * que não o expõe. É ele que permite medir a alocação POR SISTEMA sem a leitura poluir a medida.
 */
export function allocatedBytesReader(): (() => number) | null {
  const fn = host().__cortexAllocatedBytes;
  return typeof fn === 'function' ? fn : null;
}

/**
 * Bytes alocados desde o boot: do leitor barato quando há, senão do `gc.allocatedMB` (host antigo), senão
 * `null`.
 */
export function readAllocatedBytes(): number | null {
  const fast = allocatedBytesReader();
  if (fast) return fast();
  const mb = readGcTotals()?.allocatedMB;
  return typeof mb === 'number' ? mb * BYTES_PER_MB : null;
}
