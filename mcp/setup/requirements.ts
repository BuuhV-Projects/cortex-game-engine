/**
 * Requisitos da parte de IA do Studio (SPEC-0738): Claude Code ≥ 2.0, Blender ≥ 4.0 e Git. Checagem pura: os
 * comandos entram por `SetupDeps`.
 */
import { locateBlender } from '../../electron/main/autoRig/blenderLocate.js'
import { resolveCommand, runResolved, succeeded, type SetupDeps } from './commands.js'

export type RequirementId = 'claude-code' | 'blender' | 'git'
export type RequirementLevel = 'required-for-ai' | 'recommended'

export interface RequirementResult {
  id: RequirementId
  name: string
  level: RequirementLevel
  /** O executável existe. */
  found: boolean
  /** Existe, respondeu e a versão atende o mínimo. */
  ok: boolean
  version: string | null
  minVersion: string | null
  path: string | null
  installUrl: string
  message: string
}

type Version = readonly number[]

const CLAUDE_MIN: Version = [2, 0]
const BLENDER_MIN: Version = [4, 0]
const VERSION_FLAG = '--version'
const VERSION_PATTERN = /(\d+)\.(\d+)(?:\.(\d+))?/

const CLAUDE_URL = 'https://docs.claude.com/en/docs/claude-code/setup'
const BLENDER_URL = 'https://www.blender.org/download/'
const GIT_URL = 'https://git-scm.com/downloads'

/** Primeira versão `x.y[.z]` da saída (`2.0.14 (Claude Code)`, `Blender 4.2.0`, `git version 2.45.1.windows.1`). */
export function parseVersion(text: string): string | null {
  const m = VERSION_PATTERN.exec(text)
  return m ? m.slice(1).filter((p): p is string => p !== undefined).join('.') : null
}

/** `version` ≥ `min`, comparando parte a parte (parte ausente = 0). */
export function meetsMinimum(version: string, min: Version): boolean {
  const parts = version.split('.').map(Number)
  for (let i = 0; i < Math.max(parts.length, min.length); i++) {
    const diff = (parts[i] ?? 0) - (min[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return true
}

interface Spec {
  id: RequirementId
  name: string
  level: RequirementLevel
  min: Version | null
  installUrl: string
  /** Para que serve (entra na mensagem quando falta). */
  purpose: string
}

const CLAUDE: Spec = {
  id: 'claude-code',
  name: 'Claude Code',
  level: 'required-for-ai',
  min: CLAUDE_MIN,
  installUrl: CLAUDE_URL,
  purpose: 'a IA do Studio usa o MCP cortex pelo Claude Code',
}
const BLENDER: Spec = {
  id: 'blender',
  name: 'Blender',
  level: 'recommended',
  min: BLENDER_MIN,
  installUrl: BLENDER_URL,
  purpose: 'inspect_assets, auto-rig e os scripts das skills',
}
const GIT: Spec = {
  id: 'git',
  name: 'Git',
  level: 'recommended',
  min: null,
  installUrl: GIT_URL,
  purpose: 'commit inicial do projeto e o Git Bash do auto-rig',
}

function minText(spec: Spec): string | null {
  return spec.min ? spec.min.join('.') : null
}

function missing(spec: Spec, path: string | null = null): RequirementResult {
  return {
    id: spec.id,
    name: spec.name,
    level: spec.level,
    found: path !== null,
    ok: false,
    version: null,
    minVersion: minText(spec),
    path,
    installUrl: spec.installUrl,
    message: path
      ? `${spec.name} encontrado em ${path}, mas não respondeu a ${VERSION_FLAG}. Reinstale (${spec.purpose}).`
      : `${spec.name} não encontrado. Instale para ${spec.purpose}.`,
  }
}

function evaluate(spec: Spec, path: string, stdout: string): RequirementResult {
  const version = parseVersion(stdout)
  const base = { ...missing(spec, path), version }
  if (!version) return { ...base, message: `${spec.name} encontrado em ${path}, mas a versão não foi reconhecida.` }
  if (spec.min && !meetsMinimum(version, spec.min)) {
    return { ...base, message: `${spec.name} ${version} é antigo; precisa da ${minText(spec)} ou mais nova.` }
  }
  return { ...base, ok: true, message: `${spec.name} ${version} ok.` }
}

/** Requisito resolvido pelo PATH (`where`/`which`) + `--version`. */
function checkOnPath(deps: SetupDeps, spec: Spec, command: string): RequirementResult {
  const resolved = resolveCommand(deps, command)
  if (!resolved) return missing(spec)
  const result = runResolved(deps, resolved, [VERSION_FLAG])
  return succeeded(result) ? evaluate(spec, resolved.path, result.stdout) : missing(spec, resolved.path)
}

export function checkClaude(deps: SetupDeps): RequirementResult {
  return checkOnPath(deps, CLAUDE, 'claude')
}

export function checkGit(deps: SetupDeps): RequirementResult {
  return checkOnPath(deps, GIT, 'git')
}

/** Blender pelo mesmo localizador do auto-rig (sem preferência do Studio: o instalador não tem). */
export function checkBlender(deps: SetupDeps): RequirementResult {
  const location = locateBlender({
    preference: null,
    env: deps.env,
    platform: deps.platform,
    exists: deps.exists,
    listDirs: deps.listDirs,
  })
  if (!location) return missing(BLENDER)
  const result = deps.run(location.path, [VERSION_FLAG])
  if (succeeded(result)) return evaluate(BLENDER, location.path, result.stdout)
  // `blender` do PATH (Linux) que não abriu = não instalado; caminho concreto que não abriu = instalação quebrada
  return location.source === 'path' ? missing(BLENDER) : missing(BLENDER, location.path)
}

export function checkRequirements(deps: SetupDeps): RequirementResult[] {
  return [checkClaude(deps), checkBlender(deps), checkGit(deps)]
}

/** Os obrigatórios para IA estão ok (os recomendados não mudam o código de saída). */
export function requiredOk(results: readonly RequirementResult[]): boolean {
  return results.every((r) => r.level !== 'required-for-ai' || r.ok)
}
