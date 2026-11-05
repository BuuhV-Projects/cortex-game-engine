/**
 * Engine dentro do projeto: vendoring (`vendor/cortex-game-engine/`), criação
 * de projeto a partir do template, types do engine pro Monaco e a doc da API
 * do engine que o Chat IA consome. SPEC-0693.
 */
import { ipcMain } from 'electron'
import { join, resolve } from 'path'
import { readdir, readFile, writeFile, cp, mkdir } from 'fs/promises'
import { spawnSync } from 'child_process'
import { VENDOR_TYPE_MODULES } from './vendorTypeModules.js'
import { ensureGitignoreEntry, envForSpawn, resourceBase, validatePath } from './shared.js'

/**
 * Vendoriza o engine dentro de <projectPath>/vendor/cortex-game-engine/:
 * - index.js: bundle único do engine (com three embutido), de dist-engine/
 * - core/*.d.ts e ecs/*.d.ts: types copiados de dist/src/
 * - index.d.ts: agregador minimal re-exportando só core+ecs
 *
 * Os recursos vêm de resourceBase() (process.resourcesPath em produção, via
 * electron-builder.json#extraResources). Ver ADR-0034.
 */
export async function vendorEngine(projectPath: string): Promise<void> {
  const appPath = resourceBase()
  const vendorDir = join(projectPath, 'vendor', 'cortex-game-engine')
  await mkdir(vendorDir, { recursive: true })

  // Bundle do engine (JS): runtime (index.js) + dev (index.dev.js, com editor).
  // O vite.config do projeto escolhe qual usar por `mode` (dev→.dev, build→runtime),
  // então o editor fica fora do build de produção do jogo (ADR-0042).
  await cp(join(appPath, 'dist-engine', 'index.js'), join(vendorDir, 'index.js'))
  await cp(join(appPath, 'dist-engine', 'index.dev.js'), join(vendorDir, 'index.dev.js'))
  // O Studio precisa do transcoder local para GLBs com KHR_texture_basisu.
  await cp(join(appPath, 'dist-engine', 'basis'), join(vendorDir, 'basis'), { recursive: true })
  // Chunk separado do Rapier (WASM ~2 MB): o index.js/index.dev.js o carregam via
  // dynamic import `./rapier.js` SÓ quando há física (TDR-0002). Vai ao lado deles.
  await cp(join(appPath, 'dist-engine', 'rapier.js'), join(vendorDir, 'rapier.js'))

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

  // Contrato de glifos da UI (ADR-0170/SPEC-0171): quais codepoints a fonte do
  // export nativo tem. Vai vendoriado porque o teste de UI do JOGO lint(a) os
  // textos contra ele — sem isso o glifo fora da fonte só apareceria como
  // caixinha rodando o export (foi o caso do ícone do guarda-roupa do teste4).
  await cp(
    join(appPath, 'dist-engine', 'ui-font-glyphs.json'),
    join(vendorDir, 'ui-font-glyphs.json'),
  )

  // Plugin de Vite (Node-only): copiado como JS compilado (+ .d.ts), pois roda
  // no vite.config do projeto — fora do bundle do runtime. O projeto importa de
  // `./vendor/cortex-game-engine/vite/sceneSavePlugin.js`. Ver src/vite/.
  // hotReloadPlugin: fronteiras de hot reload de script e GLB (SPEC-0697).
  await mkdir(join(vendorDir, 'vite'), { recursive: true })
  for (const plugin of ['sceneSavePlugin', 'hotReloadPlugin'] as const) {
    for (const ext of ['js', 'd.ts'] as const) {
      await cp(
        join(appPath, 'dist', 'src', 'vite', `${plugin}.${ext}`),
        join(vendorDir, 'vite', `${plugin}.${ext}`),
      )
    }
  }
}

/**
 * Lê a doc da API do engine (`docs/cortex-game-engine/engine-api.md`, empacotada
 * no Studio via extraResources — ADR-0034) e a cacheia. O agentLoop injeta o
 * ÍNDICE dela no system prompt e o agente lê seções sob demanda via Read
 * (ADR-0114). Fica no build da IDE, não no projeto.
 */
