import { System, type Entity } from 'cortex-game-engine'
import type { Scene, World } from 'cortex-game-engine'
import { ZombieComponent } from '../components/ZombieComponent'
import { HealthComponent } from '../components/HealthComponent'
import { MeshComponent } from '../components/MeshComponent'
import { PlayerComponent } from '../components/PlayerComponent'
import { HitFlashComponent } from '../components/HitFlashComponent'
import { GameStateComponent } from '../components/GameStateComponent'
import type { Sfx } from '../utils/sfx'

/**
 * Resolve dois fluxos de dano:
 *
 *   1. Zumbis com `state === 'attacking'` aplicam dano no player em
 *      intervalos de `attackCooldown`.
 *   2. Zumbis com HP <= 0 entram em `dying` (timer antes de virar
 *      `dead` e serem removidos do mundo).
 *
 * Também decai HitFlash e libera o player pra death state quando HP=0.
 * Toca o som de ataque do zumbi ('swoosh') quando aplica dano.
 */
export class DamageSystem extends System {
  static override requiredComponents = [ZombieComponent, HealthComponent, MeshComponent]

  constructor(
    private world: World,
    private scene: Scene,
    private getPlayer: () => Entity | null,
    private getGameState: () => GameStateComponent | null,
    private sfx: Sfx | null = null,
  ) {
    super()
  }

  override update(entities: Entity[], deltaTime: number): void {
    const gs0 = this.getGameState()
    if (gs0?.phase === 'paused') return
    const dt = deltaTime / 1000
    const player = this.getPlayer()
    const playerHp = player?.getComponent(HealthComponent) ?? null
    const playerC = player?.getComponent(PlayerComponent) ?? null
    const gs = this.getGameState()

    for (const entity of entities) {
      const z = entity.getComponent(ZombieComponent)!
      const hp = entity.getComponent(HealthComponent)!
      const mesh = entity.getComponent(MeshComponent)!.object

      const flash = entity.getComponent(HitFlashComponent)
      if (flash) {
        flash.remaining -= dt
        if (flash.remaining <= 0) entity.removeComponent(HitFlashComponent)
      }

      if (z.state === 'attacking' && playerHp && playerC && !playerC.isDead) {
        z.attackTimer -= dt
        if (z.attackTimer <= 0) {
          z.attackTimer = z.attackCooldown
          playerHp.current = Math.max(0, playerHp.current - z.attackDamage)
          if (this.sfx) this.sfx.play('swoosh', 0.7)
          if (playerHp.current <= 0) {
            playerC.isDead = true
            if (gs) gs.phase = 'gameover'
          }
        }
      }

      if ((z.state === 'pursuing' || z.state === 'attacking') && hp.current <= 0) {
        z.state = 'dying'
        z.dyingTimer = 1.4
        mesh.position.y = 0
        if (gs) {
          gs.killsThisWave += 1
          gs.killsTotal += 1
          gs.zombiesAlive = Math.max(0, gs.zombiesAlive - 1)
        }
      }

      if (z.state === 'dying') {
        z.dyingTimer -= dt
        if (z.dyingTimer <= 0) {
          z.state = 'dead'
          this.scene.remove(mesh)
          this.world.destroyEntity(entity)
        }
      }
    }
  }
}
