import { System, type Entity } from 'cortex-game-engine'
import { AnimationComponent } from '../components/AnimationComponent'

/**
 * Avança o AnimationMixer de cada entidade animada por deltaTime.
 *
 * Prioridade alta (executa por último) pra que trocas de animação feitas
 * por outros Systems no mesmo frame entrem em efeito antes do tick do mixer.
 */
export class AnimationSystem extends System {
  static override requiredComponents = [AnimationComponent]

  override priority = 100

  constructor(private getGameState: () => { phase: string } | null = () => null) {
    super()
  }

  override update(entities: Entity[], deltaTime: number): void {
    const gs = this.getGameState()
    if (gs?.phase === 'paused') return
    const dt = deltaTime / 1000
    for (const entity of entities) {
      entity.getComponent(AnimationComponent)!.mixer.update(dt)
    }
  }
}
