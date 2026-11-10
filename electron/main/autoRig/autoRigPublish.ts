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

type RigRegistry = { version: 1; rigs: Record<string, Record<string, unknown>> }

/** Lê o registro; `null` se o arquivo existe mas não é um registro legível (nunca é sobrescrito nesse caso). */
function readRegistry(text: string | null): RigRegistry | null {
  if (text === null) return { version: 1, rigs: {} }
  try {
    const parsed = JSON.parse(text.replace(/^﻿/, '')) as Partial<RigRegistry> | null
    return parsed && typeof parsed.rigs === 'object' && parsed.rigs !== null ? (parsed as RigRegistry) : null
  } catch {
    return null
  }
}

/**
 * Grava o build (`staging` na `skin` aprovada, `published` no Aprovar; `null` tira o `published`) do personagem no
 * registro. `durations` = duração de cada clipe, do JSON do skin. Se o registro existente está ilegível, não mexe
 * nele e devolve o aviso; `null` = gravou.
 */
export function registerRig(config: ResolvedRigConfig, configRel: string, kind: 'staging' | 'published', build: { at: string } | null, durations: Record<string, number>): string | null {
  const path = join(config.project, RIG_REGISTRY_REL)
  const text = existsSync(path) ? readFileSync(path, 'utf8') : null
  const registry = readRegistry(text)
  if (!registry) return `aviso: ${RIG_REGISTRY_REL} ilegível; o registro de rigs não foi atualizado (corrija o JSON e gere de novo)`
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
  return null
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
  const touched: ManifestItem[] = []
  let manifest: ManifestItem[] = []
  try {
    // Backup de tudo e o manifest ANTES de tocar no projeto: uma falha no meio sempre tem volta.
    manifest = pairs.map(([, to]) => {
      const keep = join(dir, basename(to))
      const had = existsSync(to)
      if (had) safeCopy(to, keep)
      return { to, backup: had ? keep : null }
    })
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n')
    pairs.forEach(([from, to], i) => {
      mkdirSync(dirname(to), { recursive: true })
      touched.push(manifest[i]!)
      safeCopy(from, to)
    })
  } catch (err) {
    restore(touched)
    rmSync(dir, { recursive: true, force: true })
    return { code: AUTO_RIG_EXIT.infra, lines: [`não publicado: ${(err as Error).message}; o projeto voltou ao que era`] }
  }
  const at = now.toISOString()
  state.published = { at, backup: dir }
  writeState(config.work, state)
  const warn = registerRig(config, configRel, 'published', { at }, clipDurations(staging.clips))
  return { code: AUTO_RIG_EXIT.pass, lines: [`publicado no projeto (${manifest.length} arquivos); backup em ${dir}`, ...(warn ? [warn] : [])] }
}

/** Volta cada destino ao backup (sem backup = o arquivo não existia e é apagado). */
function restore(items: ManifestItem[]): void {
  for (const { to, backup } of items) {
    if (backup) safeCopy(backup, to)
    else rmSync(to, { force: true })
  }
}

/** Desfazer: restaura a última publicação (sem backup = o arquivo não existia e é apagado). */
export function revert(config: ResolvedRigConfig, configRel: string, state: RigState): PublishOutcome {
  const root = join(config.work, 'backup')
  const dirs = existsSync(root) ? readdirSync(root).filter((d) => existsSync(join(root, d, 'manifest.json'))).sort() : []
  const last = dirs.at(-1)
  if (!last) return { code: AUTO_RIG_EXIT.fail, lines: ['nenhuma publicação para desfazer'] }
  const dir = join(root, last)
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as ManifestItem[]
  restore(manifest)
  rmSync(dir, { recursive: true, force: true })
  delete state.published
  writeState(config.work, state)
  const restored = manifest.every((m) => m.backup)
  const warn = restored ? null : registerRig(config, configRel, 'published', null, {})
  return { code: AUTO_RIG_EXIT.pass, lines: [`restaurado o que existia antes da publicação de ${last}`, ...(warn ? [warn] : [])] }
}
