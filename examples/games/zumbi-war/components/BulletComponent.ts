import { Component } from 'cortex-game-engine'

export class BulletComponent extends Component {
  constructor(
    public dirX: number,
    public dirZ: number,
    public speed: number,
    public damage: number,
    public lifetime: number,
  ) {
    super()
  }
}
