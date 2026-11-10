/**
 * Estado das etapas do auto-rig do Studio (SPEC-0724): hash das entradas de cada etapa e `<work>/state.json`.
 * Etapa com o mesmo hash e aprovada é reaproveitada; o Aprovar exige as duas aprovadas com o hash de agora.
 */
import { createHash } from 'crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { ResolvedRigConfig } from './autoRigConfig.js'

export const STAGES = ['skin', 'preview'] as const
export type StageName = (typeof STAGES)[number]
export type StageStatus = 'pass' | 'fail' | 'infra'

/** Script do Blender de cada etapa, em `native/scripts/autorig/`. */
export const STAGE_SCRIPTS: Record<StageName, string> = { skin: 'autorig_skin.py', preview: 'autorig_preview.py' }

export interface StageState {
  hash: string
  status: StageStatus
  seconds: number
  at: string
  failures: string[]
  infra: string | null
}

export interface RigState {
  stages: Partial<Record<StageName, StageState>>
  published?: { at: string; backup: string }
}

const HASH_CHARS = 16
const MISSING = 'missing'

function sha(...parts: Array<string | Buffer>): string {
  const h = createHash('sha256')
  for (const p of parts) h.update(p)
  return h.digest('hex').slice(0, HASH_CHARS)
}

/** SHA de um arquivo; `missing` se não existe (a entrada muda quando o arquivo aparece). */
export function fileSha(path: string): string {
  return existsSync(path) ? sha(readFileSync(path)) : MISSING
}

function clipFiles(config: ResolvedRigConfig): string[] {
  const { fbx, clips } = config.skinned
  if (!fbx) return []
  return Object.values(clips).flatMap((c) => (typeof c['file'] === 'string' ? [join(fbx, c['file'])] : []))
}

/** Hash de cada etapa: a `preview` depende da `skin`, e as duas dos scripts do Studio que rodam nelas. */
export function stageHashes(config: ResolvedRigConfig, scriptsDir: string): Record<StageName, string> {
  const scripts = readdirSync(scriptsDir).filter((f) => f.endsWith('.py')).sort()
  const { preview, publish, ...skinned } = config.skinned
  void publish
  const skinInput = JSON.stringify({ code: config.code, source: config.source, transform: config.transform, budget: config.budget ?? null, skinned })
  const files = [config.source, config.skinned.markers, ...clipFiles(config), ...config.skinned.hooks]
  const skin = sha(skinInput, ...files.map(fileSha), ...scripts.map((s) => `${s}:${fileSha(join(scriptsDir, s))}`))
  return { skin, preview: sha(JSON.stringify(preview), fileSha(join(scriptsDir, STAGE_SCRIPTS.preview)), skin) }
}

export function statePath(work: string): string {
  return join(work, 'state.json')
}

export function readState(work: string): RigState {
  try {
    const raw = JSON.parse(readFileSync(statePath(work), 'utf8')) as RigState
    return raw && typeof raw === 'object' && raw.stages ? raw : { stages: {} }
  } catch {
    return { stages: {} }
  }
}

export function writeState(work: string, state: RigState): void {
  writeFileSync(statePath(work), JSON.stringify(state, null, 1) + '\n')
}

/** A etapa está aprovada com as entradas de agora. */
export function isFresh(state: RigState, hashes: Record<StageName, string>, stage: StageName): boolean {
  const s = state.stages[stage]
  return !!s && s.hash === hashes[stage] && s.status === 'pass'
}

/**
 * Etapas que mudaram ou não passaram, na ordem (a `preview` depende do hash da `skin`). O Gerar roda estas; o
 * Aprovar só publica com a lista vazia.
 */
export function stagesToRun(state: RigState, hashes: Record<StageName, string>): StageName[] {
  return STAGES.filter((s) => !isFresh(state, hashes, s))
}
