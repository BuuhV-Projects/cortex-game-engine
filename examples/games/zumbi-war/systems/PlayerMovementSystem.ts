import { System, type Entity } from 'cortex-game-engine'
import { PlayerComponent } from '../components/PlayerComponent'
import { InputStateComponent } from '../components/InputStateComponent'
import { VelocityComponent } from '../components/VelocityComponent'
import { MeshComponent } from '../components/MeshComponent'
import { AnimationComponent } from '../components/AnimationComponent'

/**
 * Aplica o input do player no mesh: rotaciona em Y por lookDelta, acumula
 * cameraPitch e move no plano XZ relativo à orientação atual.
 *
 * Também escolhe a animação (idle / walk / run / death) e ajusta o
 * mixer.timeScale pra a passada visual bater com a velocidade do mundo.
 */
export class PlayerMovementSystem extends System {
  static override requiredComponents = [
    PlayerComponent,
    InputStateComponent,
    VelocityComponent,
    MeshComponent,
  ]

  constructor(private getGameState: () => { phase: string } | null = () => null) {
    super()
  }

  override update(entities: Entity[], deltaTime: number): void {
    const gs = this.getGameState()
    if (gs?.phase === 'paused') return
    const dt = deltaTime / 1000
    for (const entity of entities) {
      const player = entity.getComponent(PlayerComponent)!
      const vel = entity.getComponent(VelocityComponent)!
      const mesh = entity.getComponent(MeshComponent)!.object
      const anim = entity.getComponent(AnimationComponent)

      if (player.isDead) {
        vel.vx = vel.vz = 0
        if (anim) anim.playAction('death', 0.15)
        continue
      }

      const input = entity.getComponent(InputStateComponent)!
      mesh.rotation.y += input.lookDelta
      // Pitch da câmera é fixo agora — CameraFollowSystem usa o valor
      // hardcoded. PlayerComponent.cameraPitch permanece em 0.

      const yaw = mesh.rotation.y
      const cos = Math.cos(yaw)
      const sin = Math.sin(yaw)
      const speed = input.sprint ? player.runSpeed : player.walkSpeed
      const localX = input.moveX
      const localZ = input.moveZ
      const worldX = localX * cos + localZ * sin
      const worldZ = -localX * sin + localZ * cos
      vel.vx = worldX * speed
      vel.vz = worldZ * speed
      mesh.position.x += vel.vx * dt
      mesh.position.z += vel.vz * dt
      mesh.position.y = 0

      if (anim) {
        const horizSpeed = Math.hypot(vel.vx, vel.vz)
        const moving = horizSpeed > 0.05
        if (!moving) {
          anim.playAction('idle')
          anim.mixer.timeScale = 1
        } else if (input.sprint) {
          anim.playAction('run')
          anim.mixer.timeScale = horizSpeed / 4.0
        } else {
          anim.playAction('walk')
          anim.mixer.timeScale = horizSpeed / 1.3
        }
      }
    }
  }
}
