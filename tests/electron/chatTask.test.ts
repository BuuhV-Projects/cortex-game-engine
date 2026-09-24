/**
 * Modos do Chat IA por tarefa (SPEC-0266): qual modelo cada tarefa usa, e a
 * leitura dos valores salvos antes da mudança.
 */
import { describe, it, expect } from 'vitest'
import { modelForTask, nextTask, taskFromSaved } from '../../electron/renderer/chatTask.js'

describe('chatTask', () => {
  it('Modelagem roda o Astra; Codificar roda Sonnet, e Opus só com o ajuste', () => {
    expect(modelForTask('modeling', false)).toBe('astra')
    expect(modelForTask('modeling', true)).toBe('astra')
    expect(modelForTask('coding', false)).toBe('sonnet')
    expect(modelForTask('coding', true)).toBe('opus')
  })

  it('lê os valores salvos antes dos modos', () => {
    expect(taskFromSaved('astra')).toBe('modeling')
    expect(taskFromSaved('sonnet')).toBe('coding')
    expect(taskFromSaved('opus')).toBe('coding')
    expect(taskFromSaved('haiku')).toBe('coding')
    expect(taskFromSaved(null)).toBe('coding')
    expect(taskFromSaved('modeling')).toBe('modeling')
  })

  it('o botão alterna entre as duas tarefas', () => {
    expect(nextTask('coding')).toBe('modeling')
    expect(nextTask('modeling')).toBe('coding')
  })
})
