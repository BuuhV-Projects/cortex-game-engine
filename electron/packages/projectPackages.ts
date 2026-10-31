import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { PACKAGE_ID_RE, PACKAGE_VERSION_RE } from '../../src/io/packages/manifest.js'

/**
 * Dependências de pacote declaradas pelo jogo (SPEC-0641): `cortex.json#packages`
 * e o lock `cortex-packages.lock.json`. Só lê/grava esses dois arquivos.
 */

/** Org padrão dos repos de pacote (a mesma da engine). */
export const DEFAULT_PACKAGE_OWNER = 'BuuhV-Projects'

export interface DeclaredPackage {
  id: string
  version: string
  /** `<owner>/<repo>` no GitHub. */
  repo: string
}

export type PackageLock = Record<string, { version: string; sha256: string }>

const stripBom = (s: string): string => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s)

async function readJson(file: string): Promise<Record<string, unknown>> {
  try {
    const raw = JSON.parse(stripBom(await readFile(file, 'utf-8')))
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const writeJson = (file: string, data: unknown): Promise<void> =>
  writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf-8')

/**
 * Lê `cortex.json#packages`. Aceita `"id": "1.0.0"` ou
 * `"id": { "version": "1.0.0", "repo": "owner/nome" }`. Entradas inválidas são
 * devolvidas em `errors` (não derrubam as outras).
 */
export async function readDeclaredPackages(projectDir: string): Promise<{ packages: DeclaredPackage[]; errors: string[] }> {
  const cfg = await readJson(join(projectDir, 'cortex.json'))
  const raw = cfg.packages
  const packages: DeclaredPackage[] = []
  const errors: string[] = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { packages, errors }
  for (const [id, spec] of Object.entries(raw as Record<string, unknown>)) {
    const obj = typeof spec === 'string' ? { version: spec } : (spec as { version?: unknown; repo?: unknown } | null)
    const version = typeof obj?.version === 'string' ? obj.version : ''
    const repo = typeof obj?.repo === 'string' ? obj.repo : `${DEFAULT_PACKAGE_OWNER}/${id}`
    if (!PACKAGE_ID_RE.test(id)) errors.push(`${id}: id inválido`)
    else if (!PACKAGE_VERSION_RE.test(version)) errors.push(`${id}: versão deve ser exata (X.Y.Z)`)
    else if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) errors.push(`${id}: repo deve ser "owner/nome"`)
    else packages.push({ id, version, repo })
  }
  return { packages, errors }
}

/** Adiciona/atualiza (`version` string) ou remove (`null`) uma entrada, preservando o resto. */
export async function setDeclaredPackage(projectDir: string, id: string, version: string | null): Promise<void> {
  const file = join(projectDir, 'cortex.json')
  const cfg = await readJson(file)
  const pkgs = { ...((cfg.packages as Record<string, unknown> | undefined) ?? {}) }
  if (version === null) delete pkgs[id]
  else {
    const prev = pkgs[id]
    pkgs[id] = prev && typeof prev === 'object' ? { ...(prev as object), version } : version
  }
  if (Object.keys(pkgs).length) cfg.packages = pkgs
  else delete cfg.packages
  await writeJson(file, cfg)
}

export async function readLock(projectDir: string): Promise<PackageLock> {
  return (await readJson(join(projectDir, 'cortex-packages.lock.json'))) as PackageLock
}

export async function writeLock(projectDir: string, lock: PackageLock): Promise<void> {
  const sorted = Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b)))
  await writeJson(join(projectDir, 'cortex-packages.lock.json'), sorted)
}
