import { Component } from 'cortex-game-engine'

export type ZombieState = 'pursuing' | 'attacking' | 'dying' | 'dead'

export class ZombieComponent extends Component {
  state: ZombieState = 'pursuing'
  speed = 1.6
  attackRange = 1.6
  attackDamage = 12
  attackCooldown = 1.2
  attackTimer = 0
  dyingTimer = 0
}
