import { System, type Entity, type World } from 'cortex-game-engine'
import { TransformComponent } from '../components/TransformComponent'
import { CarComponent } from '../components/CarComponent'
import { MeshComponent } from '../components/MeshComponent'
import { NitroPickupComponent } from '../components/NitroPickupComponent'

const PICKUP_RADIUS = 1.8
const SPIN_RATE = 2.4   // rad/s
const BOB_AMP = 0.15
const BOB_RATE = 2.5

/**
 * Anima os pickups (giro + bobbing), detecta proximidade dos carros e
 * ativa o nitro. Pickup consumido fica invisível por `respawnAfter`s.
 *
 * Roda em prioridade 12, depois de PlayerControlSystem/AIControlSystem
 * mas antes de CarPhysicsSystem, pra o boost já valer no mesmo frame.
 */
export class NitroPickupSystem extends System {
  static override requiredComponents = [TransformComponent, NitroPickupComponent, MeshComponent]
  override priority = 12

  constructor(private readonly world: World) { super() }

  override update(entities: Entity[], deltaTime: number): void {
    const dt = deltaTime / 1000
    const time = performance.now() / 1000

    // Snapshot dos carros uma vez
    const cars = this.world.query(CarComponent, TransformComponent)

    for (const e of entities) {
      const pickup = e.getComponent(NitroPickupComponent)!
      const tr = e.getComponent(TransformComponent)!
      const mc = e.getComponent(MeshComponent)!

      // Respawn
      if (!pickup.active) {
        pickup.respawnTimer -= dt
        if (pickup.respawnTimer <= 0) {
          pickup.active = true
          mc.object.visible = true
        }
        continue
      }

      // Animação visual
      mc.object.rotation.y += SPIN_RATE * dt
      mc.object.position.set(
        tr.x,
        tr.y + Math.sin(time * BOB_RATE) * BOB_AMP,
        tr.z,
      )

      // Detecta carros próximos
      for (const car of cars) {
        const ctr = car.getComponent(TransformComponent)!
        const dx = ctr.x - tr.x
        const dz = ctr.z - tr.z
        const dy = ctr.y - tr.y
        if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS && Math.abs(dy) < 2.5) {
          // Coletado
          const carC = car.getComponent(CarComponent)!
          carC.nitroTimer = Math.max(carC.nitroTimer, pickup.bonusDuration)
          pickup.active = false
          pickup.respawnTimer = pickup.respawnAfter
          mc.object.visible = false
          break
        }
      }
    }
  }
}
