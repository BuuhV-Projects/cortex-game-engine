import { readdir } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

/**
 * Pastas que a varredura do projeto NUNCA desce (SPEC-0266): dependências,
 * saídas de build e artefatos de validação. Descer nelas faria o guarda do
 * modo Modelagem ler milhares de arquivos que o agente não deve tocar.
 */
export const IGNORED_DIRS = new Set(['node_modules', 'vendor', 'dist', 'out', '.git', '.cortex'])

/**
 * Lista os arquivos do projeto com uma das `extensions`, em caminho RELATIVO
 * à raiz e com `/` como separador.
 */
export async function listProjectFiles(root: string, extensions: ReadonlySet<string>): Promise<string[]> {
  const found: string[] = []
  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return // pasta sumiu no meio da varredura ou sem permissão: ignora
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) await walk(full)
      } else if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) {
        found.push(relative(root, full).split('\\').join('/'))
      }
    }
  }
  await walk(root)
  return found
}
