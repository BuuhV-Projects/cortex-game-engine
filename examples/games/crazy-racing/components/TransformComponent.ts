import { Component } from 'cortex-game-engine'

export class TransformComponent extends Component {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
    public yaw = 0,
  ) {
    super()
  }
}
