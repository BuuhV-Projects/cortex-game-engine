import { Component } from 'cortex-game-engine'

export class HealthComponent extends Component {
  constructor(public current: number, public max: number) {
    super()
  }
}
