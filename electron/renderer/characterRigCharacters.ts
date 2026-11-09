/**
 * Ajuste de pose por personagem (SPEC-0708, ADR-0707): a chave `clipe@ARMA#ALVO` (ALVO = um código ou o grupo dos
 * NPCs), a config `skinned.characters` e para quais chaves cada opção de "aplicar a" grava. Puro.
 *
 * A herança é por espaço: o player herda do clipe e da arma (o espaço dele); o NPC herda só das chaves de NPC (o
 * espaço do esqueleto dele) — a base dele já é o clipe do player retargetado, então o ajuste começa vazio.
 */
import type { JsonObject } from './characterRigSelection.js'

const CHAR_SEP = '#'
const WEAPON_SEP = '@'

export interface CharactersConfig {
  /** Nome do grupo dos NPCs (a chave `#GRUPO` vale para todos). */
  group: string
  /** O par do esqueleto dos NPCs: as variantes deles (GLB sem malha + JSON do skin). */
  glb: string
  clips: string
  /** Pasta com `<código>.glb` (a malha de cada NPC) para a prévia. */
  preview: string
  codes: string[]
}

export interface VariantParts {
  clip: string
  weapon: string | null
  /** Código ou grupo; `null` = a chave de todos (a de hoje). */
  target: string | null
}

const isObject = (v: unknown): v is JsonObject => !!v && typeof v === 'object' && !Array.isArray(v)

/** `skinned.characters` da config (`null` sem ou malformada: um personagem só, como antes). */
export function charactersOf(cfg: JsonObject | null): CharactersConfig | null {
  const skinned = cfg?.['skinned']
  const c = isObject(skinned) ? skinned['characters'] : undefined
  if (!isObject(c)) return null
  const str = (k: string): string | null => (typeof c[k] === 'string' && c[k] ? (c[k] as string) : null)
  const group = str('group'), glb = str('glb'), clips = str('clips'), preview = str('preview')
  const codes = Array.isArray(c['codes']) ? (c['codes'] as unknown[]).filter((x): x is string => typeof x === 'string' && !!x) : []
  return group && glb && clips && preview && codes.length ? { group, glb, clips, preview, codes } : null
}

/** Monta `clipe[@ARMA][#ALVO]`. */
export function fullKey(clip: string, weapon: string | null, target: string | null): string {
  return `${clip}${weapon ? WEAPON_SEP + weapon : ''}${target ? CHAR_SEP + target : ''}`
}

/** Separa a chave: o alvo depois do último `#`, a arma depois do último `@` do resto. */
export function splitKey(key: string): VariantParts {
  const h = key.lastIndexOf(CHAR_SEP)
  const target = h > 0 && h < key.length - 1 ? key.slice(h + 1) : null
  const rest = target ? key.slice(0, h) : key
  const a = rest.lastIndexOf(WEAPON_SEP)
  return a > 0 && a < rest.length - 1 ? { clip: rest.slice(0, a), weapon: rest.slice(a + 1), target } : { clip: rest, weapon: null, target }
}

/** O alvo é um NPC (código ou o grupo)? O resto é o player. */
export const isNpcTarget = (chars: CharactersConfig | null, target: string | null): boolean => !!chars && !!target && (target === chars.group || chars.codes.includes(target))

/**
 * Chaves da mais específica à mais geral, para herdar pose e ligações. NPC: só chaves de NPC (do código, do grupo; com
 * e sem arma). Player: as dele (`#código`) e as de todos (`clipe@ARMA`, `clipe`).
 */
export function inheritChain(key: string, chars: CharactersConfig | null): string[] {
  const { clip, weapon, target } = splitKey(key)
  const out: string[] = []
  const add = (w: string | null, t: string | null): void => {
    const k = fullKey(clip, w, t)
    if (!out.includes(k)) out.push(k)
  }
  const weapons = weapon ? [weapon, null] : [null]
  if (isNpcTarget(chars, target)) {
    for (const w of weapons) for (const t of target === chars!.group ? [target] : [target, chars!.group]) add(w, t)
    return out
  }
  for (const w of weapons) if (target) add(w, target)
  for (const w of weapons) add(w, null)
  return out
}

/** Chave da pegada (SPEC-0711, ADR-0710): `ARMA` ou `ARMA#ALVO`. */
export const gripKey = (weapon: string, target: string | null): string => (target ? `${weapon}${CHAR_SEP}${target}` : weapon)

/** A chave da pegada da chave da pose `clipe@ARMA#ALVO` (`null` sem arma). */
export function gripKeyOf(key: string): string | null {
  const { weapon, target } = splitKey(key)
  return weapon ? gripKey(weapon, target) : null
}

/** Pegadas da mais específica à mais geral (a cadeia da pose, só as chaves com arma): NPC nunca herda a do player. */
export function gripChain(grip: string, chars: CharactersConfig | null): string[] {
  const { clip: weapon, target } = splitKey(grip)
  const out: string[] = []
  for (const k of inheritChain(fullKey('_', weapon, target), chars)) {
    const g = gripKeyOf(k)
    if (g && !out.includes(g)) out.push(g)
  }
  return out
}

/** O que a opção de "aplicar a" grava, por quem se edita (ADR-0707). */
export type ApplyTo = 'everyone' | 'only' | 'selected' | 'allNpcs'

/**
 * Alvos (o sufixo `#…` de cada chave, `null` = todos) de uma edição feita em `editing` (o código do player ou de um NPC):
 * - no player: `everyone` = player e todos os NPCs (`null`), `only` = só o player, `selected` = os escolhidos;
 * - num NPC: `only` = só este, `selected` = os NPCs escolhidos, `allNpcs` = o grupo.
 */
export function applyTargets(editing: string, choice: ApplyTo, selected: readonly string[], chars: CharactersConfig | null, player: string): Array<string | null> {
  const npc = isNpcTarget(chars, editing) && editing !== player
  if (choice === 'only') return [editing]
  if (choice === 'selected') return selected.length ? [...new Set(selected)] : [editing]
  if (choice === 'allNpcs' && chars) return [chars.group]
  return npc ? [editing] : [null]
}

/** As opções de "aplicar a" para quem se edita. */
export const applyChoices = (editingNpc: boolean): ApplyTo[] => (editingNpc ? ['only', 'selected', 'allNpcs'] : ['everyone', 'only', 'selected'])

/**
 * Os códigos que a lista de "Selecionados" mostra (SPEC-0718): os que contêm `query` (sem caixa), os marcados primeiro
 * (cada grupo na ordem de `codes`); com `onlyChecked`, só os marcados.
 */
export function visibleApplyCodes(codes: readonly string[], query: string, checked: ReadonlySet<string>, onlyChecked: boolean): string[] {
  const q = query.trim().toLowerCase()
  const hit = codes.filter((c) => c.toLowerCase().includes(q) && (!onlyChecked || checked.has(c)))
  return [...hit.filter((c) => checked.has(c)), ...hit.filter((c) => !checked.has(c))]
}
