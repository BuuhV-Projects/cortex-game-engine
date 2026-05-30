import {
  AnimationMixer,
  type AnimationAction,
  type AnimationClip,
  type Object3D,
} from 'cortex-game-engine'

/**
 * Constrói o mixer + actions para um modelo, dado um dicionário
 * `nome → AnimationClip`. Útil para Mixamo, onde cada animação vem
 * num FBX próprio com `.animations[0]`.
 */
export function buildAnimations(
  model: Object3D,
  clips: Record<string, AnimationClip | undefined>,
): { mixer: AnimationMixer; actions: Record<string, AnimationAction> } {
  const mixer = new AnimationMixer(model)
  const actions: Record<string, AnimationAction> = {}
  for (const [name, clip] of Object.entries(clips)) {
    if (!clip) continue
    actions[name] = mixer.clipAction(clip)
  }
  return { mixer, actions }
}

/** `AnimationActionLoopStyles.LoopOnce` no enum interno do three. */
export const LOOP_ONCE = 2200
/** `AnimationActionLoopStyles.LoopRepeat` no enum interno do three. */
export const LOOP_REPEAT = 2201
