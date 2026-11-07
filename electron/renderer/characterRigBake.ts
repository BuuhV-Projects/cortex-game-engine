/**
 * Conta pura do "Gravar no GLB do jogo" (SPEC-0704): limite de junta, auxiliares
 * (`*ElbowHelper`/`*KneeHelper`), continuidade de sinal e o JSON do skin novo.
 * Mesma fórmula do pipeline (`retarget` em `scripts/blender/character_skin.py`).
 *
 * Sem DOM e sem three.js (quaternions `[x, y, z, w]`) — testado em
 * `tests/electron/characterRigBake.test.ts`.
 */

import type { JsonObject } from './characterRigSelection.js'
import { ARM_OFFSET_KEYS, QUAT_IDENTITY, quatInv, quatMul, type ArmOffsets, type Quat } from './characterRigArmSpace.js'
import { quatAngleDeg, quatNormalize, poseToJson } from './characterRigPose.js'
import { followToJson, type FollowLink } from './characterRigFollow.js'
import { gripToJson, type Grip } from './characterRigWeapon.js'

/** Fração da base do osso de baixo que o auxiliar recebe (`HELPER_SHARE` do pipeline). */
export const HELPER_SHARE = 0.5

/** Auxiliar → (osso de cima, osso de baixo); o auxiliar tem o repouso do de baixo e segue a base dele. */
export const HELPER_PAIRS: Readonly<Record<string, readonly [string, string]>> = Object.freeze({
  LeftElbowHelper: ['LeftArm', 'LeftForeArm'],
  RightElbowHelper: ['RightArm', 'RightForeArm'],
  LeftKneeHelper: ['LeftUpLeg', 'LeftLeg'],
  RightKneeHelper: ['RightUpLeg', 'RightLeg'],
})

/** Prefixos de lado: `jointLimitsDeg` usa a parte sem eles (`ForeArm` vale para os dois antebraços). */
export const SIDE_PREFIXES: readonly string[] = ['Left', 'Right']

/** Campos do clipe base que a variante `clipe@ARMA` herda no JSON do skin. */
export const VARIANT_INHERITED_FIELDS: readonly string[] = ['loop', 'duration', 'stride', 'phase', 'marks']

/** Abaixo disso o seno do meio ângulo é tratado como zero (rotação nula). */
const SIN_EPSILON = 1e-12

