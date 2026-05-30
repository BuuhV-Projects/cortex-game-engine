import { System, type Entity } from 'cortex-game-engine'
import { ZombieComponent } from '../components/ZombieComponent'
import { VelocityComponent } from '../components/VelocityComponent'
import { MeshComponent } from '../components/MeshComponent'
import { PlayerComponent } from '../components/PlayerComponent'
import { HealthComponent } from '../components/HealthComponent'
import { AnimationComponent } from '../components/AnimationComponent'

/**
 * Move cada zumbi vivo em direção ao player, atualizando estado
 * (`pursuing` / `attacking`) e a animação correspondente.
 *
 * Recebe `getPlayer` via construtor pra evitar query custosa por zumbi.
 */
export class ZombiePursueSystem extends System {
  static override requiredComponents = [
    ZombieComponent,
    MeshComponent,
    VelocityComponent,
  ]

  constructor(
    private getPlayer: () => Entity | null,
    private getGameState: () => { phase: string } | null = () => null,
  ) {
    super()
  }

  override update(entities: Entity[], deltaTime: number): void {
    const gs = this.getGameState()
    if (gs?.phase === 'paused' || gs?.phase === 'gameover') return
    const player = this.getPlayer()
    if (!player) return
    const playerHp = player.getComponent(HealthComponent)
    const playerC = player.getComponent(PlayerComponent)
    const playerAlive = !!(playerC && playerHp && !playerC.isDead)
    const playerMesh = player.getComponent(MeshComponent)!.object
    const dt = deltaTime / 1000

    for (const entity of entities) {
      const z = entity.getComponent(ZombieComponent)!
      const v = entity.getComponent(VelocityComponent)!
      const m = entity.getComponent(MeshComponent)!.object
      const anim = entity.getComponent(AnimationComponent)

      if (z.state === 'dying' || z.state === 'dead') {
        v.vx = v.vz = 0
        if (anim) {
          anim.playAction('death', 0.15)
          anim.mixer.timeScale = 1
        }
        continue
      }

      if (!playerAlive) {
        v.vx = v.vz = 0
        if (anim) {
          anim.playAction('idle')
          anim.mixer.timeScale = 1
        }
        continue
      }

      const dx = playerMesh.position.x - m.position.x
      const dz = playerMesh.position.z - m.position.z
      const dist = Math.hypot(dx, dz)
      if (dist < 0.0001) continue

      const nx = dx / dist
      const nz = dz / dist
      // Forward do modelo = -Z (após rotação interna de π no FBX).
      // Pra que o forward aponte em (nx,nz), o yaw do root é atan2(-nx,-nz).
      m.rotation.y = Math.atan2(-nx, -nz)

      if (dist <= z.attackRange) {
        z.state = 'attacking'
        v.vx = v.vz = 0
        if (anim) {
          anim.playAction('attack', 0.15)
          anim.mixer.timeScale = 1
        }
      } else {
        z.state = 'pursuing'
        v.vx = nx * z.speed
        v.vz = nz * z.speed
        m.position.x += v.vx * dt
        m.position.z += v.vz * dt
        if (anim) {
          // Mixamo Zombie Walk ~0.9 u/s; Zombie Running ~2.6 u/s.
          if (z.speed > 2.0 && anim.actions.run) {
            anim.playAction('run')
            anim.mixer.timeScale = z.speed / 2.6
          } else {
            anim.playAction('walk')
            anim.mixer.timeScale = z.speed / 0.9
          }
        }
      }
      m.position.y = 0
    }
  }
}
