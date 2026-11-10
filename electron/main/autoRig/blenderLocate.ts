/**
 * Onde está o Blender do auto-rig do Studio (SPEC-0724): preferência do Studio, `BLENDER_PATH`, e as instalações
 * comuns. Puro (o sistema de arquivos entra por parâmetro), para testar as três plataformas.
 */
import { join } from 'path'

export type BlenderSource = 'preference' | 'env' | 'install' | 'path'

export interface BlenderLocation {
  path: string
  source: BlenderSource
}

export interface BlenderLocateDeps {
  preference: string | null | undefined
  env: NodeJS.ProcessEnv
  platform: NodeJS.Platform
  exists: (path: string) => boolean
  /** Pastas de um diretório (vazio se não existe). */
  listDirs: (path: string) => string[]
}

const WIN_FOLDER = 'Blender Foundation'
const WIN_EXE = 'blender.exe'
const MAC_APP = '/Applications/Blender.app/Contents/MacOS/Blender'
const PATH_COMMAND = 'blender'

/** `Blender 5.1` → [5, 1]; sem número = vazio (fica por último). */
function versionOf(folder: string): number[] {
  const m = /(\d+(?:\.\d+)*)/.exec(folder)
  return m ? m[1]!.split('.').map(Number) : []
}

function newerFirst(a: string, b: string): number {
  const va = versionOf(a)
  const vb = versionOf(b)
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const d = (vb[i] ?? -1) - (va[i] ?? -1)
    if (d) return d
  }
  return 0
}

/** `%ProgramFiles%\Blender Foundation\Blender <versão>\blender.exe`, a maior versão instalada. */
function windowsInstall(deps: BlenderLocateDeps): string | null {
  const roots = [deps.env['ProgramFiles'], deps.env['ProgramW6432'], deps.env['ProgramFiles(x86)']].filter((r): r is string => !!r)
  for (const root of new Set(roots)) {
    const base = join(root, WIN_FOLDER)
    for (const folder of deps.listDirs(base).sort(newerFirst)) {
      const exe = join(base, folder, WIN_EXE)
      if (deps.exists(exe)) return exe
    }
  }
  return null
}

/** O Blender a usar, ou `null` (no Windows, sem preferência, variável nem instalação). */
export function locateBlender(deps: BlenderLocateDeps): BlenderLocation | null {
  if (deps.preference && deps.exists(deps.preference)) return { path: deps.preference, source: 'preference' }
  const fromEnv = deps.env['BLENDER_PATH']
  if (fromEnv && deps.exists(fromEnv)) return { path: fromEnv, source: 'env' }
  if (deps.platform === 'win32') {
    const exe = windowsInstall(deps)
    return exe ? { path: exe, source: 'install' } : null
  }
  if (deps.platform === 'darwin' && deps.exists(MAC_APP)) return { path: MAC_APP, source: 'install' }
  // Linux (e macOS sem o .app): o `blender` do PATH; se não houver, o spawn falha e o Gerar sai com código 2
  return { path: PATH_COMMAND, source: 'path' }
}
