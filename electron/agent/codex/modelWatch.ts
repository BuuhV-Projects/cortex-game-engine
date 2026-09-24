import { stat } from 'node:fs/promises'
import { join } from 'node:path'

import { listProjectFiles } from './projectFiles.js'

/**
 * Quais modelos `.glb` um turno do modo Modelagem criou ou alterou (SPEC-0267).
 *
 * Compara o DISCO antes e depois, e não os eventos `file_change` do Codex: o
 * Astra também gera modelo rodando Blender por comando de shell, e isso não
 * aparece como `file_change`.
 */

const MODEL_EXTENSIONS: ReadonlySet<string> = new Set(['.glb'])

/** Tamanho e data de cada `.glb`, por caminho relativo. */
export type ModelSnapshot = Map<string, { size: number; mtimeMs: number }>

export async function snapshotModels(root: string): Promise<ModelSnapshot> {
  const snapshot: ModelSnapshot = new Map()
  for (const rel of await listProjectFiles(root, MODEL_EXTENSIONS)) {
    const s = await stat(join(root, rel))
    snapshot.set(rel, { size: s.size, mtimeMs: s.mtimeMs })
  }
  return snapshot
}

/** Os `.glb` novos ou alterados desde a foto, em caminho relativo. */
export async function changedModels(root: string, before: ModelSnapshot): Promise<string[]> {
  const after = await snapshotModels(root)
  const changed: string[] = []
  for (const [rel, now] of after) {
    const was = before.get(rel)
    if (!was || was.size !== now.size || was.mtimeMs !== now.mtimeMs) changed.push(rel)
  }
  return changed.sort()
}
