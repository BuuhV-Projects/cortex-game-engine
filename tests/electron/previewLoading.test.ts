/**
 * Aviso do palco durante o pré-bundle do vite (SPEC-0694): "preparando" ao pôr a
 * URL no iframe, "travado" após 60 s sem `load`, e nada após `load`/Stop.
 */
import { describe, expect, it, vi } from 'vitest'
import { createLoadingState, STALL_AFTER_MS, type LoadingPhase } from '../../electron/renderer/previewLoading.js'

function setup(stallAfterMs?: number) {
  vi.useFakeTimers()
  const phases: LoadingPhase[] = []
  const state = createLoadingState((p) => phases.push(p), undefined, stallAfterMs)
  return { state, phases }
}

describe('previewLoading — fases do palco', () => {
  it('begin mostra "preparando" na hora', () => {
    const { state, phases } = setup()
    state.begin()
    expect(phases).toEqual(['preparing'])
    expect(state.phase).toBe('preparing')
  })

  it('sem load por 60 s vira "travado"', () => {
    const { state, phases } = setup()
    state.begin()
    vi.advanceTimersByTime(STALL_AFTER_MS - 1)
    expect(state.phase).toBe('preparing')
    vi.advanceTimersByTime(1)
    expect(phases).toEqual(['preparing', 'stalled'])
  })

  it('load antes do prazo some o aviso e nunca marca travado', () => {
    const { state, phases } = setup()
    state.begin()
    vi.advanceTimersByTime(10_000)
    state.end()
    vi.advanceTimersByTime(STALL_AFTER_MS * 2)
    expect(phases).toEqual(['preparing', 'idle'])
  })

  it('reiniciar depois de travado volta a "preparando" e rearma o prazo', () => {
    const { state, phases } = setup()
    state.begin()
    vi.advanceTimersByTime(STALL_AFTER_MS)
    state.begin()
    expect(phases).toEqual(['preparing', 'stalled', 'preparing'])
    vi.advanceTimersByTime(STALL_AFTER_MS)
    expect(state.phase).toBe('stalled')
  })

  it('begin em cima de "preparando" redesenha e não dispara travado duas vezes', () => {
    const { state, phases } = setup()
    state.begin()
    vi.advanceTimersByTime(STALL_AFTER_MS / 2)
    state.begin()
    vi.advanceTimersByTime(STALL_AFTER_MS)
    expect(phases).toEqual(['preparing', 'preparing', 'stalled'])
  })

  it('prazo configurável e timers injetáveis', () => {
    const set = vi.fn(() => 'h1')
    const clear = vi.fn()
    const state = createLoadingState(() => {}, { set, clear }, 5_000)
    state.begin()
    expect(set).toHaveBeenCalledWith(expect.any(Function), 5_000)
    state.end()
    expect(clear).toHaveBeenCalledWith('h1')
  })
})
