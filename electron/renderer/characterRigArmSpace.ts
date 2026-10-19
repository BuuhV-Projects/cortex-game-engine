/**
 * Ajuste dos braços por animação (o "Character Arm-Space" do Mixamo) — lógica
 * pura da aba **Animações** do painel auto-rig (SPEC-0349, adendo 4).
 *
 * Contrato do jogo (SPEC-0187, adendo 3; `arm_offsets` em
 * `scripts/blender/character_skin.py`): cada entrada de `skinned.clips` da config
 * aceita `shoulderLift`, `armSpace`, `elbowSpace` e `shoulderBack` em graus (padrão 0); o JSON do skin de cada
 * build guarda em `clips[nome].armOffsets` o ajuste aplicado naquela geração.
 * A prévia aplica só a diferença entre o valor do slider e o gerado.
 *
 * Sem DOM e sem three.js (quaternions `[x, y, z, w]` próprios) — testado em
 * `tests/electron/characterRigArmSpace.test.ts`.
 */

import type { JsonObject } from './characterRigSelection.js'

export type ArmOffsetKey = 'shoulderLift' | 'armSpace' | 'elbowSpace' | 'shoulderBack'

export interface ArmOffsets {
  shoulderLift: number
  armSpace: number
  elbowSpace: number
  /** Ombros pra trás (+) / pra frente (−), em volta da vertical do peito (SPEC-0349, adendo 5). */
  shoulderBack: number
}

export const ARM_OFFSET_KEYS: readonly ArmOffsetKey[] = ['shoulderLift', 'armSpace', 'elbowSpace', 'shoulderBack']

/** Intervalo e passo de cada slider, em graus. */
export const ARM_OFFSET_LIMITS: Record<ArmOffsetKey, { min: number; max: number; step: number }> = {
  shoulderLift: { min: -20, max: 20, step: 0.5 },
  armSpace: { min: -20, max: 30, step: 0.5 },
  elbowSpace: { min: -30, max: 30, step: 0.5 },
  shoulderBack: { min: -20, max: 30, step: 0.5 },
}

export const ZERO_OFFSETS: Readonly<ArmOffsets> = Object.freeze({ shoulderLift: 0, armSpace: 0, elbowSpace: 0, shoulderBack: 0 })

/** Ossos girados e sinal de cada lado (`Left*` = +X do modelo gira +θ). */
export const ARM_SIDES = [
  { sign: 1, shoulder: 'LeftShoulder', arm: 'LeftArm', foreArm: 'LeftForeArm' },
  { sign: -1, shoulder: 'RightShoulder', arm: 'RightArm', foreArm: 'RightForeArm' },
] as const

/** Osso do peito que dá a frente no quadro. */
export const CHEST_BONE = 'Spine2'

/** Frente do personagem no repouso, no espaço do GLB/three.js. */
export const MODEL_FORWARD: Vec3 = [0, 0, 1]

/** Vertical do personagem no repouso, no espaço do GLB/three.js. */
export const MODEL_UP: Vec3 = [0, 1, 0]

