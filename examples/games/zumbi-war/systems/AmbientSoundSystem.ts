import { System, type Entity } from 'cortex-game-engine'
import { GameStateComponent } from '../components/GameStateComponent'
import type { Sfx } from '../utils/sfx'
import { randomInRange } from '../utils/math'

/**
 * Toca trovões ocasionais usando `GameStateComponent.thunderTimer` como
 * relógio. Sem estado interno — todo o tempo restante vive no Component.
 */
export class AmbientSoundSystem extends System {
  static override requiredComponents = [GameStateComponent]

  constructor(private sfx: Sfx) {
    super()
  }

  override update(entities: Entity[], deltaTime: number): void {
    const dt = deltaTime / 1000
    for (const entity of entities) {
      const gs = entity.getComponent(GameStateComponent)!
      if (gs.phase === 'paused' || gs.phase === 'gameover') continue
      gs.thunderTimer -= dt
      if (gs.thunderTimer <= 0) {
        this.sfx.play('thunder', 0.45)
        gs.thunderTimer = randomInRange(18, 45)
      }
    }
  }
}
