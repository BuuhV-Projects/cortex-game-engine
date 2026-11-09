/** Pegada da arma por personagem (SPEC-0711, ADR-0710): a do NPC não toca a do player; cada JSON leva a do seu espaço. */
import { describe, expect, it } from 'vitest'
import { PoseStore } from '../../electron/renderer/rigPoseStore.js'
import { parseConfigObject, serializeConfig } from '../../electron/renderer/characterRigSelection.js'
import { DEFAULT_GRIP, gripToJson, type Grip } from '../../electron/renderer/characterRigWeapon.js'
import { gripChain, gripKeyOf } from '../../electron/renderer/characterRigCharacters.js'

const PATH = 'cfg.json'
const CHARS = { group: 'NPC', glb: 'v.glb', clips: 'v.json', preview: 'p', codes: ['npc-001', 'npc-002'] }
const LUCAS: Grip = { offset: [0, 0.08, 0.01], rotation: [0, 0, 0, 1] }
const NPC: Grip = { offset: [0.03, 0.05, 0], rotation: [0, 1, 0, 0] }
const PLAYER = 'LUC-01'

function store(grips: Record<string, Grip> = { 'ARM-01': LUCAS }): { s: PoseStore; disk: { text: string } } {
  const disk = { text: JSON.stringify({ code: PLAYER, skinned: { characters: CHARS, clips: { idle: {}, walk: {} }, weaponGrips: grips } }) }
  const s = new PoseStore({ read: async () => disk.text, write: async (_p, t) => void (disk.text = t) })
  s.setConfig(PATH, parseConfigObject(disk.text))
  return { s, disk }
}

const savedGrips = (text: string): Record<string, Grip> => JSON.parse(text).skinned.weaponGrips

describe('pegada por personagem (SPEC-0711)', () => {
  it('chave e herança por espaço: o NPC nunca herda a do player', () => {
    expect(gripKeyOf('idle@ARM-01#npc-001')).toBe('ARM-01#npc-001')
    expect(gripKeyOf('idle#npc-001')).toBeNull()
    expect(gripChain('ARM-01#npc-001', CHARS)).toEqual(['ARM-01#npc-001', 'ARM-01#NPC'])
    expect(gripChain('ARM-01#LUC-01', CHARS)).toEqual(['ARM-01#LUC-01', 'ARM-01'])
    const { s } = store()
    expect(s.grip('idle@ARM-01#npc-001')).toEqual(DEFAULT_GRIP)
    expect(s.grip('walk@ARM-01')).toEqual(LUCAS)
  })

  it('ajustar com um NPC ("Só este") não muda a do player', async () => {
    const { s, disk } = store()
    s.setGrip('idle@ARM-01#npc-001', NPC)
    s.applyEditTo('idle@ARM-01#npc-001', ['idle@ARM-01#npc-001'], 'own')
    await s.save()
    expect(savedGrips(disk.text)).toEqual({ 'ARM-01': LUCAS, 'ARM-01#npc-001': NPC })
    expect(s.grip('idle@ARM-01')).toEqual(LUCAS)
    expect(s.grip('walk@ARM-01#npc-001')).toEqual(NPC) // todos os clipes da arma dividem a pegada
    expect(s.grip('idle@ARM-01#npc-002')).toEqual(DEFAULT_GRIP)
  })

  it('"Todos os NPCs" vai para a do grupo, que o NPC sem a própria herda', async () => {
    const { s, disk } = store()
    s.setGrip('idle@ARM-01#npc-001', NPC)
    s.applyEditTo('idle@ARM-01#npc-001', ['idle@ARM-01#NPC'], 'own')
    s.discardEdit('idle@ARM-01#npc-001')
    await s.save()
    expect(savedGrips(disk.text)).toEqual({ 'ARM-01': LUCAS, 'ARM-01#NPC': NPC })
    expect(s.grip('idle@ARM-01#npc-002')).toEqual(NPC)
  })

  it('ajustar o player não muda a dos NPCs; Ctrl+Z volta a pegada da chave', async () => {
    const { s, disk } = store({ 'ARM-01': LUCAS, 'ARM-01#NPC': NPC })
    s.pushUndo('idle@ARM-01', true)
    s.setGrip('idle@ARM-01', { ...LUCAS, offset: [0, 0, 0] })
    expect(s.isUnsaved('walk@ARM-01')).toBe(true)
    expect(s.isUnsaved('walk@ARM-01#npc-001')).toBe(false)
    expect(s.undoLast('idle@ARM-01')).toBe(true)
    expect(s.grip('idle@ARM-01')).toEqual(LUCAS)
    s.setGrip('idle@ARM-01', { ...LUCAS, offset: [0, 0, 0] })
    await s.save()
    expect(savedGrips(disk.text)['ARM-01#NPC']).toEqual(NPC)
  })

  it('cada JSON do skin leva as pegadas do seu esqueleto', () => {
    const { s } = store({ 'ARM-01': LUCAS, 'ARM-02#LUC-01': NPC, 'ARM-01#NPC': NPC, 'ARM-01#npc-002': LUCAS })
    expect([...s.skinGrips(false, PLAYER)]).toEqual([['ARM-01', LUCAS], ['ARM-02', NPC]])
    expect([...s.skinGrips(true, PLAYER)]).toEqual([['ARM-01', NPC], ['ARM-01#npc-002', LUCAS]])
  })

  it('voltar ao padrão apaga a sem alvo e mantém a com alvo', async () => {
    const { s, disk } = store({ 'ARM-01': LUCAS, 'ARM-01#NPC': NPC, 'ARM-01#npc-001': NPC })
    s.setGrip('idle@ARM-01', { ...DEFAULT_GRIP })
    s.setGrip('idle@ARM-01#npc-001', { ...DEFAULT_GRIP })
    await s.save()
    expect(savedGrips(disk.text)).toEqual({ 'ARM-01#NPC': NPC, 'ARM-01#npc-001': gripToJson(DEFAULT_GRIP) })
  })
})

