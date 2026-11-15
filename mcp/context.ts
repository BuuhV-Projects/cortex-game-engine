import { existsSync, readdirSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { locateBlender } from '../electron/main/autoRig/blenderLocate.js'
import type { ToolContext } from './toolDef.js'

/**
 * Onde o servidor MCP acha os recursos do Studio e o projeto do jogo (SPEC-0737).
 *
 * Recursos: `CORTEX_RESOURCES`, ou a primeira pasta acima do script que tenha `kits/` ou `docs/`. No app
 * empacotado o script fica em `resources/mcp/` (→ `resources/`); no repo, em `out/mcp/` (→ raiz).
 */

const KITS_DIR = 'kits'
const DOCS_DIR = join('docs', 'cortex-game-engine')
/** Quantos níveis acima da pasta do script procurar os recursos. */
const MAX_RESOURCE_LEVELS = 3

export interface Resources {
  base: string | undefined
  kitsDir: string | undefined
  docsDir: string | undefined
}

export function findResources(scriptDir: string, env: NodeJS.ProcessEnv, exists = existsSync): Resources {
  const candidates: string[] = []
  if (env['CORTEX_RESOURCES']) candidates.push(env['CORTEX_RESOURCES'])
  let dir = scriptDir
  for (let i = 0; i < MAX_RESOURCE_LEVELS; i++) {
    dir = dirname(dir)
    candidates.push(dir)
  }
  const base = candidates.find((c) => exists(join(c, KITS_DIR)) || exists(join(c, DOCS_DIR)))
  if (!base) return { base: undefined, kitsDir: undefined, docsDir: undefined }
  return {
    base,
    kitsDir: exists(join(base, KITS_DIR)) ? join(base, KITS_DIR) : undefined,
    docsDir: exists(join(base, DOCS_DIR)) ? join(base, DOCS_DIR) : undefined,
  }
}

/** Blender pelo mesmo localizador do auto-rig (SPEC-0724); sem achar, o `blender` do PATH. */
export function resolveBlenderBin(env: NodeJS.ProcessEnv): string {
  const found = locateBlender({
    preference: null,
    env,
    platform: process.platform,
    exists: existsSync,
    listDirs: (p) => {
      try {
        return readdirSync(p, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
      } catch {
        return []
      }
    },
  })
  return found?.path ?? 'blender'
}

/** `projectDir` da chamada (absoluto ou relativo ao cwd) ou o próprio cwd. */
export function resolveProjectRoot(projectDir: string | undefined, cwd: string): string {
  if (!projectDir) return cwd
  return isAbsolute(projectDir) ? projectDir : resolve(cwd, projectDir)
}

/** `true` quando `path` (absoluto ou relativo à raiz) fica dentro de `root`. */
export function isInside(root: string, path: string): boolean {
  const abs = isAbsolute(path) ? path : resolve(root, path)
  const rel = relative(root, abs)
  const leaves = rel === '..' || rel.startsWith(`..${sep}`)
  return !leaves && !isAbsolute(rel)
}

export function buildContext(projectRoot: string, res: Resources, blenderBin: string): ToolContext {
  return { projectRoot, kitsDir: res.kitsDir, docsDir: res.docsDir, blenderBin }
}
