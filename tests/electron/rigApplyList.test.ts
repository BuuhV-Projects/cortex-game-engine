/** Lista pesquisável do "Aplicar a: Selecionados" (SPEC-0718): filtro, marcados no topo, só marcados. */
import { describe, expect, it } from 'vitest'
import { visibleApplyCodes } from '../../electron/renderer/characterRigCharacters.js'

const CODES = ['LUC-01', 'npc-001', 'npc-110', 'npc-111', 'npc-130', 'npc-135', 'npc-136']

describe('visibleApplyCodes (SPEC-0718)', () => {
  it('filtra por trecho do código, sem diferenciar caixa', () => {
    expect(visibleApplyCodes(CODES, '110', new Set(), false)).toEqual(['npc-110'])
    expect(visibleApplyCodes(CODES, ' NPC-13 ', new Set(), false)).toEqual(['npc-130', 'npc-135', 'npc-136'])
    expect(visibleApplyCodes(CODES, '', new Set(), false)).toEqual(CODES)
  })

  it('marcados primeiro, cada grupo na ordem da config; marcado fora do filtro continua fora', () => {
    const checked = new Set(['npc-136', 'npc-001'])
    expect(visibleApplyCodes(CODES, '', checked, false)).toEqual(['npc-001', 'npc-136', 'LUC-01', 'npc-110', 'npc-111', 'npc-130', 'npc-135'])
    expect(visibleApplyCodes(CODES, '13', checked, false)).toEqual(['npc-136', 'npc-130', 'npc-135'])
  })

  it('só marcados esconde os demais e respeita a busca', () => {
    const checked = new Set(['npc-110', 'npc-135'])
    expect(visibleApplyCodes(CODES, '', checked, true)).toEqual(['npc-110', 'npc-135'])
    expect(visibleApplyCodes(CODES, '13', checked, true)).toEqual(['npc-135'])
  })
})
