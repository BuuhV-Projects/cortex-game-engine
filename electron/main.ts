import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, resolve } from 'path'
import { readdir, readFile, writeFile, cp, mkdir } from 'fs/promises'
import { spawn, ChildProcess } from 'child_process'
import Anthropic from '@anthropic-ai/sdk'

// Referência à janela principal — usada em run:start para enviar logs ao renderer
let mainWindow: BrowserWindow | null = null

// Processo filho do vite em execução (único de cada vez)
let runningProcess: ChildProcess | null = null

// Processo do terminal embutido (independente do runningProcess — permite
// rodar `yarn install` enquanto o Play continua ativo). ADR-0012.
let terminalProcess: ChildProcess | null = null

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
      preload: join(__dirname, '../preload/index.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      // Necessário para preload ESM (.mjs). contextIsolation + nodeIntegration:false
      // continuam protegendo o renderer contra acesso direto ao Node.
      sandbox: false,
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

// Cria uma pasta em <dirPath>/<name>. Mesmo padrão de validação do
// fs:createFile. Rejeita se já existir (mkdir sem recursive). ADR-0015.
ipcMain.handle('fs:createDir', async (_event, dirPath: unknown, name: unknown) => {
  const safeDir = validatePath(dirPath)
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('name deve ser uma string não vazia')
  }
  if (name.includes('/') || name.includes('\\') || name.includes('\0')) {
    throw new Error('name não pode conter separadores de path')
  }
  const dirPathFull = join(safeDir, name.trim())
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
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('name deve ser uma string não vazia')
  }
  if (name.includes('/') || name.includes('\\') || name.includes('\0')) {
    throw new Error('name não pode conter separadores de path')
  }
  const filePath = join(safeDir, name.trim())
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

// Lista dos módulos de core/ecs vendoriados — fonte única usada tanto para
// copiar os .d.ts quanto para gerar o index.d.ts agregador. AI/CLI ficam fora
// porque dependem de SDKs Node-only que não fazem sentido no runtime do projeto.
const VENDOR_TYPE_MODULES = {
  core: [
    'GameLoop',
    'Renderer',
    'Scene',
    'AssetLoader',
    'AudioManager',
    'InputManager',
    'Physics',
  ],
  ecs: ['Entity', 'Component', 'System', 'World'],
} as const

/**
 * Vendoriza o engine dentro de <projectPath>/vendor/cortex-game-engine/:
 * - index.js: bundle único do engine (com three embutido), de dist-engine/
 * - core/*.d.ts e ecs/*.d.ts: types copiados de dist/src/
 * - index.d.ts: agregador minimal re-exportando só core+ecs
 *
 * Em dev o app.getAppPath() é a raiz do repo; em produção é o app.asar do build.
 * O electron-builder copia dist-engine/ e dist/src/ no pacote (ver
 * electron-builder.json#files).
 */
async function vendorEngine(projectPath: string): Promise<void> {
  const appPath = app.getAppPath()
  const vendorDir = join(projectPath, 'vendor', 'cortex-game-engine')
  await mkdir(vendorDir, { recursive: true })

  // Bundle do engine (JS)
  await cp(join(appPath, 'dist-engine', 'index.js'), join(vendorDir, 'index.js'))

  // Types: copia *.d.ts de cada módulo (ignora .d.ts.map e .js)
  for (const [subdir, modules] of Object.entries(VENDOR_TYPE_MODULES)) {
    await mkdir(join(vendorDir, subdir), { recursive: true })
    for (const mod of modules) {
      await cp(
        join(appPath, 'dist', 'src', subdir, `${mod}.d.ts`),
        join(vendorDir, subdir, `${mod}.d.ts`),
      )
    }
  }

  // index.d.ts agregador
  const reexports = Object.entries(VENDOR_TYPE_MODULES)
    .flatMap(([subdir, modules]) =>
      modules.map((mod) => `export * from './${subdir}/${mod}.js';`),
    )
    .join('\n')
  await writeFile(join(vendorDir, 'index.d.ts'), `${reexports}\n`, 'utf-8')
}

// Copia templates/new-project/ para join(targetDir, name), substitui {{PROJECT_NAME}}
// em cada arquivo copiado, vendoriza o engine em vendor/cortex-game-engine/ e
// retorna o path do novo projeto
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
  await vendorEngine(projectPath)
  return projectPath
})

/**
 * Lê recursivamente todos os .d.ts dentro de `rootDir`. `monacoBaseUri` é
 * prefixado em cada arquivo (ex.: 'file:///node_modules/three' + '/index.d.ts').
 * `navigable` determina se o renderer deve criar um Monaco model navegável
 * (Ctrl+click) ou apenas alimentar o TS service via addExtraLib.
 */
async function readDtsRecursive(
  rootDir: string,
  monacoBaseUri: string,
  navigable: boolean,
): Promise<EngineTypeFile[]> {
  const results: EngineTypeFile[] = []

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.name.endsWith('.d.ts')) {
        const content = await readFile(fullPath, 'utf-8')
        // Path relativo a rootDir, normalizado para `/` (Monaco usa POSIX)
        const rel = fullPath.slice(rootDir.length).replace(/\\/g, '/')
        results.push({ path: `${monacoBaseUri}${rel}`, content, navigable })
      }
    }
  }

  await walk(rootDir)
  return results
}

interface EngineTypeFile {
  path: string
  content: string
  /**
   * `true` para arquivos onde queremos suporte a Ctrl+click no Monaco —
   * cria um model navegável. Reservar para o conjunto pequeno do engine;
   * criar model para os ~946 arquivos de @types/three estoura o limite
   * de 200 listeners do Monaco e quebra o editor.
   */
  navigable: boolean
}

