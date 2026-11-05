/**
 * Utilidades compartilhadas pelos módulos do main process (SPEC-0693):
 * validação de path, env dos spawns, `.gitignore`, base de recursos e as
 * referências de processo (janela principal, projeto ativo).
 */
import { app, type BrowserWindow } from 'electron'
import { join, resolve, delimiter } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'

// ---------------------------------------------------------------------------
// Janela principal + projeto ativo
// ---------------------------------------------------------------------------

// Referência à janela principal — usada pelos handlers para enviar eventos ao renderer
let mainWindow: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win
}

/** Envia um evento ao renderer da janela principal (no-op sem janela). */
export function sendToRenderer(channel: string, ...args: unknown[]): void {
  mainWindow?.webContents.send(channel, ...args)
}

// Projeto ativo (ADR-0017): sandbox das tools do agente. Atualizado via
// IPC `project:setActive` quando o renderer dispara o evento `project-open`.
let currentProjectDir: string | null = null

export function getCurrentProjectDir(): string | null {
  return currentProjectDir
}

export function setCurrentProjectDir(dir: string | null): void {
  currentProjectDir = dir
}

// ---------------------------------------------------------------------------
// Segurança: validação de path traversal
// ---------------------------------------------------------------------------

/**
 * Resolve o path para sua forma absoluta e rejeita bytes nulos.
 * path.resolve() remove quaisquer segmentos ".." e retorna sempre
 * um caminho absoluto — suficiente para impedir path traversal simples.
 */
export function validatePath(inputPath: unknown): string {
  if (typeof inputPath !== 'string') {
    throw new Error('Path deve ser uma string')
  }
  if (inputPath.includes('\0')) {
    throw new Error('Path contém byte nulo')
  }
  return resolve(inputPath)
}

// ---------------------------------------------------------------------------
// Env dos spawns
// ---------------------------------------------------------------------------

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
export function envForSpawn(projectDir?: string): NodeJS.ProcessEnv {
  const env = { ...process.env }
  const candidates = [
    // `node_modules/.bin` do PROJETO primeiro — garante rodar o `vite`/`tsc` LOCAL
    // (resolve as deps do próprio projeto). Sem isso, `spawn('vite')` dependia de
    // um vite GLOBAL no PATH (versão diferente) e o dev server falhava com
    // "Cannot find package 'vite'" mesmo com o vite instalado no projeto.
    projectDir ? join(projectDir, 'node_modules', '.bin') : null,
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

// ---------------------------------------------------------------------------
// Arquivos do projeto + recursos do Studio
// ---------------------------------------------------------------------------

/**
 * Garante (idempotente) que `pattern` está numa linha própria no `.gitignore`
 * de `projectDir`. Cria o arquivo se não existir.
 *
 * A regra `src-tauri/` é injetada por aqui em vez de viver no `.gitignore`
 * do template porque o git aplica `.gitignore` aninhados também durante
 * operações no repo da IDE — se o template tivesse `src-tauri/`, o repo
 * da IDE deixaria de trackear `templates/new-project/src-tauri/`.
 */
export async function ensureGitignoreEntry(projectDir: string, pattern: string): Promise<void> {
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
export function resourceBase(): string {
  const appPath = app.getAppPath()
  return appPath.endsWith('.asar') ? process.resourcesPath : appPath
}
