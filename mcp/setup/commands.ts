/**
 * Execução de comandos do `cortex-setup` (SPEC-0738). Tudo que toca a máquina entra por `SetupDeps`, para os
 * testes rodarem sem Claude Code, Blender ou Git instalados.
 */

export interface RunResult {
  /** Código de saída; `null` quando o processo nem abriu (comando inexistente, timeout). */
  status: number | null
  stdout: string
  /** Saída de erro; o `claude mcp add` escreve a falha aqui. */
  stderr?: string
}

export interface RunOptions {
  /** Passa pelo shell (`cmd.exe`): obrigatório para `.cmd`/`.bat` no Windows. */
  shell?: boolean
}

export type RunCommand = (cmd: string, args: readonly string[], opts?: RunOptions) => RunResult

export interface SetupDeps {
  run: RunCommand
  exists: (path: string) => boolean
  /** Pastas de um diretório (vazio se não existe) — usado pelo localizador do Blender. */
  listDirs: (path: string) => string[]
  env: NodeJS.ProcessEnv
  platform: NodeJS.Platform
}

/** Um executável achado pelo `where`/`which`. */
export interface ResolvedCommand {
  path: string
  /** `.cmd`/`.bat` do Windows: só roda pelo shell. */
  shell: boolean
}

const SUCCESS = 0
const WIN_SHELL_EXTENSIONS = ['.cmd', '.bat']
/** Ordem de preferência no Windows: o `.exe` nativo roda sem shell. */
const WIN_EXTENSION_PREFERENCE = ['.exe', ...WIN_SHELL_EXTENSIONS]
/** Caracteres que obrigam aspas numa linha de comando do `cmd.exe`. */
const CMD_SPECIAL = /[\s"&|<>^()%!,;=]/

function extensionRank(path: string): number {
  const lower = path.toLowerCase()
  return WIN_EXTENSION_PREFERENCE.findIndex((ext) => lower.endsWith(ext))
}

/** O executável `name` no PATH, ou `null`. No Windows prefere `.exe` a `.cmd` e ignora o shim sem extensão. */
export function resolveCommand(deps: SetupDeps, name: string): ResolvedCommand | null {
  const win = deps.platform === 'win32'
  const result = deps.run(win ? 'where' : 'which', [name])
  if (result.status !== SUCCESS) return null
  const lines = result.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!win) return lines[0] ? { path: lines[0], shell: false } : null
  const ranked = lines.filter((l) => extensionRank(l) >= 0).sort((a, b) => extensionRank(a) - extensionRank(b))
  const best = ranked[0]
  if (!best) return null
  const lower = best.toLowerCase()
  return { path: best, shell: WIN_SHELL_EXTENSIONS.some((ext) => lower.endsWith(ext)) }
}

/** Aspas para o `cmd.exe` (aspas internas dobradas); argumento simples passa como está. */
export function quoteForCmd(arg: string): string {
  if (arg !== '' && !CMD_SPECIAL.test(arg)) return arg
  return `"${arg.replace(/"/g, '""')}"`
}

/** Roda um comando resolvido; pelo shell, cada pedaço vai entre aspas (caminhos com espaço). */
export function runResolved(deps: SetupDeps, cmd: ResolvedCommand, args: readonly string[]): RunResult {
  if (!cmd.shell) return deps.run(cmd.path, args)
  return deps.run(quoteForCmd(cmd.path), args.map(quoteForCmd), { shell: true })
}

/** Linha de comando legível (para o relatório). */
export function displayCommand(cmd: string, args: readonly string[]): string {
  return [cmd, ...args].map(quoteForCmd).join(' ')
}

export function succeeded(result: RunResult): boolean {
  return result.status === SUCCESS
}
