import { Component } from 'cortex-game-engine'

export class VelocityComponent extends Component {
  constructor(public vx = 0, public vy = 0, public vz = 0) {
    super()
  }
}
