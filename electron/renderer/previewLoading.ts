/**
 * Estado do carregamento do palco do Play (SPEC-0694): entre colocar a URL no
 * iframe e o `load` dele chegar, o vite pode estar no pré-bundle (13–17 s num
 * projeto grande) ou preso nele. Sem DOM: o `Preview` desenha a fase.
 */
export type LoadingPhase = 'idle' | 'preparing' | 'stalled'

export interface LoadingTimers {
  set: (fn: () => void, ms: number) => unknown
  clear: (handle: unknown) => void
}

/** Sem `load` do iframe por este tempo, o vite provavelmente travou no pré-bundle. */
export const STALL_AFTER_MS = 60_000

export interface LoadingState {
  readonly phase: LoadingPhase
  /** URL colocada no iframe: mostra "preparando" e arma o timer de travamento. */
  begin(): void
  /** `load` do iframe ou Stop: some o aviso e desarma o timer. */
  end(): void
}

const realTimers: LoadingTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export function createLoadingState(
  onChange: (phase: LoadingPhase) => void,
  timers: LoadingTimers = realTimers,
  stallAfterMs: number = STALL_AFTER_MS,
): LoadingState {
  let phase: LoadingPhase = 'idle'
  let handle: unknown = null
  // `onChange` sempre dispara: um `begin` em cima de `preparing` (reiniciar) precisa
  // redesenhar, porque quem troca o iframe limpa o palco antes.
  const setPhase = (next: LoadingPhase): void => {
    phase = next
    onChange(next)
  }
  const disarm = (): void => {
    if (handle !== null) timers.clear(handle)
    handle = null
  }
  return {
    get phase() {
      return phase
    },
    begin() {
      disarm()
      handle = timers.set(() => setPhase('stalled'), stallAfterMs)
      setPhase('preparing')
    },
    end() {
      disarm()
      setPhase('idle')
    },
  }
}
