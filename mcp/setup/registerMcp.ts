/**
 * Registro do MCP `cortex` no Claude Code do dev (SPEC-0738), pelo CLI público `claude mcp` (ADR-0736: nada de
 * escrever no `~/.claude.json`).
 */
import { join } from 'node:path'
import { displayCommand, resolveCommand, runResolved, succeeded, type ResolvedCommand, type SetupDeps } from './commands.js'

export const MCP_NAME = 'cortex'
export const MCP_SCRIPT = 'cortex-mcp.mjs'
export const SETUP_SCRIPT = 'cortex-setup.mjs'
const MCP_DIR = 'mcp'
const SCOPE = ['--scope', 'user']
const RUN_AS_NODE = 'ELECTRON_RUN_AS_NODE=1'

/** O que o Claude Code vai rodar: o exe do Studio em modo Node + o bundle do MCP. */
export interface McpTarget {
  exe: string
  resources: string
}

export type RegisterStatus = 'registered' | 'pending-claude-missing' | 'failed'
export type UnregisterStatus = 'removed' | 'not-registered' | 'claude-missing'

export interface RegisterResult {
  status: RegisterStatus
  claudePath: string | null
  /** O `claude mcp add ...` (o que rodou, ou o que rodar depois). */
  command: string
  detail: string | null
}

export interface UnregisterResult {
  status: UnregisterStatus
  claudePath: string | null
}

export function mcpScriptPath(resources: string): string {
  return join(resources, MCP_DIR, MCP_SCRIPT)
}

export function setupScriptPath(resources: string): string {
  return join(resources, MCP_DIR, SETUP_SCRIPT)
}

export function removeArgs(): string[] {
  return ['mcp', 'remove', ...SCOPE, MCP_NAME]
}

export function addArgs(target: McpTarget): string[] {
  return ['mcp', 'add', ...SCOPE, MCP_NAME, '-e', RUN_AS_NODE, '--', target.exe, mcpScriptPath(target.resources)]
}

/** `undefined` = resolver agora pelo `where`/`which`; `null` = já se sabe que não há Claude Code. */
function claudeOf(deps: SetupDeps, claude: ResolvedCommand | null | undefined): ResolvedCommand | null {
  return claude === undefined ? resolveCommand(deps, 'claude') : claude
}

/** Remove o registro antigo (falha ignorada: pode não existir) e registra com o exe/recursos atuais. */
export function registerMcp(deps: SetupDeps, target: McpTarget, claude?: ResolvedCommand | null): RegisterResult {
  const resolved = claudeOf(deps, claude)
  const args = addArgs(target)
  if (!resolved) {
    return { status: 'pending-claude-missing', claudePath: null, command: displayCommand('claude', args), detail: null }
  }
  runResolved(deps, resolved, removeArgs())
  const result = runResolved(deps, resolved, args)
  const command = displayCommand(resolved.path, args)
  if (succeeded(result)) return { status: 'registered', claudePath: resolved.path, command, detail: null }
  // o `claude mcp add` escreve o erro no stderr; o stdout fica de reserva
  const output = result.stderr?.trim() || result.stdout.trim()
  const detail = output || `código de saída ${result.status ?? 'desconhecido'}`
  return { status: 'failed', claudePath: resolved.path, command, detail }
}

/** Best-effort: sem Claude Code ou sem registro, não há o que remover. */
export function unregisterMcp(deps: SetupDeps, claude?: ResolvedCommand | null): UnregisterResult {
  const resolved = claudeOf(deps, claude)
  if (!resolved) return { status: 'claude-missing', claudePath: null }
  const result = runResolved(deps, resolved, removeArgs())
  return { status: succeeded(result) ? 'removed' : 'not-registered', claudePath: resolved.path }
}