function isObject(v: unknown): v is JsonObject {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** Limita ao intervalo e arredonda ao passo (`-0` vira `0`; não número → 0). */
export function clampOffset(key: ArmOffsetKey, value: number): number {
  const { min, max, step } = ARM_OFFSET_LIMITS[key]
  if (!Number.isFinite(value)) return 0
  const v = Math.round(Math.min(max, Math.max(min, value)) / step) * step
  return v === 0 ? 0 : v
}

function readOffsets(src: unknown): ArmOffsets {
  const o = isObject(src) ? src : {}
  const num = (k: ArmOffsetKey): number => (typeof o[k] === 'number' && Number.isFinite(o[k]) ? (o[k] as number) : 0)
  return { shoulderLift: num('shoulderLift'), armSpace: num('armSpace'), elbowSpace: num('elbowSpace'), shoulderBack: num('shoulderBack') }
}

/** Ajuste de cada clipe de `skinned.clips` da config (ausente = 0). */
export function armOffsetsFromConfig(cfg: JsonObject): Map<string, ArmOffsets> {
  const skinned = cfg['skinned']
  const clips = isObject(skinned) ? skinned['clips'] : undefined
  const out = new Map<string, ArmOffsets>()
  if (!isObject(clips)) return out
  for (const [name, v] of Object.entries(clips)) if (isObject(v)) out.set(name, readOffsets(v))
  return out
}

/** Ajuste gravado na geração (`clips[nome].armOffsets` do JSON do skin; ausente = 0). */
export function armOffsetsFromSkin(skin: unknown): Map<string, ArmOffsets> {
  const clips = isObject(skin) ? skin['clips'] : undefined
  const out = new Map<string, ArmOffsets>()
  if (!isObject(clips)) return out
  for (const [name, v] of Object.entries(clips)) out.set(name, readOffsets(isObject(v) ? v['armOffsets'] : undefined))
  return out
}

export function sameOffsets(a: ArmOffsets, b: ArmOffsets): boolean {
  return ARM_OFFSET_KEYS.every((k) => a[k] === b[k])
}

/** O que a prévia aplica por cima do GLB: valor desejado − valor já gerado. */
export function offsetDelta(wanted: ArmOffsets, generated: ArmOffsets): ArmOffsets {
  return {
    shoulderLift: wanted.shoulderLift - generated.shoulderLift,
    armSpace: wanted.armSpace - generated.armSpace,
    elbowSpace: wanted.elbowSpace - generated.elbowSpace,
    shoulderBack: wanted.shoulderBack - generated.shoulderBack,
  }
}

/**
 * Grava os ajustes numa cópia da config: só nos clipes que existem em
 * `skinned.clips`; campo existente fica na posição, novo vai no fim da entrada,
 * valor 0 remove o campo. O resto do JSON fica igual.
 */
export function applyArmOffsets(cfg: JsonObject, offsets: ReadonlyMap<string, ArmOffsets>): JsonObject {
  const out = structuredClone(cfg)
  const skinned = out['skinned']
  const clips = isObject(skinned) ? skinned['clips'] : undefined
  if (!isObject(clips)) return out
  for (const [name, off] of offsets) {
    const entry = clips[name]
    if (!isObject(entry)) continue
    for (const k of ARM_OFFSET_KEYS) {
      const v = clampOffset(k, off[k])
      if (v === 0) delete entry[k]
      else entry[k] = v
    }
  }
  return out
}

/** Nomes dos clipes de `skinned.clips` da config (na ordem do arquivo). */
export function configClipNames(cfg: JsonObject): string[] {
  return [...armOffsetsFromConfig(cfg).keys()]
}

/**
 * "Aplicar a todos os clipes" (adendo 5): os mesmos ajustes em **todas** as
 * entradas de `skinned.clips`, com as regras de `applyArmOffsets`.
 */
export function applyArmOffsetsToAll(cfg: JsonObject, offsets: ArmOffsets): JsonObject {
  return applyArmOffsets(cfg, new Map(configClipNames(cfg).map((name) => [name, offsets])))
}

// ── Quaternions ─────────────────────────────────────────────────────────────

export type Vec3 = [number, number, number]
/** `[x, y, z, w]`, como o `THREE.Quaternion`. */
export type Quat = [number, number, number, number]

export const QUAT_IDENTITY: Readonly<Quat> = Object.freeze([0, 0, 0, 1]) as Readonly<Quat>

/** `a · b` (aplica `b` primeiro). */
export function quatMul(a: Readonly<Quat>, b: Readonly<Quat>): Quat {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

/** Inverso de um quaternion unitário (conjugado). */
export function quatInv(q: Readonly<Quat>): Quat {
  return [-q[0], -q[1], -q[2], q[3]]
}

/** Rotação de `deg` graus em volta de `axis` (regra da mão direita; o eixo é normalizado). */
export function quatFromAxisAngle(axis: Readonly<Vec3>, deg: number): Quat {
  const len = Math.hypot(axis[0], axis[1], axis[2]) || 1
  const half = (deg * Math.PI) / 360
  const s = Math.sin(half) / len
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)]
}

export function rotateVec(q: Readonly<Quat>, v: Readonly<Vec3>): Vec3 {
  const r = quatMul(quatMul(q, [v[0], v[1], v[2], 0]), quatInv(q))
  return [r[0], r[1], r[2]]
}

/** Frente do peito no quadro: `(W_Spine2 · W_Spine2_repouso⁻¹) · F`. */
export function chestAxis(spine2: Readonly<Quat>, spine2Rest: Readonly<Quat>, forward: Readonly<Vec3> = MODEL_FORWARD): Vec3 {
  return rotateVec(quatMul(spine2, quatInv(spine2Rest)), forward)
}

/** Vertical do peito no quadro: `(W_Spine2 · W_Spine2_repouso⁻¹) · UP`. */
export function chestUp(spine2: Readonly<Quat>, spine2Rest: Readonly<Quat>, up: Readonly<Vec3> = MODEL_UP): Vec3 {
  return rotateVec(quatMul(spine2, quatInv(spine2Rest)), up)
}

/**
 * Nova rotação local de um osso para girá-lo por `world` (rotação no espaço do
 * modelo): `P⁻¹ · R · P · L`, com `P` = rotação do pai no espaço do modelo.
 */
export function localAfterWorldRotation(parent: Readonly<Quat>, local: Readonly<Quat>, world: Readonly<Quat>): Quat {
  return quatMul(quatMul(quatMul(quatInv(parent), world), parent), local)
}

/**
 * Rotações de mundo de um lado (`sign` ±1), com `axis` = frente do peito e `up` =
 * vertical do peito: `shoulder` = R(a, ±lift) · R(u, ±back) aplicada na clavícula;
 * `arm` = R(a, ±space) aplicada no braço depois (ele já herdou a clavícula);
 * `foreArm` = R(a, ±elbow) aplicada no antebraço por último (pivô no cotovelo).
 */
export function sideRotations(axis: Readonly<Vec3>, up: Readonly<Vec3>, sign: number, offsets: ArmOffsets): { shoulder: Quat; arm: Quat; foreArm: Quat } {
  return {
    shoulder: quatMul(quatFromAxisAngle(axis, sign * offsets.shoulderLift), quatFromAxisAngle(up, sign * offsets.shoulderBack)),
    arm: quatFromAxisAngle(axis, sign * offsets.armSpace),
    foreArm: quatFromAxisAngle(axis, sign * offsets.elbowSpace),
  }
}
