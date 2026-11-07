/** Ajuste de pose por personagem (SPEC-0708): chave `clipe@ARMA#ALVO`, herança por espaço e os alvos de "aplicar a". */
import { describe, expect, it } from 'vitest'
import { applyChoices, applyTargets, charactersOf, fullKey, inheritChain, splitKey, type CharactersConfig } from '../../electron/renderer/characterRigCharacters.js'

const CHARS: CharactersConfig = { group: 'NPC', glb: 'a.glb', clips: 'a.json', preview: 'p', codes: ['npc-001', 'npc-002'] }
const PLAYER = 'LUC-01'

describe('chave por personagem (SPEC-0708)', () => {
  it('monta e separa clipe, arma e alvo', () => {
    expect(fullKey('pistolIdle', 'ARM-02', 'npc-001')).toBe('pistolIdle@ARM-02#npc-001')
    expect(splitKey('pistolIdle@ARM-02#npc-001')).toEqual({ clip: 'pistolIdle', weapon: 'ARM-02', target: 'npc-001' })
    expect(splitKey('idle#NPC')).toEqual({ clip: 'idle', weapon: null, target: 'NPC' })
    expect(splitKey('idle@ARM-01')).toEqual({ clip: 'idle', weapon: 'ARM-01', target: null })
    expect(splitKey('idle')).toEqual({ clip: 'idle', weapon: null, target: null })
  })

  it('NPC herda só de chaves de NPC; o player, das dele e das de todos', () => {
    expect(inheritChain('pistolIdle@ARM-02#npc-001', CHARS)).toEqual(['pistolIdle@ARM-02#npc-001', 'pistolIdle@ARM-02#NPC', 'pistolIdle#npc-001', 'pistolIdle#NPC'])
    expect(inheritChain('idle#NPC', CHARS)).toEqual(['idle#NPC'])
    expect(inheritChain('pistolIdle@ARM-02#LUC-01', CHARS)).toEqual(['pistolIdle@ARM-02#LUC-01', 'pistolIdle#LUC-01', 'pistolIdle@ARM-02', 'pistolIdle'])
    expect(inheritChain('pistolIdle@ARM-02', CHARS)).toEqual(['pistolIdle@ARM-02', 'pistolIdle'])
  })

  it('aplicar a: no player, todos = chave de hoje; num NPC, todos = o grupo', () => {
    expect(applyChoices(false)).toEqual(['everyone', 'only', 'selected'])
    expect(applyChoices(true)).toEqual(['only', 'selected', 'allNpcs'])
    expect(applyTargets(PLAYER, 'everyone', [], CHARS, PLAYER)).toEqual([null])
    expect(applyTargets(PLAYER, 'only', [], CHARS, PLAYER)).toEqual([PLAYER])
    expect(applyTargets(PLAYER, 'selected', [PLAYER, 'npc-002', 'npc-002'], CHARS, PLAYER)).toEqual([PLAYER, 'npc-002'])
    expect(applyTargets('npc-001', 'only', [], CHARS, PLAYER)).toEqual(['npc-001'])
    expect(applyTargets('npc-001', 'allNpcs', [], CHARS, PLAYER)).toEqual(['NPC'])
    expect(applyTargets('npc-001', 'selected', [], CHARS, PLAYER)).toEqual(['npc-001'])
  })

  it('config: characters completa ou nada', () => {
    expect(charactersOf({ skinned: { characters: { ...CHARS } } })).toEqual(CHARS)
    expect(charactersOf({ skinned: { characters: { ...CHARS, codes: [] } } })).toBeNull()
    expect(charactersOf({ skinned: {} })).toBeNull()
    expect(charactersOf(null)).toBeNull()
  })
})
