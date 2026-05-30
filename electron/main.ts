import { app, BrowserWindow, ipcMain, dialog, Menu, type MenuItemConstructorOptions } from 'electron'
import { join, resolve, delimiter } from 'path'
import { readdir, readFile, writeFile, cp, mkdir, rename, rm, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { spawn, ChildProcess } from 'child_process'
import { createHash } from 'crypto'
import { homedir } from 'os'
import { runAgent } from './agent/agentLoop.js'
import { writePlaceholderIcons } from './installer-icons.js'

/**
 * Retorna o ambiente do processo com `~/.cargo/bin` injetado no PATH.
 *
 * O Electron captura `process.env.PATH` no momento que inicia — se o
 * usuário instalou Rust DEPOIS de abrir a IDE (ou se o yarn/node pai
 * do dev mode ficou em background com PATH velho), `cargo` não aparece
 * pro spawn por mais que `cargo --version` funcione fora.
 *
 * A injeção é idempotente (não duplica se já estiver) e silenciosa
 * quando `~/.cargo/bin` não existe — esse caso é Rust não instalado,
 * que aí é problema do usuário resolver.
 */
function envWithCargo(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  const cargoBin = join(homedir(), '.cargo', 'bin')
  if (!existsSync(cargoBin)) return env
  const path = env.PATH ?? env.Path ?? ''
  const parts = path.split(delimiter)
  const already = parts.some((p) => p.toLowerCase() === cargoBin.toLowerCase())
  if (!already) env.PATH = `${cargoBin}${delimiter}${path}`
  return env
}

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

/**
 * Garante (idempotente) que `pattern` está numa linha própria no `.gitignore`
 * de `projectDir`. Cria o arquivo se não existir.
 *
 * A regra `src-tauri/` é injetada por aqui em vez de viver no `.gitignore`
 * do template porque o git aplica `.gitignore` aninhados também durante
 * operações no repo da IDE — se o template tivesse `src-tauri/`, o repo
 * da IDE deixaria de trackear `templates/new-project/src-tauri/`.
 */
async function ensureGitignoreEntry(projectDir: string, pattern: string): Promise<void> {
  const file = join(projectDir, '.gitignore')
  let content = ''
  try {
    content = await readFile(file, 'utf-8')
  } catch {
    // arquivo não existe — criamos do zero
  }
  const lines = content.split(/\r?\n/).map((l) => l.trim())
  if (lines.includes(pattern)) return
  const sep = content.length > 0 && !content.endsWith('\n') ? '\n' : ''
  await writeFile(file, content + sep + pattern + '\n', 'utf-8')
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
      // Camadas de hardening (sem mudar comportamento funcional):
      // - nodeIntegration:false + contextIsolation:true blindam o renderer
      //   contra acesso direto a require/process do Node.
      // - sandbox:false é exigido pelo preload ESM (ADR-0008); compensamos
      //   com as flags defensivas abaixo.
      // - webSecurity:true mantém SOP/CORS ativos no renderer.
      // - allowRunningInsecureContent e experimentalFeatures explícitos em
      //   false bloqueiam mixed-content e features instáveis do Chromium.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  })

  // Bloqueia navegação para qualquer URL fora do app — se algum script
  // tentasse `location.href = 'https://evil'`, o request é abortado.
  // Em dev permitimos o origem do electron-vite (localhost com porta dinâmica).
  const allowedOrigins: string[] = []
  if (process.env['ELECTRON_RENDERER_URL']) {
    try {
      allowedOrigins.push(new URL(process.env['ELECTRON_RENDERER_URL']).origin)
    } catch {
      /* URL inválida — só ignora e mantém a allowlist vazia */
    }
  }
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const origin = new URL(url).origin
      if (allowedOrigins.includes(origin)) return
    } catch {
      /* URL ilegível também cai no deny */
    }
    event.preventDefault()
  })

  // Bloqueia `window.open(...)` e `target="_blank"`. Nenhuma página da IDE
  // precisa abrir popup; se um dia precisarmos abrir link externo, fazemos
  // explicitamente via shell.openExternal no main process.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

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
  // src-tauri/ é tratada como artefato regenerável (ADR-0024). Adicionar
  // ao .gitignore aqui — não no template — porque o git aplica .gitignore
  // aninhados também no repo da IDE.
  await ensureGitignoreEntry(projectPath, 'src-tauri/')
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

