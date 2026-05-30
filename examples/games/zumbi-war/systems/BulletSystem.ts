import { System, type Entity } from 'cortex-game-engine'
import type { Scene, World } from 'cortex-game-engine'
import { BulletComponent } from '../components/BulletComponent'
import { MeshComponent } from '../components/MeshComponent'
import { ZombieComponent } from '../components/ZombieComponent'
import { HealthComponent } from '../components/HealthComponent'
import { HitFlashComponent } from '../components/HitFlashComponent'

/**
 * Move bullets em linha reta, decai lifetime e checa colisão contra
 * zumbis vivos via distância XZ (raio 0.6).
 *
 * Quando bate, aplica dano e marca HitFlash no zumbi pra feedback visual.
 * Quando expira ou bate, destrói a entidade da bala e remove o mesh.
 */
export class BulletSystem extends System {
  static override requiredComponents = [BulletComponent, MeshComponent]

  constructor(
    private world: World,
    private scene: Scene,
    private getZombies: () => Entity[],
    private getGameState: () => { phase: string } | null = () => null,
  ) {
    super()
  }

  override update(entities: Entity[], deltaTime: number): void {
    const gs = this.getGameState()
    if (gs?.phase === 'paused' || gs?.phase === 'gameover') return
    const dt = deltaTime / 1000
    const zombies = this.getZombies()
    const dead: Entity[] = []

    for (const entity of entities) {
      const b = entity.getComponent(BulletComponent)!
      const m = entity.getComponent(MeshComponent)!.object
      m.position.x += b.dirX * b.speed * dt
      m.position.z += b.dirZ * b.speed * dt
      b.lifetime -= dt

      let hit = false
      for (const z of zombies) {
        const zc = z.getComponent(ZombieComponent)!
        if (zc.state === 'dying' || zc.state === 'dead') continue
        const zMesh = z.getComponent(MeshComponent)!.object
        const dx = zMesh.position.x - m.position.x
        const dz = zMesh.position.z - m.position.z
        if (dx * dx + dz * dz <= 0.6 * 0.6) {
          const hp = z.getComponent(HealthComponent)!
          hp.current -= b.damage
          z.addComponent(new HitFlashComponent(0.1))
          hit = true
          break
        }
      }

      if (hit || b.lifetime <= 0) dead.push(entity)
    }

    for (const e of dead) {
      const m = e.getComponent(MeshComponent)
      if (m) this.scene.remove(m.object)
      this.world.destroyEntity(e)
    }
  }
}
