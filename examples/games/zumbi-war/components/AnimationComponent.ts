import {
  Component,
  type AnimationMixer,
  type AnimationAction,
} from 'cortex-game-engine'

/**
 * Guarda o AnimationMixer e o catálogo de actions de um personagem.
 *
 * `current` é o nome da action atualmente tocando. `playAction` faz
 * crossfade automático pra evitar pop entre clipes.
 */
export class AnimationComponent extends Component {
  current = ''

  constructor(
    public mixer: AnimationMixer,
    public actions: Record<string, AnimationAction>,
  ) {
    super()
  }

  playAction(name: string, fade = 0.2): void {
    if (this.current === name) return
    const next = this.actions[name]
    if (!next) return
    const prev = this.actions[this.current]
    next.reset().fadeIn(fade).play()
    if (prev) prev.fadeOut(fade)
    this.current = name
  }
}
