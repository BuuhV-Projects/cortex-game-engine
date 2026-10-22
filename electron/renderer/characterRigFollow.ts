/**
 * Ligação "seguir" entre juntas, por quadro — lógica pura do painel "Pose (deste
 * clipe)" da aba **Animações** (SPEC-0349, adendo 9).
 *
 * Contrato do jogo (SPEC-0187, seção 10; `follow_constraints`/`joint_heads` em
 * `scripts/blender/character_skin.py`): `skinned.clips[nome].follow` = lista em
 * ordem de `{ bone, target, offset: [x,y,z], rotation: [x,y,z,w] }`, no espaço do
 * modelo do GLB, relativos a T = W_alvo · W_alvo_repouso⁻¹. Em cada quadro a junta
 * (mão ou pé) vai a cabeça_alvo + T · offset por IK de dois ossos e fica com
 * W = T · rotation · W_repouso; o que está abaixo a acompanha.
 *
 * Sem DOM e sem three.js — testado em `tests/electron/characterRigFollow.test.ts`.
 */

import type { JsonObject } from './characterRigSelection.js'
import { quatInv, quatMul, rotateVec, type Quat, type Vec3 } from './characterRigArmSpace.js'
import { POSE_BONES, POSE_DECIMALS, POSE_PARENTS, readQuat, roundQuat, twoBoneIk } from './characterRigPose.js'

/** Quem pode seguir: o fim de uma cadeia de dois ossos. */
export const FOLLOW_BONES: readonly string[] = ['LeftHand', 'RightHand', 'LeftFoot', 'RightFoot']

/** Margem do alcance do IK do pipeline (m). */
export const FOLLOW_IK_MARGIN = 1e-6

export interface FollowLink {
  bone: string
  target: string
  offset: Vec3
  rotation: Quat
}

type ParentOf = (bone: string) => string | null | undefined

