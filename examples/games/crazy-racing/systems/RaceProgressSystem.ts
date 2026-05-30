import { System, type Entity } from 'cortex-game-engine'
import { TransformComponent } from '../components/TransformComponent'
import { RaceProgressComponent } from '../components/RaceProgressComponent'
import type { TrackContext } from '../utils/trackContext'

/**
 * Detecta passagem por checkpoints (cada waypoint é um) e atualiza laps,
 * `trackProgress` total (laps + distância no lap atual) e a posição no
 * ranking (1 = primeiro).
 *
 * Considera um checkpoint passado quando o carro está perto dele (raio
 * `width * 1.2`) E o próximo waypoint na ordem é o esperado. Isso evita
 * que voltar pra trás conte como checkpoint.
 */
export class RaceProgressSystem extends System {
  static override requiredComponents = [TransformComponent, RaceProgressComponent]
  override priority = 30

  constructor(
    private readonly track: TrackContext,
    private readonly totalLaps: number,
  ) { super() }

  override update(entities: Entity[]): void {
    const now = performance.now()
    const radius = this.track.layout.width * 1.2

    for (const e of entities) {
      const tr = e.getComponent(TransformComponent)!
      const rp = e.getComponent(RaceProgressComponent)!
      if (rp.finished) continue

      const wp = this.track.wp(rp.nextCheckpoint)
      const dx = tr.x - wp.x
      const dz = tr.z - wp.z
      if (dx * dx + dz * dz < radius * radius) {
        // Cruzou a linha de partida (waypoint 0) — fecha lap
        if (rp.nextCheckpoint === 0 && rp.lap > 0) {
          rp.lastLapMs = now - rp.lapStartMs
          rp.lapStartMs = now
          if (rp.lap >= this.totalLaps) {
            rp.finished = true
            rp.finishTimeMs = now - rp.raceStartMs
            continue
          }
        }
        if (rp.nextCheckpoint === 0) rp.lap++
        rp.nextCheckpoint = (rp.nextCheckpoint + 1) % this.track.count
      }

      // Recalcula trackProgress (distância acumulada total)
      const seg = this.track.nearestSegment(tr.x, tr.z)
      const lapLen = this.track.totalLength
      const along = this.track.distanceAt(seg.index, seg.alongT)
      rp.trackProgress = (rp.lap - 1) * lapLen + along
      if (rp.lap < 1) rp.trackProgress = -lapLen + along
    }

    // Atualiza ranking
    const sorted = [...entities].sort((a, b) => {
      const ra = a.getComponent(RaceProgressComponent)!
      const rb = b.getComponent(RaceProgressComponent)!
      if (ra.finished && rb.finished) {
        return (ra.finishTimeMs ?? 0) - (rb.finishTimeMs ?? 0)
      }
      if (ra.finished) return -1
      if (rb.finished) return 1
      return rb.trackProgress - ra.trackProgress
    })
    sorted.forEach((e, i) => {
      e.getComponent(RaceProgressComponent)!.position = i + 1
    })
  }
}
