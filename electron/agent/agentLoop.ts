import { query, type Options, type PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import { createBlenderToolServer } from './tools/blender.js'

/**
 * Loop do agente usando @anthropic-ai/claude-agent-sdk (ADR-0017 V2).
 *
 * O SDK faz quase tudo: roda o backend Claude Code, gerencia sessão,
 * autenticação (OAuth do `claude login` ou ANTHROPIC_API_KEY no env),
 * stream de mensagens, tools nativas (Read/Write/Edit/Bash/Glob/Grep).
 *
 * Nosso código só precisa:
 * - configurar cwd, allowedTools, systemPrompt;
 * - implementar canUseTool pra rotear aprovação ao renderer (ADR-0018);
 * - traduzir as mensagens do SDK em eventos pra UI (chunks, tool cards).
 */

const AGENT_SYSTEM_PROMPT = `\
Você é um assistente embutido em um IDE para o cortex-game-engine — um motor \
de jogos 3D em TypeScript com arquitetura Entity-Component-System (ECS) e \
renderização via Three.js.

Diretrizes:
- Todos os arquivos que você edita ou cria devem ficar dentro do projeto \
aberto (cwd). Não acesse arquivos fora dele.
- Sempre que possível, leia arquivos existentes antes de propor mudanças.
- Responda em português. Quando escrever código, prefira TypeScript moderno \
(ES2022+) e siga o padrão ECS do engine.
- Seja conciso. Não repita o que as ferramentas já mostram no output.`

const APPROVED_AUTO_TOOLS = new Set(['Read', 'Glob', 'Grep', 'NotebookRead'])

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ToolRequest {
  id: string
  name: string
  input: Record<string, unknown>
  summary: string
  needsApproval: boolean
}

export interface ToolExecutionResult {
  content: string
  isError: boolean
}

export interface TurnStats {
  /** Duração total do turno em milissegundos. */
  durationMs: number
  /** Custo estimado em USD (já calculado pelo SDK). */
  costUsd: number
  /** Tokens de input enviados (não inclui cache hits). */
  inputTokens: number
  /** Tokens de output gerados. */
  outputTokens: number
  /** Tokens lidos do cache (mais baratos). */
  cacheReadTokens: number
}

export interface AgentEvents {
  onTextChunk(text: string): void
  onToolRequest(request: ToolRequest): void
  onToolExecuted(id: string, result: ToolExecutionResult): void
  onDone(stopReason: string | null, stats: TurnStats | null): void
  onError(err: unknown): void
}

export interface AgentApproval {
  /** Pergunta ao usuário se uma tool destrutiva pode rodar. */
  requestApproval(request: ToolRequest): Promise<boolean>
}

export interface RunAgentOptions {
  prompt: string
  projectRoot: string | null
  events: AgentEvents
  approval: AgentApproval
  abortController: AbortController
  /** true no primeiro turno do projeto; demais turnos usam continue:true */
  continueSession: boolean
}

/**
 * Roda um turno do agente. `prompt` é só a mensagem atual do usuário;
 * o SDK persiste o histórico por sessão (chave = cwd) quando passamos
 * `continue: true`.
 */
export async function runAgent(opts: RunAgentOptions): Promise<void> {
  // Tools customizadas ficam num MCP server in-process — só carregadas quando
  // há projeto aberto (precisam de projectRoot pra resolver paths relativos).
  const mcpServers = opts.projectRoot
    ? { 'cortex-blender': createBlenderToolServer(opts.projectRoot) }
    : undefined

  const queryOptions: Options = {
    cwd: opts.projectRoot ?? undefined,
    systemPrompt: { type: 'preset', preset: 'claude_code', append: AGENT_SYSTEM_PROMPT },
    continue: opts.continueSession || undefined,
    abortController: opts.abortController,
    mcpServers,
    canUseTool: async (toolName, input) => {
      if (APPROVED_AUTO_TOOLS.has(toolName)) {
        return { behavior: 'allow', updatedInput: input } as PermissionResult
      }
      const request: ToolRequest = {
        id: makeId(),
        name: toolName,
        input,
        summary: buildSummary(toolName, input),
        needsApproval: true,
      }
      opts.events.onToolRequest(request)
      const approved = await opts.approval.requestApproval(request)
      if (!approved) {
        const denied: ToolExecutionResult = {
          content: 'Usuário negou esta operação.',
          isError: true,
        }
        opts.events.onToolExecuted(request.id, denied)
        return { behavior: 'deny', message: 'Usuário negou esta operação.' } as PermissionResult
      }
      return { behavior: 'allow', updatedInput: input } as PermissionResult
    },
  }

  try {
    const q = query({ prompt: opts.prompt, options: queryOptions })
    for await (const message of q) {
      handleSdkMessage(message, opts.events)
    }
  } catch (err) {
    opts.events.onError(err)
  }
}

function handleSdkMessage(message: unknown, events: AgentEvents): void {
  const msg = message as { type?: string }
  if (!msg || typeof msg.type !== 'string') return

  switch (msg.type) {
    case 'assistant': {
      const blocks = (msg as { message?: { content?: Array<{ type?: string; text?: string }> } })
        .message?.content
      if (!blocks) return
      for (const block of blocks) {
        if (block.type === 'text' && typeof block.text === 'string') {
          events.onTextChunk(block.text)
        }
      }
      return
    }
    case 'user': {
      // Mensagens 'user' que voltam carregam tool_result blocks da execução
      const blocks = (msg as { message?: { content?: unknown[] } }).message?.content
      if (!Array.isArray(blocks)) return
      for (const block of blocks) {
        const b = block as { type?: string; tool_use_id?: string; content?: unknown; is_error?: boolean }
        if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
          const content = stringifyToolResult(b.content)
          events.onToolExecuted(b.tool_use_id, { content, isError: b.is_error === true })
        }
      }
      return
    }
    case 'result': {
      const m = msg as {
        subtype?: string
        duration_ms?: number
        total_cost_usd?: number
        usage?: {
          input_tokens?: number
          output_tokens?: number
          cache_read_input_tokens?: number
        }
      }
      const stats: TurnStats | null =
        typeof m.duration_ms === 'number'
          ? {
              durationMs: m.duration_ms,
              costUsd: typeof m.total_cost_usd === 'number' ? m.total_cost_usd : 0,
              inputTokens: m.usage?.input_tokens ?? 0,
              outputTokens: m.usage?.output_tokens ?? 0,
              cacheReadTokens: m.usage?.cache_read_input_tokens ?? 0,
            }
          : null
      events.onDone(m.subtype ?? null, stats)
      return
    }
    default:
      return
  }
}

function stringifyToolResult(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        const block = b as { type?: string; text?: string }
        if (block.type === 'text' && typeof block.text === 'string') return block.text
        return JSON.stringify(b)
      })
      .join('\n')
  }
  return JSON.stringify(content)
}

function buildSummary(toolName: string, input: Record<string, unknown>): string {
  const path = typeof input['file_path'] === 'string' ? input['file_path'] : ''
  const command = typeof input['command'] === 'string' ? input['command'] : ''
  switch (toolName) {
    case 'Write':
      return `Criar/sobrescrever ${path}`
    case 'Edit':
      return `Editar ${path}`
    case 'NotebookEdit':
      return `Editar notebook ${path}`
    case 'Bash':
      return `Executar: ${command}`
  }
  // Tools de MCP servers chegam prefixadas como mcp__<server>__<tool>
  if (toolName.endsWith('generate_blender_model')) {
    const target = typeof input['target_path'] === 'string' ? input['target_path'] : ''
    const desc = typeof input['description'] === 'string' ? input['description'] : ''
    const short = desc.length > 60 ? `${desc.slice(0, 60)}…` : desc
    return `Gerar modelo 3D em ${target}: "${short}"`
  }
  return toolName
}

function makeId(): string {
  return `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
