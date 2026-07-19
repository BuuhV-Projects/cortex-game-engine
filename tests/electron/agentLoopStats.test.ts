/**
 * Testes da captura de TurnStats no handleSdkMessage (evento `result` do SDK):
 * garante que TODOS os campos de usage entram nas stats — em especial
 * cache_read_input_tokens e cache_creation_input_tokens, que dominam o custo
 * de turnos agenticos e antes ficavam fora do display (conta não fechava com
 * o total_cost_usd).
 */
import { describe, it, expect } from 'vitest'
import { handleSdkMessage, type AgentEvents, type TurnStats } from '../../electron/agent/agentLoop.js'

function collectDone(): { events: AgentEvents; done: { stopReason: string | null; stats: TurnStats | null }[] } {
  const done: { stopReason: string | null; stats: TurnStats | null }[] = []
  const events: AgentEvents = {
    onTextChunk: () => {},
    onToolRequest: () => {},
    onToolExecuted: () => {},
    onDone: (stopReason, stats) => done.push({ stopReason, stats }),
    onError: () => {},
  }
  return { events, done }
}

describe('handleSdkMessage — evento result', () => {
  it('captura usage completo, incluindo cache read e cache write', () => {
    const { events, done } = collectDone()
    handleSdkMessage(
      {
        type: 'result',
        subtype: 'success',
        duration_ms: 317_000,
        total_cost_usd: 15.81,
        session_id: 'sess-123',
        usage: {
          input_tokens: 1400,
          output_tokens: 17_200,
          cache_read_input_tokens: 1_234_567,
          cache_creation_input_tokens: 89_012,
        },
      },
      events,
    )
    expect(done).toHaveLength(1)
    expect(done[0].stopReason).toBe('success')
    expect(done[0].stats).toEqual({
      durationMs: 317_000,
      costUsd: 15.81,
      inputTokens: 1400,
      outputTokens: 17_200,
      cacheReadTokens: 1_234_567,
      cacheCreationTokens: 89_012,
      sessionId: 'sess-123',
    })
  })

  it('campos de usage ausentes viram 0 (SDKs antigos sem cache_creation)', () => {
    const { events, done } = collectDone()
    handleSdkMessage(
      {
        type: 'result',
        duration_ms: 1000,
        usage: { input_tokens: 10, output_tokens: 20 },
      },
      events,
    )
    expect(done[0].stats).toMatchObject({
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: 0,
      sessionId: null,
    })
  })

  it('result sem duration_ms produz stats null', () => {
    const { events, done } = collectDone()
    handleSdkMessage({ type: 'result', subtype: 'error_during_execution' }, events)
    expect(done).toHaveLength(1)
    expect(done[0].stats).toBeNull()
  })
})
