import type { AgentEvents, ToolRequest, TurnStats } from '../agentTypes.js'

/**
 * Tradutor da saída JSONL do `codex exec --json` para o {@link AgentEvents}
 * que o Chat IA já consome (ADR-0191 / SPEC-0192).
 *
 * É separado do runner e **puro** (não roda processo, não toca disco) para
 * poder ser testado com linhas capturadas de uma execução real.
 */

// ─── Formato dos eventos do Codex CLI ─────────────────────────────────────────

/** Item de um turno (mensagem do agente, comando, alteração de arquivo). */
interface CodexItem {
  id?: string
  type?: string
  text?: string
  command?: string
  aggregated_output?: string
  exit_code?: number
  status?: string
  changes?: unknown
}

/** Uso de tokens reportado no fim do turno. */
interface CodexUsage {
  input_tokens?: number
  output_tokens?: number
  cached_input_tokens?: number
  cache_write_input_tokens?: number
}

/** Uma linha do JSONL. */
interface CodexEvent {
  type?: string
  thread_id?: string
  item?: CodexItem
  usage?: CodexUsage
  error?: unknown
  message?: string
}

/** Estado acumulado ao longo do turno, montado linha a linha. */
export interface CodexTurnState {
  /** `thread_id` da sessão — vira o `sessionId` do turno, usado no `resume`. */
  threadId: string | null
  /** Tokens e afins do `turn.completed`; null se o turno não chegou ao fim. */
  stats: TurnStats | null
  /** Mensagem de erro reportada pelo próprio CLI, se houve. */
  errorMessage: string | null
}

/** Cria o estado inicial de um turno. */
export function createTurnState(): CodexTurnState {
  return { threadId: null, stats: null, errorMessage: null }
}

// ─── Tradução ─────────────────────────────────────────────────────────────────

/** Tipos de item que viram card de tool no chat. */
const COMMAND_ITEM = 'command_execution'
const FILE_CHANGE_ITEM = 'file_change'
const MESSAGE_ITEM = 'agent_message'

/** Quantos caracteres de um comando/saída cabem no resumo do card. */
const SUMMARY_MAX = 200

/**
 * Consome UMA linha do JSONL e emite os eventos correspondentes.
 *
 * Linhas que não são JSON (log de progresso do CLI) e tipos desconhecidos são
 * ignorados de propósito: o Codex CLI ganha eventos novos entre versões, e um
 * evento não reconhecido não deve derrubar o turno.
 *
 * @param line   - Uma linha crua da saída do processo.
 * @param state  - Estado acumulado do turno (mutado in-place).
 * @param events - Callbacks do chat.
 */
export function consumeCodexLine(
  line: string,
  state: CodexTurnState,
  events: AgentEvents,
): void {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{')) return

  let evt: CodexEvent
  try {
    evt = JSON.parse(trimmed) as CodexEvent
  } catch {
    return
  }

  switch (evt.type) {
    case 'thread.started':
      state.threadId = evt.thread_id ?? null
      return

    case 'turn.completed':
      state.stats = buildStats(state.threadId, evt.usage)
      return

    case 'turn.failed':
    case 'error':
      state.errorMessage = readErrorMessage(evt)
      return

    case 'item.started':
      emitToolRequest(evt.item, events)
      return

    case 'item.completed':
      emitItemCompleted(evt.item, events)
      return

    default:
      return
  }
}

/** Um item começou: vira card de tool (histórico, sem gate de aprovação). */
function emitToolRequest(item: CodexItem | undefined, events: AgentEvents): void {
  if (!item) return

  if (item.type === COMMAND_ITEM) {
    events.onToolRequest(toolRequest(item, 'Bash', item.command ?? '(comando)'))
    return
  }
  if (item.type === FILE_CHANGE_ITEM) {
    events.onToolRequest(toolRequest(item, 'Edit', describeChanges(item.changes)))
  }
}

/** Um item terminou: texto vira chunk; comando/arquivo fecham o card. */
function emitItemCompleted(item: CodexItem | undefined, events: AgentEvents): void {
  if (!item) return

  switch (item.type) {
    case MESSAGE_ITEM: {
      if (item.text) events.onTextChunk(item.text)
      return
    }
    case COMMAND_ITEM: {
      const failed = typeof item.exit_code === 'number' && item.exit_code !== 0
      events.onToolExecuted(itemId(item), {
        content: item.aggregated_output ?? '',
        isError: failed,
      })
      return
    }
    case FILE_CHANGE_ITEM: {
      events.onToolExecuted(itemId(item), {
        content: describeChanges(item.changes),
        isError: item.status === 'failed',
      })
      return
    }
    default:
      return
  }
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

/** Id estável do card. O CLI numera os itens (`item_0`, `item_1`, …). */
function itemId(item: CodexItem): string {
  return item.id ?? `codex-${item.type ?? 'item'}`
}

/** Monta o `ToolRequest` de um item — sempre sem aprovação (ver SPEC-0192). */
function toolRequest(item: CodexItem, name: string, summary: string): ToolRequest {
  return {
    id: itemId(item),
    name,
    input: { command: item.command, changes: item.changes },
    summary: truncate(summary, SUMMARY_MAX),
    needsApproval: false,
  }
}

/**
 * Descreve as alterações de arquivo de forma legível no card.
 *
 * O formato de `changes` varia entre versões do CLI (mapa de path → operação,
 * ou lista); tratamos os dois e caímos num JSON curto se for outra coisa.
 */
function describeChanges(changes: unknown): string {
  if (!changes) return '(alteração de arquivo)'

  if (Array.isArray(changes)) {
    const paths = changes.map((c) => readPath(c)).filter(Boolean)
    return paths.length ? paths.join(', ') : truncate(JSON.stringify(changes), SUMMARY_MAX)
  }
  if (typeof changes === 'object') {
    const keys = Object.keys(changes as Record<string, unknown>)
    return keys.length ? keys.join(', ') : '(alteração de arquivo)'
  }
  return String(changes)
}

/** Extrai o caminho de uma entrada de `changes` em lista. */
function readPath(entry: unknown): string {
  if (typeof entry === 'string') return entry
  if (entry && typeof entry === 'object') {
    const obj = entry as Record<string, unknown>
    const p = obj['path'] ?? obj['file'] ?? obj['filename']
    if (typeof p === 'string') return p
  }
  return ''
}

/** Lê a mensagem de erro de um evento `error`/`turn.failed`. */
function readErrorMessage(evt: CodexEvent): string {
  if (typeof evt.message === 'string') return evt.message
  const err = evt.error
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    const msg = (err as Record<string, unknown>)['message']
    if (typeof msg === 'string') return msg
  }
  return 'O Codex reportou uma falha no turno.'
}

/**
 * Converte o `usage` do Codex no {@link TurnStats} do chat.
 *
 * `costUsd` fica 0: o turno roda pela subscription e o CLI não informa custo em
 * dólar — estimar seria inventar. `durationMs` é preenchido pelo runner, que é
 * quem sabe quando o processo começou.
 */
function buildStats(threadId: string | null, usage: CodexUsage | undefined): TurnStats {
  return {
    durationMs: 0,
    costUsd: 0,
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheReadTokens: usage?.cached_input_tokens ?? 0,
    cacheCreationTokens: usage?.cache_write_input_tokens ?? 0,
    sessionId: threadId,
  }
}

/** Corta um texto longo para caber no resumo do card. */
function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}
