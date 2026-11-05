/**
 * As duas fases do aviso do Play (SPEC-0695): servidor até o `load` do iframe, cena
 * até a ponte dizer `loading: false`, e o aviso some se a ponte nunca aparecer.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BRIDGE_CONTACT_MS, PreviewLoadingFlow, type LoadingKind, type MessageLike } from '../../electron/renderer/previewLoadingFlow.js'
import { SCENE_MS_KEY_PREFIX, SCENE_STALL_AFTER_MS, sceneReadyFrom } from '../../electron/renderer/previewLoading.js'

const PROJECT = 'D:/jogos/demo'
const GAME_WINDOW = { name: 'iframe do jogo' }
const OTHER_WINDOW = { name: 'outra janela' }

const state = (loading?: boolean): Record<string, unknown> => ({ source: 'cortex-editor', type: 'state', ...(loading === undefined ? {} : { loading }) })

function setup() {
  vi.useFakeTimers()
  const rendered: Array<{ kind: LoadingKind; phase: string }> = []
  const map = new Map<string, string>()
  let onMessage: (ev: MessageLike) => void = () => {}
  let onLoad: () => void = () => {}
  const flow = new PreviewLoadingFlow({
    render: (s, kind) => rendered.push({ kind, phase: s.phase }),
    projectDir: () => PROJECT,
    store: { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) },
    listen: (fn) => { onMessage = fn },
  })
  flow.track({ contentWindow: GAME_WINDOW, addEventListener: (_t, fn) => { onLoad = fn } })
  const last = (): { kind: LoadingKind; phase: string } | undefined => rendered.at(-1)
  const send = (data: unknown, source: unknown = GAME_WINDOW): void => onMessage({ source, data })
  return { flow, rendered, map, last, send, load: () => onLoad() }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('sceneReadyFrom — mensagem da ponte', () => {
  it('só lê state da ponte; sem o campo loading conta como pronta', () => {
    expect(sceneReadyFrom({ source: 'cortex-editor', type: 'hello' })).toBeNull()
    expect(sceneReadyFrom({ source: 'outro', type: 'state' })).toBeNull()
    expect(sceneReadyFrom(null)).toBeNull()
    expect(sceneReadyFrom(state(true))).toBe(false)
    expect(sceneReadyFrom(state(false))).toBe(true)
    expect(sceneReadyFrom(state())).toBe(true)
  })
})

describe('PreviewLoadingFlow — duas fases', () => {
  it('load do iframe troca a fase servidor pela fase cena', () => {
    const { flow, last, load } = setup()
    flow.begin()
    expect(last()).toEqual({ kind: 'server', phase: 'preparing' })
    load()
    expect(last()).toEqual({ kind: 'scene', phase: 'preparing' })
  })

  it('a cena só termina quando a ponte diz loading=false, e grava a medida', () => {
    const { flow, last, load, send, map } = setup()
    flow.begin()
    load()
    send(state(true)) // a ponte publica durante a carga
    vi.advanceTimersByTime(20_000)
    send(state(true))
    expect(last()?.phase).toBe('preparing')
    vi.advanceTimersByTime(5_000)
    send(state(false))
    expect(last()).toEqual({ kind: 'scene', phase: 'idle' })
    expect(map.get(SCENE_MS_KEY_PREFIX + PROJECT)).toBe('25000')
  })

  it('ignora mensagem de outra janela', () => {
    const { flow, last, load, send } = setup()
    flow.begin()
    load()
    send(state(false), OTHER_WINDOW)
    expect(last()).toEqual({ kind: 'scene', phase: 'preparing' })
  })

  it('sem contato da ponte em 15 s o aviso some, sem medir', () => {
    const { flow, last, load, map } = setup()
    flow.begin()
    load()
    vi.advanceTimersByTime(BRIDGE_CONTACT_MS)
    expect(last()).toEqual({ kind: 'scene', phase: 'idle' })
    expect(map.has(SCENE_MS_KEY_PREFIX + PROJECT)).toBe(false)
  })

  it('com contato da ponte o prazo de 15 s não derruba a cena carregando', () => {
    const { flow, last, load, send } = setup()
    flow.begin()
    load()
    send({ source: 'cortex-editor', type: 'hello' })
    vi.advanceTimersByTime(BRIDGE_CONTACT_MS * 2)
    expect(last()).toEqual({ kind: 'scene', phase: 'preparing' })
  })

  it('cena sem terminar em 3 min vira travada', () => {
    const { flow, last, load, send } = setup()
    flow.begin()
    load()
    send(state(true))
    vi.advanceTimersByTime(SCENE_STALL_AFTER_MS)
    expect(last()).toEqual({ kind: 'scene', phase: 'stalled' })
  })

  it('Stop some com o aviso; uma state atrasada não reabre nem mede', () => {
    const { flow, last, load, send, map } = setup()
    flow.begin()
    load()
    flow.cancel()
    send(state(false))
    expect(last()?.phase).toBe('idle')
    expect(map.has(SCENE_MS_KEY_PREFIX + PROJECT)).toBe(false)
  })

  it('um segundo load (reload do vite) reabre a cena e o prazo antigo não a derruba', () => {
    const { flow, last, load, send } = setup()
    flow.begin()
    load()
    vi.advanceTimersByTime(BRIDGE_CONTACT_MS - 1_000)
    load() // reload completo: o iframe navega de novo
    send(state(true))
    vi.advanceTimersByTime(BRIDGE_CONTACT_MS)
    expect(last()).toEqual({ kind: 'scene', phase: 'preparing' })
  })

  it('load atrasado depois do Stop é ignorado', () => {
    const { flow, rendered, load } = setup()
    flow.begin()
    flow.cancel()
    const count = rendered.length
    load()
    expect(rendered).toHaveLength(count)
  })

  it('reiniciar no meio da cena volta à fase servidor', () => {
    const { flow, last, load } = setup()
    flow.begin()
    load()
    flow.begin()
    expect(last()).toEqual({ kind: 'server', phase: 'preparing' })
  })
})
