/**
 * Aviso do palco durante o pré-bundle do vite (SPEC-0694): "preparando" com
 * porcentagem estimada por tempo, "travado" após 60 s sem `load`, e a duração
 * medida calibra o próximo Play do projeto.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createLoadingState,
  DEFAULT_EXPECTED_MS,
  estimateProgress,
  LOAD_MS_KEY_PREFIX,
  MIN_LOAD_MS,
  PROGRESS_AT_EXPECTED,
  PROGRESS_CAP,
  readExpectedLoadMs,
  saveLoadMs,
  STALL_AFTER_MS,
  type LoadingSnapshot,
} from '../../electron/renderer/previewLoading.js'

const EXPECTED_MS = 10_000

function setup() {
  vi.useFakeTimers()
  const snaps: LoadingSnapshot[] = []
  const state = createLoadingState((s) => snaps.push(s), undefined, undefined, () => Date.now())
  const phases = (): string[] => snaps.map((s) => s.phase).filter((p, i, a) => p !== a[i - 1])
  return { state, snaps, phases }
}

function memoryStore(): Pick<Storage, 'getItem' | 'setItem'> {
  const map = new Map<string, string>()
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('estimateProgress — porcentagem por tempo', () => {
  it('sobe linear até 90% no tempo esperado', () => {
    expect(estimateProgress(0, EXPECTED_MS)).toBe(0)
    expect(estimateProgress(EXPECTED_MS / 2, EXPECTED_MS)).toBe(PROGRESS_AT_EXPECTED / 2)
    expect(estimateProgress(EXPECTED_MS, EXPECTED_MS)).toBe(PROGRESS_AT_EXPECTED)
  })

  it('depois do esperado rasteja e nunca passa de 99%', () => {
    const later = estimateProgress(EXPECTED_MS * 2, EXPECTED_MS)
    expect(later).toBeGreaterThan(PROGRESS_AT_EXPECTED)
    expect(later).toBeLessThan(PROGRESS_CAP)
    expect(estimateProgress(EXPECTED_MS * 100, EXPECTED_MS)).toBe(PROGRESS_CAP)
  })
})

describe('createLoadingState — fases e porcentagem', () => {
  it('begin mostra "preparando" a 0% na hora', () => {
    const { state, snaps } = setup()
    state.begin(EXPECTED_MS)
    expect(snaps).toEqual([{ phase: 'preparing', percent: 0 }])
  })

  it('a porcentagem avança com o tempo', () => {
    const { state } = setup()
    state.begin(EXPECTED_MS)
    vi.advanceTimersByTime(EXPECTED_MS / 2)
    expect(state.snapshot).toEqual({ phase: 'preparing', percent: PROGRESS_AT_EXPECTED / 2 })
  })

  it('sem load por 60 s vira "travado" com a porcentagem congelada', () => {
    const { state, phases } = setup()
    state.begin(EXPECTED_MS)
    vi.advanceTimersByTime(STALL_AFTER_MS)
    const frozen = state.snapshot.percent
    expect(state.snapshot.phase).toBe('stalled')
    vi.advanceTimersByTime(STALL_AFTER_MS)
    expect(state.snapshot.percent).toBe(frozen)
    expect(phases()).toEqual(['preparing', 'stalled'])
  })

  it('loaded some o aviso, devolve o tempo medido e nunca marca travado', () => {
    const { state, phases } = setup()
    state.begin(EXPECTED_MS)
    vi.advanceTimersByTime(7_000)
    expect(state.loaded()).toBe(7_000)
    vi.advanceTimersByTime(STALL_AFTER_MS * 2)
    expect(phases()).toEqual(['preparing', 'idle'])
  })

  it('loaded sem carregamento em curso ou depois de travado devolve 0', () => {
    const { state } = setup()
    expect(state.loaded()).toBe(0)
    state.begin(EXPECTED_MS)
    vi.advanceTimersByTime(STALL_AFTER_MS + 5_000)
    expect(state.loaded()).toBe(0)
    expect(state.snapshot.phase).toBe('idle')
  })

  it('cancel (Stop) some o aviso e desarma o travamento', () => {
    const { state, phases } = setup()
    state.begin(EXPECTED_MS)
    state.cancel()
    vi.advanceTimersByTime(STALL_AFTER_MS * 2)
    expect(phases()).toEqual(['preparing', 'idle'])
  })

  it('reiniciar depois de travado volta a 0% e rearma o prazo', () => {
    const { state } = setup()
    state.begin(EXPECTED_MS)
    vi.advanceTimersByTime(STALL_AFTER_MS)
    state.begin(EXPECTED_MS)
    expect(state.snapshot).toEqual({ phase: 'preparing', percent: 0 })
    vi.advanceTimersByTime(STALL_AFTER_MS)
    expect(state.snapshot.phase).toBe('stalled')
  })

  it('begin em cima de "preparando" redesenha e não dispara travado duas vezes', () => {
    const { state, snaps } = setup()
    state.begin(EXPECTED_MS)
    vi.advanceTimersByTime(STALL_AFTER_MS / 2)
    state.begin(EXPECTED_MS)
    vi.advanceTimersByTime(STALL_AFTER_MS)
    expect(snaps.filter((s) => s.phase === 'stalled')).toHaveLength(1)
    expect(snaps.filter((s) => s.phase === 'preparing' && s.percent === 0)).toHaveLength(2)
  })
})

describe('calibração por projeto', () => {
  it('projeto nunca medido usa o tempo default', () => {
    expect(readExpectedLoadMs(memoryStore(), 'D:/jogos/demo')).toBe(DEFAULT_EXPECTED_MS)
    expect(readExpectedLoadMs(memoryStore(), null)).toBe(DEFAULT_EXPECTED_MS)
  })

  it('guarda a duração medida por projeto e lê de volta', () => {
    const store = memoryStore()
    saveLoadMs(store, 'D:/jogos/demo', 16_712.4)
    expect(store.getItem(LOAD_MS_KEY_PREFIX + 'D:/jogos/demo')).toBe('16712')
    expect(readExpectedLoadMs(store, 'D:/jogos/demo')).toBe(16_712)
    expect(readExpectedLoadMs(store, 'D:/jogos/outro')).toBe(DEFAULT_EXPECTED_MS)
  })

  it('não grava medida abaixo do piso nem sem projeto, e ignora valor inválido', () => {
    const store = memoryStore()
    saveLoadMs(store, 'D:/jogos/demo', 0)
    saveLoadMs(store, 'D:/jogos/demo', MIN_LOAD_MS - 1) // página de erro do vite
    expect(store.getItem(LOAD_MS_KEY_PREFIX + 'D:/jogos/demo')).toBeNull()
    saveLoadMs(store, 'D:/jogos/demo', MIN_LOAD_MS)
    expect(readExpectedLoadMs(store, 'D:/jogos/demo')).toBe(MIN_LOAD_MS)
    store.setItem(LOAD_MS_KEY_PREFIX + 'D:/jogos/demo', '0')
    saveLoadMs(store, null, 5_000)
    expect(readExpectedLoadMs(store, 'D:/jogos/demo')).toBe(DEFAULT_EXPECTED_MS)
    store.setItem(LOAD_MS_KEY_PREFIX + 'D:/jogos/demo', 'abc')
    expect(readExpectedLoadMs(store, 'D:/jogos/demo')).toBe(DEFAULT_EXPECTED_MS)
  })
})
