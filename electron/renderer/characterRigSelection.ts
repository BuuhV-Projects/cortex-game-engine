/**
 * Seleção dos FBX que entram no rig (`skinned.clips` da config do personagem) —
 * lógica pura da aba **Pasta** do painel auto-rig (SPEC-0349, adendos 1 e 6).
 *
 * `skinned.fbx` é a raiz dos pacotes; `file` de cada clipe é relativo a ela, com
 * a subpasta do pacote (`pistol-locomotion/pistol walk.fbx`). Config antiga, com
 * `skinned.fbx` apontando para um pacote e `file` sem barra, segue a mesma regra.
 *
 * A config é do jogo (`tools/characters/<CODE>.json`): só `skinned.clips` muda;
 * o resto do JSON e a ordem das chaves ficam. Formato de gravação do jogo:
 * `JSON.stringify(cfg, null, 1) + '\n'`.
 *
 * Sem DOM e sem three.js — testado em `tests/electron/characterRigSelection.test.ts`.
 */

import { camelCase, clipNameFromFile, resolveProjectPath, type RigClip } from './characterRigRegistry.js'

/** Uma entrada de `skinned.clips`. */
export interface SelectedClip {
  name: string
  file: string
  loop: boolean
  /** Chaves além de `file`/`loop` (`rootMotion`, `jump`…): o jogo usa o clipe. */
  flags: string[]
}

/** O que o painel quer na config: FBX → laço. Chave = `fileKey(file)`. */
export type SelectionState = Map<string, { file: string; loop: boolean }>

export type JsonObject = Record<string, unknown>

const BASE_KEYS = new Set(['file', 'loop'])

/** Caminho relativo com `/`: troca `\`, junta barras repetidas e tira `./`. */
export function normalizeRelPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/(^|\/)(\.\/)+/g, '$1')
}

/** Chave de comparação de arquivo (barras normalizadas; Windows: sem caixa). */
export function fileKey(file: string): string {
  return normalizeRelPath(file).toLowerCase()
}

/** Pacote do arquivo: a pasta relativa à raiz (`pistol-locomotion`), ou `''` na própria raiz. */
export function packageOf(file: string): string {
  const n = normalizeRelPath(file)
  const i = n.lastIndexOf('/')
  return i < 0 ? '' : n.slice(0, i)
}

/** Nome do arquivo, sem a pasta. */
export function fileBaseName(file: string): string {
  const n = normalizeRelPath(file)
  return n.slice(n.lastIndexOf('/') + 1)
}

