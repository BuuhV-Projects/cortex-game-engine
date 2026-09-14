/**
 * Testes do tradutor de eventos do Codex → AgentEvents
 * (electron/agent/codex/codexEvents.ts).
 *
 * As linhas usadas como fixture foram capturadas de execuções reais do
 * `codex exec --model gpt-6-astra --json`.
 *
 * @see ADR-0191 / SPEC-0192
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  consumeCodexLine,
  createTurnState,
  type CodexTurnState,
} from '../electron/agent/codex/codexEvents.js'
import type { AgentEvents } from '../electron/agent/agentTypes.js'

function makeEvents(): AgentEvents {
  return {
    onTextChunk: vi.fn(),
    onToolRequest: vi.fn(),
    onToolExecuted: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  }
}

describe('consumeCodexLine', () => {
  let events: AgentEvents
  let state: CodexTurnState

  beforeEach(() => {
    events = makeEvents()
    state = createTurnState()
  })

  it('guarda o thread_id de thread.started (vira o sessionId do resume)', () => {
    consumeCodexLine(
      '{"type":"thread.started","thread_id":"01a09dc3-fc84-7421-b4d9-c82cded24bc9"}',
      state,
      events,
    )

    expect(state.threadId).toBe('01a09dc3-fc84-7421-b4d9-c82cded24bc9')
  })

  it('transmite agent_message como texto no chat', () => {
    consumeCodexLine(
      '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"pronto"}}',
      state,
      events,
    )

    expect(events.onTextChunk).toHaveBeenCalledWith('pronto')
  })

  it('abre card de tool quando um comando começa', () => {
    consumeCodexLine(
      '{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":"ls -la"}}',
      state,
      events,
    )

    expect(events.onToolRequest).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'item_1', name: 'Bash', summary: 'ls -la' }),
    )
  })

  it('nunca pede aprovação — o card é histórico, não gate', () => {
    consumeCodexLine(
      '{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":"rm -rf x"}}',
      state,
      events,
    )

    expect(events.onToolRequest).toHaveBeenCalledWith(
      expect.objectContaining({ needsApproval: false }),
    )
  })

  it('marca erro quando o comando sai com exit code não-zero', () => {
    consumeCodexLine(
      '{"type":"item.completed","item":{"id":"item_1","type":"command_execution","exit_code":1,"aggregated_output":"boom"}}',
      state,
      events,
    )

    expect(events.onToolExecuted).toHaveBeenCalledWith('item_1', {
      content: 'boom',
      isError: true,
    })
  })

  it('lista os arquivos alterados no card de file_change', () => {
    consumeCodexLine(
      '{"type":"item.completed","item":{"id":"item_2","type":"file_change","changes":{"scenes/level.json":"modified"}}}',
      state,
      events,
    )

    expect(events.onToolExecuted).toHaveBeenCalledWith('item_2', {
      content: 'scenes/level.json',
      isError: false,
    })
  })

  it('aceita changes em lista, não só em mapa', () => {
    consumeCodexLine(
      '{"type":"item.started","item":{"id":"item_3","type":"file_change","changes":[{"path":"main.ts"}]}}',
      state,
      events,
    )

    expect(events.onToolRequest).toHaveBeenCalledWith(
      expect.objectContaining({ summary: 'main.ts' }),
    )
  })

  it('converte o usage de turn.completed em TurnStats', () => {
    consumeCodexLine('{"type":"thread.started","thread_id":"t1"}', state, events)
    consumeCodexLine(
      '{"type":"turn.completed","usage":{"input_tokens":14894,"cached_input_tokens":11776,"cache_write_input_tokens":0,"output_tokens":71}}',
      state,
      events,
    )

    expect(state.stats).toEqual({
      durationMs: 0,
      costUsd: 0,
      inputTokens: 14894,
      outputTokens: 71,
      cacheReadTokens: 11776,
      cacheCreationTokens: 0,
      sessionId: 't1',
    })
  })

  it('reporta custo 0 — o turno roda pela subscription, sem custo em dólar', () => {
    consumeCodexLine('{"type":"turn.completed","usage":{"input_tokens":10}}', state, events)

    expect(state.stats?.costUsd).toBe(0)
  })

  it('captura mensagem de erro do CLI', () => {
    consumeCodexLine(
      '{"type":"error","message":"The model requires a newer version of Codex."}',
      state,
      events,
    )

    expect(state.errorMessage).toContain('newer version')
  })

  it('ignora linha que não é JSON (log de progresso do CLI)', () => {
    consumeCodexLine('Reading prompt from stdin...', state, events)

    expect(events.onTextChunk).not.toHaveBeenCalled()
    expect(events.onError).not.toHaveBeenCalled()
  })

  it('ignora JSON malformado sem derrubar o turno', () => {
    consumeCodexLine('{"type":"item.completed", "item":', state, events)

    expect(events.onError).not.toHaveBeenCalled()
  })

  it('ignora tipo de evento desconhecido (o CLI ganha eventos entre versões)', () => {
    consumeCodexLine('{"type":"turn.thinking","item":{"type":"reasoning"}}', state, events)

    expect(events.onTextChunk).not.toHaveBeenCalled()
    expect(events.onError).not.toHaveBeenCalled()
  })
})
