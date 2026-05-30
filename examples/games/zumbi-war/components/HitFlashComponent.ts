import { Component } from 'cortex-game-engine'

/**
 * Marca um inimigo que acabou de tomar dano — usado para piscar vermelho
 * por um curto período.
 */
export class HitFlashComponent extends Component {
  constructor(public remaining: number) {
    super()
  }
}
