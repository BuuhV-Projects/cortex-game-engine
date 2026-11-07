/** PoseStore com personagens (SPEC-0708): "aplicar a" grava nas chaves escolhidas; o NPC herda só de NPC. */
import { describe, expect, it } from 'vitest'
import { PoseStore } from '../../electron/renderer/rigPoseStore.js'
import { parseConfigObject } from '../../electron/renderer/characterRigSelection.js'
import type { Quat } from '../../electron/renderer/characterRigArmSpace.js'

const TURN: Quat = [0, 0.258819, 0, 0.965926]
const PATH = 'cfg.json'
const near = (q: readonly number[] | undefined): void => q!.forEach((v, i) => expect(v).toBeCloseTo(TURN[i]!, 5))
const CHARS = { group: 'NPC', glb: 'v.glb', clips: 'v.json', preview: 'p', codes: ['npc-001', 'npc-002'] }
const CFG = JSON.stringify({ code: 'LUC-01', skinned: { characters: CHARS, clips: { idle: { pose: { Head: TURN } }, walk: {} } } })

function store(): { s: PoseStore; disk: { text: string } } {
  const disk = { text: CFG }
  const s = new PoseStore({ read: async () => disk.text, write: async (_p, t) => void (disk.text = t) })
  s.setConfig(PATH, parseConfigObject(CFG))
  return { s, disk }
}

describe('PoseStore com personagens (SPEC-0708)', () => {
  it('a chave do NPC não herda a pose do player; a do player só (#LUC-01) herda', () => {
    const { s } = store()
    expect(s.characters?.group).toBe('NPC')
    expect(s.wanted('idle#npc-001').size).toBe(0)
    near(s.wanted('idle#LUC-01').get('Head'))
  })

  it('aplicar a selecionados grava a mesma edição em cada chave, com o espaço do player no NPC', async () => {
    const { s, disk } = store()
    s.setPose('walk', new Map([['LeftArm', TURN]]))
    s.applyEditTo('walk', ['walk#LUC-01', 'walk#npc-002'], 'player')
    expect(s.spaceOf('walk#npc-002')).toBe('player')
    await s.save()
    const clip = (JSON.parse(disk.text).skinned.clips.walk) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(clip.characters['npc-002'].space).toBe('player')
    near(clip.characters['npc-002'].pose.LeftArm)
    near(clip.characters['LUC-01'].pose.LeftArm)
    expect(clip.characters['LUC-01'].space).toBeUndefined()
    expect(s.variantKeys().sort()).toEqual(['walk#LUC-01', 'walk#npc-002'])
  })

  it('edição num NPC com arma, para todos os NPCs: chave do grupo com a arma, lida de volta do disco', async () => {
    const { s, disk } = store()
    s.setPose('idle@ARM-02#npc-001', new Map([['RightHand', TURN]]))
    s.applyEditTo('idle@ARM-02#npc-001', ['idle@ARM-02#NPC'], 'own')
    await s.save()
    const back = new PoseStore({ read: async () => disk.text, write: async () => {} })
    back.setConfig(PATH, parseConfigObject(disk.text))
    near(back.wanted('idle@ARM-02#npc-002').get('RightHand')) // herdou do grupo
    expect(back.spaceOf('idle@ARM-02#NPC')).toBe('own')
  })
})
