/**
 * Config do auto-rig do Studio (SPEC-0724): lê `tools/characters/<nome>.json`, valida, resolve os caminhos contra o
 * projeto e preenche os padrões. O resultado vira o `config.resolved.json` que os scripts do Blender leem.
 */
import { isAbsolute, normalize, resolve, sep } from 'path'

/** Códigos de saída (os mesmos do `prepare-character.sh` do DDD 61, SPEC-0349). */
export const AUTO_RIG_EXIT = { pass: 0, fail: 1, infra: 2, review: 3, usage: 64 } as const

const CODE_RE = /^[A-Za-z0-9._-]+$/
const DEFAULT_HEIGHT_M = 1.8
const DEFAULT_WELD_M = 0.00001
/** Limites e faixas do LUC-01 (o player do DDD 61 e do Port Hollow). */
const DEFAULT_JOINT_LIMITS: Record<string, number> = { ForeArm: 115 }
const DEFAULT_JOINT_BANDS: Record<string, JointBand> = {
  ElbowHelper: { band: 0.07, reach: 0.15, membership: 0.9 },
  KneeHelper: { band: 0.08, reach: 0.18, membership: 0.9 },
}

export interface JointBand {
  band: number
  reach: number
  membership: number
}

export interface PreviewPose {
  label: string
  clip?: string
  mark?: string
}

export interface ResolvedRigConfig {
  code: string
  /** Absolutos (resolvidos contra o projeto). */
  source: string
  work: string
  project: string
  transform: { rotateZDeg: number; height: number; weld: number; sharpAngleDeg?: number }
  budget?: { minTriangles: number; maxTriangles: number }
  skinned: {
    markers: string
    fbx: string | null
    clips: Record<string, Record<string, unknown>>
    jointLimitsDeg: Record<string, number>
    jointBands: Record<string, JointBand>
    preview: PreviewPose[]
    hooks: string[]
    /** Relativos ao projeto (o `--approve` grava ali). */
    publish: { glb: string; clips: string }
  }
}

export type RigConfigResult = { ok: true; config: ResolvedRigConfig } | { ok: false; errors: string[] }

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => v != null && typeof v === 'object' && !Array.isArray(v)
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** A config é do pipeline do Studio: tem `work` e `skinned.publish.{glb,clips}` (SPEC-0724). */
export function isBuiltinRigConfig(raw: unknown): boolean {
  if (!isObj(raw) || !isText(raw['work']) || !isObj(raw['skinned'])) return false
  const publish = raw['skinned']['publish']
  return isObj(publish) && isText(publish['glb']) && isText(publish['clips'])
}

/** Caminho da config (absoluto ou relativo ao projeto, aceitando `\`) → absoluto. */
export function projectPath(projectDir: string, p: string): string {
  return isAbsolute(p) ? normalize(p) : resolve(projectDir, p.replace(/\\/g, '/'))
}

/** `rel` é relativo ao projeto e não sai dele (sem `..`, sem unidade nem raiz). */
export function isProjectRelative(rel: string): boolean {
  if (isAbsolute(rel) || /^[A-Za-z]:/.test(rel) || rel.startsWith('/') || rel.startsWith('\\')) return false
  return !rel.split(/[\\/]/).includes('..')
}

/** `<config>.json` → `<config>.markers.json` (o arquivo que o painel grava, SPEC-0349). */
export function defaultMarkersPath(configRel: string): string {
  return configRel.replace(/\.json$/, '.markers.json')
}

function readTransform(raw: unknown, errors: string[]): ResolvedRigConfig['transform'] {
  const t = isObj(raw) ? raw : {}
  const num = (key: string, fallback: number): number => {
    const v = t[key]
    if (v === undefined) return fallback
    if (!isNum(v)) errors.push(`transform.${key} não é número`)
    return isNum(v) ? v : fallback
  }
  const out: ResolvedRigConfig['transform'] = { rotateZDeg: num('rotateZDeg', 0), height: num('height', DEFAULT_HEIGHT_M), weld: num('weld', DEFAULT_WELD_M) }
  if (out.height <= 0) errors.push('transform.height tem de ser > 0')
  if (out.weld < 0) errors.push('transform.weld não pode ser negativo')
  if (t['sharpAngleDeg'] !== undefined) out.sharpAngleDeg = num('sharpAngleDeg', 0)
  return out
}

function readBudget(raw: unknown, errors: string[]): ResolvedRigConfig['budget'] {
  if (raw === undefined) return undefined
  if (!isObj(raw) || !isNum(raw['minTriangles']) || !isNum(raw['maxTriangles'])) {
    errors.push('budget precisa de minTriangles e maxTriangles')
    return undefined
  }
  return { minTriangles: raw['minTriangles'], maxTriangles: raw['maxTriangles'] }
}

function readClips(raw: unknown, errors: string[]): Record<string, Obj> {
  if (raw === undefined) return {}
  if (!isObj(raw)) {
    errors.push('skinned.clips não é objeto')
    return {}
  }
  const out: Record<string, Obj> = {}
  for (const [name, clip] of Object.entries(raw)) {
    if (!isObj(clip)) errors.push(`skinned.clips.${name} não é objeto`)
    else out[name] = clip
  }
  return out
}

