/**
 * Entrada do bundle `resources/mcp/cortex-setup.mjs` (SPEC-0738). Roda com o exe do Studio em modo Node
 * (`ELECTRON_RUN_AS_NODE=1`), chamado pelo instalador NSIS (`build/installer.nsh`) ou à mão.
 *
 *   --check        verifica os requisitos (padrão quando nenhuma ação é pedida)
 *   --register     registra o MCP `cortex` no Claude Code (scope user)
 *   --unregister   remove o registro (best-effort, sempre sai 0)
 *   --json         stdout em JSON em vez de texto
 *   --report <arq> grava o relatório em texto (UTF-16LE com BOM, o que o NSIS lê)
 *
 * Saída: 0 tudo ok; 1 faltou requisito obrigatório ou o registro falhou; 2 erro do próprio setup.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RunResult, SetupDeps } from './commands.js'
import { registerMcp, setupScriptPath, unregisterMcp } from './registerMcp.js'
import { formatJson, formatReport, registerLaterCommand, type SetupOutcome } from './report.js'
import { checkRequirements, requiredOk } from './requirements.js'

export const EXIT_OK = 0
export const EXIT_MISSING = 1
export const EXIT_SETUP_ERROR = 2

/** `blender --version` abre o Blender sem UI e pode demorar alguns segundos. */
const RUN_TIMEOUT_MS = 60_000
const UTF16_BOM = '﻿'

export interface CliOptions {
  check: boolean
  register: boolean
  unregister: boolean
  json: boolean
  report: string | null
}

export interface CliDeps extends SetupDeps {
  /** O exe do Studio (`process.execPath`). */
  exe: string
  /** A pasta `resources` do Studio instalado. */
  resources: string
  stdout: (text: string) => void
  stderr: (text: string) => void
  writeReport: (path: string, text: string) => void
}

export class UsageError extends Error {}

export function parseArgs(argv: readonly string[]): CliOptions {
  const opts: CliOptions = { check: false, register: false, unregister: false, json: false, report: null }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--check') opts.check = true
    else if (arg === '--register') opts.register = true
    else if (arg === '--unregister') opts.unregister = true
    else if (arg === '--json') opts.json = true
    else if (arg === '--report') {
      const file = argv[++i]
      if (!file) throw new UsageError('--report precisa do caminho do arquivo')
      opts.report = file
    } else throw new UsageError(`flag desconhecida: ${arg}`)
  }
  if (opts.register && opts.unregister) throw new UsageError('--register e --unregister não combinam')
  if (!opts.check && !opts.register && !opts.unregister) opts.check = true
  return opts
}

function run(opts: CliOptions, deps: CliDeps): { outcome: SetupOutcome; code: number } {
  const target = { exe: deps.exe, resources: deps.resources }
  const outcome: SetupOutcome = {
    requirements: opts.check ? checkRequirements(deps) : null,
    registration: opts.register ? registerMcp(deps, target) : null,
    unregistration: opts.unregister ? unregisterMcp(deps) : null,
    registerLaterCommand: registerLaterCommand(deps.platform, deps.exe, setupScriptPath(deps.resources)),
  }
  const missing = outcome.requirements !== null && !requiredOk(outcome.requirements)
  const failedRegister = outcome.registration !== null && outcome.registration.status !== 'registered'
  return { outcome, code: missing || failedRegister ? EXIT_MISSING : EXIT_OK }
}

/** Testável: nada de `process` aqui dentro, tudo vem de `deps`. */
export function main(argv: readonly string[], deps: CliDeps): number {
  try {
    const opts = parseArgs(argv)
    const { outcome, code } = run(opts, deps)
    const text = formatReport(outcome)
    if (opts.report) deps.writeReport(opts.report, text)
    deps.stdout(opts.json ? formatJson(outcome, code) : text)
    return code
  } catch (err) {
    deps.stderr(`cortex-setup: ${err instanceof Error ? err.message : String(err)}\n`)
    return EXIT_SETUP_ERROR
  }
}

/** UTF-16LE com BOM e CRLF: o `FileReadUTF16LE` do NSIS e o Bloco de Notas leem sem trocar acento. */
export function writeReportFile(path: string, text: string): void {
  writeFileSync(path, UTF16_BOM + text.replace(/\r?\n/g, '\r\n'), 'utf16le')
}

function systemRun(cmd: string, args: readonly string[], opts?: { shell?: boolean }): RunResult {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: opts?.shell ?? false, timeout: RUN_TIMEOUT_MS, windowsHide: true })
  return { status: r.error ? null : r.status, stdout: r.stdout ?? '' }
}

function listDirs(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  } catch {
    return []
  }
}

const SCRIPT_PATH = fileURLToPath(import.meta.url)

/** `CORTEX_RESOURCES`, ou a pasta acima de `resources/mcp/` (onde mora o bundle). */
export function defaultResources(env: NodeJS.ProcessEnv, scriptPath: string): string {
  return env['CORTEX_RESOURCES'] || dirname(dirname(scriptPath))
}

export function systemDeps(): CliDeps {
  return {
    run: systemRun,
    exists: existsSync,
    listDirs,
    env: process.env,
    platform: process.platform,
    exe: process.execPath,
    resources: defaultResources(process.env, SCRIPT_PATH),
    stdout: (t) => process.stdout.write(t),
    stderr: (t) => process.stderr.write(t),
    writeReport: writeReportFile,
  }
}

function isEntry(): boolean {
  const invoked = process.argv[1]
  if (!invoked) return false
  const norm = (p: string) => (process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p))
  return norm(invoked) === norm(SCRIPT_PATH)
}

if (isEntry()) process.exitCode = main(process.argv.slice(2), systemDeps())
