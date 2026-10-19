/**
 * Seleção dos FBX que entram no rig (`skinned.clips` da config do personagem) —
 * lógica pura da aba **Pasta** do painel auto-rig (SPEC-0349, adendo 1).
 *
 * A config é do jogo (`tools/characters/<CODE>.json`): só `skinned.clips` muda;
 * o resto do JSON e a ordem das chaves ficam. Formato de gravação do jogo:
 * `JSON.stringify(cfg, null, 1) + '\n'`.
 *
 * Sem DOM e sem three.js — testado em `tests/electron/characterRigSelection.test.ts`.
 */

import { clipNameFromFile, type RigClip } from './characterRigRegistry.js'

/** Uma entrada de `skinned.clips`. */
export interface SelectedClip {
  name: string
  file: string
  loop: boolean
  /** Chaves além de `file`/`loop` (`rootMotion`, `jump`…): o jogo usa o clipe. */
  flags: string[]
}

/** O que o painel quer na config: FBX → laço. Chave = arquivo em minúsculas. */
export type SelectionState = Map<string, { file: string; loop: boolean }>

export type JsonObject = Record<string, unknown>

const BASE_KEYS = new Set(['file', 'loop'])

/** Chave de comparação de arquivo (Windows: sem caixa). */
export function fileKey(file: string): string {
  return file.toLowerCase()
}

export function isFbxName(name: string): boolean {
  return /\.fbx$/i.test(name)
}

