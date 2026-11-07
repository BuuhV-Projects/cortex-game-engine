/**
 * Gravação do assado do auto-rig no jogo (SPEC-0704): o GLB e o JSON do skin juntos, só dentro do
 * projeto, sem deixar o par pela metade. Cada arquivo vai para `<arquivo>.tmp`; o par atual vira
 * `<arquivo>.bak`; depois os `.tmp` trocam de nome. Uma falha antes da troca não toca no par atual.
 */
import { copyFileSync, existsSync, renameSync, rmSync, writeFileSync } from 'fs'
import { isAbsolute, relative, resolve } from 'path'

/** Sufixos dos arquivos de passagem e de backup. */
export const BAKE_TMP_SUFFIX = '.tmp'
export const BAKE_BACKUP_SUFFIX = '.bak'
const GLB_EXT = /\.glb$/i
const JSON_EXT = /\.json$/i

/** Caminho absoluto de `rel` dentro de `projectDir`; lança se sair do projeto. */
export function insideProject(projectDir: string, rel: string): string {
  const root = resolve(projectDir)
  const abs = resolve(root, rel)
  const back = relative(root, abs)
  if (!back || back.startsWith('..') || isAbsolute(back)) throw new Error(`caminho fora do projeto: ${rel}`)
  return abs
}

/** Grava o par (GLB binário + JSON texto) com backup do par anterior. Devolve os caminhos absolutos. */
export function writeBakePair(projectDir: string, glbRel: string, jsonRel: string, glb: Uint8Array, json: string): { glb: string; json: string } {
  if (!GLB_EXT.test(glbRel) || !JSON_EXT.test(jsonRel)) throw new Error('o assado grava um .glb e um .json')
  const files = [
    { path: insideProject(projectDir, glbRel), data: glb },
    { path: insideProject(projectDir, jsonRel), data: json },
  ]
  try {
    for (const f of files) writeFileSync(f.path + BAKE_TMP_SUFFIX, f.data)
    for (const f of files) if (existsSync(f.path)) copyFileSync(f.path, f.path + BAKE_BACKUP_SUFFIX)
    for (const f of files) renameSync(f.path + BAKE_TMP_SUFFIX, f.path)
  } finally {
    for (const f of files) rmSync(f.path + BAKE_TMP_SUFFIX, { force: true })
  }
  return { glb: files[0]!.path, json: files[1]!.path }
}
