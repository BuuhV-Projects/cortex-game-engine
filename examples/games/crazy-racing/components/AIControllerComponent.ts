import { Component } from 'cortex-game-engine'

/**
 * Estado do bot — armazena qual waypoint da pista ele está perseguindo
 * e um pequeno offset lateral pra evitar que todos andem em linha reta.
 */
export class AIControllerComponent extends Component {
  targetWaypoint = 0
  lateralOffset = 0
  constructor(public personality: number = Math.random()) {
    super()
  }
}
