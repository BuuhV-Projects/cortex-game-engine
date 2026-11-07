/**
 * Ajustes por personagem na config (SPEC-0708): `skinned.clips[c].characters[ALVO]` com `pose`, `follow`, `space` e
 * `weapons[ARMA]` dentro (como a variante por arma da SPEC-0703). `space: "player"` = a edição veio do player para um
 * NPC: no assado, o clipe do player corrigido é retargetado para o NPC. Puro.
 */
import type { JsonObject } from './characterRigSelection.js'
import { poseToJson, readPose, type Pose } from './characterRigPose.js'
import { followToJson, readFollows, type FollowLink } from './characterRigFollow.js'
import type { Quat } from './characterRigArmSpace.js'
import { fullKey, splitKey } from './characterRigCharacters.js'

/** Espaço da edição guardada num alvo de NPC. */
export type EditSpace = 'player' | 'own'
const PLAYER_SPACE = 'player'

const isObject = (v: unknown): v is JsonObject => !!v && typeof v === 'object' && !Array.isArray(v)

function clipsOf(cfg: JsonObject): JsonObject | null {
  const skinned = cfg['skinned']
  const clips = isObject(skinned) ? skinned['clips'] : undefined
  return isObject(clips) ? clips : null
}

/** Cada entrada de personagem da config: a chave `clipe[@ARMA]#ALVO` → o objeto dela. */
function entries(cfg: JsonObject): Array<[string, JsonObject]> {
  const out: Array<[string, JsonObject]> = []
  for (const [clip, v] of Object.entries(clipsOf(cfg) ?? {})) {
    const chars = isObject(v) ? v['characters'] : undefined
    if (!isObject(chars)) continue
    for (const [target, c] of Object.entries(chars)) {
      if (!isObject(c)) continue
      out.push([fullKey(clip, null, target), c])
      const weapons = c['weapons']
      if (isObject(weapons)) for (const [w, e] of Object.entries(weapons)) if (isObject(e)) out.push([fullKey(clip, w, target), e])
    }
  }
  return out
}

/** Poses das chaves de personagem (só as que têm `pose`: sem o campo, herdam). */
export function characterPosesFromConfig(cfg: JsonObject): Map<string, Map<string, Quat>> {
  return new Map(entries(cfg).filter(([, e]) => e['pose'] !== undefined).map(([k, e]) => [k, readPose(e['pose'])]))
}

export function characterFollowsFromConfig(cfg: JsonObject): Map<string, FollowLink[]> {
  return new Map(entries(cfg).filter(([, e]) => e['follow'] !== undefined).map(([k, e]) => [k, readFollows(e['follow'])]))
}

/** O espaço de cada chave de personagem (`player` só quando gravado). */
export function characterSpacesFromConfig(cfg: JsonObject): Map<string, EditSpace> {
  return new Map(entries(cfg).map(([k, e]) => [k, e['space'] === PLAYER_SPACE ? 'player' : 'own']))
}

/** Grava as chaves de personagem numa cópia (só de clipes que existem); `spaces` marca as do player num NPC. */
export function applyCharacterVariants(
  cfg: JsonObject,
  poses: ReadonlyMap<string, Pose>,
  follows: ReadonlyMap<string, readonly FollowLink[]>,
  spaces: ReadonlyMap<string, EditSpace> = new Map(),
): JsonObject {
  const out = structuredClone(cfg)
  const clips = clipsOf(out)
  if (!clips) return out
  const entryOf = (key: string): JsonObject | null => {
    const { clip, weapon, target } = splitKey(key)
    const c = clips[clip]
    if (!target || !isObject(c)) return null
    const chars = isObject(c['characters']) ? c['characters'] : {}
    const t = isObject(chars[target]) ? chars[target] : {}
    chars[target] = t
    c['characters'] = chars
    if (!weapon) return t
    const weapons = isObject(t['weapons']) ? t['weapons'] : {}
    const e = isObject(weapons[weapon]) ? weapons[weapon] : {}
    weapons[weapon] = e
    t['weapons'] = weapons
    return e
  }
  // o espaço segue a última edição: `own` apaga o `player` de antes (senão o assado retargetaria de novo)
  const mark = (key: string, e: JsonObject): void => {
    if (spaces.get(key) === 'player') e['space'] = PLAYER_SPACE
    else if (spaces.has(key)) delete e['space']
  }
  for (const [key, pose] of poses) {
    const e = entryOf(key)
    if (e) {
      e['pose'] = poseToJson(pose)
      mark(key, e)
    }
  }
  for (const [key, list] of follows) {
    const e = entryOf(key)
    if (e) {
      e['follow'] = list.map(followToJson)
      mark(key, e)
    }
  }
  return out
}
