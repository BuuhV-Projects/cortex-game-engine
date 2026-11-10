/**
 * Publicação do auto-rig do Studio (SPEC-0724): Aprovar copia o staging para `skinned.publish` com backup, Desfazer
 * restaura a última publicação, e o registro `tools/characters/rigs.json` (SPEC-0349, adendo 1) guarda o que o
 * painel pode pré-visualizar.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'fs'
import { basename, dirname, join, relative } from 'path'
import { AUTO_RIG_EXIT, publishTarget, type ResolvedRigConfig } from './autoRigConfig.js'
import { fileSha, stagesToRun, writeState, type RigState, type StageName } from './autoRigState.js'

export const RIG_REGISTRY_REL = 'tools/characters/rigs.json'
const DEFAULT_INDENT = 2

export interface PublishOutcome {
  code: number
  lines: string[]
}

interface ManifestItem {
  to: string
  backup: string | null
}

/** GLB e JSON de staging gerados pela etapa `skin`. */
export function stagingFiles(config: ResolvedRigConfig): { glb: string; clips: string } {
  const dir = join(config.work, 'staging')
  return { glb: join(dir, `${config.code}-skinned.glb`), clips: join(dir, `${config.code}-skinned.json`) }
}

/** Cópia que nunca deixa o destino pela metade: grava ao lado, confere o hash com a origem e só então troca. */
export function safeCopy(from: string, to: string): void {
  const tmp = `${to}.tmp-${process.pid}`
  try {
    copyFileSync(from, tmp)
    if (fileSha(tmp) !== fileSha(from)) throw new Error(`cópia corrompida: ${to}`)
    renameSync(tmp, to)
  } finally {
    rmSync(tmp, { force: true })
  }
}

/** Indentação de um JSON existente (1 ou mais espaços); arquivo novo usa 2. */
export function detectIndent(text: string): number {
  const m = /\n( +)"/.exec(text)
  return m ? m[1]!.length : DEFAULT_INDENT
}

const projectRel = (config: ResolvedRigConfig, abs: string): string => relative(config.project, abs).replace(/\\/g, '/')

/**
 * Grava o build (`staging` na `skin` aprovada, `published` no Aprovar; `null` tira o `published`) do personagem no
 * registro. `durations` = duração de cada clipe, do JSON do skin.
 */
export function registerRig(config: ResolvedRigConfig, configRel: string, kind: 'staging' | 'published', build: { at: string } | null, durations: Record<string, number>): void {
  const path = join(config.project, RIG_REGISTRY_REL)
  const text = existsSync(path) ? readFileSync(path, 'utf8') : null
  const registry = text ? (JSON.parse(text.replace(/^﻿/, '')) as { version: 1; rigs: Record<string, Record<string, unknown>> }) : { version: 1 as const, rigs: {} }
  const entry = registry.rigs[config.code] ?? {}
  const files = kind === 'staging' ? stagingFiles(config) : { glb: publishTarget(config, config.skinned.publish.glb), clips: publishTarget(config, config.skinned.publish.clips) }
  entry['config'] = configRel
  entry['animations'] = config.skinned.fbx ? projectRel(config, config.skinned.fbx) : dirname(config.skinned.publish.glb).replace(/\\/g, '/')
  if (build) entry[kind] = { glb: projectRel(config, files.glb), clips: projectRel(config, files.clips), at: build.at }
  else delete entry[kind]
  if (kind === 'staging') {
    entry['clips'] = Object.entries(config.skinned.clips)
      .filter(([, c]) => typeof c['file'] === 'string')
      .map(([name, c]) => ({ name, file: c['file'], loop: c['loop'] === true, duration: durations[name] ?? null }))
  }
  registry.rigs[config.code] = entry
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(registry, null, text ? detectIndent(text) : DEFAULT_INDENT) + '\n')
}

/** Duração de cada clipe no JSON do skin (vazio se não existe). */
export function clipDurations(sidecarPath: string): Record<string, number> {
  try {
    const clips = (JSON.parse(readFileSync(sidecarPath, 'utf8')) as { clips?: Record<string, { duration?: number }> }).clips ?? {}
    return Object.fromEntries(Object.entries(clips).flatMap(([n, c]) => (typeof c.duration === 'number' ? [[n, c.duration]] : [])))
  } catch {
    return {}
  }
}

/** Aprovar: com as etapas aprovadas nos hashes de agora, publica o staging com backup. */
export function approve(config: ResolvedRigConfig, configRel: string, state: RigState, hashes: Record<StageName, string>, now: Date): PublishOutcome {
  const stale = stagesToRun(state, hashes)
  if (stale.length) return { code: AUTO_RIG_EXIT.fail, lines: [`não publicado: etapas pendentes ou reprovadas: ${stale.join(', ')}`] }
  const staging = stagingFiles(config)
  const pairs: Array<[string, string]> = [
    [staging.glb, publishTarget(config, config.skinned.publish.glb)],
    [staging.clips, publishTarget(config, config.skinned.publish.clips)],
  ]
  const dir = join(config.work, 'backup', now.toISOString().replace(/[:.]/g, '-'))
  mkdirSync(dir, { recursive: true })
  const manifest: ManifestItem[] = []
  for (const [from, to] of pairs) {
    mkdirSync(dirname(to), { recursive: true })
    const keep = join(dir, basename(to))
    const had = existsSync(to)
    if (had) safeCopy(to, keep)
    manifest.push({ to, backup: had ? keep : null })
    safeCopy(from, to)
  }
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n')
  const at = now.toISOString()
  state.published = { at, backup: dir }
  writeState(config.work, state)
  registerRig(config, configRel, 'published', { at }, clipDurations(staging.clips))
  return { code: AUTO_RIG_EXIT.pass, lines: [`publicado no projeto (${manifest.length} arquivos); backup em ${dir}`] }
}

/** Desfazer: restaura a última publicação (sem backup = o arquivo não existia e é apagado). */
export function revert(config: ResolvedRigConfig, configRel: string, state: RigState): PublishOutcome {
  const root = join(config.work, 'backup')
  const dirs = existsSync(root) ? readdirSync(root).filter((d) => existsSync(join(root, d, 'manifest.json'))).sort() : []
  const last = dirs.at(-1)
  if (!last) return { code: AUTO_RIG_EXIT.fail, lines: ['nenhuma publicação para desfazer'] }
  const dir = join(root, last)
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as ManifestItem[]
  for (const { to, backup } of manifest) {
    if (backup) safeCopy(backup, to)
    else rmSync(to, { force: true })
  }
  rmSync(dir, { recursive: true, force: true })
  delete state.published
  writeState(config.work, state)
  const restored = manifest.every((m) => m.backup)
  if (!restored) registerRig(config, configRel, 'published', null, {})
  return { code: AUTO_RIG_EXIT.pass, lines: [`restaurado o que existia antes da publicação de ${last}`] }
}
