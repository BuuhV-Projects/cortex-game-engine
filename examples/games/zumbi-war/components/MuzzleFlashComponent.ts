import { Component } from 'cortex-game-engine'
import type { PointLight } from 'cortex-game-engine'

/**
 * Luz pontual presa no cano da arma do jogador. WeaponSystem liga o ponto
 * de luz brevemente a cada tiro; este componente guarda o timer de fade.
 */
export class MuzzleFlashComponent extends Component {
  remaining = 0

  constructor(public light: PointLight) {
    super()
  }
}
