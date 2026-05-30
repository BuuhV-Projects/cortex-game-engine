import { System, type Entity, type InputManager, type GamepadManager } from 'cortex-game-engine'
import { PlayerInputComponent } from '../components/PlayerInputComponent'
import { XBOX_AXIS } from '../utils/gamepad'
import type { GamepadBinding } from '../utils/inputBinding'
import { clamp } from '../utils/math'

/**
 * Lê teclado (via InputManager do engine) e gamepad (via GamepadManager
 * do engine) e popula PlayerInputComponent.throttle/brake/steer/pause de
 * cada player.
 *
 * O mapeamento dos botões do gamepad vem de `GamepadBinding`, configurável
 * pela tela de Configurações. O eixo de direção é sempre o stick esquerdo
 * (LX) com opção de inverter.
 *
 * Layouts de teclado:
 *   - 'either' (solo):     aceita SETAS *e* WASD
 *   - 'arrows' (P2 coop):  apenas setas
 *   - 'wasd'   (P1 coop):  apenas WASD
 *
 * Para teclas de letra comparamos lowercase e uppercase — InputManager
 * registra event.key literal, que vira maiúscula com Shift/CapsLock.
 */
export class InputSystem extends System {
  static override requiredComponents = [PlayerInputComponent]

  constructor(
    private readonly input: InputManager,
    private readonly gamepads: GamepadManager,
    private readonly binding: GamepadBinding,
  ) { super() }

  override update(entities: Entity[]): void {
    this.gamepads.poll()

    for (const e of entities) {
      const pi = e.getComponent(PlayerInputComponent)!
      if (pi.source.kind === 'keyboard') {
        const isDown = (...keys: string[]) => keys.some((k) => this.input.isKeyDown(k))
        const wasd = {
          up:    isDown('w', 'W'),
          down:  isDown('s', 'S'),
          left:  isDown('a', 'A'),
          right: isDown('d', 'D'),
        }
        const useArrows = pi.source.layout === 'arrows' || pi.source.layout === 'either'
        const useWasd   = pi.source.layout === 'wasd'   || pi.source.layout === 'either'
        const upHit    = (useArrows && isDown('ArrowUp'))    || (useWasd && wasd.up)
        const downHit  = (useArrows && isDown('ArrowDown'))  || (useWasd && wasd.down)
        const leftHit  = (useArrows && isDown('ArrowLeft'))  || (useWasd && wasd.left)
        const rightHit = (useArrows && isDown('ArrowRight')) || (useWasd && wasd.right)
        pi.throttle = upHit   ? 1 : 0
        pi.brake    = downHit ? 1 : 0
        pi.steer    = (leftHit ? -1 : 0) + (rightHit ? 1 : 0)
        pi.pause = isDown('Escape')
      } else {
        const slot = pi.source.slot
        pi.throttle = this.gamepads.isButtonDown(slot, this.binding.throttleButton) ? 1 : 0
        pi.brake    = this.gamepads.isButtonDown(slot, this.binding.brakeButton)    ? 1 : 0
        pi.pause    = this.gamepads.isButtonDown(slot, this.binding.pauseButton)
        const raw = this.gamepads.getAxis(slot, XBOX_AXIS.LX)
        pi.steer = clamp(this.binding.invertSteer ? -raw : raw, -1, 1)
      }
    }
  }
}
