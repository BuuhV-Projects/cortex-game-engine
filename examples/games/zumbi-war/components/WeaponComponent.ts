import { Component } from 'cortex-game-engine'

export class WeaponComponent extends Component {
  ammo = 30
  magSize = 30
  reserve = 120
  fireRate = 0.09
  fireTimer = 0
  reloadTime = 1.6
  reloading = false
  reloadTimer = 0
  damage = 50
  range = 60
}
