/**
 * As duas fases do aviso sobre o palco do Play (SPEC-0694 e SPEC-0695):
 *
 * 1. `server` — URL no iframe até o `load` dele (o vite no pré-bundle).
 * 2. `scene`  — do `load` até a ponte do editor dizer `loading: false` (o jogo
 *    montando a cena). Sem contato da ponte em 15 s, o aviso some: não esconde
 *    a página de erro do vite nem um jogo que quebrou antes do `new Game`.
 *
 * Render, escuta de `message` e timers são injetáveis — testável sem DOM.
 */
import {
  createLoadingState,
  DEFAULT_SCENE_EXPECTED_MS,
  readExpectedLoadMs,
  saveLoadMs,
  SCENE_MS_KEY_PREFIX,
  SCENE_STALL_AFTER_MS,
  sceneReadyFrom,
  type LoadingSnapshot,
  type LoadingTimers,
  type Store,
} from './previewLoading.js'

export type LoadingKind = 'server' | 'scene'

/** Sem nenhuma mensagem da ponte por este tempo depois do `load`, não há jogo vivo pra esperar. */
export const BRIDGE_CONTACT_MS = 15_000

/** O mínimo do iframe que o fluxo usa. */
export interface TrackedFrame {
  readonly contentWindow: unknown
  addEventListener(type: 'load', fn: () => void): void
}

export interface MessageLike {
  source: unknown
  data: unknown
}

export interface PreviewLoadingFlowOptions {
  /** Desenha (ou remove, em `idle`) o overlay. */
  render: (snapshot: LoadingSnapshot, kind: LoadingKind) => void
  projectDir: () => string | null
  store: Store
  /** Liga a escuta de mensagens da janela do Studio. */
  listen: (fn: (ev: MessageLike) => void) => void
  timers?: LoadingTimers
  now?: () => number
}

const realTimers: LoadingTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export class PreviewLoadingFlow {
  private frame: TrackedFrame | null = null
  private contactHandle: unknown = null
  private readonly timers: LoadingTimers
  private readonly server
  private readonly scene

  constructor(private readonly opts: PreviewLoadingFlowOptions) {
    this.timers = opts.timers ?? realTimers
    const now = opts.now ?? (() => Date.now())
    this.server = createLoadingState((s) => opts.render(s, 'server'), this.timers, undefined, now)
    this.scene = createLoadingState((s) => opts.render(s, 'scene'), this.timers, SCENE_STALL_AFTER_MS, now)
    opts.listen((ev) => this.onMessage(ev))
  }

  /** URL nova no iframe (Play, reiniciar, trocar de fase): volta à fase 1. */
  begin(): void {
    this.clearContact()
    this.scene.cancel()
    this.server.begin(readExpectedLoadMs(this.opts.store, this.opts.projectDir()))
  }

  /** Iframe novo no palco: o `load` dele encerra a fase 1 e abre a 2. */
  track(frame: TrackedFrame): void {
    this.frame = frame
    frame.addEventListener('load', () => {
      if (this.frame === frame) this.onFrameLoad()
    })
  }

  /** Stop: some com o aviso das duas fases, sem medir. */
  cancel(): void {
    this.clearContact()
    this.server.cancel()
    this.scene.cancel()
  }

  private onFrameLoad(): void {
    saveLoadMs(this.opts.store, this.opts.projectDir(), this.server.loaded())
    this.scene.begin(readExpectedLoadMs(this.opts.store, this.opts.projectDir(), SCENE_MS_KEY_PREFIX, DEFAULT_SCENE_EXPECTED_MS))
    this.contactHandle = this.timers.set(() => {
      this.contactHandle = null
      this.scene.cancel()
    }, BRIDGE_CONTACT_MS)
  }

  private onMessage(ev: MessageLike): void {
    if (!this.frame || ev.source !== this.frame.contentWindow) return
    if (this.scene.snapshot.phase === 'idle') return
    const ready = sceneReadyFrom(ev.data)
    // Qualquer mensagem da ponte (hello, state) prova que o jogo está vivo.
    const fromBridge = ready !== null || (ev.data as { source?: unknown } | null)?.source === 'cortex-editor'
    if (fromBridge) this.clearContact()
    if (ready) saveLoadMs(this.opts.store, this.opts.projectDir(), this.scene.loaded(), SCENE_MS_KEY_PREFIX)
  }

  private clearContact(): void {
    if (this.contactHandle !== null) this.timers.clear(this.contactHandle)
    this.contactHandle = null
  }
}