// Lê os .d.ts do engine + os types reais do `three` (de @types/three) e retorna
// pares { path, content, navigable } para o renderer alimentar o Monaco.
ipcMain.handle('engine:readTypes', async (): Promise<EngineTypeFile[]> => {
  const appPath = app.getAppPath()
  const results: EngineTypeFile[] = []

  // Types do three — só addExtraLib (resolução de tipos), sem createModel.
  // São ~946 arquivos; criar um model por arquivo passa do limite de 200
  // listeners do Monaco e dispara o erro "potential listener LEAK detected".
  const threeTypesDir = join(appPath, 'node_modules', '@types', 'three')
  const threeTypes = await readDtsRecursive(
    threeTypesDir,
    'file:///node_modules/three',
    /* navigable */ false,
  )
  results.push(...threeTypes)

  // Types do engine — navegáveis (cria model no Monaco para Ctrl+click)
  for (const [subdir, modules] of Object.entries(VENDOR_TYPE_MODULES)) {
    for (const mod of modules) {
      const fileContent = await readFile(
        join(appPath, 'dist', 'src', subdir, `${mod}.d.ts`),
        'utf-8',
      )
      results.push({
        path: `file:///node_modules/cortex-game-engine/${subdir}/${mod}.d.ts`,
        content: fileContent,
        navigable: true,
      })
    }
  }

  // index.d.ts agregador sem '.js' nos paths — moduleResolution default do
  // Monaco TS (Node legacy) não trata `.js` como mapeamento para `.d.ts`
  const reexports = Object.entries(VENDOR_TYPE_MODULES)
    .flatMap(([subdir, modules]) =>
      modules.map((mod) => `export * from './${subdir}/${mod}';`),
    )
    .join('\n')
  results.push({
    path: 'file:///node_modules/cortex-game-engine/index.d.ts',
    content: `${reexports}\n`,
    navigable: true,
  })

  // package.json virtual — o Node resolver do Monaco TS procura por ele
  // primeiro ao resolver `import 'cortex-game-engine'`. Sem isso, em alguns
  // cenários o fallback para index.d.ts falha silenciosamente.
  results.push({
    path: 'file:///node_modules/cortex-game-engine/package.json',
    content: JSON.stringify({ name: 'cortex-game-engine', types: 'index.d.ts' }),
    navigable: false,
  })

  return results
})

// Abre um diálogo nativo de seleção de pasta. Retorna o path absoluto ou null
// se o usuário cancelar. Modal à janela principal quando ela existe.
ipcMain.handle('dialog:openDirectory', async () => {
  const result = await (mainWindow
    ? dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
    : dialog.showOpenDialog({ properties: ['openDirectory'] }))
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
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

// Terminal embutido — roda um comando one-shot no projeto (ADR-0012).
// stdout/stderr vão para o canal 'terminal:output'; conclusão via
// 'terminal:done' com { code }.
ipcMain.handle('terminal:run', async (_event, projectDir: unknown, command: unknown) => {
  const safeDir = validatePath(projectDir)
  if (typeof command !== 'string' || command.trim() === '') {
    throw new Error('command deve ser uma string não vazia')
  }

  if (terminalProcess) {
    terminalProcess.kill()
    terminalProcess = null
  }

  const child = spawn(command, [], {
    cwd: safeDir,
    shell: true,
  })

  terminalProcess = child

  const forwardOutput = (data: Buffer): void => {
    mainWindow?.webContents.send('terminal:output', data.toString())
  }

  child.stdout?.on('data', forwardOutput)
  child.stderr?.on('data', forwardOutput)

  child.on('close', (code) => {
    terminalProcess = null
    mainWindow?.webContents.send('terminal:done', { code: code ?? -1 })
  })
})

// Chat IA — envia o histórico para Claude e faz streaming dos chunks de volta
// para o renderer via canais ai:chunk / ai:done / ai:error (ADR-0014).
const AI_SYSTEM_PROMPT = `\
Você é um assistente para o cortex-game-engine — um motor de jogos 3D em \
TypeScript com arquitetura Entity-Component-System (ECS), renderização via \
Three.js, e ferramentas de geração de scripts e modelos 3D via IA.

Você ajuda o usuário a criar jogos, explicar código existente, debugar \
problemas e sugerir mudanças. Responda em português. Quando sugerir código, \
prefira TypeScript moderno (ES2022+) e siga o padrão ECS do engine.`

ipcMain.handle('ai:chat', async (_event, messages: unknown) => {
  if (!Array.isArray(messages)) {
    mainWindow?.webContents.send('ai:error', { message: 'messages deve ser array' })
    return
  }

  if (!process.env['ANTHROPIC_API_KEY']) {
    mainWindow?.webContents.send('ai:error', {
      message: 'ANTHROPIC_API_KEY não está configurada. Defina a variável de ambiente e reinicie o IDE.',
    })
    return
  }

  try {
    const client = new Anthropic()
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system: AI_SYSTEM_PROMPT,
      messages: messages as Anthropic.MessageParam[],
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        mainWindow?.webContents.send('ai:chunk', { text: event.delta.text })
      }
    }

    const finalMessage = await stream.finalMessage()
    mainWindow?.webContents.send('ai:done', {
      stopReason: finalMessage.stop_reason,
      usage: finalMessage.usage,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    mainWindow?.webContents.send('ai:error', { message })
  }
})

// Mata o comando do terminal em execução, se houver
ipcMain.handle('terminal:stop', async () => {
  if (terminalProcess) {
    terminalProcess.kill()
    terminalProcess = null
    mainWindow?.webContents.send('terminal:done', { code: -1 })
  }
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
