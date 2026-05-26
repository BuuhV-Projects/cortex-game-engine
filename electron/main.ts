import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, resolve } from 'path'
import { readdir, readFile, writeFile, cp, mkdir, rename, rm, unlink } from 'fs/promises'
import { spawn, ChildProcess } from 'child_process'
import { createHash } from 'crypto'
import { runAgent } from './agent/agentLoop.js'

// Referência à janela principal — usada em run:start para enviar logs ao renderer
let mainWindow: BrowserWindow | null = null

// Processo filho do vite em execução (único de cada vez)
let runningProcess: ChildProcess | null = null

// Processo do terminal embutido (independente do runningProcess — permite
// rodar `yarn install` enquanto o Play continua ativo). ADR-0012.
let terminalProcess: ChildProcess | null = null

// Projeto ativo (ADR-0017): sandbox das tools do agente. Atualizado via
// IPC `project:setActive` quando o renderer dispara o evento `project-open`.
let currentProjectDir: string | null = null

// Estado do turno do agente em curso (PRD-0002 / ADR-0018): controla
// aprovação de tools e cancelamento.
interface PendingApproval {
  resolve: (approved: boolean) => void
}
const pendingApprovals = new Map<string, PendingApproval>()
let agentAborted = false
let agentRunning = false

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

// Move (renomeia) um arquivo/pasta. Usado pelo drag & drop do FileTree para
// reorganizar itens entre pastas do projeto (ADR-0016).
ipcMain.handle('fs:move', async (_event, src: unknown, dest: unknown) => {
  const safeSrc = validatePath(src)
  const safeDest = validatePath(dest)
  await rename(safeSrc, safeDest)
})

