import { System, type Entity, type PerspectiveCamera } from 'cortex-game-engine'
import { TransformComponent } from '../components/TransformComponent'
import { CameraTargetComponent } from '../components/CameraTargetComponent'
import { CarComponent } from '../components/CarComponent'
import { lerp } from '../utils/math'

/**
 * Câmera em "chase" atrás de cada CameraTarget. No modo coop existem 2
 * câmeras (uma por canvas). No modo solo, a câmera índice 0 é usada.
 */
export class CameraFollowSystem extends System {
  static override requiredComponents = [TransformComponent, CameraTargetComponent]
  override priority = 95

  private readonly state = new Map<number, { x: number; y: number; z: number; yaw: number }>()

  constructor(private readonly cameras: PerspectiveCamera[]) { super() }

  override update(entities: Entity[], deltaTime: number): void {
    const dt = Math.min(0.05, deltaTime / 1000)
    for (const e of entities) {
      const ct = e.getComponent(CameraTargetComponent)!
      const cam = this.cameras[ct.playerIndex]
      if (!cam) continue
      const tr = e.getComponent(TransformComponent)!
      const car = e.getComponent(CarComponent)
      const speedNorm = car ? Math.min(1, Math.abs(car.speed) / car.maxSpeed) : 0.5

      const distance = 7 + speedNorm * 2
      const height = 4.5
      const behindX = tr.x - Math.sin(tr.yaw) * distance
      const behindZ = tr.z - Math.cos(tr.yaw) * distance
      // Altura é RELATIVA ao Y do carro — assim a câmera sobe junto em
      // espirais/rampas e desce junto em pistas inclinadas, ao invés de
      // ficar grudada em Y absoluto e atravessar o asfalto.
      const targetY = tr.y + height

      const s = this.state.get(ct.playerIndex) ?? { x: behindX, y: targetY, z: behindZ, yaw: tr.yaw }
      const smooth = 6
      // Y precisa de smoothing mais alto pra não "vibrar" subindo rampas
      const smoothY = 10
      s.x = lerp(s.x, behindX, Math.min(1, smooth * dt))
      s.y = lerp(s.y, targetY, Math.min(1, smoothY * dt))
      s.z = lerp(s.z, behindZ, Math.min(1, smooth * dt))
      this.state.set(ct.playerIndex, s)

      cam.position.set(s.x, s.y, s.z)
      cam.lookAt(tr.x, tr.y + 1, tr.z)
    }
  }
}