function readPreview(raw: unknown, clips: Record<string, Obj>, errors: string[]): PreviewPose[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    errors.push('skinned.preview não é lista')
    return []
  }
  const out: PreviewPose[] = []
  raw.forEach((p: unknown, i) => {
    if (!isObj(p) || !isText(p['label'])) return void errors.push(`skinned.preview[${i}] sem label`)
    const clip = p['clip']
    if (clip !== undefined && (!isText(clip) || !isText(clips[clip]?.['file']))) {
      return void errors.push(`skinned.preview[${i}]: clipe ${String(clip)} não é um clipe com "file"`)
    }
    out.push({ label: p['label'], ...(isText(clip) ? { clip } : {}), ...(isText(p['mark']) ? { mark: p['mark'] } : {}) })
  })
  return out
}

function readNumberMap(raw: unknown, fallback: Record<string, number>, key: string, errors: string[]): Record<string, number> {
  if (raw === undefined) return { ...fallback }
  if (!isObj(raw) || !Object.values(raw).every(isNum)) {
    errors.push(`skinned.${key} precisa de números`)
    return { ...fallback }
  }
  return raw as Record<string, number>
}

function readBands(raw: unknown, errors: string[]): Record<string, JointBand> {
  const out = { ...DEFAULT_JOINT_BANDS }
  if (raw === undefined) return out
  if (!isObj(raw)) {
    errors.push('skinned.jointBands não é objeto')
    return out
  }
  for (const [name, band] of Object.entries(raw)) {
    if (!isObj(band) || !['band', 'reach', 'membership'].every((k) => isNum(band[k]))) {
      errors.push(`skinned.jointBands.${name} precisa de band, reach e membership`)
    } else out[name] = { band: band['band'] as number, reach: band['reach'] as number, membership: band['membership'] as number }
  }
  return out
}

function readSkinned(sk: Obj, projectDir: string, configRel: string, errors: string[]): ResolvedRigConfig['skinned'] {
  const at = (p: string): string => projectPath(projectDir, p)
  const clips = readClips(sk['clips'], errors)
  const fbx = isText(sk['fbx']) ? at(sk['fbx']) : null
  if (!fbx && Object.values(clips).some((c) => isText(c['file']))) errors.push('skinned.fbx faltando (há clipe com "file")')
  const hooksRaw = sk['hooks'] ?? []
  if (!Array.isArray(hooksRaw) || !hooksRaw.every(isText)) errors.push('skinned.hooks precisa ser uma lista de caminhos')
  const publish = sk['publish'] as Obj
  for (const k of ['glb', 'clips'] as const) {
    if (!isText(publish[k]) || !isProjectRelative(publish[k])) errors.push(`skinned.publish.${k} tem de ser relativo ao projeto, sem ".."`)
  }
  return {
    markers: at(isText(sk['markers']) ? sk['markers'] : defaultMarkersPath(configRel)),
    fbx,
    clips,
    jointLimitsDeg: readNumberMap(sk['jointLimitsDeg'], DEFAULT_JOINT_LIMITS, 'jointLimitsDeg', errors),
    jointBands: readBands(sk['jointBands'], errors),
    preview: readPreview(sk['preview'], clips, errors),
    hooks: Array.isArray(hooksRaw) ? hooksRaw.filter(isText).map(at) : [],
    publish: { glb: String(publish['glb'] ?? ''), clips: String(publish['clips'] ?? '') },
  }
}

/** Valida e resolve a config (texto do JSON) do projeto `projectDir`; `configRel` = `tools/characters/<nome>.json`. */
export function resolveRigConfig(text: string, projectDir: string, configRel: string): RigConfigResult {
  let raw: unknown
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''))
  } catch (err) {
    return { ok: false, errors: [`JSON inválido: ${(err as Error).message}`] }
  }
  if (!isBuiltinRigConfig(raw)) return { ok: false, errors: ['a config não é do pipeline do Studio (falta work ou skinned.publish)'] }
  const r = raw as Obj
  const errors: string[] = []
  if (!isText(r['code']) || !CODE_RE.test(r['code'])) errors.push('code ausente ou com caractere fora de [A-Za-z0-9._-]')
  if (!isText(r['source'])) errors.push('source ausente')
  const project = resolve(projectDir)
  const config: ResolvedRigConfig = {
    code: String(r['code'] ?? ''),
    source: isText(r['source']) ? projectPath(project, r['source']) : '',
    work: projectPath(project, r['work'] as string),
    project,
    transform: readTransform(r['transform'], errors),
    skinned: readSkinned(r['skinned'] as Obj, project, configRel, errors),
  }
  const budget = readBudget(r['budget'], errors)
  if (budget) config.budget = budget
  return errors.length ? { ok: false, errors } : { ok: true, config }
}

/** Caminho absoluto de um destino de publicação, garantido dentro do projeto. */
export function publishTarget(config: ResolvedRigConfig, rel: string): string {
  const abs = resolve(config.project, rel)
  if (abs !== config.project && !abs.startsWith(config.project + sep)) throw new Error(`fora do projeto: ${rel}`)
  return abs
}
