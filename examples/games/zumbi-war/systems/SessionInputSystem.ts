import { System, type Entity } from 'cortex-game-engine'
import type { InputManager, GamepadManager } from 'cortex-game-engine'
import { GameStateComponent } from '../components/GameStateComponent'
import { XBOX } from '../utils/xboxLayout'
import type { KeyBindings } from '../utils/keyBindings'

export interface SessionInputCallbacks {
  /** Reinicia a partida sem recarregar a página — chamado no game over. */
  onRestart: () => void
  /** Volta pra MenuScene — chamado no game over ou em qualquer momento. */
  onExitToMenu: () => void
}

/**
 * Faz o poll do gamepad uma vez por frame e atualiza flags de sessão
 * (gamepadConnected, troca entre playing/paused). No game over, dispara
 * `onRestart` (A / Enter) ou `onExitToMenu` (B / Esc).
 *
 * Roda com priority menor pra garantir gamepad fresco no resto do frame.
 */
export class SessionInputSystem extends System {
  static override requiredComponents = [GameStateComponent]

  override priority = -10

  private prevStart = false
  private prevPause = false
  private prevEnter = false
  private prevA = false
  private prevEsc = false
  private prevB = false

  constructor(
    private input: InputManager,
    private gamepad: GamepadManager,
    private bindings: { current: KeyBindings },
    private callbacks: SessionInputCallbacks,
  ) {
    super()
  }

  private isPauseDown(): boolean {
    for (const k of this.bindings.current.pause) {
      if (k === 'escape' && this.input.isKeyDown('Escape')) return true
      if (this.input.isKeyDown(k)) return true
      if (k.length === 1 && this.input.isKeyDown(k.toUpperCase())) return true
    }
    return false
  }

  override update(entities: Entity[], _deltaTime: number): void {
    this.gamepad.poll()
    const gp = this.gamepad.getGamepad(0)
    const gpConnected = gp?.connected ?? false

    const startBtn = gpConnected && this.gamepad.isButtonDown(0, XBOX.START)
    const pauseKey = this.isPauseDown()
    const pauseEdge = (startBtn && !this.prevStart) || (pauseKey && !this.prevPause)
    this.prevStart = startBtn
    this.prevPause = pauseKey

    const enterKey = this.input.isKeyDown('Enter')
    const aBtn = gpConnected && this.gamepad.isButtonDown(0, XBOX.A)
    const restartEdge = (enterKey && !this.prevEnter) || (aBtn && !this.prevA)
    this.prevEnter = enterKey
    this.prevA = aBtn

    // "Voltar ao menu" tem tecla dedicada (Backspace + gamepad B), pra
    // não conflitar com Esc/Start que mantém a função de pause toggle.
    const backKey = this.input.isKeyDown('Backspace')
    const bBtn = gpConnected && this.gamepad.isButtonDown(0, XBOX.B)
    const exitEdge = (backKey && !this.prevEsc) || (bBtn && !this.prevB)
    this.prevEsc = backKey
    this.prevB = bBtn

    for (const entity of entities) {
      const gs = entity.getComponent(GameStateComponent)!
      gs.gamepadConnected = gpConnected

      if (gs.phase === 'gameover') {
        if (restartEdge) {
          this.callbacks.onRestart()
        } else if (exitEdge) {
          this.callbacks.onExitToMenu()
        }
        continue
      }

      if (pauseEdge) {
        if (gs.phase === 'playing') gs.phase = 'paused'
        else if (gs.phase === 'paused') gs.phase = 'playing'
      }

      if (gs.phase === 'paused' && exitEdge) {
        this.callbacks.onExitToMenu()
      }
    }
  }
}
