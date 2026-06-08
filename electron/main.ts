import { app, BrowserWindow, ipcMain, dialog, Menu, type MenuItemConstructorOptions } from 'electron'
import { join, resolve, delimiter } from 'path'
import { readdir, readFile, writeFile, cp, mkdir, rename, rm, unlink } from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import { spawn, spawnSync, ChildProcess } from 'child_process'
import { createHash } from 'crypto'
import { homedir } from 'os'
import { runAgent } from './agent/agentLoop.js'
import { writePlaceholderIcons } from './installer-icons.js'

/**
 * Retorna o ambiente do processo com diretórios de ferramentas de dev
 * (yarn/npm/node/cargo) injetados no PATH.
 *
 * O Electron herda o `PATH` que o Explorer tinha quando o app foi aberto —
 * num app empacotado (instalado pelo NSIS) esse PATH costuma NÃO incluir o
 * prefixo global do npm (`%APPDATA%\npm`, onde mora `yarn.cmd`) nem a pasta
 * do Node, então `yarn`/`node`/`cargo` "somem" pro spawn mesmo estando
 * instalados e funcionando no terminal do usuário. Esse env é usado tanto
 * nos spawns locais (vite/terminal) quanto repassado ao Claude Agent SDK,
 * cuja tool Bash herda o env deste processo.
 *
 * A injeção é idempotente (não duplica entradas já presentes) e só adiciona
 * diretórios que existem no disco — candidatos ausentes são ignorados em
 * silêncio (ferramenta não instalada é problema do usuário resolver).
 */
function envForSpawn(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  const candidates = [
    join(homedir(), '.cargo', 'bin'),
    env.APPDATA ? join(env.APPDATA, 'npm') : null, // npm global no Windows (yarn.cmd, etc.)
    env.ProgramFiles ? join(env.ProgramFiles, 'nodejs') : null, // node + corepack
    env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'Yarn', 'bin') : null, // yarn classic (MSI)
    join(homedir(), '.yarn', 'bin'), // yarn (instalação por script)
  ].filter((p): p is string => p !== null && existsSync(p))

  // No Windows a chave pode vir como `Path`; preserva a que existir.
  const key = env.PATH !== undefined ? 'PATH' : env.Path !== undefined ? 'Path' : 'PATH'
  const current = env[key] ?? ''
  const present = new Set(current.split(delimiter).map((p) => p.toLowerCase()))
  const additions = candidates.filter((c) => !present.has(c.toLowerCase()))
  if (additions.length > 0) {
    env[key] = [...additions, current].filter(Boolean).join(delimiter)
  }
  return env
}

// Referência à janela principal — usada em run:start para enviar logs ao renderer
let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null

/** Logo (public/logo.png) como data URL, pra inlinar na splash sem depender de path. */
function logoDataUrl(): string | null {
  const candidates = [
    join(__dirname, '../renderer/logo.png'), // produção (out/renderer)
    join(app.getAppPath(), 'electron/renderer/public/logo.png'), // dev
    join(app.getAppPath(), 'out/renderer/logo.png'),
  ]
  for (const p of candidates) {
    try {
      return `data:image/png;base64,${readFileSync(p).toString('base64')}`
    } catch {
      /* tenta o próximo */
    }
  }
  return null
}

