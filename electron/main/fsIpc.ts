/**
 * Handlers IPC — sistema de arquivos do projeto (`fs:*`). SPEC-0693.
 */
import { ipcMain } from 'electron'
import { join } from 'path'
import { readdir, readFile, writeFile, mkdir, rename, rm } from 'fs/promises'
import { watch, type FSWatcher } from 'fs'
import { sendToRenderer, validatePath } from './shared.js'

/**
 * Lista recursivamente todos os arquivos-fonte do projeto (.ts/.tsx/.js/.jsx),
 * pulando diretórios que não devem alimentar o TypeScript service do Monaco
 * (build outputs, dependências, engine vendoriado — esse último tem types
 * próprios carregados via `engine:readTypes`).
 *
 * Usado pelo Editor pra pre-criar models de todos os fontes do projeto e
 * habilitar Ctrl+click em imports de arquivos que o usuário ainda não abriu
 * manualmente. Sem isso, o TS service não sabe que esses arquivos existem
 * e a navegação falha silenciosamente.
 */
const PROJECT_SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const PROJECT_EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  'dist-engine',
  'dist-app',
  'build',
  'src-tauri',
  'vendor',
  '.git',
  '.cortex',
  'coverage',
])

// Observa o diretório do projeto (fs.watch recursivo) e avisa o renderer a cada
// mudança no disco — a árvore de Projeto atualiza em TEMPO REAL (criar/apagar/
// salvar/git/build). Um watcher por vez (troca ao abrir outro projeto). Ignora
// ruído (node_modules/.git/dist) e faz debounce de rajadas no lado do renderer.
let projectWatcher: FSWatcher | null = null
const WATCH_IGNORE = /(^|[\\/])(node_modules|\.git|dist|\.cortex)([\\/]|$)/

/** Valida um nome de arquivo/pasta vindo do renderer (sem separadores de path). */
function validateEntryName(name: unknown): string {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('name deve ser uma string não vazia')
  }
  if (name.includes('/') || name.includes('\\') || name.includes('\0')) {
    throw new Error('name não pode conter separadores de path')
  }
  return name.trim()
}

export function registerFsIpc(): void {
  ipcMain.handle('fs:listProjectFiles', async (_event, projectDir: unknown) => {
    const safeDir = validatePath(projectDir)
    const out: string[] = []

    async function walk(dir: string): Promise<void> {
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (PROJECT_EXCLUDED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
          await walk(join(dir, entry.name))
        } else if (entry.isFile()) {
          const dot = entry.name.lastIndexOf('.')
          const ext = dot >= 0 ? entry.name.slice(dot) : ''
          if (PROJECT_SOURCE_EXTENSIONS.has(ext)) {
            out.push(join(dir, entry.name))
          }
        }
      }
    }

    await walk(safeDir)
    return out
  })

  // Retorna as entradas de um diretório como { name, path, isDir }[]
  ipcMain.handle('fs:readDir', async (_event, dirPath: unknown) => {
    const safePath = validatePath(dirPath)
    const entries = await readdir(safePath, { withFileTypes: true })
    return entries.map((entry) => ({
      name: entry.name,
      path: join(safePath, entry.name),
      isDir: entry.isDirectory(),
    }))
  })

  ipcMain.handle('fs:watchProject', (_event, projectDir: unknown) => {
    const safeDir = validatePath(projectDir)
    if (projectWatcher) {
      projectWatcher.close()
      projectWatcher = null
    }
    try {
      // recursive: suportado em Windows e macOS (o público-alvo do Studio).
      projectWatcher = watch(safeDir, { recursive: true }, (_type, filename) => {
        if (filename && WATCH_IGNORE.test(String(filename))) return
        sendToRenderer('project:files-changed')
      })
    } catch {
      /* fs.watch pode falhar (dir removido/sem suporte) — sem real-time, mas o app segue */
    }
  })

  // Lê o conteúdo de um arquivo como texto UTF-8
  ipcMain.handle('fs:readFile', async (_event, filePath: unknown) => {
    const safePath = validatePath(filePath)
    return readFile(safePath, 'utf-8')
  })

  // Lê um arquivo binário (ex.: imagem) como base64 — usado pelo preview de imagem
  // do editor (renderizar via data URL, sem depender de file:// no renderer).
  ipcMain.handle('fs:readFileBase64', async (_event, filePath: unknown) => {
    const safePath = validatePath(filePath)
    return (await readFile(safePath)).toString('base64')
  })

  // Move (renomeia) um arquivo/pasta. Usado pelo drag & drop do FileTree para
  // reorganizar itens entre pastas do projeto (SPEC-0016).
  ipcMain.handle('fs:move', async (_event, src: unknown, dest: unknown) => {
    const safeSrc = validatePath(src)
    const safeDest = validatePath(dest)
    await rename(safeSrc, safeDest)
  })

  // Apaga um arquivo ou pasta recursivamente. Usado pelo menu de contexto
  // do FileTree (SPEC-0016). A confirmação fica no renderer.
  ipcMain.handle('fs:delete', async (_event, targetPath: unknown) => {
    const safePath = validatePath(targetPath)
    await rm(safePath, { recursive: true, force: false })
  })

  // Cria uma pasta em <dirPath>/<name>. Mesmo padrão de validação do
  // fs:createFile. Rejeita se já existir (mkdir sem recursive). SPEC-0015.
  ipcMain.handle('fs:createDir', async (_event, dirPath: unknown, name: unknown) => {
    const safeDir = validatePath(dirPath)
    const entryName = validateEntryName(name)
    const dirPathFull = join(safeDir, entryName)
    try {
      await mkdir(dirPathFull, { recursive: false })
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === 'EEXIST') {
        throw new Error(`Pasta já existe: ${name}`)
      }
      throw err
    }
    return dirPathFull
  })

  // Cria um arquivo vazio em <dirPath>/<name>. Rejeita se já existir ou se
  // `name` contiver separadores de path (impede path traversal).
  ipcMain.handle('fs:createFile', async (_event, dirPath: unknown, name: unknown) => {
    const safeDir = validatePath(dirPath)
    const entryName = validateEntryName(name)
    const filePath = join(safeDir, entryName)
    try {
      // wx flag: rejeita se já existir
      await writeFile(filePath, '', { encoding: 'utf-8', flag: 'wx' })
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === 'EEXIST') {
        throw new Error(`Arquivo já existe: ${name}`)
      }
      throw err
    }
    return filePath
  })

  // Escreve conteúdo em um arquivo (sobrescreve).
  // A restrição anterior a userData/projects/ foi removida: o IDE permite que
  // o usuário crie projetos em qualquer pasta (ver dialog:openDirectory). A
  // validação se reduz a `validatePath` (resolve absoluto + rejeita byte nulo);
  // o controle de acesso fica por conta do FS do SO.
  ipcMain.handle('fs:writeFile', async (_event, filePath: unknown, content: unknown) => {
    const safePath = validatePath(filePath)
    if (typeof content !== 'string') {
      throw new Error('content deve ser uma string')
    }
    await writeFile(safePath, content, 'utf-8')
  })
}
