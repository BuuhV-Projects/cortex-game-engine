import * as THREE from 'three'
import { isNpcTarget, splitKey } from './characterRigCharacters'
import { retargetAnimation, type RetargetRig } from './characterRigRetarget'
import type { BakedChannel, BakedClip } from './glbAnimations'
import type { PoseStore } from './rigPoseStore'

/**
 * O assado com personagens (SPEC-0708, ADR-0707): cada visão assa as chaves do esqueleto que mostra. No player: as
 * dele (no GLB do player) e as de NPC editadas no player (assadas no player e retargetadas para o esqueleto dos NPCs).
 * Num NPC: as de NPC editadas num NPC. As outras ficam para a outra visão.
 */

export interface ViewKeys {
  /** Assadas no modelo mostrado, no GLB dele. */
  own: string[]
  /** Visão do player: chaves de NPC editadas no player (vão para o GLB dos NPCs, retargetadas). */
  toNpc: string[]
  /** Ficam para a outra visão. */
  skipped: string[]
}

/** Separa as variantes salvas pela visão (`character` = o NPC mostrado, `null` = o player). */
export function keysForView(store: PoseStore, variants: readonly string[], character: string | null, player: string): ViewKeys {
  const out: ViewKeys = { own: [], toNpc: [], skipped: [] }
  const chars = store.characters
  for (const key of variants) {
    const target = splitKey(key).target
    const npc = isNpcTarget(chars, target) && target !== player
    const fromPlayer = store.spaceOf(key) === 'player'
    if (character) (npc && !fromPlayer ? out.own : out.skipped).push(key)
    else if (!npc) out.own.push(key)
    else (fromPlayer ? out.toNpc : out.skipped).push(key)
  }
  return out
}

const ROTATION = '.quaternion'
const POSITION = '.position'

function toAnimation(clip: BakedClip, duration: number): THREE.AnimationClip {
  const tracks = clip.channels.flatMap((c): THREE.KeyframeTrack[] => {
    if (c.path === 'rotation') return [new THREE.QuaternionKeyframeTrack(`${c.node}${ROTATION}`, Array.from(c.times), Array.from(c.values))]
    if (c.path === 'translation') return [new THREE.VectorKeyframeTrack(`${c.node}${POSITION}`, Array.from(c.times), Array.from(c.values))]
    return []
  })
  return new THREE.AnimationClip(clip.name, duration, tracks)
}

/** O clipe assado no player levado para o esqueleto do NPC (a conta do jogo, `retargetAnimation`). */
export function retargetBaked(clip: BakedClip, duration: number, from: RetargetRig, to: RetargetRig): BakedClip {
  const anim = retargetAnimation(toAnimation(clip, duration), from, to)
  const channels: BakedChannel[] = anim.tracks.map((t) => ({
    node: t.name.slice(0, t.name.lastIndexOf('.')),
    path: t.name.endsWith(ROTATION) ? 'rotation' : 'translation',
    interpolation: 'LINEAR',
    times: Float32Array.from(t.times),
    values: Float32Array.from(t.values),
  }))
  return { name: clip.name, channels }
}
