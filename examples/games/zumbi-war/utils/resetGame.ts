import type { Entity, Scene, World } from 'cortex-game-engine'
import { ZombieComponent } from '../components/ZombieComponent'
import { BulletComponent } from '../components/BulletComponent'
import { MeshComponent } from '../components/MeshComponent'
import { PlayerComponent } from '../components/PlayerComponent'
import { HealthComponent } from '../components/HealthComponent'
import { WeaponComponent } from '../components/WeaponComponent'
import { VelocityComponent } from '../components/VelocityComponent'
import { InputStateComponent } from '../components/InputStateComponent'
import type { GameStateComponent } from '../components/GameStateComponent'

/**
 * Reseta o estado do jogo para iniciar uma nova partida (do zero) sem
 * destruir o mundo: remove zumbis e balas em voo, restaura HP/ammo do
 * player, zera flags do GameStateComponent e re-entra no fluxo de
 * `intermission → playing`.
 *
 * Usado após game over (com input do jogador) e também por callbacks
 * que pedem restart sem recarregar a página.
 */
export function resetGame(
  world: World,
  scene: Scene,
  session: GameStateComponent,
  getPlayer: () => Entity | null,
): void {
  for (const z of world.query(ZombieComponent)) {
    const m = z.getComponent(MeshComponent)
    if (m) scene.remove(m.object)
    world.destroyEntity(z)
  }
  for (const b of world.query(BulletComponent)) {
    const m = b.getComponent(MeshComponent)
    if (m) scene.remove(m.object)
    world.destroyEntity(b)
  }

  const player = getPlayer()
  if (player) {
    const pc = player.getComponent(PlayerComponent)
    if (pc) {
      pc.isDead = false
      pc.cameraPitch = 0
    }
    const hp = player.getComponent(HealthComponent)
    if (hp) hp.current = hp.max
    const w = player.getComponent(WeaponComponent)
    if (w) {
      w.ammo = w.magSize
      w.reserve = 120
      w.reloading = false
      w.fireTimer = 0
      w.reloadTimer = 0
    }
    const vel = player.getComponent(VelocityComponent)
    if (vel) {
      vel.vx = vel.vy = vel.vz = 0
    }
    const inp = player.getComponent(InputStateComponent)
    if (inp) {
      inp.moveX = inp.moveZ = 0
      inp.lookDelta = inp.pitchDelta = 0
      inp.fire = inp.sprint = inp.reload = false
    }
    const mesh = player.getComponent(MeshComponent)
    if (mesh) {
      mesh.object.position.set(0, 0, 0)
      mesh.object.rotation.set(0, 0, 0)
    }
  }

  session.phase = 'intermission'
  session.wave = 0
  session.killsThisWave = 0
  session.killsTotal = 0
  session.zombiesAlive = 0
  session.zombiesToSpawn = 0
  session.spawnTimer = 0
  session.intermissionTimer = 2
  session.thunderTimer = 12
}
