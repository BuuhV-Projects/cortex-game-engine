import { Component } from 'cortex-game-engine'

/** Marca uma entity como alvo da câmera do jogador `playerIndex`. */
export class CameraTargetComponent extends Component {
  constructor(public playerIndex: 0 | 1) {
    super()
  }
}