// ---------------------------------------------------------------------------
// Handlers IPC — setup de Tauri (ADR-0024)
// ---------------------------------------------------------------------------

/**
 * Verifica se um projeto já tem Tauri configurado: precisa ter
 * `src-tauri/tauri.conf.json` E o script `tauri:build` no package.json.
 *
 * Projetos criados antes do template Tauri-ready não têm nada disso;
 * `installer:setup` instala. Projetos novos já saem prontos.
 */
ipcMain.handle('installer:check', async (_event, projectDir: unknown) => {
  const safeDir = validatePath(projectDir)
  try {
    await readFile(join(safeDir, 'src-tauri', 'tauri.conf.json'), 'utf-8')
  } catch {
    return { configured: false }
  }
  try {
    const pkgRaw = await readFile(join(safeDir, 'package.json'), 'utf-8')
    const pkg = JSON.parse(pkgRaw)
    if (!pkg?.scripts?.['tauri:build']) return { configured: false }
  } catch {
    return { configured: false }
  }
  // Detecção de projeto legado: Cargo.toml declara `[lib] name = game_app_lib`
  // mas src/lib.rs não existe (template inicial estava incompleto). Sem isso,
  // `cargo metadata` falha. Reaplicar o setup escreve o lib.rs e o main.rs novo.
  if (!existsSync(join(safeDir, 'src-tauri', 'src', 'lib.rs'))) {
    return { configured: false }
  }
  // Faltam ícones obrigatórios (tauri.conf.json referencia eles): reaplicar
  // setup gera placeholders cinza-azulado automaticamente.
  if (!existsSync(join(safeDir, 'src-tauri', 'icons', 'icon.ico'))) {
    return { configured: false }
  }
  return { configured: true }
})

/**
 * Configura Tauri num projeto existente: copia `templates/new-project/src-tauri/`
 * para o projeto (substituindo `{{PROJECT_NAME}}` pelo nome real) e mescla
 * scripts + devDependencies do template no package.json do projeto.
 *
 * Idempotente: se `src-tauri/` já existe, mantém. Se o package.json já tem
 * os scripts, não duplica. Não toca em vite.config.ts (usuário pode ter
 * editado) — o README do template explica os ajustes recomendados.
 */
