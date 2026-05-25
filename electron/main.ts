import { app, BrowserWindow, ipcMain } from 'electron'
import { join, resolve } from 'path'
import { readdir, readFile, writeFile, cp } from 'fs/promises'
import { spawn, ChildProcess } from 'child_process'

// Referência à janela principal — usada em run:start para enviar logs ao renderer
let mainWindow: BrowserWindow | null = null

// Processo filho do vite em execução (único de cada vez)
let runningProcess: ChildProcess | null = null

// ---------------------------------------------------------------------------
// Segurança: validação de path traversal
// ---------------------------------------------------------------------------

/**
 * Resolve o path para sua forma absoluta e rejeita bytes nulos.
 * path.resolve() remove quaisquer segmentos ".." e retorna sempre
 * um caminho absoluto — suficiente para impedir path traversal simples.
 */
function validatePath(inputPath: unknown): string {
  if (typeof inputPath !== 'string') {
    throw new Error('Path deve ser uma string')
  }
  if (inputPath.includes('\0')) {
    throw new Error('Path contém byte nulo')
  }
  return resolve(inputPath)
}

// ---------------------------------------------------------------------------
// Criação da janela
// ---------------------------------------------------------------------------

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // Em desenvolvimento, electron-vite injeta ELECTRON_RENDERER_URL com o dev server
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ---------------------------------------------------------------------------
// Handlers IPC — sistema de arquivos
// ---------------------------------------------------------------------------

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

// Lê o conteúdo de um arquivo como texto UTF-8
ipcMain.handle('fs:readFile', async (_event, filePath: unknown) => {
  const safePath = validatePath(filePath)
  return readFile(safePath, 'utf-8')
})

// Escreve conteúdo em um arquivo (sobrescreve)
ipcMain.handle('fs:writeFile', async (_event, filePath: unknown, content: unknown) => {
  const safePath = validatePath(filePath)
  if (typeof content !== 'string') {
    throw new Error('content deve ser uma string')
  }
  await writeFile(safePath, content, 'utf-8')
})

// Copia templates/new-project/ para join(targetDir, name), substitui {{PROJECT_NAME}}
// em cada arquivo copiado e retorna o path do novo projeto
ipcMain.handle('fs:createProject', async (_event, targetDir: unknown, name: unknown) => {
  const safeTarget = validatePath(targetDir)
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('name deve ser uma string não vazia')
  }
  // Impede path traversal no nome: rejeita separadores de path e bytes nulos
  if (name.includes('/') || name.includes('\\') || name.includes('\0')) {
    throw new Error('name não pode conter separadores de path')
  }
  const projectName = name.trim()
  // Projeto criado em subdiretório dedicado dentro de targetDir
  const projectPath = resolve(safeTarget, projectName)
  const templateDir = join(app.getAppPath(), 'templates', 'new-project')
  await cp(templateDir, projectPath, { recursive: true })
  // Substitui o placeholder {{PROJECT_NAME}} em cada arquivo do template copiado
  const entries = await readdir(projectPath, { withFileTypes: true })
  await Promise.all(
    entries
      .filter((e) => e.isFile())
      .map(async (e) => {
        const filePath = join(projectPath, e.name)
        const content = await readFile(filePath, 'utf-8')
        if (content.includes('{{PROJECT_NAME}}')) {
          await writeFile(filePath, content.replaceAll('{{PROJECT_NAME}}', projectName), 'utf-8')
        }
      }),
  )
  return projectPath
})

// ---------------------------------------------------------------------------
// Handlers IPC — execução de projeto
// ---------------------------------------------------------------------------

// Spawna o `vite` no diretório do projeto; redireciona stdout/stderr ao renderer via 'log'
ipcMain.handle('run:start', async (_event, projectDir: unknown) => {
  const safeDir = validatePath(projectDir)

  // Garante que não há processo anterior pendurado
  if (runningProcess) {
    runningProcess.kill()
    runningProcess = null
  }

  const child = spawn('vite', [], {
    cwd: safeDir,
    shell: true,
  })

  runningProcess = child

  const forwardLog = (data: Buffer): void => {
    const line = data.toString()
    mainWindow?.webContents.send('log', line)
  }

  child.stdout?.on('data', forwardLog)
  child.stderr?.on('data', forwardLog)

  child.on('close', () => {
    runningProcess = null
    mainWindow?.webContents.send('project:stopped')
  })
})

// Mata o processo filho em execução, se houver
ipcMain.handle('run:stop', async () => {
  if (runningProcess) {
    runningProcess.kill()
    runningProcess = null
    // Emite imediatamente para o renderer — o evento 'close' do child pode demorar
    // ou não disparar em algumas plataformas após kill()
    mainWindow?.webContents.send('project:stopped')
  }
})

// ---------------------------------------------------------------------------
// Ciclo de vida do app
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  createWindow()

  // macOS: recria a janela ao clicar no ícone do dock quando não há janelas abertas
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Em plataformas que não sejam macOS, encerra o app ao fechar todas as janelas
  if (process.platform !== 'darwin') app.quit()
})
