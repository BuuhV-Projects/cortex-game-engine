import { Component } from 'cortex-game-engine'

export type InputSource =
  | { kind: 'keyboard'; layout: 'arrows' | 'wasd' | 'either' }
  | { kind: 'gamepad'; slot: number }

export class PlayerInputComponent extends Component {
  throttle = 0
  brake = 0
  steer = 0
  pause = false

  constructor(public playerIndex: 0 | 1, public source: InputSource) {
    super()
  }
}