// Apaga um arquivo ou pasta recursivamente. Usado pelo menu de contexto
// do FileTree (ADR-0016). A confirmação fica no renderer.
ipcMain.handle('fs:delete', async (_event, targetPath: unknown) => {
  const safePath = validatePath(targetPath)
  await rm(safePath, { recursive: true, force: false })
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

  // index.d.ts agregador — usa o gerado pelo tsc a partir de src/index-runtime.ts.
  // Já inclui core+ecs E os re-exports de three (Mesh, BoxGeometry, lights, etc.)
  // que o template usa para criar a cena. Manter agregador manual aqui perderia
  // os re-exports.
  await cp(
    join(appPath, 'dist', 'src', 'index-runtime.d.ts'),
    join(vendorDir, 'index.d.ts'),
  )
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

  // index.d.ts agregador — lê o gerado pelo tsc (inclui core+ecs + re-exports
  // de three). Strippa o sufixo '.js' dos paths relativos porque o
  // moduleResolution default do Monaco TS (Node legacy) não trata `.js` como
  // mapeamento para `.d.ts`. Os módulos `three` continuam intactos.
  const indexRuntime = await readFile(
    join(appPath, 'dist', 'src', 'index-runtime.d.ts'),
    'utf-8',
  )
  const aggregatorContent = indexRuntime.replace(
    /from '(\.\/[^']+)\.js'/g,
    (_match, relPath: string) => `from '${relPath}'`,
  )
  results.push({
    path: 'file:///node_modules/cortex-game-engine/index.d.ts',
    content: aggregatorContent,
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

/**
 * Mata o processo e toda a sua árvore de filhos.
 *
 * No Windows, `ChildProcess.kill()` mata apenas o shell (cmd.exe) spawnado
 * com `shell: true`, deixando os processos netos (ex.: vite/node) como
 * zumbis que continuam segurando portas. Usamos `taskkill /T /F` para
 * derrubar a árvore inteira. Em Unix, o kill normal já cascateia.
 */
function killProcessTree(proc: ChildProcess): void {
  if (!proc.pid) return
  if (process.platform === 'win32') {
    // /T = mata filhos recursivamente; /F = força (SIGKILL equivalente)
    spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'])
  } else {
    proc.kill('SIGTERM')
  }
}

// Spawna o `vite` no diretório do projeto; redireciona stdout/stderr ao renderer via 'log'
ipcMain.handle('run:start', async (_event, projectDir: unknown) => {
  const safeDir = validatePath(projectDir)

  // Garante que não há processo anterior pendurado
  if (runningProcess) {
    killProcessTree(runningProcess)
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
  // Erros síncronos (validação) viram rejeição da Promise; o renderer já pega
  // no catch e libera o input. Para erros assíncronos (spawn error, cwd
  // inválido) garantimos que 'terminal:done' SEMPRE dispara — sem isso o
  // input do terminal trava esperando um done que nunca chega.
  const safeDir = validatePath(projectDir)
  if (typeof command !== 'string' || command.trim() === '') {
    throw new Error('command deve ser uma string não vazia')
  }

  if (terminalProcess) {
    killProcessTree(terminalProcess)
    terminalProcess = null
  }

  let done = false
  const emitDone = (code: number): void => {
    if (done) return
    done = true
    terminalProcess = null
    mainWindow?.webContents.send('terminal:done', { code })
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

  child.on('close', (code) => emitDone(code ?? -1))
  child.on('error', (err) => {
    mainWindow?.webContents.send('terminal:output', `\nErro: ${err.message}\n`)
    emitDone(-1)
  })
})

// Chat IA — usa @anthropic-ai/claude-agent-sdk como backend. Auth (OAuth do
// Claude Code OU ANTHROPIC_API_KEY) é gerenciada pelo próprio SDK. ADR-0014
// + ADR-0017 V2.

// Rastreia se já houve uma chamada de query() pra cada projeto. A 2ª em
// diante usa continue:true para manter contexto do turno anterior. Reseta
// quando o usuário troca de projeto.
const sessionStartedFor = new Set<string>()
let currentAgentAbort: AbortController | null = null

ipcMain.handle('project:setActive', async (_event, projectDir: unknown) => {
  if (projectDir === null || projectDir === undefined) {
    currentProjectDir = null
    return
  }
  currentProjectDir = validatePath(projectDir)
})

// Decisão do usuário sobre uma tool call pendente (ADR-0018). O renderer
// chama isso depois de mostrar o card e o usuário clicar Aprovar ou Negar.
ipcMain.handle('ai:tool_decision', async (_event, id: unknown, approved: unknown) => {
  if (typeof id !== 'string' || typeof approved !== 'boolean') return
  const pending = pendingApprovals.get(id)
  if (!pending) return
  pendingApprovals.delete(id)
  pending.resolve(approved)
})

// Cancela o turno do agente em andamento. Aborta o controller passado ao
// ── Persistência do histórico do chat (PRD-0001 V2 / ADR-0021) ─────────────
//
// Salva em <userData>/chats/<hash>.json, onde <hash> é SHA-1 do path do projeto.
// Centralizado no IDE (não polui o diretório do projeto) e identificado por
// path absoluto — se o usuário renomear/mover o projeto, perde o histórico
// (trade-off assumido pra V1; mais simples que rastrear identidade do projeto).

function chatHistoryPath(projectDir: string): string {
  const hash = createHash('sha1').update(projectDir).digest('hex').slice(0, 16)
  return join(app.getPath('userData'), 'chats', `${hash}.json`)
}

ipcMain.handle('chat:load', async (_event, projectDir: unknown) => {
  if (typeof projectDir !== 'string' || projectDir === '') return []
  const file = chatHistoryPath(validatePath(projectDir))
  try {
    const raw = await readFile(file, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
})

ipcMain.handle('chat:save', async (_event, projectDir: unknown, messages: unknown) => {
  if (typeof projectDir !== 'string' || projectDir === '') return
  if (!Array.isArray(messages)) return
  const file = chatHistoryPath(validatePath(projectDir))
  await mkdir(join(app.getPath('userData'), 'chats'), { recursive: true })
  await writeFile(file, JSON.stringify(messages), 'utf-8')
})

// Recebe um dataURL de imagem (do clipboard do usuário) e salva em
// <projectDir>/.cortex/paste/clipboard_<ts>.<ext>. Retorna o path relativo
// ao projeto pra ser injetado na mensagem do chat — a IA usa Read pra
// "ver" a imagem via Claude Agent SDK.
ipcMain.handle('clipboard:saveImage', async (_event, dataUrl: unknown) => {
  if (!currentProjectDir) throw new Error('Sem projeto ativo')
  if (typeof dataUrl !== 'string') throw new Error('dataUrl deve ser string')
  const match = /^data:image\/([a-z0-9+]+);base64,(.+)$/i.exec(dataUrl)
  if (!match) throw new Error('dataUrl não é uma imagem base64 válida')
  const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase()
  const buf = Buffer.from(match[2], 'base64')
  const dir = join(currentProjectDir, '.cortex', 'paste')
  await mkdir(dir, { recursive: true })
  const filePath = join(dir, `clipboard_${Date.now()}.${ext}`)
  await writeFile(filePath, buf)
  // Path relativo POSIX-style — o agente lê melhor com / do que com \
  return filePath
    .slice(currentProjectDir.length + 1)
    .replace(/\\/g, '/')
})

ipcMain.handle('chat:clear', async (_event, projectDir: unknown) => {
  if (typeof projectDir !== 'string' || projectDir === '') return
  const file = chatHistoryPath(validatePath(projectDir))
  try {
    await unlink(file)
  } catch {
    // ignora se não existe
  }
})

// SDK e resolve as aprovações pendentes como negadas.
ipcMain.handle('ai:cancel', async () => {
  agentAborted = true
  currentAgentAbort?.abort()
  for (const [id, pending] of pendingApprovals) {
    pendingApprovals.delete(id)
    pending.resolve(false)
  }
})

// Turno do agente: extrai a última mensagem do usuário, delega ao SDK
// (que gerencia stream, tools e sessão), traduz eventos pro renderer.
ipcMain.handle('ai:chat', async (_event, messages: unknown, mode: unknown) => {
  if (!Array.isArray(messages)) {
    mainWindow?.webContents.send('ai:error', { message: 'messages deve ser array' })
    return
  }
  const agentMode = mode === 'auto' ? 'auto' : 'ask'
  if (agentRunning) {
    mainWindow?.webContents.send('ai:error', {
      message: 'Outro turno do agente já está em andamento.',
    })
    return
  }
  // Salvaguarda: sem projectRoot, o SDK roda com cwd do processo Electron
  // (o repo do IDE) e o agente pode tocar arquivos fora do sandbox. Recusa.
  if (!currentProjectDir) {
    mainWindow?.webContents.send('ai:error', {
      message: 'Abra um projeto antes de conversar com a IA. O agente só age dentro do projeto ativo.',
    })
    return
  }
  const history = messages as Array<{ role: 'user' | 'assistant'; content: string }>
  const lastUserMessage = [...history].reverse().find((m) => m.role === 'user')?.content
  if (!lastUserMessage) {
    mainWindow?.webContents.send('ai:error', { message: 'Sem mensagem do usuário pra enviar.' })
    return
  }

  agentRunning = true
  agentAborted = false
  const abortController = new AbortController()
  currentAgentAbort = abortController

  const sessionKey = currentProjectDir ?? '<no-project>'
  const continueSession = sessionStartedFor.has(sessionKey)

  try {
    await runAgent({
      prompt: lastUserMessage,
      projectRoot: currentProjectDir,
      continueSession,
      mode: agentMode,
      abortController,
      events: {
        onTextChunk(text) {
          mainWindow?.webContents.send('ai:chunk', { text })
        },
        onToolRequest(request) {
          mainWindow?.webContents.send('ai:tool_request', request)
        },
        onToolExecuted(id, result) {
          mainWindow?.webContents.send('ai:tool_executed', { id, result })
        },
        onDone(stopReason, stats) {
          mainWindow?.webContents.send('ai:done', { stopReason, stats })
        },
        onError(err) {
          const message = err instanceof Error ? err.message : String(err)
          mainWindow?.webContents.send('ai:error', { message })
        },
      },
      approval: {
        async requestApproval(request) {
          if (agentAborted) return false
          return new Promise<boolean>((resolveApproval) => {
            pendingApprovals.set(request.id, { resolve: resolveApproval })
          })
        },
      },
    })
    sessionStartedFor.add(sessionKey)
  } finally {
    agentRunning = false
    currentAgentAbort = null
    pendingApprovals.clear()
  }
})

// Mata o comando do terminal em execução, se houver
ipcMain.handle('terminal:stop', async () => {
  if (terminalProcess) {
    killProcessTree(terminalProcess)
    terminalProcess = null
    mainWindow?.webContents.send('terminal:done', { code: -1 })
  }
})

// Mata o processo filho em execução, se houver
ipcMain.handle('run:stop', async () => {
  if (runningProcess) {
    killProcessTree(runningProcess)
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