ipcMain.handle('installer:setup', async (_event, projectDir: unknown) => {
  const safeDir = validatePath(projectDir)
  const projectName = safeDir.split(/[\\/]/).filter(Boolean).pop() ?? 'game'

  // ── 1. Copia src-tauri/ do template ─────────────────────────────────────
  // cp recursivo com force:false: preenche arquivos faltantes (ex.: lib.rs
  // novo num projeto legado) sem sobrescrever edições do usuário.
  const tauriDir = join(safeDir, 'src-tauri')
  const templateTauriDir = join(app.getAppPath(), 'templates', 'new-project', 'src-tauri')
  await cp(templateTauriDir, tauriDir, { recursive: true, force: false, errorOnExist: false })

  // Substitui {{PROJECT_NAME}} nos arquivos de texto copiados (Cargo.toml,
  // tauri.conf.json). Walk recursivo limitado aos arquivos de texto que o
  // template conhece — evita tocar acidentalmente em binários futuros.
  const TEXT_FILES = [
    'Cargo.toml',
    'tauri.conf.json',
    'src/main.rs',
    'src/lib.rs',
    'build.rs',
    '.gitignore',
  ]
  for (const rel of TEXT_FILES) {
    const filePath = join(tauriDir, rel)
    try {
      const content = await readFile(filePath, 'utf-8')
      if (content.includes('{{PROJECT_NAME}}')) {
        await writeFile(filePath, content.replaceAll('{{PROJECT_NAME}}', projectName), 'utf-8')
      }
    } catch {
      // Arquivo pode não existir (ex: .gitignore renomeado); ignorar.
    }
  }

  // ── 1.b Sobrescreve arquivos Rust em projetos legados ──────────────────
  // Projetos configurados pela versão antiga do setup têm um main.rs que
  // chama `tauri::Builder::default().run(...)` direto e nenhum lib.rs.
  // Cargo.toml declara `[lib] name = "game_app_lib"`, então `cargo metadata`
  // falha procurando lib.rs. O cp acima já copiou o lib.rs novo (não
  // existia no destino), mas o main.rs antigo continua incompatível —
  // forçar sobrescrita aqui resolve.
  const mainRsPath = join(tauriDir, 'src', 'main.rs')
  const mainRsTemplate = await readFile(join(templateTauriDir, 'src', 'main.rs'), 'utf-8')
  const mainRsCurrent = await readFile(mainRsPath, 'utf-8').catch(() => '')
  if (!mainRsCurrent.includes('game_app_lib::run')) {
    await writeFile(mainRsPath, mainRsTemplate, 'utf-8')
  }

  // ── 1.c Gera ícones placeholder ────────────────────────────────────────
  // Sem `icons/icon.ico`, o tauri build falha. Geramos um PNG cinza-azulado
  // sólido em todos os tamanhos exigidos e um .ico com PNG embutido —
  // suficiente pro primeiro `tauri build` rodar. Usuário substitui depois
  // com `yarn tauri icon <png>` quando tiver a arte do jogo. Idempotente:
  // a função pula se `icon.ico` já existe.
  const iconsGenerated = await writePlaceholderIcons(tauriDir)

  // ── 2. Merge package.json ───────────────────────────────────────────────
  const pkgPath = join(safeDir, 'package.json')
  const pkgRaw = await readFile(pkgPath, 'utf-8')
  const pkg = JSON.parse(pkgRaw) as {
    scripts?: Record<string, string>
    devDependencies?: Record<string, string>
  }

  pkg.scripts = {
    ...pkg.scripts,
    build: pkg.scripts?.build ?? 'vite build',
    tauri: pkg.scripts?.tauri ?? 'tauri',
    'tauri:dev': pkg.scripts?.['tauri:dev'] ?? 'tauri dev',
    'tauri:build': pkg.scripts?.['tauri:build'] ?? 'tauri build',
  }
  pkg.devDependencies = {
    ...pkg.devDependencies,
    '@tauri-apps/cli': pkg.devDependencies?.['@tauri-apps/cli'] ?? '^2',
  }
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')

  // Projetos legados podem não ter `src-tauri/` no .gitignore — garante.
  await ensureGitignoreEntry(safeDir, 'src-tauri/')

  return { ok: true, iconsGenerated }
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
    env: envWithCargo(),
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
    env: envWithCargo(),
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

/**
 * Path do arquivo que guarda o session_id do Claude Agent SDK para um
 * projeto. Permite retomar a conversa (resume) entre execuções diferentes
 * do IDE — o backend Claude Code mantém o histórico em ~/.claude/sessions/.
 */
function sessionIdPath(projectDir: string): string {
  const hash = createHash('sha1').update(projectDir).digest('hex').slice(0, 16)
  return join(app.getPath('userData'), 'sessions', `${hash}.txt`)
}

async function loadSessionId(projectDir: string): Promise<string | null> {
  try {
    const raw = await readFile(sessionIdPath(projectDir), 'utf-8')
    return raw.trim() || null
  } catch {
    return null
  }
}

async function saveSessionId(projectDir: string, sessionId: string): Promise<void> {
  const file = sessionIdPath(projectDir)
  await mkdir(join(app.getPath('userData'), 'sessions'), { recursive: true })
  await writeFile(file, sessionId, 'utf-8')
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

/**
 * Diretório onde imagens coladas (Ctrl+V) vivem temporariamente.
 * Fica em <userData>/cortex-pastes/<hash do projeto>/ — fora do diretório
 * do projeto pra não poluir o repo do usuário. O agente recebe path
 * ABSOLUTO na mensagem [imagem: ...] e o system prompt explicita que
 * paths absolutos retornados pela UI são confiáveis para Read.
 */
function pasteDirForProject(projectDir: string): string {
  const hash = createHash('sha1').update(projectDir).digest('hex').slice(0, 16)
  return join(app.getPath('userData'), 'cortex-pastes', hash)
}

ipcMain.handle('clipboard:saveImage', async (_event, dataUrl: unknown) => {
  if (!currentProjectDir) throw new Error('Sem projeto ativo')
  if (typeof dataUrl !== 'string') throw new Error('dataUrl deve ser string')
  const match = /^data:image\/([a-z0-9+]+);base64,(.+)$/i.exec(dataUrl)
  if (!match) throw new Error('dataUrl não é uma imagem base64 válida')
  const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase()
  const buf = Buffer.from(match[2], 'base64')
  const dir = pasteDirForProject(currentProjectDir)
  await mkdir(dir, { recursive: true })
  const filePath = join(dir, `clipboard_${Date.now()}.${ext}`)
  await writeFile(filePath, buf)
  // Path absoluto POSIX-style (Read do Claude Code aceita / no Windows)
  return filePath.replace(/\\/g, '/')
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

// Apaga uma imagem de <userData>/cortex-pastes/<projectHash>/. O renderer
// chama isso após o turno do agente terminar — as imagens só fazem sentido
// enquanto estão sendo referenciadas. Sandboxed: rejeita paths fora do
// diretório de pastes pra não virar um deletePath genérico.
ipcMain.handle('clipboard:deleteImage', async (_event, absolutePath: unknown) => {
  if (!currentProjectDir) return
  if (typeof absolutePath !== 'string') return
  const expected = pasteDirForProject(currentProjectDir).replace(/\\/g, '/')
  const normalized = absolutePath.replace(/\\/g, '/')
  if (!normalized.startsWith(expected + '/')) return
  if (normalized.includes('..') || normalized.includes('\0')) return
  try {
    await unlink(normalized)
  } catch {
    // ignora se já não existe
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
  // Tenta retomar a sessão do passado (outra execução do IDE). Só vale no
  // primeiro turno desta execução; depois continueSession já mantém vivo.
  const resumeSessionId = continueSession ? null : await loadSessionId(sessionKey)

  try {
    await runAgent({
      prompt: lastUserMessage,
      projectRoot: currentProjectDir,
      continueSession,
      resumeSessionId,
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
          // Persiste o session_id atual pra retomar em execuções futuras
          if (stats?.sessionId) {
            void saveSessionId(sessionKey, stats.sessionId)
          }
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
// Menu nativo da aplicação
// ---------------------------------------------------------------------------

/**
 * Monta o Menu principal acrescentando o submenu "Projeto" aos defaults do
 * Electron. Itens do submenu disparam eventos pra o renderer via
 * `webContents.send` — o renderer já tem toda a UI (BottomPanel/Terminal)
 * pra mostrar logs e capturar saída do comando.
 *
 * "Gerar instalador..." dispara `yarn tauri:build` no projeto ativo
 * (ADR-0024). Requer Rust toolchain + MSVC Build Tools + ícones gerados
 * via `yarn tauri icon` — pré-requisitos documentados no README do
 * template.
 */
function buildAppMenu(): Menu {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    {
      label: 'Projeto',
      submenu: [
        {
          label: 'Gerar instalador...',
          accelerator: isMac ? 'Cmd+Shift+B' : 'Ctrl+Shift+B',
          click: (): void => {
            mainWindow?.webContents.send('menu:build-installer')
          },
        },
      ],
    },
    { role: 'windowMenu' },
  ]

  return Menu.buildFromTemplate(template)
}

// ---------------------------------------------------------------------------
// Ciclo de vida do app
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  Menu.setApplicationMenu(buildAppMenu())
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
