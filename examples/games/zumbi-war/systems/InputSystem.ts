import { System, type Entity } from 'cortex-game-engine'
import type { InputManager, GamepadManager } from 'cortex-game-engine'
import { InputStateComponent } from '../components/InputStateComponent'
import { PlayerComponent } from '../components/PlayerComponent'
import { XBOX } from '../utils/xboxLayout'
import {
  type ActionId,
  type KeyBindings,
  normalizeKey,
} from '../utils/keyBindings'
import { applyRadialDeadzone, curve } from '../utils/stick'

/**
 * Lê teclado, mouse e gamepad do player, populando o InputStateComponent.
 *
 * Esquema do gamepad (tank-style):
 *   - LS_Y    → andar pra frente / pra trás (moveZ)
 *   - LS_X    → rotacionar o personagem (sensibilidade média)
 *   - RS_X    → rotacionar o personagem (sensibilidade maior, "turn rápido")
 *   - RS_Y    → pitch da câmera (olha pra cima / pra baixo)
 *
 * No teclado, moveX (strafe lateral A/D) continua disponível normalmente.
 */
export class InputSystem extends System {
  static override requiredComponents = [InputStateComponent, PlayerComponent]

  private prevReload = false

  constructor(
    private input: InputManager,
    private gamepad: GamepadManager,
    private bindings: { current: KeyBindings },
    private getGameState: () => { phase: string } | null,
    private mouseSensitivity = 0.0025,
    private lsRotateSensitivity = 2.2,
    private rsRotateSensitivity = 3.2,
    private stickDeadzone = 0.20,
  ) {
    super()
  }

  private isAction(action: ActionId): boolean {
    for (const k of this.bindings.current[action]) {
      if (this.isKey(k)) return true
    }
    return false
  }

  private isKey(k: string): boolean {
    if (this.input.isKeyDown(k)) return true
    const lower = k.toLowerCase()
    if (this.input.isKeyDown(lower)) return true
    if (k.length === 1 && this.input.isKeyDown(k.toUpperCase())) return true
    if (k === 'shift' && (this.input.isKeyDown('Shift') || this.input.isKeyDown('shift'))) return true
    if (k === 'control' && (this.input.isKeyDown('Control') || this.input.isKeyDown('control'))) return true
    if (k === 'alt' && (this.input.isKeyDown('Alt') || this.input.isKeyDown('alt'))) return true
    if (k === 'arrowup' && this.input.isKeyDown('ArrowUp')) return true
    if (k === 'arrowdown' && this.input.isKeyDown('ArrowDown')) return true
    if (k === 'arrowleft' && this.input.isKeyDown('ArrowLeft')) return true
    if (k === 'arrowright' && this.input.isKeyDown('ArrowRight')) return true
    if (k === 'escape' && this.input.isKeyDown('Escape')) return true
    if (k === 'enter' && this.input.isKeyDown('Enter')) return true
    return false
  }

  override update(entities: Entity[], deltaTime: number): void {
    void normalizeKey
    const gs = this.getGameState()
    const paused = gs?.phase === 'paused' || gs?.phase === 'gameover'
    const gp = this.gamepad.getGamepad(0)
    const gpConnected = gp?.connected ?? false
    const dtSec = deltaTime / 1000

    for (const entity of entities) {
      const input = entity.getComponent(InputStateComponent)!
      if (paused) {
        input.moveX = input.moveZ = 0
        input.lookDelta = input.pitchDelta = 0
        input.fire = input.sprint = input.reload = false
        // descarta delta do mouse pra não pular ao despausar
        this.input.getMouseDelta()
        continue
      }

      let mx = 0
      let mz = 0
      if (this.isAction('moveForward')) mz -= 1
      if (this.isAction('moveBack')) mz += 1
      if (this.isAction('moveLeft')) mx -= 1
      if (this.isAction('moveRight')) mx += 1

      let lsX = 0
      let lsY = 0
      let rsX = 0
      let rsY = 0
      if (gpConnected) {
        const rawLsX = this.gamepad.getAxis(0, XBOX.LS_X)
        const rawLsY = this.gamepad.getAxis(0, XBOX.LS_Y)
        const rawRsX = this.gamepad.getAxis(0, XBOX.RS_X)
        const rawRsY = this.gamepad.getAxis(0, XBOX.RS_Y)
        ;[lsX, lsY] = applyRadialDeadzone(rawLsX, rawLsY, this.stickDeadzone)
        ;[rsX, rsY] = applyRadialDeadzone(rawRsX, rawRsY, this.stickDeadzone)
        // Snap final pra zero: valores residuais minúsculos vindos do
        // rescaling perto da borda da deadzone (drift na fronteira)
        // não devem integrar. O pitch é especialmente sensível porque
        // acumula ao longo do tempo.
        if (Math.abs(lsX) < 0.05) lsX = 0
        if (Math.abs(lsY) < 0.05) lsY = 0
        if (Math.abs(rsX) < 0.05) rsX = 0
        if (Math.abs(rsY) < 0.05) rsY = 0
        // Curva quadrática só nos eixos de rotação (integrados em yaw).
        // RS_Y mantém linear pra resposta simétrica do pitch.
        lsX = curve(lsX)
        rsX = curve(rsX)
        if (lsY !== 0) mz = lsY
      }
      const mag = Math.hypot(mx, mz)
      if (mag > 1) {
        mx /= mag
        mz /= mag
      }
      input.moveX = mx
      input.moveZ = mz

      let look = 0
      const mouseDelta = this.input.getMouseDelta()
      look += -mouseDelta.x * this.mouseSensitivity
      if (gpConnected) {
        look += -lsX * this.lsRotateSensitivity * dtSec
        look += -rsX * this.rsRotateSensitivity * dtSec
      }
      input.lookDelta = look
      // Pitch desabilitado — câmera fica num ângulo fixo (3ª pessoa
      // por cima do ombro). RS_Y é ignorado.
      void rsY
      input.pitchDelta = 0

      const fireKey = this.input.isButtonDown(0)
      const fireBtn = gpConnected && this.gamepad.isButtonDown(0, XBOX.RT)
      input.fire = fireKey || fireBtn

      const sprintKey = this.isAction('sprint')
      const sprintBtn = gpConnected && this.gamepad.isButtonDown(0, XBOX.LB)
      input.sprint = sprintKey || sprintBtn

      const reloadKey = this.isAction('reload')
      const reloadBtn = gpConnected && this.gamepad.isButtonDown(0, XBOX.X)
      const reloadNow = reloadKey || reloadBtn
      input.reload = reloadNow && !this.prevReload
      this.prevReload = reloadNow
    }
  }
}
