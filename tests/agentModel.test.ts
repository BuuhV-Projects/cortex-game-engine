/**
 * Testes de `resolveAgentModel` (electron/agent/agentTypes.ts).
 *
 * O Chat do Studio deixa o usuário escolher o modelo do backend (Opus/Sonnet/
 * Haiku); o valor cru chega pelo IPC e precisa cair num alias válido, com
 * Sonnet como default seguro (teto de uso maior no plano — ADR-0130).
 *
 * Importa de `agentTypes` (não do `agentLoop`) de propósito: o contrato é puro,
 * sem SDK nem MCP servers atrás — o teste roda sem tocar em Electron.
 */

import { describe, it, expect } from 'vitest'
import { resolveAgentModel } from '../electron/agent/agentTypes.ts'

describe('resolveAgentModel', () => {
  it('mantém os aliases válidos', () => {
    expect(resolveAgentModel('opus')).toBe('opus')
    expect(resolveAgentModel('sonnet')).toBe('sonnet')
    expect(resolveAgentModel('haiku')).toBe('haiku')
  })

  it('cai em sonnet (default) pra valor ausente ou inválido', () => {
    expect(resolveAgentModel(undefined)).toBe('sonnet')
    expect(resolveAgentModel(null)).toBe('sonnet')
    expect(resolveAgentModel('')).toBe('sonnet')
    expect(resolveAgentModel('gpt-4')).toBe('sonnet')
    expect(resolveAgentModel('OPUS')).toBe('sonnet') // case-sensitive de propósito
    expect(resolveAgentModel(42)).toBe('sonnet')
    expect(resolveAgentModel({})).toBe('sonnet')
  })
})