let cachedEngineApiDoc: string | null = null
export function engineApiDocPath(): string {
  return join(resourceBase(), 'docs', 'cortex-game-engine', 'engine-api.md')
}
export async function loadEngineApiDoc(): Promise<string> {
  if (cachedEngineApiDoc !== null) return cachedEngineApiDoc
  try {
    cachedEngineApiDoc = await readFile(engineApiDocPath(), 'utf-8')
  } catch {
    cachedEngineApiDoc = ''
  }
  return cachedEngineApiDoc
}

/**
 * Inicializa um repo git no projeto novo (branch `main`) e faz o **commit inicial**
 * com o template. Best-effort: se `git` não existir ou algum passo falhar, ignora
 * (criar o projeto não pode quebrar por causa do git). Usa a identidade global do
 * usuário se houver; senão, um autor padrão só pra o commit não falhar.
 */
function gitInitialCommit(projectPath: string): void {
  const git = (args: string[]): boolean => {
    const r = spawnSync('git', args, { cwd: projectPath, env: envForSpawn(projectPath) })
    return r.status === 0
  }
  try {
    // `git init -b main` (git ≥ 2.28). Fallback p/ versões antigas: init + renomeia.
    if (!git(['init', '-b', 'main'])) {
      if (!git(['init'])) return // git indisponível — desiste
      git(['checkout', '-b', 'main'])
    }
    if (!git(['add', '-A'])) return
    const msg = 'chore: projeto inicial (template Cortex)'
    // Respeita a identidade global; se ausente, commit não falha (autor padrão).
    if (!git(['commit', '-m', msg])) {
      git(['-c', 'user.name=Cortex', '-c', 'user.email=cortex@localhost', 'commit', '-m', msg])
    }
  } catch {
    /* best-effort — nunca quebra a criação do projeto */
  }
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

export function registerEngineIpc(): void {
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
    const templateDir = join(resourceBase(), 'templates', 'new-project')
    await cp(templateDir, projectPath, { recursive: true })
    // Marca de projeto do engine + IDENTIDADE do jogo (ADR-0126):
    //  - `id`: slug ESTÁVEL (= nome da pasta na criação). Chaveia os SAVES no host
    //    nativo — nunca muda, mesmo que o usuário renomeie o `name`. Renomear o
    //    display não pode órfãos os saves nem colidir entre jogos (o exe exportado
    //    é fixo `launcher.exe`, então o nome do exe não serve mais de chave).
    //  - `name`: nome de EXIBIÇÃO (título da janela, Meus Programas, console).
    //    Editável nas Configurações do jogo (Studio). Default = nome do projeto.
    // Não há "tipo" de projeto: o engine é 3D por padrão e 2D/2.5D são questão de
    // câmera/render, decididas no código do jogo (ADR-0062).
    await writeFile(
      join(projectPath, 'cortex.json'),
      JSON.stringify({ engine: 'cortex-game-engine', id: projectName, name: projectName }, null, 2) + '\n',
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
    // git init + commit inicial = "primeira versão do jogo" (o template). node_modules/
    // dist/src-tauri ficam de fora pelo .gitignore; vendor/ entra (engine é parte do
    // projeto, ADR-0009). Roda ANTES do install — commit limpo. Falha em silêncio se
    // git não estiver instalado (o projeto é criado mesmo assim).
    gitInitialCommit(projectPath)
    return projectPath
  })

  // Re-vendoriza o engine num projeto JÁ existente (opção do studio): copia o bundle
  // + .d.ts atuais do IDE pro `vendor/cortex-game-engine` do projeto. Útil quando o
  // engine atualizou e o vendor do projeto ficou velho (ex.: símbolo novo "exportado
  // mas não encontrado" no projeto). Em dev, pega o build atual de dist-engine/dist.
  ipcMain.handle('engine:revendor', async (_event, projectDir: unknown) => {
    const safeDir = validatePath(projectDir)
    await vendorEngine(safeDir)
  })

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
}
