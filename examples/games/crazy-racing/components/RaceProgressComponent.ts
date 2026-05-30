import { Component } from 'cortex-game-engine'

/**
 * Progresso de um carro em uma corrida. `lapStartMs` é o timestamp do
 * cruzamento atual da linha; `lastLapMs` guarda a volta anterior pra HUD.
 */
export class RaceProgressComponent extends Component {
  nextCheckpoint = 0
  lap = 0
  position = 1
  finished = false
  finishTimeMs: number | null = null
  raceStartMs: number = performance.now()
  lapStartMs: number = performance.now()
  lastLapMs: number | null = null
  /** Distância acumulada percorrida na pista — usada pra ranking. */
  trackProgress = 0

  constructor(public label: string) {
    super()
  }
}
