import { Component } from 'cortex-game-engine'
import type { EngineAudio } from '../utils/engineAudio'

/** Guarda a referência ao emissor de som do motor de uma entidade. */
export class EngineSoundComponent extends Component {
  constructor(public audio: EngineAudio) {
    super()
  }
}
