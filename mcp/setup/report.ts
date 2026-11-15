/**
 * Relatório do `cortex-setup` (SPEC-0738): o texto que o instalador mostra na `MessageBox` e grava em
 * `requisitos.txt`, e a forma JSON (`--json`).
 */
import type { RegisterResult, UnregisterResult } from './registerMcp.js'
import type { RequirementResult } from './requirements.js'

export interface SetupOutcome {
  requirements: RequirementResult[] | null
  registration: RegisterResult | null
  unregistration: UnregisterResult | null
  /** Como rodar o `--register` depois (exe do Studio em modo Node). */
  registerLaterCommand: string
}

const OK_MARK = '✓'
const FAIL_MARK = '✗'
const LEVEL_LABEL: Record<RequirementResult['level'], string> = {
  'required-for-ai': 'obrigatório para IA',
  recommended: 'recomendado',
}

/** Linha para rodar o registro depois; no Windows, no `cmd.exe`. */
export function registerLaterCommand(platform: NodeJS.Platform, exe: string, setupScript: string): string {
  const run = `"${exe}" "${setupScript}" --register`
  return platform === 'win32' ? `set ELECTRON_RUN_AS_NODE=1 && ${run}` : `ELECTRON_RUN_AS_NODE=1 ${run}`
}

function requirementLines(r: RequirementResult): string[] {
  const lines = [`${r.ok ? OK_MARK : FAIL_MARK} ${r.name} (${LEVEL_LABEL[r.level]}): ${r.message}`]
  if (r.path) lines.push(`    caminho: ${r.path}`)
  if (!r.ok) lines.push(`    instalar: ${r.installUrl}`)
  return lines
}

function registrationLines(reg: RegisterResult, later: string): string[] {
  if (reg.status === 'registered') return [`${OK_MARK} MCP cortex registrado no Claude Code.`]
  const head =
    reg.status === 'pending-claude-missing'
      ? `${FAIL_MARK} MCP cortex não registrado: falta o Claude Code.`
      : `${FAIL_MARK} MCP cortex: o registro falhou (${reg.detail ?? 'sem detalhe'}).`
  return [head, '    Depois de instalar o Claude Code, registre com:', `    ${later}`]
}

function unregistrationLine(un: UnregisterResult): string {
  if (un.status === 'removed') return `${OK_MARK} MCP cortex removido do Claude Code.`
  if (un.status === 'claude-missing') return 'MCP cortex: Claude Code não encontrado, nada a remover.'
  return 'MCP cortex: não estava registrado.'
}

export function formatReport(outcome: SetupOutcome): string {
  const lines: string[] = []
  if (outcome.requirements) {
    lines.push('Requisitos do TS Cortex Studio', '')
    for (const r of outcome.requirements) lines.push(...requirementLines(r))
    lines.push('', 'O editor funciona sem esses requisitos; eles servem à parte de IA, ao auto-rig e ao Git.')
  }
  if (outcome.registration) {
    if (lines.length) lines.push('')
    lines.push(...registrationLines(outcome.registration, outcome.registerLaterCommand))
  }
  if (outcome.unregistration) {
    if (lines.length) lines.push('')
    lines.push(unregistrationLine(outcome.unregistration))
  }
  return lines.join('\n') + '\n'
}

const JSON_INDENT = 2

export function formatJson(outcome: SetupOutcome, exitCode: number): string {
  return JSON.stringify({ ...outcome, exitCode }, null, JSON_INDENT) + '\n'
}
