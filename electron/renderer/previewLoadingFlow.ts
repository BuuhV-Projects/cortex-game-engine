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
/**
 * `loading: false` antes de qualquer `true` só fecha o aviso se durar isto: a ponte
 * nasce no `new Game` e pode publicar antes do jogo abrir o escopo de carga (no DDD 00
 * há um `await i18n.load` entre os dois). Um `true` dentro do prazo mantém a fase 2.
 */
export const SETTLE_MS = 1_500

/** O mínimo do iframe que o fluxo usa. */
export interface TrackedFrame {
  readonly contentWindow: unknown
  addEventListener(type: 'load', fn: () => void): void
}

export interface MessageLike {
  source: unknown
  data: unknown
}

/** Quantas vezes o Studio reinicia o vite sozinho antes de pedir ajuda (SPEC-0696). */
export const MAX_AUTO_RETRIES = 2

export interface PreviewLoadingFlowOptions {
  /** Desenha (ou remove, em `idle`) o overlay. `attempt` = retentativas automáticas já feitas. */
  render: (snapshot: LoadingSnapshot, kind: LoadingKind, attempt: number) => void
  /** Stop + Play do servidor — usado na retentativa automática. */
  restart?: () => void
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
  private settleHandle: unknown = null
  /** A ponte já disse `loading: true` nesta carga? Então um `false` fecha na hora. */
  private sawLoading = false
  /** Retentativas automáticas desta subida do servidor (zera num `load` ou num Stop do usuário). */
  private retries = 0
  /** Reiniciando sozinho: o Stop que vem a seguir não apaga o aviso nem zera o contador. */
  private autoRestarting = false
  private readonly timers: LoadingTimers
  private readonly server
  private readonly scene

  constructor(private readonly opts: PreviewLoadingFlowOptions) {
    this.timers = opts.timers ?? realTimers
    const now = opts.now ?? (() => Date.now())
    this.server = createLoadingState((s) => this.onServerSnapshot(s), this.timers, undefined, now)
    this.scene = createLoadingState((s) => opts.render(s, 'scene', this.retries), this.timers, SCENE_STALL_AFTER_MS, now)
    opts.listen((ev) => this.onMessage(ev))
  }

  /** O Stop que está chegando é da retentativa automática? (o Preview não troca o palco). */
  get restarting(): boolean {
    return this.autoRestarting
  }

  /** URL nova no iframe (Play, reiniciar, trocar de fase): volta à fase 1. */
  begin(): void {
    this.autoRestarting = false
    this.clearContact()
    this.clearSettle()
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

  /** Stop: some com o aviso das duas fases, sem medir, e esquece o iframe (um `load` atrasado dele é ignorado). */
  cancel(): void {
    this.frame = null
    this.clearContact()
    this.clearSettle()
    // Stop da retentativa automática: o aviso "tentando de novo" e o prazo do servidor
    // continuam armados — se o vite novo também não subir, o prazo dispara outra vez.
    if (this.autoRestarting) return
    this.retries = 0
    this.server.cancel()
    this.scene.cancel()
  }

  /**
   * Servidor travado (SPEC-0696): reinicia sozinho até {@link MAX_AUTO_RETRIES} vezes
   * antes de mostrar o aviso de travado. Cada tentativa rearma o prazo do servidor.
   */
  private onServerSnapshot(s: LoadingSnapshot): void {
    if (s.phase === 'stalled' && this.opts.restart && this.retries < MAX_AUTO_RETRIES) {
      this.retries++
      this.autoRestarting = true
      this.server.begin(readExpectedLoadMs(this.opts.store, this.opts.projectDir()))
      this.opts.restart()
      return
    }
    this.opts.render(s, 'server', this.retries)
  }

  /**
   * Também roda num `load` sem `begin()` antes: o reload completo que o vite faz ao
   * editar código recarrega o iframe e o jogo monta a cena de novo — o aviso volta.
   */
  private onFrameLoad(): void {
    this.retries = 0 // o servidor respondeu: a próxima trava tem as tentativas de novo
    this.clearContact() // o prazo de um `load` anterior não pode derrubar este
    this.clearSettle()
    this.sawLoading = false
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
    if (ready === false) {
      this.sawLoading = true
      this.clearSettle()
    } else if (ready && this.sawLoading) {
      this.finishScene()
    } else if (ready && this.settleHandle === null) {
      this.settleHandle = this.timers.set(() => {
        this.settleHandle = null
        this.finishScene()
      }, SETTLE_MS)
    }
  }

  private finishScene(): void {
    this.clearSettle()
    saveLoadMs(this.opts.store, this.opts.projectDir(), this.scene.loaded(), SCENE_MS_KEY_PREFIX)
  }

  private clearContact(): void {
    if (this.contactHandle !== null) this.timers.clear(this.contactHandle)
    this.contactHandle = null
  }

  private clearSettle(): void {
    if (this.settleHandle !== null) this.timers.clear(this.settleHandle)
    this.settleHandle = null
  }
}
