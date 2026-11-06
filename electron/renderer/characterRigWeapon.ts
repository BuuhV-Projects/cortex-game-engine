/**
 * Arma na mão no ajuste de pose (SPEC-0703, ADR-0702) — lógica pura: a chave da
 * variante `clipe@ARMA`, a variante na config (`skinned.clips[clipe].weapons[ARMA]
 * = { pose, follow }`), a pegada por arma (`skinned.weaponGrips[ARMA] = { offset,
 * rotation }`, no espaço do osso `RightHand`) e a lista de armas do GLB.
 *
 * Sem DOM e sem three.js — testado em `tests/electron/characterRigWeapon.test.ts`.
 */

import type { JsonObject } from './characterRigSelection.js'
import type { Quat, Vec3 } from './characterRigArmSpace.js'
import { POSE_DECIMALS, poseToJson, readPose, readQuat, roundQuat, type Pose } from './characterRigPose.js'
import { followToJson, readFollows, type FollowLink } from './characterRigFollow.js'

/** Separa o clipe da arma na chave da variante (`idle@ARM-02`). */
export const WEAPON_SEP = '@'
/** Sufixo do nó do apoio da mão esquerda dentro do nó da arma. */
export const GRIP_L_SUFFIX = '_Grip_L'
/** GLB das armas quando a config não diz (`skinned.weaponsGlb`). */
export const DEFAULT_WEAPONS_GLB = 'assets/armas/armas.glb'
/** Osso em que a arma fica presa. */
export const GRIP_BONE = 'RightHand'

/** Da cabeça do osso da mão (pulso) até a palma, no eixo dos dedos (m): o `PALM` do jogo. */
export const PALM: Vec3 = [0, 0.08, 0]

/** Onde fica o `Grip_R` e como a arma gira, no espaço do osso `RightHand`. */
export interface Grip {
  offset: Vec3
  rotation: Quat
}

/**
 * Pegada sem entrada na config: o `Grip_R` na palma (o `PALM` do jogo, 8 cm no eixo
 * dos dedos), cano no +Y do `RightHand` (os dedos) e topo da arma no +Z do osso — 180°
 * em torno de (0, 1, 1)/√2. Medido no LUC-01 (Mixamo) no clipe `pistolIdle`, onde a mão
 * segura uma pistola: dedos para a frente, +Z para cima.
 */
export const DEFAULT_GRIP: Readonly<Grip> = Object.freeze({
  offset: PALM,
  rotation: [0, Math.SQRT1_2, Math.SQRT1_2, 0] as Quat,
})

