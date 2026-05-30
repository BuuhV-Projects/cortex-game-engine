import { System, type Entity } from 'cortex-game-engine'
import { CarComponent } from '../components/CarComponent'
import { AIControllerComponent } from '../components/AIControllerComponent'
import { TransformComponent } from '../components/TransformComponent'
import { clamp, wrapAngle, angleTo, dist2D } from '../utils/math'
import type { TrackContext } from '../utils/trackContext'

/**
 * IA simples: persegue waypoints, vira em direção ao próximo, mantém throttle
 * alto. Cada bot tem `lateralOffset` pra não andar todos colados.
 */
export class AIControlSystem extends System {
  static override requiredComponents = [CarComponent, AIControllerComponent, TransformComponent]
  override priority = 11

  constructor(private readonly track: TrackContext) { super() }

  override update(entities: Entity[]): void {
    for (const e of entities) {
      const car = e.getComponent(CarComponent)!
      const ai  = e.getComponent(AIControllerComponent)!
      const tr  = e.getComponent(TransformComponent)!

      const wp = this.track.wp(ai.targetWaypoint)
      const next = this.track.wp(ai.targetWaypoint + 1)
      // Mira o ponto entre o waypoint atual e o próximo com offset lateral
      const dx = next.x - wp.x
      const dz = next.z - wp.z
      const len = Math.hypot(dx, dz) || 1
      const nx = -dz / len
      const nz =  dx / len
      const targetX = (wp.x + next.x) / 2 + nx * ai.lateralOffset
      const targetZ = (wp.z + next.z) / 2 + nz * ai.lateralOffset

      if (dist2D(tr.x, tr.z, wp.x, wp.z) < this.track.layout.width * 1.3) {
        ai.targetWaypoint = (ai.targetWaypoint + 1) % this.track.count
      }

      const desired = angleTo(tr.x, tr.z, targetX, targetZ)
      const diff = wrapAngle(desired - tr.yaw)
      car.inputSteer = clamp(diff * 1.5, -1, 1)
      // Freia em curvas fechadas
      car.inputBrake = Math.abs(diff) > 1.0 ? 0.4 : 0
      car.inputThrottle = Math.abs(diff) > 1.4 ? 0.6 : 1
    }
  }
}
