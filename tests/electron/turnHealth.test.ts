/** Saúde do turno do Chat IA (ADR-0272): níveis e formato do tempo. */
import { describe, it, expect } from 'vitest'
import { QUIET_AFTER_MS, STALLED_AFTER_MS, formatElapsed, turnHealthLevel } from '../../electron/renderer/turnHealth.js'

describe('turnHealth', () => {
  it('trabalhando → quieto em 1 min → parado em 5 min sem atividade', () => {
    expect(turnHealthLevel(0)).toBe('working')
    expect(turnHealthLevel(QUIET_AFTER_MS - 1)).toBe('working')
    expect(turnHealthLevel(QUIET_AFTER_MS)).toBe('quiet')
    expect(turnHealthLevel(STALLED_AFTER_MS - 1)).toBe('quiet')
    expect(turnHealthLevel(STALLED_AFTER_MS)).toBe('stalled')
  })

  it('formata segundos e minutos', () => {
    expect(formatElapsed(0)).toBe('0s')
    expect(formatElapsed(45_900)).toBe('45s')
    expect(formatElapsed(192_000)).toBe('3m12s')
    expect(formatElapsed(-5)).toBe('0s')
  })
})
