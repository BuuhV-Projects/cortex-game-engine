import { Component } from 'cortex-game-engine'
import type { PlayerCustomization } from '../utils/constants'

/**
 * Estado físico arcade do carro: velocidade longitudinal, capacidades
 * (definidas pela cilindrada) e visual (definido pela customização).
 */
export class CarComponent extends Component {
  speed = 0
  maxSpeed = 20
  accel = 12
  brakeForce = 18
  turnRate = 2.2
  drag = 4
  reverseMax = -6

  // Entradas escritas por PlayerControlSystem ou AIControlSystem.
  // -1..1 para steer; 0..1 para throttle/brake.
  inputThrottle = 0
  inputBrake = 0
  inputSteer = 0

  /** Quando >0, accel/maxSpeed são multiplicados por NITRO_MUL. Decresce. */
  nitroTimer = 0
  /** Velocidade vertical — usada quando o carro saiu da pista (queda livre). */
  vy = 0

  constructor(public customization: PlayerCustomization) {
    super()
  }
}
