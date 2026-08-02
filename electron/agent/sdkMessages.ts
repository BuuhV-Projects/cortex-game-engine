import type { AgentEvents, ToolExecutionResult, TurnStats } from './agentTypes.js'

/**
 * Tradução das mensagens do SDK em eventos de UI.
 *
 * O SDK emite um stream heterogêneo (`assistant`, `user` com tool_result,
 * `result`); o renderer só entende chunks de texto, cards de tool e o fim do
 * turno. Toda a normalização mora aqui.
 */

export function handleSdkMessage(message: unknown, events: AgentEvents): void {
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
      // Mensagens 'user' que voltam carregam tool_result blocks da execução.
      const blocks = (msg as { message?: { content?: unknown[] } }).message?.content
      if (!Array.isArray(blocks)) return
      for (const block of blocks) {
        const b = block as {
          type?: string
          tool_use_id?: string
          content?: unknown
          is_error?: boolean
        }
        if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
          const content = stringifyToolResult(b.content)
          events.onToolExecuted(b.tool_use_id, { content, isError: b.is_error === true })
        }
      }
      return
    }
    case 'result': {
      events.onDone(readSubtype(msg), readStats(msg))
      return
    }
    default:
      return
  }
}

function readSubtype(msg: unknown): string | null {
  const subtype = (msg as { subtype?: string }).subtype
  return subtype ?? null
}

function readStats(msg: unknown): TurnStats | null {
  const m = msg as {
    duration_ms?: number
    total_cost_usd?: number
    session_id?: string
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_read_input_tokens?: number
      cache_creation_input_tokens?: number
    }
  }
  if (typeof m.duration_ms !== 'number') return null
  return {
    durationMs: m.duration_ms,
    costUsd: typeof m.total_cost_usd === 'number' ? m.total_cost_usd : 0,
    inputTokens: m.usage?.input_tokens ?? 0,
    outputTokens: m.usage?.output_tokens ?? 0,
    cacheReadTokens: m.usage?.cache_read_input_tokens ?? 0,
    cacheCreationTokens: m.usage?.cache_creation_input_tokens ?? 0,
    sessionId: typeof m.session_id === 'string' ? m.session_id : null,
  }
}

export function stringifyToolResult(content: unknown): string {
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

/** Rótulo curto do card de tool no chat. */
export function buildSummary(toolName: string, input: Record<string, unknown>): string {
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
    case 'Skill':
      return `Usar skill ${typeof input['skill'] === 'string' ? input['skill'] : ''}`
    case 'Agent':
      return `Delegar ao agente ${typeof input['subagent_type'] === 'string' ? input['subagent_type'] : ''}`
  }
  // Tools de MCP servers chegam prefixadas como mcp__<server>__<tool>
  if (toolName.endsWith('generate_blender_model')) {
    const target = typeof input['target_path'] === 'string' ? input['target_path'] : ''
    const desc = typeof input['description'] === 'string' ? input['description'] : ''
    const short = desc.length > 60 ? `${desc.slice(0, 60)}…` : desc
    return `Gerar modelo 3D em ${target}: "${short}"`
  }
  if (toolName.endsWith('generate_blueprint')) {
    const src = typeof input['source'] === 'string' ? input['source'] : ''
    const bp = input['blueprint']
    const nPieces =
      bp && typeof bp === 'object' && Array.isArray((bp as { pieces?: unknown[] }).pieces)
        ? (bp as { pieces: unknown[] }).pieces.length
        : 0
    return `Gerar blueprint de fase (${src}, ${nPieces} peças)`
  }
  return toolName
}
