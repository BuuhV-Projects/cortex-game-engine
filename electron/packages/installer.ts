import { join, dirname } from 'path'
import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { createHash } from 'crypto'
import { parsePackageManifest, type PackageManifest } from '../../src/io/packages/manifest.js'
import { readZip } from './zipReader.js'
import { readDeclaredPackages, readLock, writeLock, type DeclaredPackage } from './projectPackages.js'

/**
 * Instalador de pacotes de textura (ADR-0640 / SPEC-0641): baixa o zip do
 * GitHub Release na versão pinada, confere o SHA-256 e extrai em
 * `assets/packages/<id>/`. Rede e `gh` são injetados (testável, e o Studio nunca
 * toca em token — o `gh` do usuário cuida da autenticação de repo privado).
 */

/** Baixa um asset do Release. `null` = não achou (404 / repo privado sem acesso). */
export type AssetDownloader = (repo: string, tag: string, file: string) => Promise<Uint8Array | null>

export interface InstallerDeps {
  /** Downloaders tentados em ordem (ex.: HTTPS público, depois `gh`). */
  downloaders: AssetDownloader[]
  /** Cache global de zips: `<cacheDir>/<id>/<versão>.zip`. */
  cacheDir: string
  onProgress?: (msg: { id: string; stage: 'check' | 'download' | 'extract' | 'done' | 'skip' }) => void
}

export interface InstallResult {
  id: string
  version: string
  status: 'installed' | 'up-to-date' | 'error'
  error?: string
}

export const RELEASE_MANIFEST = 'cortex-package.json'
export const packageDir = (projectDir: string, id: string): string => join(projectDir, 'assets', 'packages', id)
const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')

/** Manifesto do pacote já instalado no projeto, ou null. */
export async function readInstalledManifest(projectDir: string, id: string): Promise<PackageManifest | null> {
  try {
    return parsePackageManifest(JSON.parse(await readFile(join(packageDir(projectDir, id), RELEASE_MANIFEST), 'utf-8')))
  } catch {
    return null
  }
}

async function download(deps: InstallerDeps, pkg: DeclaredPackage, file: string): Promise<Uint8Array> {
  const tag = `v${pkg.version}`
  for (const dl of deps.downloaders) {
    const bytes = await dl(pkg.repo, tag, file)
    if (bytes) return bytes
  }
  throw new Error(`${file} não encontrado no release ${tag} de ${pkg.repo} (repo privado precisa do "gh auth login")`)
}

async function readCached(file: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(file))
  } catch {
    return null
  }
}

/** Obtém o zip (cache ou download), validado contra o SHA-256 esperado. */
async function obtainArchive(deps: InstallerDeps, pkg: DeclaredPackage, lockedSha: string | undefined): Promise<Uint8Array> {
  const cacheFile = join(deps.cacheDir, pkg.id, `${pkg.version}.zip`)
  const cached = await readCached(cacheFile)
  if (cached && lockedSha && sha256(cached) === lockedSha) return cached

  const release = parsePackageManifest(JSON.parse(Buffer.from(await download(deps, pkg, RELEASE_MANIFEST)).toString('utf-8')))
  if (release.id !== pkg.id || release.version !== pkg.version || !release.archive) {
    throw new Error(`manifesto do release não bate com ${pkg.id}@${pkg.version}`)
  }
  const expected = release.archive.sha256
  if (lockedSha && lockedSha !== expected) {
    throw new Error(`SHA-256 do release mudou desde o lock (${lockedSha.slice(0, 12)}… → ${expected.slice(0, 12)}…)`)
  }
  const bytes = cached && sha256(cached) === expected ? cached : await download(deps, pkg, release.archive.file)
  const got = sha256(bytes)
  if (got !== expected) throw new Error(`SHA-256 do zip não confere (esperado ${expected.slice(0, 12)}…, veio ${got.slice(0, 12)}…)`)
  if (bytes !== cached) {
    await mkdir(dirname(cacheFile), { recursive: true })
    await writeFile(cacheFile, bytes)
  }
  return bytes
}

/** Extrai numa pasta temporária ao lado e troca atômico pela pasta final. */
async function extractTo(projectDir: string, pkg: DeclaredPackage, bytes: Uint8Array): Promise<void> {
  const entries = readZip(bytes)
  const inner = entries.find((e) => e.path === RELEASE_MANIFEST)
  if (!inner) throw new Error('zip sem cortex-package.json na raiz')
  const m = parsePackageManifest(JSON.parse(Buffer.from(inner.data).toString('utf-8')))
  if (m.id !== pkg.id || m.version !== pkg.version) throw new Error(`zip é de ${m.id}@${m.version}, esperado ${pkg.id}@${pkg.version}`)

  const final = packageDir(projectDir, pkg.id)
  const tmp = `${final}.tmp-${process.pid}`
  await rm(tmp, { recursive: true, force: true })
  for (const e of entries) {
    const out = join(tmp, ...e.path.split('/'))
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, e.data)
  }
  await rm(final, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  await rename(tmp, final)
}

/** Instala/atualiza um pacote. Já instalado na versão certa = no-op. */
export async function installPackage(projectDir: string, pkg: DeclaredPackage, deps: InstallerDeps): Promise<InstallResult> {
  const base = { id: pkg.id, version: pkg.version }
  try {
    deps.onProgress?.({ id: pkg.id, stage: 'check' })
    const lock = await readLock(projectDir)
    const installed = await readInstalledManifest(projectDir, pkg.id)
    if (installed?.version === pkg.version && lock[pkg.id]?.version === pkg.version) {
      deps.onProgress?.({ id: pkg.id, stage: 'skip' })
      return { ...base, status: 'up-to-date' }
    }
    const locked = lock[pkg.id]?.version === pkg.version ? lock[pkg.id].sha256 : undefined
    deps.onProgress?.({ id: pkg.id, stage: 'download' })
    const bytes = await obtainArchive(deps, pkg, locked)
    deps.onProgress?.({ id: pkg.id, stage: 'extract' })
    await extractTo(projectDir, pkg, bytes)
    await writeLock(projectDir, { ...(await readLock(projectDir)), [pkg.id]: { version: pkg.version, sha256: sha256(bytes) } })
    deps.onProgress?.({ id: pkg.id, stage: 'done' })
    return { ...base, status: 'installed' }
  } catch (err) {
    return { ...base, status: 'error', error: err instanceof Error ? err.message : String(err) }
  }
}

/** Instala tudo que o `cortex.json` declara (sequencial — download grande, um de cada vez). */
export async function syncPackages(projectDir: string, deps: InstallerDeps): Promise<{ results: InstallResult[]; errors: string[] }> {
  const { packages, errors } = await readDeclaredPackages(projectDir)
  const results: InstallResult[] = []
  for (const pkg of packages) results.push(await installPackage(projectDir, pkg, deps))
  return { results, errors }
}

/** Remove a pasta e a entrada do lock (a declaração no cortex.json é com `setDeclaredPackage`). */
export async function uninstallPackage(projectDir: string, id: string): Promise<void> {
  await rm(packageDir(projectDir, id), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  const lock = await readLock(projectDir)
  delete lock[id]
  await writeLock(projectDir, lock)
}
