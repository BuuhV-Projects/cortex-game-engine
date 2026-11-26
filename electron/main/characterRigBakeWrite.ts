/**
 * Gravação do assado do auto-rig no jogo (SPEC-0704): o GLB e o JSON do skin juntos, só dentro do
 * projeto, sem deixar o par pela metade. Cada arquivo vai para `<arquivo>.tmp`; o par atual é copiado
 * para a pasta de backup, fora do projeto (SPEC-0745); depois os `.tmp` trocam de nome. Uma falha antes da
 * troca não toca no par atual.
 */
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { basename, isAbsolute, join, relative, resolve, sep } from 'path'

/** Sufixos dos arquivos de passagem e de backup. */
export const BAKE_TMP_SUFFIX = '.tmp'
export const BAKE_BACKUP_SUFFIX = '.bak'
/** Pasta, dentro da temporária do sistema, onde fica o par anterior (nada de `.bak` no checkout do jogo). */
export const BAKE_BACKUP_DIR = 'cortex-rig-backup'
const GLB_EXT = /\.glb$/i
const JSON_EXT = /\.json$/i

/** Pasta padrão do backup do par anterior. */
export function defaultBackupDir(): string {
  return join(tmpdir(), BAKE_BACKUP_DIR)
}

/** Caminho absoluto de `rel` dentro de `projectDir`; lança se sair do projeto. */
export function insideProject(projectDir: string, rel: string): string {
  const root = resolve(projectDir)
  const abs = resolve(root, rel)
  const back = relative(root, abs)
  // sobe de pasta só quando o primeiro segmento é '..' (um arquivo '..fundo.glb' é legítimo)
  if (!back || back === '..' || back.startsWith(`..${sep}`) || isAbsolute(back)) throw new Error(`caminho fora do projeto: ${rel}`)
  return abs
}

/**
 * Grava o par (GLB binário + JSON texto) com backup do par anterior em `backupDir`. Devolve os caminhos
 * absolutos. `rename` e `backupDir` só mudam nos testes.
 */
export function writeBakePair(
  projectDir: string,
  glbRel: string,
  jsonRel: string,
  glb: Uint8Array,
  json: string,
  rename: (from: string, to: string) => void = renameSync,
  backupDir: string = defaultBackupDir(),
): { glb: string; json: string } {
  if (!GLB_EXT.test(glbRel) || !JSON_EXT.test(jsonRel)) throw new Error('o assado grava um .glb e um .json')
  const stamp = Date.now()
  const files = [
    { path: insideProject(projectDir, glbRel), data: glb },
    { path: insideProject(projectDir, jsonRel), data: json },
  ].map((f) => ({ ...f, backup: join(backupDir, `${basename(f.path)}.${stamp}${BAKE_BACKUP_SUFFIX}`) }))
  try {
    for (const f of files) writeFileSync(f.path + BAKE_TMP_SUFFIX, f.data)
    const had = files.map((f) => existsSync(f.path))
    if (had.some(Boolean)) mkdirSync(backupDir, { recursive: true })
    files.forEach((f, i) => had[i] && copyFileSync(f.path, f.backup))
    const swapped: number[] = []
    try {
      files.forEach((f, i) => {
        rename(f.path + BAKE_TMP_SUFFIX, f.path)
        swapped.push(i)
      })
    } catch (err) {
      // um trocado e o outro não: volta o trocado ao par anterior (o backup), ou some se não havia
      for (const i of swapped) {
        const f = files[i]!
        if (had[i]) copyFileSync(f.backup, f.path)
        else rmSync(f.path, { force: true })
      }
      throw err
    }
  } finally {
    for (const f of files) rmSync(f.path + BAKE_TMP_SUFFIX, { force: true })
  }
  return { glb: files[0]!.path, json: files[1]!.path }
}
