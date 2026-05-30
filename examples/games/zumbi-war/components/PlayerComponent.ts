import { Component } from 'cortex-game-engine'

export class PlayerComponent extends Component {
  walkSpeed = 4
  runSpeed = 8
  isDead = false
  /** Pitch acumulado da câmera (radianos). Clampado em ±π/3. */
  cameraPitch = 0
}
