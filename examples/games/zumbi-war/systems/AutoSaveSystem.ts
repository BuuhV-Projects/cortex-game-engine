import { System, type Entity } from 'cortex-game-engine'
import { GameStateComponent } from '../components/GameStateComponent'
import { HealthComponent } from '../components/HealthComponent'
import { WeaponComponent } from '../components/WeaponComponent'
import { writeSave } from '../utils/save'

/**
 * Persiste o progresso quando uma wave é concluída. Detecta a transição
 * `playing → intermission` (wave atual > waveSalva no último flush).
 */
export class AutoSaveSystem extends System {
  static override requiredComponents = [GameStateComponent]

  override priority = 90

  private lastSavedWave = 0
  private wasPlaying = false

  constructor(private getPlayer: () => Entity | null) {
    super()
  }

  override update(entities: Entity[]): void {
    for (const entity of entities) {
      const gs = entity.getComponent(GameStateComponent)!

      if (gs.phase === 'playing') {
        this.wasPlaying = true
        continue
      }

      if (gs.phase === 'intermission' && this.wasPlaying && gs.wave > this.lastSavedWave) {
        this.flush(gs)
        this.lastSavedWave = gs.wave
        this.wasPlaying = false
      }

      if (gs.phase === 'gameover') {
        this.wasPlaying = false
      }
    }
  }

  private flush(gs: GameStateComponent): void {
    const player = this.getPlayer()
    const hp = player?.getComponent(HealthComponent)
    const w = player?.getComponent(WeaponComponent)
    writeSave({
      completedWave: gs.wave,
      killsTotal: gs.killsTotal,
      hp: hp ? Math.max(30, Math.round(hp.current)) : 100,
      ammo: w ? w.ammo : 30,
      reserve: w ? w.reserve : 120,
    })
  }
}
