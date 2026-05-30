import { Component } from 'cortex-game-engine'

/**
 * Marca uma entidade como pickup de nitro. Quando consumido, fica
 * inativo por `respawnTimer` segundos e depois reaparece.
 */
export class NitroPickupComponent extends Component {
  active = true
  respawnTimer = 0
  /** Segundos até reaparecer após ser coletado. */
  respawnAfter = 6
  /** Bônus dado ao carro (segundos de nitro). */
  bonusDuration = 2
}
