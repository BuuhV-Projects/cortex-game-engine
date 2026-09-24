import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { listProjectFiles } from './projectFiles.js'

/**
 * Fronteira do modo Modelagem (ADR-0265 / SPEC-0266): o Astra trabalha em DADO
 * (cena, assets, materiais, efeitos declarados); código é do modo Codificar.
 *
 * A regra vai no preâmbulo do turno, mas é GARANTIDA aqui: o custo de o Astra
 * editar código não aparece na hora — o jogo pode até rodar — e o usuário não
 * saberia que a fronteira foi cruzada.
 */

/** O que conta como código do jogo. */
export const CODE_EXTENSIONS: ReadonlySet<string> = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

/** Conteúdo de cada arquivo de código, por caminho relativo. */
export type CodeSnapshot = Map<string, Buffer>

/** Fotografa o código do projeto antes do turno. */
export async function snapshotCode(root: string): Promise<CodeSnapshot> {
  const snapshot: CodeSnapshot = new Map()
  for (const rel of await listProjectFiles(root, CODE_EXTENSIONS)) {
    snapshot.set(rel, await readFile(join(root, rel)))
  }
  return snapshot
}

/**
 * Desfaz toda mudança de código desde a foto: reescreve o editado, recria o
 * apagado, apaga o criado.
 *
 * @returns os caminhos relativos desfeitos, em ordem — vazio se nada mudou.
 */
export async function restoreCode(root: string, snapshot: CodeSnapshot): Promise<string[]> {
  const reverted: string[] = []
  const now = new Set(await listProjectFiles(root, CODE_EXTENSIONS))

  for (const [rel, original] of snapshot) {
    const path = join(root, rel)
    if (now.has(rel)) {
      const current = await readFile(path)
      if (current.equals(original)) continue
    } else {
      await mkdir(dirname(path), { recursive: true })
    }
    await writeFile(path, original)
    reverted.push(rel)
  }
  for (const rel of now) {
    if (snapshot.has(rel)) continue
    await rm(join(root, rel), { force: true })
    reverted.push(rel)
  }
  return reverted.sort()
}
