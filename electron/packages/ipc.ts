import type { IpcMain, WebContents } from 'electron'
import { join } from 'path'
import { ghReleaseDownloader, httpsReleaseDownloader } from './downloaders.js'
import { installPackage, readInstalledManifest, syncPackages, uninstallPackage, type InstallerDeps } from './installer.js'
import { readDeclaredPackages, setDeclaredPackage } from './projectPackages.js'
import { PACKAGE_ID_RE, PACKAGE_VERSION_RE } from '../../src/io/packages/manifest.js'

/**
 * IPC dos pacotes de textura (SPEC-0641 §4):
 * - `packages:list(projectDir)` → declarados + estado instalado;
 * - `packages:sync(projectDir)` → instala o que falta (abrir projeto chama isto);
 * - `packages:add(projectDir, id, version)` / `packages:remove(projectDir, id)`.
 * Progresso vai por `packages:progress` pra janela que pediu.
 */

export interface PackageIpcOptions {
  validatePath: (p: unknown) => string
  /** Pasta do cache global (`%LOCALAPPDATA%/cortex/packages`). */
  cacheDir: string
}

function depsFor(sender: WebContents, cacheDir: string): InstallerDeps {
  return {
    downloaders: [httpsReleaseDownloader, ghReleaseDownloader],
    cacheDir,
    onProgress: (msg) => {
      if (!sender.isDestroyed()) sender.send('packages:progress', msg)
    },
  }
}

export function registerPackageIpc(ipcMain: IpcMain, opts: PackageIpcOptions): void {
  ipcMain.handle('packages:list', async (_event, projectDir: unknown) => {
    const dir = opts.validatePath(projectDir)
    const { packages, errors } = await readDeclaredPackages(dir)
    const items = await Promise.all(
      packages.map(async (p) => {
        const m = await readInstalledManifest(dir, p.id)
        return {
          ...p,
          installedVersion: m?.version ?? null,
          name: m?.name ?? p.id,
          materials: m?.materials.length ?? 0,
          redistributable: m?.license.redistributable ?? null,
        }
      }),
    )
    return { items, errors }
  })

  ipcMain.handle('packages:sync', async (event, projectDir: unknown) =>
    syncPackages(opts.validatePath(projectDir), depsFor(event.sender, opts.cacheDir)),
  )

  ipcMain.handle('packages:add', async (event, projectDir: unknown, id: unknown, version: unknown) => {
    const dir = opts.validatePath(projectDir)
    if (typeof id !== 'string' || !PACKAGE_ID_RE.test(id)) throw new Error('id de pacote inválido')
    if (typeof version !== 'string' || !PACKAGE_VERSION_RE.test(version)) throw new Error('versão deve ser X.Y.Z')
    await setDeclaredPackage(dir, id, version)
    const pkg = (await readDeclaredPackages(dir)).packages.find((p) => p.id === id)
    if (!pkg) throw new Error(`não consegui declarar ${id}`)
    return installPackage(dir, pkg, depsFor(event.sender, opts.cacheDir))
  })

  ipcMain.handle('packages:remove', async (_event, projectDir: unknown, id: unknown) => {
    const dir = opts.validatePath(projectDir)
    if (typeof id !== 'string' || !PACKAGE_ID_RE.test(id)) throw new Error('id de pacote inválido')
    await setDeclaredPackage(dir, id, null)
    await uninstallPackage(dir, id)
    return { ok: true }
  })
}

/**
 * Abrir projeto instala o que falta (SPEC-0641 §4.4). Fire-and-forget: erro vira
 * `packages:progress` com `stage: 'error'`, nunca derruba a abertura.
 */
export async function syncOnOpen(sender: WebContents, projectDir: string, cacheDir: string): Promise<void> {
  const { packages } = await readDeclaredPackages(projectDir)
  if (!packages.length) return
  const { results } = await syncPackages(projectDir, depsFor(sender, cacheDir))
  for (const r of results) {
    if (r.status === 'error' && !sender.isDestroyed()) {
      sender.send('packages:progress', { id: r.id, stage: 'error', error: r.error })
    }
  }
}

/** Pasta padrão do cache de pacotes, por usuário. */
export const defaultPackageCacheDir = (localAppData: string): string => join(localAppData, 'cortex', 'packages')
