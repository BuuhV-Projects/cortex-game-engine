import { System, type Entity, Vector3 } from 'cortex-game-engine'
import type { Scene, World } from 'cortex-game-engine'
import { WeaponComponent } from '../components/WeaponComponent'
import { InputStateComponent } from '../components/InputStateComponent'
import { MeshComponent } from '../components/MeshComponent'
import { PlayerComponent } from '../components/PlayerComponent'
import { MuzzleFlashComponent } from '../components/MuzzleFlashComponent'
import { createBullet } from '../entities/createBullet'
import type { Sfx } from '../utils/sfx'

/**
 * Lida com tiro, reload e cooldown. Lê InputStateComponent (fire/reload)
 * e emite bullets via `createBullet`. Pisca o muzzle flash e toca o som
 * do rifle quando dispara.
 */
export class WeaponSystem extends System {
  static override requiredComponents = [
    PlayerComponent,
    WeaponComponent,
    InputStateComponent,
    MeshComponent,
  ]

  constructor(
    private world: World,
    private scene: Scene,
    private sfx: Sfx | null = null,
    private getGameState: () => { phase: string } | null = () => null,
  ) {
    super()
  }

  override update(entities: Entity[], deltaTime: number): void {
    const gs = this.getGameState()
    if (gs?.phase === 'paused' || gs?.phase === 'gameover') return
    const dt = deltaTime / 1000
    for (const entity of entities) {
      const player = entity.getComponent(PlayerComponent)!
      if (player.isDead) continue
      const w = entity.getComponent(WeaponComponent)!
      const input = entity.getComponent(InputStateComponent)!
      const mesh = entity.getComponent(MeshComponent)!.object

      if (w.fireTimer > 0) w.fireTimer -= dt

      if (w.reloading) {
        w.reloadTimer -= dt
        if (w.reloadTimer <= 0) {
          const needed = w.magSize - w.ammo
          const take = Math.min(needed, w.reserve)
          w.ammo += take
          w.reserve -= take
          w.reloading = false
        }
      }

      if (input.reload && !w.reloading && w.ammo < w.magSize && w.reserve > 0) {
        w.reloading = true
        w.reloadTimer = w.reloadTime
      }

      const flash = entity.getComponent(MuzzleFlashComponent)
      if (flash && flash.remaining > 0) {
        flash.remaining -= dt
        flash.light.intensity = Math.max(0, flash.remaining * 30)
      }

      if (input.fire && !w.reloading && w.fireTimer <= 0 && w.ammo > 0) {
        w.fireTimer = w.fireRate
        w.ammo -= 1

        const yaw = mesh.rotation.y
        // Forward = -Z quando yaw=0 (convenção do jogo).
        const fwdX = -Math.sin(yaw)
        const fwdZ = -Math.cos(yaw)
        const muzzleOffset = 0.9
        const origin = new Vector3(
          mesh.position.x + fwdX * muzzleOffset,
          1.45,
          mesh.position.z + fwdZ * muzzleOffset,
        )
        createBullet(this.world, this.scene, origin, fwdX, fwdZ, w.damage, w.range)

        if (flash) {
          flash.remaining = 0.06
          flash.light.intensity = 2.5
        }
        if (this.sfx) this.sfx.play('rifle', 0.5)
      }
    }
  }
}
