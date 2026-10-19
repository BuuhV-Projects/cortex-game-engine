/**
 * Registro de rigs gerados (`tools/characters/rigs.json`, escrito pelo pipeline
 * do jogo) — lógica pura da aba **Animações** do painel auto-rig (SPEC-0349,
 * adendo 1): ler/validar o registro, escolher o build (staging × publicado),
 * resolver caminhos e dar o nome camelCase de um FBX.
 *
 * Sem DOM e sem three.js — testado em `tests/electron/characterRigRegistry.test.ts`.
 */

export type RigBuildKind = 'staging' | 'published'

export interface RigBuild {
  glb: string
  clips: string
  /** ISO 8601 da geração/publicação. */
  at: string
}

export interface RigClip {
  /** Nome da animação dentro do GLB. */
  name: string
  /** FBX de origem (nome do arquivo na pasta `animations`). */
  file: string
  loop: boolean
  duration: number
}

export interface RigEntry {
  config: string
  /** Pasta dos FBX (relativa ao projeto ou absoluta). */
  animations: string
  staging?: RigBuild
  published?: RigBuild
  clips: RigClip[]
}

export interface RigRegistry {
  version: 1
  rigs: Record<string, RigEntry>
}

/** Nome do arquivo do registro dentro de `tools/characters/`. */
export const RIG_REGISTRY_FILE = 'rigs.json'

export function registryPath(projectDir: string): string {
  return `${projectDir.replace(/[\\/]+$/, '')}/tools/characters/${RIG_REGISTRY_FILE}`
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string' || !v) throw new Error(`${what} ausente`)
  return v
}

function parseBuild(v: unknown, what: string): RigBuild | undefined {
  if (v == null) return undefined
  const b = v as Record<string, unknown>
  const at = str(b['at'], `${what}.at`)
  if (Number.isNaN(Date.parse(at))) throw new Error(`${what}.at inválido: ${at}`)
  return { glb: str(b['glb'], `${what}.glb`), clips: str(b['clips'], `${what}.clips`), at }
}

/** Lê e valida o `rigs.json`. Lança com a primeira inconsistência. */
export function parseRigRegistry(text: string): RigRegistry {
  const raw = JSON.parse(text.replace(/^﻿/, '')) as Record<string, unknown>
  if (raw['version'] !== 1) throw new Error(`versão não suportada: ${String(raw['version'])}`)
  const src = raw['rigs']
  if (!src || typeof src !== 'object') throw new Error('rigs ausente')
  const rigs: Record<string, RigEntry> = {}
  for (const [code, value] of Object.entries(src as Record<string, unknown>)) {
    const e = value as Record<string, unknown>
    const clipsRaw = Array.isArray(e['clips']) ? (e['clips'] as Array<Record<string, unknown>>) : []
    rigs[code] = {
      config: str(e['config'], `${code}.config`),
      animations: str(e['animations'], `${code}.animations`),
      staging: parseBuild(e['staging'], `${code}.staging`),
      published: parseBuild(e['published'], `${code}.published`),
      clips: clipsRaw.map((c, i) => ({
        name: str(c['name'], `${code}.clips[${i}].name`),
        file: str(c['file'], `${code}.clips[${i}].file`),
        loop: c['loop'] === true,
        duration: typeof c['duration'] === 'number' && Number.isFinite(c['duration']) ? c['duration'] : 0,
      })),
    }
  }
  return { version: 1, rigs }
}

/** Builds presentes, o mais recente primeiro. */
export function availableBuilds(entry: RigEntry): RigBuildKind[] {
  const kinds = (['staging', 'published'] as const).filter((k) => entry[k])
  return kinds.sort((a, b) => Date.parse(entry[b]!.at) - Date.parse(entry[a]!.at))
}

/**
 * Build a mostrar: `prefer` se existir, senão o mais recente (`at`). `null` se o
 * registro não tem nenhum build.
 */
export function pickBuild(entry: RigEntry, prefer?: RigBuildKind): { kind: RigBuildKind; build: RigBuild } | null {
  const kinds = availableBuilds(entry)
  const kind = prefer && kinds.includes(prefer) ? prefer : kinds[0]
  return kind ? { kind, build: entry[kind]! } : null
}

/** `true` para caminho absoluto (letra de unidade, `/` ou `\`). */
export function isAbsolutePath(p: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('/') || p.startsWith('\\')
}

/** Caminho do registro → absoluto (relativos são do projeto). */
export function resolveProjectPath(projectDir: string, p: string): string {
  if (isAbsolutePath(p)) return p
  return `${projectDir.replace(/[\\/]+$/, '')}/${p.replace(/^\.?[\\/]+/, '')}`
}

/**
 * `left turn 90.fbx` → `leftTurn90`: nome do clipe novo na seleção. Separa em
 * espaço, `_`, `-` (qualquer não alfanumérico); 1ª palavra minúscula, as outras
 * com a inicial maiúscula.
 */
export function clipNameFromFile(file: string): string {
  const base = file.split(/[\\/]/).pop() ?? file
  const words = base.replace(/\.[^.]+$/, '').split(/[^A-Za-z0-9]+/).filter(Boolean)
  return words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0]!.toUpperCase() + w.slice(1).toLowerCase())).join('')
}

/** `D:/a/b.glb` → `{ dir: 'D:/a', name: 'b.glb' }` (aceita `\` e `/`). */
export function splitPath(p: string): { dir: string; name: string } {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i < 0 ? { dir: '.', name: p } : { dir: p.slice(0, i) || p.slice(0, 1), name: p.slice(i + 1) }
}

/** Duração em segundos para a lista (`1.03 s`). */
export function formatSeconds(s: number): string {
  return `${s.toFixed(2)} s`
}
