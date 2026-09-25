/**
 * Modos do Chat IA por tarefa (SPEC-0266 / SPEC-0270): qual modelo cada tarefa
 * usa, o padrão e a leitura dos valores salvos antes da mudança.
 */
import { describe, it, expect } from 'vitest'
import { modelForTask, nextTask, taskFromSaved } from '../../electron/renderer/chatTask.js'

describe('chatTask', () => {
  it('Modelagem roda o Astra; Codificar sempre Opus (ADR-0276); Orquestrador Sonnet, Opus só com o ajuste', () => {
    expect(modelForTask('modeling', false)).toBe('astra')
    expect(modelForTask('modeling', true)).toBe('astra')
    expect(modelForTask('coding', false)).toBe('opus')
    expect(modelForTask('coding', true)).toBe('opus')
    expect(modelForTask('orchestrator', false)).toBe('sonnet')
    expect(modelForTask('orchestrator', true)).toBe('opus')
  })

  it('sem valor salvo, o padrão é o Orquestrador', () => {
    expect(taskFromSaved(null)).toBe('orchestrator')
    expect(taskFromSaved('orchestrator')).toBe('orchestrator')
  })

  it('lê os valores salvos antes do Orquestrador', () => {
    expect(taskFromSaved('astra')).toBe('modeling')
    expect(taskFromSaved('modeling')).toBe('modeling')
    expect(taskFromSaved('sonnet')).toBe('coding')
    expect(taskFromSaved('opus')).toBe('coding')
    expect(taskFromSaved('haiku')).toBe('coding')
    expect(taskFromSaved('coding')).toBe('coding')
  })

  it('o botão cicla Orquestrador → Modelagem → Codificar → Orquestrador', () => {
    expect(nextTask('orchestrator')).toBe('modeling')
    expect(nextTask('modeling')).toBe('coding')
    expect(nextTask('coding')).toBe('orchestrator')
  })
})
