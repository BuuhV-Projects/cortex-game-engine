/**
 * Retentativa automática do servidor (SPEC-0696): vite sem responder em 60 s é
 * reiniciado sozinho até 2 vezes; só depois o aviso de travado aparece.
 *
 * O teste faz o papel do Preview: `restart` = Stop (→ `cancel`) e, quando o vite
 * novo imprime a URL, `begin`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_AUTO_RETRIES, PreviewLoadingFlow } from '../../electron/renderer/previewLoadingFlow.js'
import { STALL_AFTER_MS } from '../../electron/renderer/previewLoading.js'

interface Frame { kind: string; phase: string; attempt: number }

function setup(withRestart = true) {
  vi.useFakeTimers()
  const rendered: Frame[] = []
  let onLoad: () => void = () => {}
  /** Como o `restartServer` do Preview: o Stop chega (cancel) e então avisa que terminou. */
  const restart = vi.fn(() => {
    flow.cancel()
    flow.restartStopDone()
  })
  const map = new Map<string, string>()
  const flow: PreviewLoadingFlow = new PreviewLoadingFlow({
    render: (s, kind, attempt) => rendered.push({ kind, phase: s.phase, attempt }),
    ...(withRestart ? { restart } : {}),
    projectDir: () => 'D:/jogos/demo',
    store: { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) },
    listen: () => {},
  })
  const newFrame = (): void => flow.track({ contentWindow: {}, addEventListener: (_t, fn) => { onLoad = fn } })
  newFrame()
  /** O vite novo imprimiu a URL: o `showIframe` cria um iframe novo (track) e põe a URL nele (begin). */
  const serverCameBack = (): void => {
    newFrame()
    flow.begin()
  }
  return { flow, rendered, restart, serverCameBack, load: () => onLoad(), last: () => rendered.at(-1) }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('PreviewLoadingFlow — retentativa automática do vite', () => {
  it('reinicia sozinho 2 vezes e só então mostra travado', () => {
    const { flow, restart, serverCameBack, last } = setup()
    flow.begin()
    for (let attempt = 1; attempt <= MAX_AUTO_RETRIES; attempt++) {
      vi.advanceTimersByTime(STALL_AFTER_MS)
      expect(restart).toHaveBeenCalledTimes(attempt)
      expect(last()).toEqual({ kind: 'server', phase: 'preparing', attempt })
      serverCameBack()
    }
    vi.advanceTimersByTime(STALL_AFTER_MS)
    expect(restart).toHaveBeenCalledTimes(MAX_AUTO_RETRIES)
    expect(last()).toEqual({ kind: 'server', phase: 'stalled', attempt: MAX_AUTO_RETRIES })
  })

  it('o Stop da retentativa não apaga o aviso; o do usuário apaga', () => {
    const { flow, last, restart } = setup()
    flow.begin()
    vi.advanceTimersByTime(STALL_AFTER_MS)
    expect(restart).toHaveBeenCalledTimes(1) // o Stop da retentativa já passou pelo cancel
    expect(last()?.phase).toBe('preparing')
    expect(flow.restarting).toBe(false)
    flow.cancel() // Stop do usuário
    expect(last()?.phase).toBe('idle')
  })

  it('Stop do usuário vale mesmo se o vite nunca voltou depois da retentativa', () => {
    const { flow, last, restart } = setup()
    flow.begin()
    vi.advanceTimersByTime(STALL_AFTER_MS) // retentativa 1, e o vite não imprime a URL
    flow.cancel() // usuário desiste
    expect(last()?.phase).toBe('idle')
    vi.advanceTimersByTime(STALL_AFTER_MS * 3)
    expect(restart).toHaveBeenCalledTimes(1) // nenhum prazo ficou armado
  })

  it('vite que nem volta a imprimir a URL também é retentado pelo prazo', () => {
    const { flow, restart } = setup()
    flow.begin()
    vi.advanceTimersByTime(STALL_AFTER_MS)
    vi.advanceTimersByTime(STALL_AFTER_MS) // sem begin: o restart não trouxe o vite de volta
    expect(restart).toHaveBeenCalledTimes(2)
  })

  it('servidor que respondeu (load) zera as tentativas pra próxima trava', () => {
    const { flow, restart, serverCameBack, load } = setup()
    flow.begin()
    for (let i = 0; i < MAX_AUTO_RETRIES; i++) {
      vi.advanceTimersByTime(STALL_AFTER_MS)
      serverCameBack()
    }
    load() // a 2ª tentativa funcionou: as tentativas acabaram, mas o servidor respondeu
    flow.begin() // reiniciar/trocar de fase depois
    vi.advanceTimersByTime(STALL_AFTER_MS)
    // Só reinicia de novo se o load zerou o contador.
    expect(restart).toHaveBeenCalledTimes(MAX_AUTO_RETRIES + 1)
  })

  it('Stop do usuário zera as tentativas', () => {
    const { flow, restart, serverCameBack } = setup()
    flow.begin()
    vi.advanceTimersByTime(STALL_AFTER_MS)
    serverCameBack()
    vi.advanceTimersByTime(STALL_AFTER_MS)
    serverCameBack()
    flow.cancel() // usuário apertou Stop
    flow.begin() // e Play
    vi.advanceTimersByTime(STALL_AFTER_MS)
    expect(restart).toHaveBeenCalledTimes(3)
  })

  it('sem restart configurado, mostra travado direto', () => {
    const { flow, last } = setup(false)
    flow.begin()
    vi.advanceTimersByTime(STALL_AFTER_MS)
    expect(last()).toEqual({ kind: 'server', phase: 'stalled', attempt: 0 })
  })
})