function isObject(v: unknown): v is JsonObject {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** Chave da pose: o clipe sozinho (sem arma) ou `clipe@ARMA`. */
export function variantKey(clip: string, weapon: string | null): string {
  return weapon ? `${clip}${WEAPON_SEP}${weapon}` : clip
}

/** Separa a chave no último `@`: `idle@ARM-02` → `{ clip: 'idle', weapon: 'ARM-02' }`. */
export function splitVariant(key: string): { clip: string; weapon: string | null } {
  const i = key.lastIndexOf(WEAPON_SEP)
  return i > 0 && i < key.length - 1 ? { clip: key.slice(0, i), weapon: key.slice(i + 1) } : { clip: key, weapon: null }
}

function clipsOf(cfg: JsonObject): JsonObject | null {
  const skinned = cfg['skinned']
  const clips = isObject(skinned) ? skinned['clips'] : undefined
  return isObject(clips) ? clips : null
}

/** Cada variante salva da config: chave `clipe@ARMA` → a entrada `{ pose, follow }`. */
function variantEntries(cfg: JsonObject): Array<[string, JsonObject]> {
  const out: Array<[string, JsonObject]> = []
  for (const [clip, v] of Object.entries(clipsOf(cfg) ?? {})) {
    const weapons = isObject(v) ? v['weapons'] : undefined
    if (!isObject(weapons)) continue
    for (const [weapon, w] of Object.entries(weapons)) if (isObject(w)) out.push([variantKey(clip, weapon), w])
  }
  return out
}

/** Poses das variantes salvas (chave `clipe@ARMA`); a leitura dos ossos é a do adendo 8. */
export function variantPosesFromConfig(cfg: JsonObject): Map<string, Map<string, Quat>> {
  return new Map(variantEntries(cfg).map(([key, w]) => [key, readPose(w['pose'])]))
}

/** Ligações das variantes salvas (chave `clipe@ARMA`). */
export function variantFollowsFromConfig(cfg: JsonObject): Map<string, FollowLink[]> {
  return new Map(variantEntries(cfg).map(([key, w]) => [key, readFollows(w['follow'])]))
}

/**
 * Grava as variantes numa cópia da config: só de clipes que existem em
 * `skinned.clips`; campo existente fica na posição, novo vai no fim; pose vazia
 * remove `pose`, lista vazia remove `follow`, arma sem nada some e `weapons` vazio
 * some. O resto do JSON fica igual. Chaves sem arma são ignoradas.
 *
 * Só mexe nas chaves recebidas (como `applyPoses`): para tirar uma variante da
 * config, passe a chave com pose vazia (e lista vazia de ligações).
 */
export function applyVariants(cfg: JsonObject, poses: ReadonlyMap<string, Pose>, follows: ReadonlyMap<string, readonly FollowLink[]>): JsonObject {
  const out = structuredClone(cfg)
  const clips = clipsOf(out)
  if (!clips) return out
  const write = (key: string, field: 'pose' | 'follow', value: JsonObject | JsonObject[] | null): void => {
    const { clip, weapon } = splitVariant(key)
    const entry = clips[clip]
    if (!weapon || !isObject(entry)) return
    const weapons = isObject(entry['weapons']) ? entry['weapons'] : {}
    const w = isObject(weapons[weapon]) ? weapons[weapon] : {}
    if (value) w[field] = value
    else delete w[field]
    if (Object.keys(w).length) weapons[weapon] = w
    else delete weapons[weapon]
    if (Object.keys(weapons).length) entry['weapons'] = weapons
    else delete entry['weapons']
  }
  for (const [key, pose] of poses) {
    const json = poseToJson(pose)
    write(key, 'pose', Object.keys(json).length ? json : null)
  }
  for (const [key, list] of follows) write(key, 'follow', list.length ? list.map(followToJson) : null)
  return out
}

function readVec(v: unknown): Vec3 | null {
  return Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? [v[0], v[1], v[2]] : null
}

function round(v: number): number {
  const f = 10 ** POSE_DECIMALS
  const r = Math.round(v * f) / f
  return r === 0 ? 0 : r
}

/** A pegada como vai para a config (6 casas). */
export function gripToJson(g: Grip): JsonObject {
  return { offset: g.offset.map(round), rotation: roundQuat(g.rotation) }
}

/** Mesma pegada a 6 casas. */
export function sameGrip(a: Grip, b: Grip): boolean {
  return JSON.stringify(gripToJson(a)) === JSON.stringify(gripToJson(b))
}

/** Pegadas da config (`skinned.weaponGrips`); entrada inválida é ignorada. */
export function gripsFromConfig(cfg: JsonObject): Map<string, Grip> {
  const skinned = cfg['skinned']
  const src = isObject(skinned) ? skinned['weaponGrips'] : undefined
  const out = new Map<string, Grip>()
  if (!isObject(src)) return out
  for (const [weapon, v] of Object.entries(src)) {
    if (!isObject(v)) continue
    const offset = readVec(v['offset'])
    const rotation = readQuat(v['rotation'])
    if (offset && rotation) out.set(weapon, { offset, rotation })
  }
  return out
}

/** Grava as pegadas numa cópia da config; igual ao padrão remove a entrada, sem entradas remove o campo. */
export function applyGrips(cfg: JsonObject, grips: ReadonlyMap<string, Grip>): JsonObject {
  const out = structuredClone(cfg)
  const skinned = out['skinned']
  if (!isObject(skinned)) return out
  const all = isObject(skinned['weaponGrips']) ? skinned['weaponGrips'] : {}
  for (const [weapon, g] of grips) {
    if (sameGrip(g, DEFAULT_GRIP)) delete all[weapon]
    else all[weapon] = gripToJson(g)
  }
  if (Object.keys(all).length) skinned['weaponGrips'] = all
  else delete skinned['weaponGrips']
  return out
}

/** Caminho do GLB das armas (`skinned.weaponsGlb`, relativo ao projeto). */
export function weaponsGlbOf(cfg: JsonObject | null): string {
  const skinned = cfg?.['skinned']
  const v = isObject(skinned) ? skinned['weaponsGlb'] : undefined
  return typeof v === 'string' && v ? v : DEFAULT_WEAPONS_GLB
}

/** Uma arma do GLB: o código (nome do nó raiz) e o nome do filho do apoio. */
export interface WeaponNode {
  code: string
  gripL: string
}

/** Armas: nós raiz com um filho `*_Grip_L`, em ordem de nome. O código não pode ter `@`. */
export function weaponsFromNodes(roots: ReadonlyArray<{ name: string; children: readonly string[] }>): WeaponNode[] {
  const out: WeaponNode[] = []
  for (const r of roots) {
    const gripL = r.children.find((c) => c.endsWith(GRIP_L_SUFFIX))
    if (r.name && gripL && !r.name.includes(WEAPON_SEP)) out.push({ code: r.name, gripL })
  }
  return out.sort((a, b) => a.code.localeCompare(b.code))
}
