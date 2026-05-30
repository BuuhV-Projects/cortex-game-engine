import { Component } from 'cortex-game-engine'

export type GamePhase = 'playing' | 'paused' | 'gameover' | 'intermission'

export class GameStateComponent extends Component {
  phase: GamePhase = 'intermission'
  wave = 0
  killsThisWave = 0
  killsTotal = 0
  zombiesAlive = 0
  zombiesToSpawn = 0
  spawnTimer = 0
  intermissionTimer = 3
  gamepadConnected = false
  thunderTimer = 12
}