function isObject(v: unknown): v is JsonObject {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** Parte do osso sem o lado (`LeftForeArm` → `ForeArm`; `Hips` fica `Hips`), como o `part_of` do pipeline. */
export function partOf(bone: string): string {
  const side = SIDE_PREFIXES.find((s) => bone.startsWith(s))
  return side ? bone.slice(side.length) : bone
}

/** Limite em graus do osso em `skinned.jointLimitsDeg` (pela parte), ou `null` sem limite. */
export function limitOf(bone: string, limitsDeg: Readonly<Record<string, number>>): number | null {
  const v = limitsDeg[partOf(bone)]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** `q` com `w ≥ 0` (mesma rotação, caminho curto). */
function shortPath(q: Readonly<Quat>): Quat {
  return q[3] < 0 ? [-q[0], -q[1], -q[2], -q[3]] : [...q] as Quat
}

/** `slerp(I, b, t)` com `b` unitário de `w ≥ 0`. */
function slerpFromIdentity(b: Readonly<Quat>, t: number): Quat {
  const half = Math.acos(Math.min(1, b[3]))
  const s = Math.sin(half)
  if (s < SIN_EPSILON) return [...QUAT_IDENTITY] as Quat
  const k = Math.sin(t * half) / s
  return [b[0] * k, b[1] * k, b[2] * k, Math.cos(t * half)]
}

/**
 * Limite de junta (passo 3): b = rest⁻¹·q; se o ângulo de b passa de `limitDeg`,
 * b = slerp(I, b, limite/ângulo) e devolve rest·b. Dentro do limite devolve o próprio `q` (mesma referência).
 */
export function clampJoint(rest: Readonly<Quat>, q: Readonly<Quat>, limitDeg: number): Quat {
  const b = shortPath(quatNormalize(quatMul(quatInv(rest), q)))
  const angle = quatAngleDeg(b)
  if (angle <= limitDeg) return q as Quat
  return quatNormalize(quatMul(rest, slerpFromIdentity(b, limitDeg / angle)))
}

/**
 * Auxiliar (passo 4): b = restLower⁻¹·qLower (w ≥ 0) e q_aux = restLower·slerp(I, b, HELPER_SHARE).
 * `restLower`/`qLower` = rotação local de repouso e do quadro do osso de baixo do par.
 */
export function helperQuat(restLower: Readonly<Quat>, qLower: Readonly<Quat>): Quat {
  const b = shortPath(quatNormalize(quatMul(quatInv(restLower), qLower)))
  return quatNormalize(quatMul(restLower, slerpFromIdentity(b, HELPER_SHARE)))
}

/** Continuidade (passo 5): troca o sinal de `q` se `dot(q, prev) < 0` (sem `prev`, `q` como está). */
export function keepContinuous(prev: Readonly<Quat> | null, q: Readonly<Quat>): Quat {
  if (!prev) return [...q] as Quat
  const dot = prev[0] * q[0] + prev[1] * q[1] + prev[2] * q[2] + prev[3] * q[3]
  return dot < 0 ? [-q[0], -q[1], -q[2], -q[3]] : [...q] as Quat
}

/** Uma chave assada: `name` = clipe gravado; `base` = clipe de origem; `weapon` só na variante. */
export interface BakeEntry {
  name: string
  base: string
  weapon?: string
  arm: ArmOffsets
  pose: ReadonlyMap<string, Quat>
  follow: readonly FollowLink[]
}

/** Grava `value` em `key` (existente fica na posição, novo vai no fim); `undefined` remove. */
function setField(entry: JsonObject, key: string, value: unknown): void {
  if (value === undefined) delete entry[key]
  else entry[key] = value
}

function armToJson(arm: ArmOffsets): JsonObject | undefined {
  const out: JsonObject = {}
  for (const k of ARM_OFFSET_KEYS) if (arm[k] !== 0) out[k] = arm[k]
  return Object.keys(out).length ? out : undefined
}

/**
 * JSON do skin depois de assar: cópia de `skin` com `clips[nome]` gravando o desejado
 * (`armOffsets` só com as chaves ≠ 0, `poseOffsets` e `follow`; vazios somem). A variante
 * copia de `clips[base]` os campos de `VARIANT_INHERITED_FIELDS` e ganha `clip` e `weapon`.
 * `weaponGrips` recebe a pegada de cada arma de `grips` (vazio mantém o que havia).
 * Os outros campos e a ordem das chaves existentes ficam iguais.
 */
export function bakedSidecar(skin: JsonObject, entries: readonly BakeEntry[], grips: ReadonlyMap<string, Grip>): JsonObject {
  const out = structuredClone(skin)
  if (!isObject(out['clips'])) out['clips'] = {}
  const clips = out['clips'] as JsonObject
  for (const e of entries) {
    if (!isObject(clips[e.name])) clips[e.name] = {}
    const entry = clips[e.name] as JsonObject
    if (e.weapon !== undefined) {
      const base = isObject(clips[e.base]) ? (clips[e.base] as JsonObject) : {}
      for (const f of VARIANT_INHERITED_FIELDS) setField(entry, f, base[f] === undefined ? undefined : structuredClone(base[f]))
      setField(entry, 'clip', e.base)
      setField(entry, 'weapon', e.weapon)
    }
    setField(entry, 'armOffsets', armToJson(e.arm))
    const pose = poseToJson(e.pose)
    setField(entry, 'poseOffsets', Object.keys(pose).length ? pose : undefined)
    setField(entry, 'follow', e.follow.length ? e.follow.map(followToJson) : undefined)
  }
  if (grips.size) {
    const all = isObject(out['weaponGrips']) ? (out['weaponGrips'] as JsonObject) : {}
    for (const [weapon, g] of grips) all[weapon] = gripToJson(g)
    out['weaponGrips'] = all
  }
  return out
}

/**
 * Pegadas salvas que o JSON do skin `skin` não tem iguais (ausente ou diferente a 6 casas): as que o Gravar
 * tem que levar mesmo sem clipe a assar (SPEC-0709).
 */
export function gripsToWrite(saved: ReadonlyMap<string, Grip>, skin: unknown): Map<string, Grip> {
  const have = isObject(skin) && isObject(skin['weaponGrips']) ? (skin['weaponGrips'] as JsonObject) : {}
  return new Map([...saved].filter(([w, g]) => JSON.stringify(gripToJson(g)) !== JSON.stringify(have[w])))
}

/** `skinned.jointLimitsDeg` da config (parte do osso → graus); ausente ou inválido = sem limite. */
export function jointLimitsOf(cfg: JsonObject | null): Record<string, number> {
  const skinned = cfg?.['skinned']
  const v = skinned && typeof skinned === 'object' && !Array.isArray(skinned) ? (skinned as JsonObject)['jointLimitsDeg'] : undefined
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  return Object.fromEntries(Object.entries(v).filter(([, d]) => typeof d === 'number' && Number.isFinite(d))) as Record<string, number>
}
