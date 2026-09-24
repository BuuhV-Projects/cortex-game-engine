/**
 * Tool `delegate_modeling` do Orquestrador (SPEC-0270): o turno do Modelagem
 * roda por dentro do turno do Claude sem encerrá-lo.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getAppPath: () => '' } }))

import { delegateModeling } from '../../electron/agent/tools/modeling.js'
import type { AgentEvents, RunAgentOptions, TurnStats } from '../../electron/agent/agentTypes.js'

function outerOpts(root: string): { opts: RunAgentOptions; events: AgentEvents } {
  const events: AgentEvents = {
    onTextChunk: vi.fn(),
    onToolRequest: vi.fn(),
    onToolExecuted: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  }
  const opts: RunAgentOptions = {
    prompt: 'pedido do usuário',
    projectRoot: root,
    events,
    approval: { requestApproval: async () => true },
    abortController: new AbortController(),
    continueSession: false,
    resumeSessionId: 'sessao-do-claude',
    mode: 'auto',
    model: 'sonnet',
    orchestrate: true,
  }
  return { opts, events }
}

const stats = (sessionId: string): TurnStats => ({
  durationMs: 1,
  costUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  sessionId,
})

describe('delegateModeling', () => {
  it('texto vira resultado, cards vão ao chat e o fim do Astra não encerra o turno', async () => {
    const { opts, events } = outerOpts('/proj-a')
    const card = { id: 'c1', name: 'Write', input: {}, summary: 's', needsApproval: false }
    const result = await delegateModeling(opts, 'crie um canhão', async (inner) => {
      expect(inner.prompt).toBe('crie um canhão')
      expect(inner.model).toBe('astra')
      expect(inner.resumeSessionId).toBeNull()
      inner.events.onToolRequest(card)
      inner.events.onTextChunk('Canhão ')
      inner.events.onTextChunk('criado.')
      inner.events.onDone(null, stats('thread-1'))
    })
    expect(result).toEqual({ content: 'Canhão criado.', isError: false })
    expect(events.onToolRequest).toHaveBeenCalledWith(card)
    expect(events.onTextChunk).not.toHaveBeenCalled()
    expect(events.onDone).not.toHaveBeenCalled()
  })

  it('a delegação seguinte retoma a sessão do Astra do mesmo projeto', async () => {
    const { opts } = outerOpts('/proj-b')
    await delegateModeling(opts, 'um', async (inner) => inner.events.onDone(null, stats('thread-b')))
    let resumed: string | null | undefined
    await delegateModeling(opts, 'dois', async (inner) => {
      resumed = inner.resumeSessionId
    })
    expect(resumed).toBe('thread-b')
  })

  it('erro do Astra vira resultado de erro, sem derrubar o turno do Claude', async () => {
    const { opts, events } = outerOpts('/proj-c')
    const result = await delegateModeling(opts, 'x', async (inner) => inner.events.onError(new Error('sem login')))
    expect(result).toEqual({ content: 'O Modelagem falhou: sem login', isError: true })
    expect(events.onError).not.toHaveBeenCalled()
  })
})