function isObject(v: unknown): v is JsonObject {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** Lê a config inteira (objeto, para regravar). Lança se não for objeto. */
export function parseConfigObject(text: string): JsonObject {
  const raw: unknown = JSON.parse(text.replace(/^﻿/, ''))
  if (!isObject(raw)) throw new Error('config não é um objeto JSON')
  return raw
}

/** `JSON.stringify(cfg, null, 1) + '\n'` — o formato das configs do jogo. */
export function serializeConfig(cfg: JsonObject): string {
  return `${JSON.stringify(cfg, null, 1)}\n`
}

/** `skinned.fbx` (pasta dos FBX), ou `null`. */
export function fbxDirOf(cfg: JsonObject): string | null {
  const skinned = cfg['skinned']
  const dir = isObject(skinned) ? skinned['fbx'] : undefined
  return typeof dir === 'string' && dir ? dir : null
}

/** Entradas de `skinned.clips`, na ordem da config (ignora as sem `file`). */
export function selectedClips(cfg: JsonObject): SelectedClip[] {
  const skinned = cfg['skinned']
  const clips = isObject(skinned) ? skinned['clips'] : undefined
  if (!isObject(clips)) return []
  const out: SelectedClip[] = []
  for (const [name, v] of Object.entries(clips)) {
    if (!isObject(v) || typeof v['file'] !== 'string' || !v['file']) continue
    out.push({ name, file: v['file'], loop: v['loop'] === true, flags: Object.keys(v).filter((k) => !BASE_KEYS.has(k)) })
  }
  return out
}

/** Estado inicial do painel a partir da config. */
export function selectionFromConfig(cfg: JsonObject): SelectionState {
  const out: SelectionState = new Map()
  for (const c of selectedClips(cfg)) out.set(fileKey(c.file), { file: c.file, loop: c.loop })
  return out
}

/** `base` se livre, senão `base2`, `base3`… */
export function uniqueClipName(base: string, taken: ReadonlySet<string>): string {
  const name = base || 'clip'
  if (!taken.has(name)) return name
  for (let i = 2; ; i++) if (!taken.has(`${name}${i}`)) return `${name}${i}`
}

/**
 * Aplica a seleção numa cópia da config: remove as entradas desmarcadas, ajusta
 * `loop` das que ficam (mantendo as outras chaves e a posição) e acrescenta as
 * novas no fim (`{ file, loop }`, nome camelCase único). O resto fica igual.
 */
export function applySelection(cfg: JsonObject, selection: SelectionState): JsonObject {
  const out = structuredClone(cfg)
  const skinned: JsonObject = isObject(out['skinned']) ? out['skinned'] : (out['skinned'] = {})
  const src: JsonObject = isObject(skinned['clips']) ? skinned['clips'] : {}
  const clips: JsonObject = {}
  const present = new Set<string>()
  for (const [name, v] of Object.entries(src)) {
    const file = isObject(v) && typeof v['file'] === 'string' ? v['file'] : null
    const want = file ? selection.get(fileKey(file)) : undefined
    if (!file) {
      clips[name] = v // entrada sem `file`: não é do painel, fica
      continue
    }
    if (!want) continue
    present.add(fileKey(file))
    clips[name] = (v as JsonObject)['loop'] === want.loop ? v : { ...(v as JsonObject), loop: want.loop }
  }
  const taken = new Set(Object.keys(clips))
  for (const [key, want] of selection) {
    if (present.has(key)) continue
    const name = uniqueClipName(clipNameFromFile(want.file), taken)
    taken.add(name)
    clips[name] = { file: want.file, loop: want.loop }
  }
  skinned['clips'] = clips
  return out
}

/** Clipes que o jogo usa (com flags) e que a seleção tiraria. */
export function removedGameClips(cfg: JsonObject, selection: SelectionState): SelectedClip[] {
  return selectedClips(cfg).filter((c) => c.flags.length > 0 && !selection.has(fileKey(c.file)))
}

// ── Linhas da lista ───────────────────────────────────────────────────────────

/** `generated` = no rig; `pending` = selecionada, fora do rig; `unselected`. */
export type RowState = 'generated' | 'pending' | 'unselected'

export interface FbxRow {
  file: string
  /** Nome do clipe: o da config se selecionado, senão o que vai ganhar. */
  name: string
  selected: boolean
  loop: boolean
  state: RowState
  /** Está no rig gerado (registro), mesmo desmarcado. */
  inRig: boolean
  /** Flags do jogo na entrada da config (vazio se não selecionado). */
  flags: string[]
  /** Listado na config mas ausente da pasta. */
  missing: boolean
}

/**
 * Linhas da aba Pasta: os `.fbx` da pasta (alfabética) e, no fim, os da
 * seleção que não estão na pasta. `cfg` é a config já com a seleção aplicada.
 */
export function buildRows(dirFiles: readonly string[], cfg: JsonObject, rigClips: readonly RigClip[]): FbxRow[] {
  const inRig = new Set(rigClips.map((c) => fileKey(c.file)))
  const byFile = new Map(selectedClips(cfg).map((c) => [fileKey(c.file), c]))
  const taken = new Set(selectedClips(cfg).map((c) => c.name))
  const files = dirFiles.filter(isFbxName).sort((a, b) => a.localeCompare(b))
  const inDir = new Set(files.map(fileKey))
  const row = (file: string, missing: boolean): FbxRow => {
    const key = fileKey(file)
    const sel = byFile.get(key)
    const rig = inRig.has(key)
    return {
      file,
      name: sel?.name ?? uniqueClipName(clipNameFromFile(file), taken),
      selected: !!sel,
      loop: sel?.loop ?? false,
      state: sel ? (rig ? 'generated' : 'pending') : 'unselected',
      inRig: rig,
      flags: sel?.flags ?? [],
      missing,
    }
  }
  const rows = files.map((f) => row(f, false))
  for (const c of byFile.values()) if (!inDir.has(fileKey(c.file))) rows.push(row(c.file, true))
  return rows
}

/** Minúsculas e sem acento, para a busca. */
export function normalizeSearch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Linhas cujo arquivo ou nome de clipe contém a busca (sem caixa/acento). */
export function filterRows(rows: readonly FbxRow[], query: string): FbxRow[] {
  const q = normalizeSearch(query.trim())
  if (!q) return [...rows]
  return rows.filter((r) => normalizeSearch(r.file).includes(q) || normalizeSearch(r.name).includes(q))
}

/** Contador "N de M": selecionadas entre as linhas da pasta (sem as ausentes). */
export function selectionCount(rows: readonly FbxRow[]): { selected: number; total: number } {
  const inDir = rows.filter((r) => !r.missing)
  return { selected: inDir.filter((r) => r.selected).length, total: inDir.length }
}