describe('salvar pose com o player entre os alvos (SPEC-0719)', () => {
  const SEL = ['idle@ARM-01#LUC-01', 'idle@ARM-01#npc-001', 'idle@ARM-01#npc-002']
  const commit = (s: PoseStore, from: string, to: string[]): void => {
    s.applyEditTo(from, to, 'player', PLAYER)
    s.discardEdit(from, to.some((k) => k.endsWith(`#${PLAYER}`)))
  }

  it('sem mexer na pegada, salvar a pose não cria nem muda pegada', async () => {
    const { s, disk } = store()
    s.setPose('idle@ARM-01', new Map([['LeftArm', [0, 0, 0.1, 0.995]]]))
    commit(s, 'idle@ARM-01', SEL)
    await s.save()
    expect(savedGrips(disk.text)).toEqual({ 'ARM-01': LUCAS })
  })

  it('a pegada editada no player fica em ARMA (nunca ARMA#player) e vai como está para os NPCs', async () => {
    const { s, disk } = store()
    s.setGrip('idle@ARM-01', NPC)
    commit(s, 'idle@ARM-01', SEL)
    await s.save()
    const npc = gripToJson(NPC)
    expect(savedGrips(disk.text)).toEqual({ 'ARM-01': npc, 'ARM-01#npc-001': npc, 'ARM-01#npc-002': npc })
    expect(s.grip('idle@ARM-01')).toEqual(NPC) // o que a prévia do player mostra é o que foi gravado
  })

  it('regravar a config mantém a indentação do arquivo', () => {
    const two = JSON.stringify({ code: PLAYER, skinned: { clips: {} } }, null, 2) + '\n'
    expect(serializeConfig(parseConfigObject(two), two)).toBe(two)
    expect(serializeConfig({ a: 1 })).toBe('{\n "a": 1\n}\n')
  })
})