/** Splash com logo (janela sem moldura) enquanto o app carrega; fecha quando a janela principal está pronta. */
function createSplash(): void {
  splashWindow = new BrowserWindow({
    width: 460,
    height: 300,
    frame: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    show: false,
    skipTaskbar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  const logo = logoDataUrl()
  const html = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;overflow:hidden;font-family:"Segoe UI",Roboto,Arial,sans-serif}
    .card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
      background:radial-gradient(120% 90% at 50% 0%,#23252e 0%,#16171c 75%);color:#e6e6e6}
    img{width:128px;height:auto;filter:drop-shadow(0 8px 22px rgba(0,0,0,.55))}
    .t{font-size:15px;font-weight:600}.s{font-size:12px;color:#9aa0ad}
    .bar{width:180px;height:4px;border-radius:3px;background:#2c2e36;overflow:hidden;margin-top:4px}
    .bar>i{display:block;height:100%;width:38%;background:#3b5bdb;border-radius:3px;animation:s 1.1s ease-in-out infinite}
    @keyframes s{0%{margin-left:-38%}100%{margin-left:100%}}
  </style><div class="card">${logo ? `<img src="${logo}">` : ''}
    <div class="t">Cortex Game Engine Studio</div><div class="s">carregando…</div>
    <div class="bar"><i></i></div></div>`
  void splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  splashWindow.once('ready-to-show', () => splashWindow?.show())
}

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
    const raw = await readFile(file, 'utf-8')
    if (typeof raw === 'string') content = raw
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
    show: false, // só mostra quando o renderer carregou (a splash cobre o gap)
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

  // Renderer pronto → mostra a janela principal e fecha a splash.
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow?.show()
    splashWindow?.close()
    splashWindow = null
  })

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

// Lê um arquivo binário (ex.: imagem) como base64 — usado pelo preview de imagem
// do editor (renderizar via data URL, sem depender de file:// no renderer).
ipcMain.handle('fs:readFileBase64', async (_event, filePath: unknown) => {
  const safePath = validatePath(filePath)
  return (await readFile(safePath)).toString('base64')
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
    'Game',
    'Renderer',
    'Scene',
    'AssetLoader',
    'AudioManager',
    'InputManager',
    'GamepadManager',
    'Physics',
    'LoadingScreen',
    'Skybox',
    'PostFX',
  ],
  ecs: ['Entity', 'Component', 'System', 'World'],
  components: [
    'TransformComponent',
    'Object3DComponent',
    'KinematicBodyComponent',
    'FollowCameraTargetComponent',
    'EditableTargetComponent',
    'Collider2DComponent',
    'PlatformerBodyComponent',
    'PlayerAnimatorComponent',
    'SpriteAnimationComponent',
  ],
  systems: [
    'Object3DSyncSystem',
    'ThirdPersonCameraSystem',
    'PlatformerPhysicsSystem',
    'PlatformerInputSystem',
    'FollowCamera2DSystem',
    'PlatformerAnimationSystem',
    'SpriteAnimationSystem',
  ],
  // Editor NÃO entra: não é exportado pelo runtime (index.d.ts não o referencia).
  // Ele vive só no bundle de dev (index.dev.js), ligado automaticamente pelo Game.
  scene: [
    'SceneFile',
    'SceneLoader',
    'SceneDefinition',
    'SceneBuilder',
    'Kit',
    'Background',
    'SceneAnimator',
    'Platformer',
    'SceneAssets',
    'OutdoorLighting',
    'Water',
    'Sprite',
    'Spritesheet',
    'Tilemap',
  ],
  io: ['SceneFileWriter', 'HttpSceneFileWriter', 'TauriSceneFileWriter', 'autoDetectSceneFileWriter'],
} as const

/**
 * Base de leitura dos recursos que o IDE consome via fs (templates, bundle do
 * engine, `.d.ts` do engine e do three). Em dev é a raiz do repo; em produção é
 * `process.resourcesPath` (o diretório `resources/` ao lado do `app.asar`).
 *
 * Por que NÃO ficam dentro do `app.asar`: o electron-builder remove
 * incondicionalmente todo `*.d.ts` do asar (lista `excludedExts` em
 * app-builder-lib — ver issue electron-userland/electron-builder#7512), e ainda
 * faz pruning das devDependencies (ex.: `@types/three`). Ou seja, nenhum padrão
 * em `files`/`asarUnpack` consegue empacotar os `.d.ts` — eles sempre somem.
 * Além disso `fs.cp` não lê de dentro do asar. Por isso esses recursos são
 * copiados via `electron-builder.json#extraResources`, que grava árvores reais
 * em `resources/` (sem strip de `.d.ts`, sem pruning), preservando os mesmos
 * subpaths (`dist/src`, `dist-engine`, `templates`, `node_modules/@types/three`)
 * que existem na raiz do repo em dev. Assim os mesmos `join(resourceBase(), …)`
 * funcionam em dev e prod. Ver ADR-0034.
 */
function resourceBase(): string {
  const appPath = app.getAppPath()
  return appPath.endsWith('.asar') ? process.resourcesPath : appPath
}

/**
 * Vendoriza o engine dentro de <projectPath>/vendor/cortex-game-engine/:
 * - index.js: bundle único do engine (com three embutido), de dist-engine/
 * - core/*.d.ts e ecs/*.d.ts: types copiados de dist/src/
 * - index.d.ts: agregador minimal re-exportando só core+ecs
 *
 * Os recursos vêm de resourceBase() (process.resourcesPath em produção, via
 * electron-builder.json#extraResources). Ver ADR-0034.
 */
async function vendorEngine(projectPath: string): Promise<void> {
  const appPath = resourceBase()
  const vendorDir = join(projectPath, 'vendor', 'cortex-game-engine')
  await mkdir(vendorDir, { recursive: true })

  // Bundle do engine (JS): runtime (index.js) + dev (index.dev.js, com editor).
  // O vite.config do projeto escolhe qual usar por `mode` (dev→.dev, build→runtime),
  // então o editor fica fora do build de produção do jogo (ADR-0042).
  await cp(join(appPath, 'dist-engine', 'index.js'), join(vendorDir, 'index.js'))
  await cp(join(appPath, 'dist-engine', 'index.dev.js'), join(vendorDir, 'index.dev.js'))

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

  // Plugin de Vite (Node-only): copiado como JS compilado (+ .d.ts), pois roda
  // no vite.config do projeto — fora do bundle do runtime. O projeto importa de
  // `./vendor/cortex-game-engine/vite/sceneSavePlugin.js`. Ver src/vite/.
  await mkdir(join(vendorDir, 'vite'), { recursive: true })
  for (const ext of ['js', 'd.ts'] as const) {
    await cp(
      join(appPath, 'dist', 'src', 'vite', `sceneSavePlugin.${ext}`),
      join(vendorDir, 'vite', `sceneSavePlugin.${ext}`),
    )
  }
}

/**
 * Lê a doc da API do engine (`docs/cortex-game-engine/engine-api.md`, empacotada
 * no Studio via extraResources — ADR-0034) e a cacheia. É injetada no system
 * prompt do agente (ver ai:chat) pra o Chat IA saber o que o engine expõe ao
 * criar features. Fica no build da IDE, não no projeto.
 */
let cachedEngineApiDoc: string | null = null
async function loadEngineApiDoc(): Promise<string> {
  if (cachedEngineApiDoc !== null) return cachedEngineApiDoc
  try {
    cachedEngineApiDoc = await readFile(
      join(resourceBase(), 'docs', 'cortex-game-engine', 'engine-api.md'),
      'utf-8',
    )
  } catch {
    cachedEngineApiDoc = ''
  }
  return cachedEngineApiDoc
}

/**
 * Lê a **Game Design Bible** (`docs/game-design-bible/`, empacotada via
 * extraResources) — base curada de regras de design de jogos 2.5D/platformer/
 * low poly. Concatena todos os `.md` (com cabeçalho do caminho) e injeta no
 * system prompt do agente, pra a IA já vir orientada a level/game design. Cache.
 */
let cachedGameDesignBible: string | null = null
async function loadGameDesignBible(): Promise<string> {
  if (cachedGameDesignBible !== null) return cachedGameDesignBible
  const root = join(resourceBase(), 'docs', 'game-design-bible')
  const parts: string[] = []
  const walk = async (dir: string): Promise<void> => {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        await walk(full)
      } else if (e.name.toLowerCase().endsWith('.md')) {
        try {
          const content = await readFile(full, 'utf-8')
          const rel = full.slice(root.length + 1).replace(/\\/g, '/')
          parts.push(`===== game-design-bible/${rel} =====\n\n${content.trim()}`)
        } catch {
          /* ignora arquivo ilegível */
        }
      }
    }
  }
  await walk(root)
  cachedGameDesignBible = parts.join('\n\n')
  return cachedGameDesignBible
}

/**
 * Lê o tipo do projeto de `<projectDir>/cortex.json` (`2d` = pixel/ortográfica;
 * `2.5d` = malhas/perspectiva, default). Usado pra orientar o prompt do Chat IA.
 */
async function loadProjectType(projectDir: string | null): Promise<'2d' | '2.5d'> {
  if (!projectDir) return '2.5d'
  try {
    const raw = await readFile(join(projectDir, 'cortex.json'), 'utf-8')
    const parsed = JSON.parse(raw) as { type?: unknown }
    return parsed.type === '2d' ? '2d' : '2.5d'
  } catch {
    return '2.5d'
  }
}

// Copia templates/new-project/ para join(targetDir, name), substitui {{PROJECT_NAME}}
// em cada arquivo copiado, vendoriza o engine em vendor/cortex-game-engine/ e
// retorna o path do novo projeto
ipcMain.handle('fs:createProject', async (_event, targetDir: unknown, name: unknown, kind: unknown) => {
  const safeTarget = validatePath(targetDir)
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('name deve ser uma string não vazia')
  }
  // Impede path traversal no nome: rejeita separadores de path e bytes nulos
  if (name.includes('/') || name.includes('\\') || name.includes('\0')) {
    throw new Error('name não pode conter separadores de path')
  }
  // Tipo do jogo: '2.5d' (default, com malhas/perspectiva) ou '2d' (pixel/ortho).
  const projectKind = kind === '2d' ? '2d' : '2.5d'
  const projectName = name.trim()
  // Projeto criado em subdiretório dedicado dentro de targetDir
  const projectPath = resolve(safeTarget, projectName)
  const templateDir = join(resourceBase(), 'templates', 'new-project')
  await cp(templateDir, projectPath, { recursive: true })
  // 2D: sobrepõe os arquivos específicos (ex.: main.ts ortográfico) por cima da base.
  if (projectKind === '2d') {
    await cp(join(resourceBase(), 'templates', 'variants', '2d'), projectPath, { recursive: true })
  }
  // Marca o tipo do projeto — lido pelo Chat IA pra orientar o prompt (2D vs 2.5D).
  await writeFile(
    join(projectPath, 'cortex.json'),
    JSON.stringify({ engine: 'cortex-game-engine', type: projectKind }, null, 2) + '\n',
    'utf-8',
  )
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
  const appPath = resourceBase()
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
  // de three). Strippa o sufixo '.js' de qualquer import porque o
  // moduleResolution default do Monaco TS (Node legacy) não trata `.js` como
  // mapeamento para `.d.ts`. Vale tanto para paths relativos (`./core/...`)
  // quanto para addons do three (`three/examples/jsm/...`), que sem isso não
  // resolveriam contra @types/three. O bare `three` não tem `.js` e fica intacto.
  const indexRuntime = await readFile(
    join(appPath, 'dist', 'src', 'index-runtime.d.ts'),
    'utf-8',
  )
  const aggregatorContent = indexRuntime.replace(
    /from '([^']+)\.js'/g,
    (_match, modPath: string) => `from '${modPath}'`,
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
  const templateTauriDir = join(resourceBase(), 'templates', 'new-project', 'src-tauri')
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

// ---------------------------------------------------------------------------
// Handlers IPC — preferências do usuário (i18n etc — ADR-0025)
// ---------------------------------------------------------------------------

/**
 * Path do arquivo de preferências: `<userData>/preferences.json`.
 * Vive fora de qualquer projeto, é compartilhado entre execuções da IDE.
 */
function prefsPath(): string {
  return join(app.getPath('userData'), 'preferences.json')
}

interface Preferences {
  locale?: 'en' | 'pt'
  welcomed?: boolean
}

ipcMain.handle('prefs:get', async (): Promise<Preferences> => {
  try {
    const raw = await readFile(prefsPath(), 'utf-8')
    const parsed = JSON.parse(raw) as Preferences
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
})

ipcMain.handle('prefs:set', async (_event, patch: unknown) => {
  if (!patch || typeof patch !== 'object') return
  let current: Preferences = {}
  try {
    const raw = await readFile(prefsPath(), 'utf-8')
    current = JSON.parse(raw) as Preferences
  } catch {
    /* arquivo novo */
  }
  const next = { ...current, ...(patch as Preferences) }
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(prefsPath(), JSON.stringify(next, null, 2), 'utf-8')
  return next
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
    env: envForSpawn(),
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
    env: envForSpawn(),
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
  } else {
    currentProjectDir = validatePath(projectDir)
  }
  // O menu "Projeto" só faz sentido com projeto aberto — reconstrói pra mostrar/ocultar.
  Menu.setApplicationMenu(buildAppMenu())
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
  const dir = validatePath(projectDir)
  try {
    await unlink(chatHistoryPath(dir))
  } catch {
    // ignora se não existe
  }
  // Também descarta o session_id do Agent SDK — senão o próximo turno RETOMA a
  // sessão antiga no backend (com todo o histórico/imagens acumulados) e a UI
  // limpa não corresponde ao que é enviado. Apagar = começar de fato do zero.
  try {
    await unlink(sessionIdPath(dir))
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
  const agentMode = mode === 'auto' ? 'auto' : mode === 'plan' ? 'plan' : 'ask'
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

  const engineApiDoc = await loadEngineApiDoc()
  const gameDesignBible = await loadGameDesignBible()
  const projectType = await loadProjectType(currentProjectDir)

  try {
    await runAgent({
      prompt: lastUserMessage,
      projectRoot: currentProjectDir,
      continueSession,
      resumeSessionId,
      mode: agentMode,
      engineApiDoc,
      gameDesignBible,
      projectType,
      kitsDir: join(resourceBase(), 'kits'),
      // PATH aumentado: a tool Bash do SDK herda este env, então `yarn`/`node`
      // resolvem mesmo no app empacotado (onde o PATH do Explorer não os tem).
      env: envForSpawn(),
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
 * Strings do menu nativo localizadas. Carregadas no boot via `prefs:get`
 * e usadas em `buildAppMenu()`. Quando o usuário troca de idioma no
 * renderer, ele dispara `menu:rebuild` via IPC e o menu é reconstruído.
 */
const MENU_STRINGS = {
  en: {
    project: 'Project',
    close_project: 'Close project',
    generate_installer: 'Generate installer...',
    generate_installer_debug: 'Generate installer (debug)...',
    language: 'Language',
  },
  pt: {
    project: 'Projeto',
    close_project: 'Fechar projeto',
    generate_installer: 'Gerar instalador...',
    generate_installer_debug: 'Gerar instalador (debug)...',
    language: 'Idioma',
  },
} as const

let currentMenuLocale: 'en' | 'pt' = 'en'

/**
 * Monta o Menu principal.
 *
 * - Em **release** (`app.isPackaged === true`) só fica visível o submenu
 *   "Project" (Generate installer + Language). Os defaults do Electron
 *   (File/Edit/View/Window) somem — não fazem sentido pro usuário final
 *   da IDE final e "vazam" comportamento de browser (Reload, DevTools).
 * - Em **dev** (`yarn electron:dev`), os defaults voltam — DevTools,
 *   Reload e Cut/Copy/Paste continuam acessíveis pra debug.
 * - macOS sempre mantém o `appMenu` (com Quit/About) porque sem ele o
 *   Cmd+Q não funciona.
 */
function buildAppMenu(): Menu {
  const isMac = process.platform === 'darwin'
  const s = MENU_STRINGS[currentMenuLocale]

  const projectMenu: MenuItemConstructorOptions = {
    label: s.project,
    submenu: [
      {
        label: s.close_project,
        click: (): void => {
          mainWindow?.webContents.send('menu:close-project')
        },
      },
      { type: 'separator' },
      {
        label: s.generate_installer,
        accelerator: isMac ? 'Cmd+Shift+B' : 'Ctrl+Shift+B',
        click: (): void => {
          mainWindow?.webContents.send('menu:build-installer', { debug: false })
        },
      },
      {
        label: s.generate_installer_debug,
        accelerator: isMac ? 'Cmd+Shift+D' : 'Ctrl+Shift+D',
        click: (): void => {
          mainWindow?.webContents.send('menu:build-installer', { debug: true })
        },
      },
      { type: 'separator' },
      {
        label: s.language,
        submenu: [
          {
            label: 'English',
            type: 'radio',
            checked: currentMenuLocale === 'en',
            click: (): void => {
              mainWindow?.webContents.send('menu:change-locale', 'en')
            },
          },
          {
            label: 'Português',
            type: 'radio',
            checked: currentMenuLocale === 'pt',
            click: (): void => {
              mainWindow?.webContents.send('menu:change-locale', 'pt')
            },
          },
        ],
      },
    ],
  }

  // O menu "Projeto" só aparece com um projeto aberto (na tela inicial não há o que fazer).
  const projectMenus = currentProjectDir ? [projectMenu] : []
  const template: MenuItemConstructorOptions[] = app.isPackaged
    ? [...(isMac ? [{ role: 'appMenu' as const }] : []), ...projectMenus]
    : [
        ...(isMac ? [{ role: 'appMenu' as const }] : []),
        { role: 'fileMenu' },
        { role: 'editMenu' },
        { role: 'viewMenu' },
        ...projectMenus,
        { role: 'windowMenu' },
      ]

  return Menu.buildFromTemplate(template)
}

// Renderer chama isso quando o usuário troca de idioma no Welcome ou
// nas configurações — assim o menu nativo acompanha sem reload.
ipcMain.handle('menu:rebuild', async (_event, locale: unknown) => {
  if (locale === 'en' || locale === 'pt') {
    currentMenuLocale = locale
    Menu.setApplicationMenu(buildAppMenu())
  }
})

// ---------------------------------------------------------------------------
// Ciclo de vida do app
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  // Lê o locale persistido pra montar o menu nativo no idioma certo
  // já no primeiro frame (evita o "flash" do menu em inglês quando o
  // usuário tem PT escolhido).
  try {
    const raw = await readFile(prefsPath(), 'utf-8')
    const prefs = JSON.parse(raw) as { locale?: 'en' | 'pt' }
    if (prefs.locale === 'en' || prefs.locale === 'pt') currentMenuLocale = prefs.locale
  } catch {
    /* sem preferências ainda — usa 'en' default */
  }
  Menu.setApplicationMenu(buildAppMenu())
  createSplash()
  createWindow()

  // macOS: recria a janela ao clicar no ícone do dock quando não há janelas abertas
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Ao fechar o Studio, mata o vite/terminal SINCRONAMENTE — senão o `vite` (neto
// do shell) vira processo órfão segurando a porta, e na próxima abertura a porta
// fica presa. `before-quit` cobre o fechamento normal (window-all-closed→quit).
app.on('before-quit', () => {
  for (const proc of [runningProcess, terminalProcess]) {
    if (!proc?.pid) continue
    try {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'])
      } else {
        proc.kill('SIGKILL')
      }
    } catch {
      /* best-effort no shutdown */
    }
  }
  runningProcess = null
  terminalProcess = null
})

app.on('window-all-closed', () => {
  // Em plataformas que não sejam macOS, encerra o app ao fechar todas as janelas
  if (process.platform !== 'darwin') app.quit()
})
