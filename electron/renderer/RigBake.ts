import * as THREE from 'three'
import type { Quat } from './characterRigArmSpace'
import { poseDelta } from './characterRigPose'
import { sameFollows } from './characterRigFollow'
import { splitVariant } from './characterRigWeapon'
import { keepContinuous, type BakeEntry } from './characterRigBake'
import type { BakedChannel, BakedClip } from './glbAnimations'
import type { PoseStore } from './rigPoseStore'
import type { RigArmAdjust } from './RigArmAdjust'
import type { RigSkeleton, UndoStack } from './RigSkeleton'

/**
 * Assado da aba Animações no GLB do jogo (SPEC-0704): para cada chave a gravar (clipe base ou variante
 * `clipe@ARMA`), amostra as chaves da animação base direto das faixas (sem mixer), aplica a mesma conta
 * da prévia (braços, pose e ligações desejados − gerados, limite de junta e auxiliares), lê os
 * quatérnions locais e monta as faixas novas. Translação e escala vêm da animação base sem mudança.
 */

/** Uma chave a gravar e a animação do GLB de onde ela sai. */
export interface BakeJob {
  /** Nome no GLB: o clipe (corrige) ou `clipe@ARMA` (variante). */
  name: string
  /** Animação do GLB que serve de base (o clipe base, já com o gerado dele). */
  anim: string
}

/** O que a prévia precisa emprestar para assar. */
export interface BakeContext {
  sk: RigSkeleton
  arm: RigArmAdjust
  store: PoseStore
  clips: ReadonlyMap<string, THREE.AnimationClip>
  limits: Readonly<Record<string, number>>
}

const QUAT_PATH = '.quaternion'
const POSITION_PATH = '.position'
const SCALE_PATH = '.scale'
const QUAT_SIZE = 4

/** Chaves que diferem do build: clipes base com braços/pose/ligações diferentes e as variantes salvas. */
export function bakeJobs(store: PoseStore, arm: RigArmAdjust, baseClips: readonly string[], variants: readonly string[], glbAnims: ReadonlySet<string>): BakeJob[] {
  const jobs: BakeJob[] = []
  for (const name of baseClips) {
    if (!glbAnims.has(name) || !store.editable(name)) continue
    if (store.needsRegen(name, name) || arm.needsRegen(name)) jobs.push({ name, anim: name })
  }
  for (const key of variants) {
    const { clip } = splitVariant(key)
    if (glbAnims.has(clip) && store.editable(key)) jobs.push({ name: key, anim: clip })
  }
  return jobs
}

/** Ligações gravadas no build que o desejado não tem: o assado não sabe desfazer (SPEC-0704). */
export function lostLinks(store: PoseStore, job: BakeJob): boolean {
  const wanted = store.wantedFollow(job.name)
  return store.generatedLinks(job.anim).some((g) => !wanted.some((w) => sameFollows([w], [g])))
}

function boneOf(track: THREE.KeyframeTrack): string {
  return track.name.slice(0, track.name.lastIndexOf('.'))
}

/** Tempos da animação: os da faixa de rotação com mais chaves (as do Blender saem todas iguais). */
function framesOf(clip: THREE.AnimationClip): Float32Array {
  let best: THREE.KeyframeTrack | null = null
  for (const t of clip.tracks) if (t.name.endsWith(QUAT_PATH) && (!best || t.times.length > best.times.length)) best = t
  if (!best) throw new Error(`animação ${clip.name} sem rotação`)
  return Float32Array.from(best.times)
}

/** Amostrador exato da faixa (nos tempos das chaves devolve a própria chave). */
function sampler(t: THREE.KeyframeTrack): THREE.Interpolant {
  const size = t.getValueSize()
  const result = new Float32Array(size)
  if (t.getInterpolation() === THREE.InterpolateDiscrete) return new THREE.DiscreteInterpolant(t.times, t.values, size, result)
  if (t.name.endsWith(QUAT_PATH)) return new THREE.QuaternionLinearInterpolant(t.times, t.values, size, result)
  return new THREE.LinearInterpolant(t.times, t.values, size, result)
}

