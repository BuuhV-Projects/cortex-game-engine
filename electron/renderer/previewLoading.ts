/**
 * Estado do carregamento do palco do Play (SPEC-0694): entre colocar a URL no
 * iframe e o `load` dele chegar, o vite pode estar no pré-bundle (13–17 s num
 * projeto grande) ou preso nele. Sem DOM: o `Preview` desenha o snapshot.
 *
 * O vite não emite progresso do pré-bundle, então a porcentagem é uma ESTIMATIVA
 * por tempo: sobe linear até `PROGRESS_AT_EXPECTED` no tempo esperado (a duração
 * medida do último Play do projeto, persistida) e depois rasteja até `PROGRESS_CAP`.
 */
export type LoadingPhase = 'idle' | 'preparing' | 'stalled'

export interface LoadingSnapshot {
  phase: LoadingPhase
  /** 0–99 enquanto carrega; 0 em `idle`. */
  percent: number
}

export interface LoadingTimers {
  set: (fn: () => void, ms: number) => unknown
  clear: (handle: unknown) => void
}

/** Sem `load` do iframe por este tempo, o vite provavelmente travou no pré-bundle. */
export const STALL_AFTER_MS = 60_000
/** Duração esperada quando o projeto nunca foi medido. */
export const DEFAULT_EXPECTED_MS = 15_000
/** Intervalo de atualização da porcentagem. */
export const PROGRESS_TICK_MS = 250
/** Porcentagem alcançada exatamente no tempo esperado. */
export const PROGRESS_AT_EXPECTED = 90
/** Teto da estimativa — os 100% só vêm com o `load` real. */
export const PROGRESS_CAP = 99
/** Prefixo da chave (por projeto) da duração medida do último carregamento. */
export const LOAD_MS_KEY_PREFIX = 'preview_loadMs:'

/** Estimativa por tempo: linear até o esperado, depois saturando no teto. */
export function estimateProgress(elapsedMs: number, expectedMs: number): number {
  if (expectedMs <= 0) return PROGRESS_CAP
  if (elapsedMs <= expectedMs) return Math.round((PROGRESS_AT_EXPECTED * elapsedMs) / expectedMs)
  const tail = PROGRESS_CAP - PROGRESS_AT_EXPECTED
  const over = (elapsedMs - expectedMs) / expectedMs
  return Math.min(PROGRESS_CAP, Math.round(PROGRESS_AT_EXPECTED + tail * (1 - Math.exp(-over))))
}

/** Fase 2 (SPEC-0695): a cena do jogo montando. Prefixo da calibração própria. */
export const SCENE_MS_KEY_PREFIX = 'preview_sceneMs:'
/** Duração esperada da fase 2 quando o projeto nunca foi medido. */
export const DEFAULT_SCENE_EXPECTED_MS = 30_000
/** Fase 2 sem terminar por este tempo: provável erro do jogo (ver o Console). */
export const SCENE_STALL_AFTER_MS = 180_000

export type Store = Pick<Storage, 'getItem' | 'setItem'>

/** Duração medida do último carregamento do projeto (ou o default). */
export function readExpectedLoadMs(
  store: Store,
  projectDir: string | null,
  prefix: string = LOAD_MS_KEY_PREFIX,
  fallbackMs: number = DEFAULT_EXPECTED_MS,
): number {
  const raw = projectDir ? store.getItem(prefix + projectDir) : null
  const ms = Number(raw)
  return raw !== null && Number.isFinite(ms) && ms > 0 ? ms : fallbackMs
}

/**
 * Piso da medida: abaixo disso o `load` foi de uma página de erro do vite ou de um
 * cache quente demais para calibrar — gravar faria a barra pular a 99% no próximo Play.
 */
export const MIN_LOAD_MS = 500

/** Guarda a duração medida (ignora 0 — `load` fora de `preparing` — e medidas abaixo do piso). */
export function saveLoadMs(store: Store, projectDir: string | null, ms: number, prefix: string = LOAD_MS_KEY_PREFIX): void {
  if (projectDir && ms >= MIN_LOAD_MS) store.setItem(prefix + projectDir, String(Math.round(ms)))
}

/**
 * Lê uma mensagem do iframe (SPEC-0695): `null` se não é `state` da ponte do editor;
 * senão, se a cena está pronta. Sem o campo `loading` (engine vendorizado antigo),
 * conta como pronta — o aviso fecha na primeira mensagem, como antes.
 */
export function sceneReadyFrom(data: unknown): boolean | null {
  if (!data || typeof data !== 'object') return null
  const msg = data as { source?: unknown; type?: unknown; loading?: unknown }
  if (msg.source !== 'cortex-editor' || msg.type !== 'state') return null
  return msg.loading !== true
}

export interface LoadingState {
  readonly snapshot: LoadingSnapshot
  /** URL colocada no iframe: mostra "preparando" a 0% e arma o timer de travamento. */
  begin(expectedMs?: number): void
  /**
   * `load` do iframe: some o aviso e devolve o tempo medido (calibra o próximo Play).
   * Devolve 0 se não estava em `preparing`: um `load` depois do travamento mediria a
   * espera do usuário, não o projeto.
   */
  loaded(): number
  /** Stop: some o aviso sem medir nada. */
  cancel(): void
}

const realTimers: LoadingTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export function createLoadingState(
  onChange: (snapshot: LoadingSnapshot) => void,
  timers: LoadingTimers = realTimers,
  stallAfterMs: number = STALL_AFTER_MS,
  now: () => number = () => Date.now(),
): LoadingState {
  let snapshot: LoadingSnapshot = { phase: 'idle', percent: 0 }
  let stallHandle: unknown = null
  let tickHandle: unknown = null
  let startedAt = 0
  let expectedMs = DEFAULT_EXPECTED_MS

  // `onChange` sempre dispara no `begin`: um `begin` em cima de `preparing`
  // (reiniciar) precisa redesenhar, porque quem troca o iframe limpa o palco antes.
  const emit = (next: LoadingSnapshot): void => {
    snapshot = next
    onChange(next)
  }
  const disarm = (): void => {
    if (stallHandle !== null) timers.clear(stallHandle)
    if (tickHandle !== null) timers.clear(tickHandle)
    stallHandle = null
    tickHandle = null
  }
  const tick = (): void => {
    tickHandle = null
    if (snapshot.phase !== 'preparing') return
    const percent = estimateProgress(now() - startedAt, expectedMs)
    if (percent !== snapshot.percent) emit({ phase: 'preparing', percent })
    tickHandle = timers.set(tick, PROGRESS_TICK_MS)
  }
  const finish = (): void => {
    disarm()
    emit({ phase: 'idle', percent: 0 })
  }

  return {
    get snapshot() {
      return snapshot
    },
    begin(expected = DEFAULT_EXPECTED_MS) {
      disarm()
      startedAt = now()
      expectedMs = expected
      emit({ phase: 'preparing', percent: 0 })
      // Travado: congela a porcentagem onde estava (o tick se encerra sozinho).
      stallHandle = timers.set(() => emit({ phase: 'stalled', percent: snapshot.percent }), stallAfterMs)
      tickHandle = timers.set(tick, PROGRESS_TICK_MS)
    },
    loaded() {
      const elapsed = snapshot.phase === 'preparing' ? now() - startedAt : 0
      finish()
      return elapsed
    },
    cancel: finish,
  }
}
