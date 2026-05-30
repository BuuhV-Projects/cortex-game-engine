import { System, type Entity } from 'cortex-game-engine'
import type { Scene, World } from 'cortex-game-engine'
import { GameStateComponent } from '../components/GameStateComponent'
import { MeshComponent } from '../components/MeshComponent'
import { createZombie, type ZombieAssets } from '../entities/createZombie'
import { randomInRange } from '../utils/math'

/**
 * Controla o ciclo "intermission → playing → intermission" e o spawn
 * progressivo de zumbis por onda. Spawna em volta do player num raio
 * mínimo de 18 unidades.
 */
export class WaveSystem extends System {
  static override requiredComponents = [GameStateComponent]

  override priority = -5

  constructor(
    private world: World,
    private scene: Scene,
    private getPlayer: () => Entity | null,
    private getZombieAssets: () => ZombieAssets | null,
  ) {
    super()
  }

  override update(entities: Entity[], deltaTime: number): void {
    const dt = deltaTime / 1000
    for (const entity of entities) {
      const gs = entity.getComponent(GameStateComponent)!
      if (gs.phase === 'paused' || gs.phase === 'gameover') continue
      const assets = this.getZombieAssets()
      const player = this.getPlayer()
      if (!assets || !player) continue

      if (gs.phase === 'intermission') {
        gs.intermissionTimer -= dt
        if (gs.intermissionTimer <= 0) {
          gs.wave += 1
          gs.killsThisWave = 0
          gs.zombiesToSpawn = 4 + gs.wave * 3
          gs.zombiesAlive = 0
          gs.spawnTimer = 0
          gs.phase = 'playing'
        }
        continue
      }

      if (gs.phase === 'playing') {
        if (gs.zombiesToSpawn > 0) {
          gs.spawnTimer -= dt
          if (gs.spawnTimer <= 0) {
            this.spawnOne(gs, player, assets)
            gs.spawnTimer = Math.max(0.15, 1.2 - gs.wave * 0.08)
          }
        }
        if (gs.zombiesToSpawn === 0 && gs.zombiesAlive === 0) {
          gs.phase = 'intermission'
          gs.intermissionTimer = 4.5
        }
      }
    }
  }

  private spawnOne(gs: GameStateComponent, player: Entity, assets: ZombieAssets): void {
    const mesh = player.getComponent(MeshComponent)!.object
    const angle = Math.random() * Math.PI * 2
    const radius = randomInRange(18, 28)
    const x = mesh.position.x + Math.cos(angle) * radius
    const z = mesh.position.z + Math.sin(angle) * radius
    const speed = randomInRange(1.4, 2.4) + Math.min(2, gs.wave * 0.1)
    createZombie(this.world, this.scene, assets, x, z, speed)
    gs.zombiesToSpawn -= 1
    gs.zombiesAlive += 1
  }
}