/** Rótulo da lista de clipes: `pistol-locomotion · pistol walk.fbx` (só o arquivo, sem pacote). */
export function fileLabel(file: string): string {
  const pkg = packageOf(file)
  return pkg ? `${pkg} · ${fileBaseName(file)}` : fileBaseName(file)
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

/** `skinned.fbx` (raiz dos pacotes de FBX), ou `null`. */
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
 * Nome de um clipe novo: camelCase do arquivo (sem a pasta); se já for de outro
 * clipe, com o pacote em camelCase na frente (`pistol-locomotion/idle.fbx` →
 * `pistolLocomotionIdle`); se ainda colidir, sufixo numérico. Arquivo da raiz
 * (sem pacote) vai direto ao sufixo.
 */
export function autoClipName(file: string, taken: ReadonlySet<string>): string {
  const base = clipNameFromFile(file) || 'clip'
  if (!taken.has(base)) return base
  const pkg = camelCase(packageOf(file))
  if (!pkg) return uniqueClipName(base, taken)
  return uniqueClipName(`${pkg}${base[0]!.toUpperCase()}${base.slice(1)}`, taken)
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
    const name = autoClipName(want.file, taken)
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
  /** Caminho relativo à raiz (`skinned.fbx`), com `/`. */
  file: string
  /** Pasta do arquivo relativa à raiz (`''` = a própria raiz). */
  pkg: string
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

/** Ordem da lista: pacote (a raiz primeiro), depois o arquivo. */
function compareFiles(a: string, b: string): number {
  return packageOf(a).localeCompare(packageOf(b)) || fileBaseName(a).localeCompare(fileBaseName(b))
}

/**
 * Linhas da aba Pasta: os `.fbx` da raiz e das subpastas (caminhos relativos à
 * raiz), por pacote e nome; no fim, os da seleção que não estão no disco.
 * `cfg` é a config já com a seleção aplicada; `rigClips` com `file` já relativo
 * à raiz (`rebaseRigFile`).
 */
export function buildRows(dirFiles: readonly string[], cfg: JsonObject, rigClips: readonly Pick<RigClip, 'file'>[]): FbxRow[] {
  const inRig = new Set(rigClips.map((c) => fileKey(c.file)))
  const byFile = new Map(selectedClips(cfg).map((c) => [fileKey(c.file), c]))
  const taken = new Set(selectedClips(cfg).map((c) => c.name))
  const files = dirFiles.filter(isFbxName).map(normalizeRelPath).sort(compareFiles)
  const inDir = new Set(files.map(fileKey))
  const row = (file: string, missing: boolean): FbxRow => {
    const key = fileKey(file)
    const sel = byFile.get(key)
    const rig = inRig.has(key)
    return {
      file,
      pkg: packageOf(file),
      name: sel?.name ?? autoClipName(file, taken),
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

/** Linhas cujo caminho (pacote + arquivo) ou nome de clipe contém a busca (sem caixa/acento). */
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

export interface FbxGroup {
  /** Pasta relativa à raiz (`''` = a própria raiz). */
  pkg: string
  /** Linhas do pacote que passam na busca. */
  rows: FbxRow[]
  /** "N de M" do pacote inteiro (sem a busca e sem as ausentes). */
  selected: number
  total: number
}

/**
 * Agrupa por pacote (a raiz primeiro, depois alfabética), mantendo a ordem das
 * linhas. Pacote sem nenhuma linha no filtro fica de fora.
 */
export function groupRows(rows: readonly FbxRow[], query: string): FbxGroup[] {
  const shown = new Set(filterRows(rows, query))
  const groups = new Map<string, FbxGroup>()
  for (const r of rows) {
    let g = groups.get(r.pkg)
    if (!g) groups.set(r.pkg, (g = { pkg: r.pkg, rows: [], selected: 0, total: 0 }))
    if (shown.has(r)) g.rows.push(r)
  }
  for (const g of groups.values()) Object.assign(g, selectionCount(rows.filter((r) => r.pkg === g.pkg)))
  return [...groups.values()].filter((g) => g.rows.length).sort((a, b) => a.pkg.localeCompare(b.pkg))
}

// ── Disco e registro ──────────────────────────────────────────────────────────

export interface DirEntry {
  name: string
  isDir: boolean
}

/** Quantos níveis de subpasta a listagem desce abaixo da raiz. */
const MAX_FBX_DEPTH = 8

/**
 * `.fbx` de `root` e das subpastas (menos as que começam com `.`), como caminhos
 * relativos a `root` com `/`, por pacote e nome. Erro de leitura sobe.
 */
export async function listFbxRecursive(readDir: (dir: string) => Promise<DirEntry[]>, root: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (rel: string, depth: number): Promise<void> => {
    const entries = await readDir(rel ? `${root.replace(/[\\/]+$/, '')}/${rel}` : root)
    for (const e of entries) {
      const path = rel ? `${rel}/${e.name}` : e.name
      if (e.isDir) {
        if (!e.name.startsWith('.') && depth < MAX_FBX_DEPTH) await walk(path, depth + 1)
      } else if (isFbxName(e.name)) {
        out.push(path)
      }
    }
  }
  await walk('', 0)
  return out.sort(compareFiles)
}

/**
 * `file` do registro (relativo à pasta `animations` dele) → relativo à raiz da
 * config, quando a primeira está dentro da segunda: registro antigo com
 * `animations` = o pacote e `file` = `walking.fbx` vira
 * `basic-locomotion/walking.fbx`. Fora da raiz, fica como está (normalizado).
 */
export function rebaseRigFile(projectDir: string, rigAnimations: string, file: string, root: string): string {
  const abs = (p: string): string => normalizeRelPath(resolveProjectPath(projectDir, p)).replace(/\/+$/, '')
  const full = `${abs(rigAnimations)}/${normalizeRelPath(file)}`
  const base = abs(root)
  return full.toLowerCase().startsWith(`${base.toLowerCase()}/`) ? full.slice(base.length + 1) : normalizeRelPath(file)
}
