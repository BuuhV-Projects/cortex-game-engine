/**
 * **Profiler de boot** (SPEC-0217) — mede onde vão os segundos entre o início do
 * bundle e o primeiro frame desenhado. Desligado por padrão: só imprime com o
 * escopo `boot` ligado no {@link debug} (`?cortexDebug=boot`,
 * `localStorage['cortex:debug']`, `setDebug('boot')` ou, no host nativo,
 * `CORTEX_LAUNCH_QUERY="?cortexDebug=boot"`).
 *
 * Existe porque no host nativo o boot é uma cadeia única de `await` que não
 * devolve o controle ao host (o `fetch` do host é síncrono): sem marcos, a única
 * informação disponível é "a tela ficou preta por N segundos".
 *
 * - {@link bootMark} carimba um INSTANTE (ms desde o início do bundle);
 * - {@link bootAcc}/{@link bootSync} ACUMULAM tempo por chave, para custos que
 *   aparecem centenas de vezes (carregar um `.glb`, fundir um grupo);
 * - {@link bootDump} imprime os acumulados, do mais caro pro mais barato.
 *
 * @example
 * ```ts
 * bootMark('cena: comecei a montar');
 * const gltf = await bootAcc('loadGLB', () => loader.loadGLTF(url));
 * bootDump('fim do boot');
 * ```
 */
import { isDebug } from './debug.js';

/** Escopo do {@link debug} que liga o profiler. */
const SCOPE = 'boot';
/** Referência de tempo: a avaliação deste módulo ≈ início do bundle. */
const t0 = Date.now();

const acc = new Map<string, { ms: number; n: number }>();

/** O profiler está ligado? (todas as funções viram passagem direta quando não.) */
export function isBootProfiling(): boolean {
  return isDebug(SCOPE);
}

/** Carimba um instante do boot: `[cortex:boot] 4716ms  <label>`. */
export function bootMark(label: string): void {
  if (!isDebug(SCOPE)) return;
  console.log(`[cortex:${SCOPE}] ${Date.now() - t0}ms  ${label}`);
}

/** Acumula o tempo de uma etapa **assíncrona** sob `key`. */
export async function bootAcc<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!isDebug(SCOPE)) return fn();
  const start = Date.now();
  try {
    return await fn();
  } finally {
    record(key, Date.now() - start);
  }
}

/** Acumula o tempo de uma etapa **síncrona** sob `key`. */
export function bootSync<T>(key: string, fn: () => T): T {
  if (!isDebug(SCOPE)) return fn();
  const start = Date.now();
  try {
    return fn();
  } finally {
    record(key, Date.now() - start);
  }
}

function record(key: string, ms: number): void {
  const entry = acc.get(key);
  if (entry) {
    entry.ms += ms;
    entry.n++;
  } else {
    acc.set(key, { ms, n: 1 });
  }
}

/** Imprime os acumulados (mais caro primeiro) com um rótulo de momento. */
export function bootDump(label: string): void {
  if (!isDebug(SCOPE)) return;
  const rows = [...acc.entries()].sort((a, b) => b[1].ms - a[1].ms);
  console.log(`[cortex:${SCOPE}] === acumulados (${label}) ===`);
  for (const [key, v] of rows) console.log(`[cortex:${SCOPE}]    ${key}: ${v.ms}ms em ${v.n}x`);
}
