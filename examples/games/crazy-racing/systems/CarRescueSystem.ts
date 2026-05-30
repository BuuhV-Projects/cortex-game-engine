import { System, type Entity } from 'cortex-game-engine'
import { TransformComponent } from '../components/TransformComponent'
import { CarComponent } from '../components/CarComponent'
import { RaceProgressComponent } from '../components/RaceProgressComponent'
import type { TrackContext } from '../utils/trackContext'

const FALL_THRESHOLD_Y = -8

/**
 * Reset do carro se ele cair muito abaixo do nível da pista (saiu da
 * espiral, por exemplo). Teleporta para o último checkpoint cruzado e
 * zera velocidade.
 */
export class CarRescueSystem extends System {
  static override requiredComponents = [TransformComponent, CarComponent, RaceProgressComponent]
  override priority = 25  // depois do CarPhysics, antes do RaceProgress

  constructor(private readonly track: TrackContext) { super() }

  override update(entities: Entity[]): void {
    for (const e of entities) {
      const tr = e.getComponent(TransformComponent)!
      if (tr.y > FALL_THRESHOLD_Y) continue

      const rp = e.getComponent(RaceProgressComponent)!
      const car = e.getComponent(CarComponent)!

      // Volta pro checkpoint anterior (último que ele já cruzou)
      const lastIdx = ((rp.nextCheckpoint - 1) + this.track.count) % this.track.count
      const wp = this.track.wp(lastIdx)
      const next = this.track.wp(lastIdx + 1)

      tr.x = wp.x
      tr.y = wp.y + 0.5
      tr.z = wp.z
      tr.yaw = Math.atan2(next.x - wp.x, next.z - wp.z)
      car.speed = 0
      car.vy = 0
    }
  }
}
