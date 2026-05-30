import { Component } from 'cortex-game-engine'

/**
 * Snapshot do input do frame, preenchido pelo InputSystem.
 *
 *   - `moveX` / `moveZ` em [-1, 1] — sentido em coordenadas locais do
 *     player (moveZ < 0 = pra frente, moveX > 0 = strafe direita).
 *   - `lookDelta` é o quanto o yaw do player deve girar neste frame
 *     (radianos, integrado em mesh.rotation.y).
 *   - `pitchDelta` é o quanto o pitch da câmera deve mudar neste
 *     frame (radianos). Integrado pelo PlayerMovementSystem em
 *     `PlayerComponent.cameraPitch` — câmera fica onde você deixar.
 */
export class InputStateComponent extends Component {
  moveX = 0
  moveZ = 0
  lookDelta = 0
  pitchDelta = 0
  fire = false
  sprint = false
  reload = false
  pauseToggle = false
}
