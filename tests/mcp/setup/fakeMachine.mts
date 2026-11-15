/**
 * Máquina falsa para os testes do `cortex-setup` (SPEC-0738): respostas por linha de comando e registro das
 * chamadas.
 */
import type { RunOptions, RunResult, SetupDeps } from '../../../mcp/setup/commands.js'

export interface Call {
  cmd: string
  args: readonly string[]
  shell: boolean
}

export interface FakeMachine extends SetupDeps {
  calls: Call[]
}

export interface FakeSpec {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  /** `"cmd arg1 arg2"` → resposta; o que não estiver aqui sai com status `null` (não abriu). */
  commands?: Record<string, RunResult | string>
  files?: string[]
  dirs?: Record<string, string[]>
}

export const PROGRAM_FILES = 'C:\\Program Files'

export function ok(stdout: string): RunResult {
  return { status: 0, stdout }
}

export function fail(stdout = ''): RunResult {
  return { status: 1, stdout }
}

export function fakeMachine(spec: FakeSpec = {}): FakeMachine {
  const calls: Call[] = []
  const files = new Set(spec.files ?? [])
  return {
    calls,
    platform: spec.platform ?? 'win32',
    env: spec.env ?? { ProgramFiles: PROGRAM_FILES },
    exists: (p) => files.has(p),
    listDirs: (p) => spec.dirs?.[p] ?? [],
    run: (cmd: string, args: readonly string[], opts?: RunOptions) => {
      calls.push({ cmd, args, shell: opts?.shell ?? false })
      const answer = spec.commands?.[[cmd, ...args].join(' ')]
      if (answer === undefined) return { status: null, stdout: '' }
      return typeof answer === 'string' ? ok(answer) : answer
    },
  }
}