/** Faixa copiada da animação base (translação/escala). */
function copied(track: THREE.KeyframeTrack, path: BakedChannel['path']): BakedChannel {
  const step = track.getInterpolation() === THREE.InterpolateDiscrete
  return { node: boneOf(track), path, interpolation: step ? 'STEP' : 'LINEAR', times: Float32Array.from(track.times), values: Float32Array.from(track.values) }
}

/** Assa uma chave. Deixa os ossos como estavam antes (a prévia continua no quadro dela). */
export function bakeJob(ctx: BakeContext, job: BakeJob): { clip: BakedClip; entry: BakeEntry } {
  const base = ctx.clips.get(job.anim)
  if (!base) throw new Error(`animação ${job.anim} não está no GLB`)
  const { clip: baseClip, weapon } = splitVariant(job.name)
  const times = framesOf(base)
  const rotTracks = base.tracks.filter((t) => t.name.endsWith(QUAT_PATH) && ctx.sk.allBones.has(boneOf(t)))
  const posTracks = base.tracks.filter((t) => t.name.endsWith(POSITION_PATH) && ctx.sk.allBones.has(boneOf(t)))
  const interp = [...rotTracks, ...posTracks].map((t) => ({ bone: ctx.sk.allBones.get(boneOf(t))!, rot: t.name.endsWith(QUAT_PATH), i: sampler(t) }))
  const delta = poseDelta(ctx.store.wanted(job.name), ctx.store.generatedPose(job.anim))
  const follows = ctx.store.wantedFollow(job.name)
  const names = rotTracks.map(boneOf)
  const out = new Map(names.map((n) => [n, new Float32Array(times.length * QUAT_SIZE)]))
  // a prévia guarda as correções do quadro na pilha dos braços: volta à pose do mixer antes de assar,
  // senão o próximo quadro da prévia somaria a correção de novo
  ctx.arm.restore()
  ctx.arm.undoStack.length = 0
  const keep: Array<[THREE.Object3D, THREE.Vector3, THREE.Quaternion]> = [...ctx.sk.allBones.values()].map((b) => [b, b.position.clone(), b.quaternion.clone()])
  const prev = new Map<string, Quat>()
  try {
    for (let i = 0; i < times.length; i++) {
      for (const s of interp) {
        const v = s.i.evaluate(times[i]!) as ArrayLike<number>
        if (s.rot) s.bone.quaternion.set(v[0]!, v[1]!, v[2]!, v[3]!).normalize()
        else s.bone.position.set(v[0]!, v[1]!, v[2]!)
      }
      const stack: UndoStack = []
      ctx.arm.apply(baseClip, job.anim)
      ctx.arm.undoStack.length = 0 // o assado não desfaz por quadro: cada quadro parte da faixa
      ctx.sk.applyPose(ctx.sk.readFrame(), delta, follows, stack)
      ctx.sk.applyLimitsAndHelpers(ctx.limits, stack)
      for (const n of names) {
        const q = ctx.sk.allBones.get(n)!.quaternion
        const c = keepContinuous(prev.get(n) ?? null, [q.x, q.y, q.z, q.w])
        prev.set(n, c)
        out.get(n)!.set(c, i * QUAT_SIZE)
      }
    }
  } finally {
    for (const [b, p, q] of keep) {
      b.position.copy(p)
      b.quaternion.copy(q)
    }
  }
  const channels: BakedChannel[] = names.map((n) => ({ node: n, path: 'rotation', interpolation: 'LINEAR', times, values: out.get(n)! }))
  for (const t of base.tracks) {
    if (t.name.endsWith(POSITION_PATH)) channels.push(copied(t, 'translation'))
    else if (t.name.endsWith(SCALE_PATH)) channels.push(copied(t, 'scale'))
  }
  const entry: BakeEntry = {
    name: job.name,
    base: baseClip,
    ...(weapon ? { weapon } : {}),
    arm: ctx.arm.wanted(baseClip),
    pose: ctx.store.wanted(job.name),
    follow: follows,
  }
  return { clip: { name: job.name, channels }, entry }
}