const sub = (a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const length = (a: Readonly<Vec3>): number => Math.hypot(a[0], a[1], a[2])

function isObject(v: unknown): v is JsonObject {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** A cadeia de `bone`: ela, o meio (antebraço/perna) e a raiz (braço/coxa). */
export function followChain(bone: string, parentOf: ParentOf = (n) => POSE_PARENTS[n]): string[] {
  const mid = parentOf(bone) ?? null
  const up = mid ? parentOf(mid) ?? null : null
  return [bone, ...(mid ? [mid] : []), ...(up ? [up] : [])]
}

/** `null` se a ligação vale; senão o motivo (`bone` não é mão/pé, alvo desconhecido ou na própria cadeia). */
export function followProblem(bone: string, target: string): 'bone' | 'target' | 'chain' | null {
  if (!FOLLOW_BONES.includes(bone)) return 'bone'
  if (!POSE_BONES.includes(target)) return 'target'
  if (followChain(bone).includes(target)) return 'chain'
  return null
}

/**
 * Cabeça de cada osso no quadro (FK, `joint_heads` do pipeline): a do pai + o
 * giro do pai a partir do repouso × o vetor do repouso; a raiz fica em `hip`.
 */
export function jointHeads(
  order: readonly string[],
  parentOf: ParentOf,
  rest: ReadonlyMap<string, Quat>,
  restHeads: ReadonlyMap<string, Vec3>,
  frame: ReadonlyMap<string, Quat>,
  hip: Readonly<Vec3>,
): Map<string, Vec3> {
  const heads = new Map<string, Vec3>()
  for (const n of order) {
    const p = parentOf(n) ?? null
    if (!p) {
      heads.set(n, [hip[0], hip[1], hip[2]])
      continue
    }
    const turn = quatMul(frame.get(p)!, quatInv(rest.get(p)!))
    heads.set(n, add(heads.get(p)!, rotateVec(turn, sub(restHeads.get(n)!, restHeads.get(p)!))))
  }
  return heads
}

/** T = W_alvo · W_alvo_repouso⁻¹. */
function targetTurn(target: string, rest: ReadonlyMap<string, Quat>, frame: ReadonlyMap<string, Quat>): Quat {
  return quatMul(frame.get(target)!, quatInv(rest.get(target)!))
}

/**
 * `follow_constraints` do pipeline: as rotações de mundo do esqueleto depois de
 * aplicar as ligações em ordem (as cabeças são recalculadas a cada uma). Ligação
 * inválida ou com osso ausente é ignorada.
 */
export function followConstraints(
  order: readonly string[],
  parentOf: ParentOf,
  rest: ReadonlyMap<string, Quat>,
  restHeads: ReadonlyMap<string, Vec3>,
  frame: ReadonlyMap<string, Quat>,
  hip: Readonly<Vec3>,
  follows: readonly FollowLink[],
): Map<string, Quat> {
  const out = new Map(frame)
  for (const c of follows) {
    const [f, mid, up] = followChain(c.bone, parentOf)
    if (!f || !mid || !up || followChain(c.bone, parentOf).includes(c.target)) continue
    if (![f, mid, up, c.target].every((n) => out.has(n) && rest.has(n) && restHeads.has(n))) continue
    const heads = jointHeads(order, parentOf, rest, restHeads, out, hip)
    const T = targetTurn(c.target, rest, out)
    const goal = add(heads.get(c.target)!, rotateVec(T, c.offset))
    const lengths: [number, number] = [length(sub(restHeads.get(mid)!, restHeads.get(up)!)), length(sub(restHeads.get(f)!, restHeads.get(mid)!))]
    const { upper, lower } = twoBoneIk(heads.get(up)!, heads.get(mid)!, heads.get(f)!, goal, { margin: FOLLOW_IK_MARGIN, lengths })
    const old = new Map(out)
    out.set(up, quatMul(upper, old.get(up)!))
    out.set(mid, quatMul(quatMul(lower, upper), old.get(mid)!))
    out.set(f, quatMul(quatMul(T, c.rotation), rest.get(f)!))
    // o que fica abaixo da junta segue o giro dela
    const corr = new Map<string, Quat>([up, mid, f].map((n) => [n, quatMul(out.get(n)!, quatInv(old.get(n)!))]))
    for (const n of order) {
      const p = parentOf(n) ?? null
      const cp = p ? corr.get(p) : undefined
      if (corr.has(n) || !cp) continue
      out.set(n, quatMul(cp, old.get(n)!))
      corr.set(n, cp)
    }
  }
  return out
}

/**
 * Captura no quadro mostrado (`frame`/`heads` com pose, braços e ligações já
 * aplicados): offset = T⁻¹ · (cabeça_bone − cabeça_alvo), rotation = T⁻¹ · W_bone ·
 * W_bone_repouso⁻¹. Criar a ligação não mexe em nada naquele quadro.
 */
export function captureFollow(
  bone: string,
  target: string,
  rest: ReadonlyMap<string, Quat>,
  frame: ReadonlyMap<string, Quat>,
  heads: ReadonlyMap<string, Vec3>,
): FollowLink {
  const tInv = quatInv(targetTurn(target, rest, frame))
  return {
    bone,
    target,
    offset: rotateVec(tInv, sub(heads.get(bone)!, heads.get(target)!)),
    rotation: quatMul(quatMul(tInv, frame.get(bone)!), quatInv(rest.get(bone)!)),
  }
}

/** Acrescenta a ligação no fim; uma junta segue no máximo um alvo (a anterior sai). */
export function withFollow(follows: readonly FollowLink[], link: FollowLink): FollowLink[] {
  return [...follows.filter((c) => c.bone !== link.bone), link]
}

// ── Config e JSON do skin ───────────────────────────────────────────────────

function readVec(v: unknown): Vec3 | null {
  return Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? [v[0], v[1], v[2]] : null
}

function readFollows(src: unknown): FollowLink[] {
  if (!Array.isArray(src)) return []
  const out: FollowLink[] = []
  for (const c of src) {
    if (!isObject(c) || typeof c['bone'] !== 'string' || typeof c['target'] !== 'string') continue
    const offset = readVec(c['offset'])
    const rotation = readQuat(c['rotation'])
    if (!offset || !rotation || followProblem(c['bone'], c['target'])) continue
    out.push({ bone: c['bone'], target: c['target'], offset, rotation })
  }
  return out
}

/** Ligações de cada clipe de `skinned.clips` da config (sem ligação = lista vazia). */
export function followsFromConfig(cfg: JsonObject): Map<string, FollowLink[]> {
  const skinned = cfg['skinned']
  const clips = isObject(skinned) ? skinned['clips'] : undefined
  const out = new Map<string, FollowLink[]>()
  if (!isObject(clips)) return out
  for (const [name, v] of Object.entries(clips)) if (isObject(v)) out.set(name, readFollows(v['follow']))
  return out
}

/** Ligações aplicadas na geração (`clips[nome].follow` do JSON do skin; ausente = vazia). */
export function followsFromSkin(skin: unknown): Map<string, FollowLink[]> {
  const clips = isObject(skin) ? skin['clips'] : undefined
  const out = new Map<string, FollowLink[]>()
  if (!isObject(clips)) return out
  for (const [name, v] of Object.entries(clips)) out.set(name, readFollows(isObject(v) ? v['follow'] : undefined))
  return out
}

function round(v: number): number {
  const f = 10 ** POSE_DECIMALS
  const r = Math.round(v * f) / f
  return r === 0 ? 0 : r
}

/** A ligação como vai para a config (6 casas). */
export function followToJson(c: FollowLink): JsonObject {
  return { bone: c.bone, target: c.target, offset: c.offset.map(round), rotation: roundQuat(c.rotation) }
}

/** Mesmas ligações, na mesma ordem (a 6 casas). */
export function sameFollows(a: readonly FollowLink[], b: readonly FollowLink[]): boolean {
  return JSON.stringify(a.map(followToJson)) === JSON.stringify(b.map(followToJson))
}

/**
 * Grava as ligações numa cópia da config: só nos clipes de `skinned.clips`;
 * `follow` existente fica na posição, novo vai no fim da entrada; lista vazia
 * remove o campo. O resto do JSON fica igual.
 */
export function applyFollows(cfg: JsonObject, follows: ReadonlyMap<string, readonly FollowLink[]>): JsonObject {
  const out = structuredClone(cfg)
  const skinned = out['skinned']
  const clips = isObject(skinned) ? skinned['clips'] : undefined
  if (!isObject(clips)) return out
  for (const [name, list] of follows) {
    const entry = clips[name]
    if (!isObject(entry)) continue
    if (list.length) entry['follow'] = list.map(followToJson)
    else delete entry['follow']
  }
  return out
}
