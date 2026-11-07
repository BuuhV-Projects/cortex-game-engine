/** Assado com personagens (SPEC-0708): cada visão assa as chaves do esqueleto que mostra. */
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { keysForView, retargetBaked } from '../../electron/renderer/RigBakeCharacters.js'
import { retargetRig } from '../../electron/renderer/characterRigRetarget.js'
import { PoseStore } from '../../electron/renderer/rigPoseStore.js'
import { parseConfigObject } from '../../electron/renderer/characterRigSelection.js'

const CHARS = { group: 'NPC', glb: 'v.glb', clips: 'v.json', preview: 'p', codes: ['npc-001'] }
const CFG = JSON.stringify({ code: 'LUC-01', skinned: { characters: CHARS, clips: { walk: {} } } })

describe('assado com personagens (SPEC-0708)', () => {
  const store = new PoseStore({ read: async () => CFG, write: async () => {} })
  store.setConfig('c.json', parseConfigObject(CFG))
  store.setPose('walk', new Map([['Head', [0, 0, 0, 1]]]))
  store.applyEditTo('walk', ['walk#LUC-01', 'walk#npc-001'], 'player')
  store.setPose('walk#NPC', new Map([['Head', [0, 0, 0, 1]]]))
  const keys = ['walk#LUC-01', 'walk#npc-001', 'walk#NPC', 'walk@ARM-02']

  it('no player: as do player e as de NPC editadas no player; a do NPC fica para a visão do NPC', () => {
    expect(keysForView(store, keys, null, 'LUC-01')).toEqual({ own: ['walk#LUC-01', 'walk@ARM-02'], toNpc: ['walk#npc-001'], skipped: ['walk#NPC'] })
  })

  it('num NPC: só as de NPC editadas num NPC', () => {
    expect(keysForView(store, keys, 'npc-001', 'LUC-01')).toEqual({ own: ['walk#NPC'], toNpc: [], skipped: ['walk#LUC-01', 'walk#npc-001', 'walk@ARM-02'] })
  })

  it('o clipe assado no player vai para o esqueleto do NPC como rotação e translação', () => {
    const rig = (y: number): THREE.Group => {
      const root = new THREE.Group()
      const hips = new THREE.Bone()
      hips.name = 'Hips'
      hips.position.y = y
      root.add(hips)
      return root
    }
    const from = retargetRig(rig(1))
    const to = retargetRig(rig(0.8))
    const out = retargetBaked({
      name: 'walk#npc-001',
      channels: [
        { node: 'Hips', path: 'rotation', interpolation: 'LINEAR', times: Float32Array.of(0, 1), values: Float32Array.of(0, 0, 0, 1, 0, 0, 0, 1) },
        { node: 'Hips', path: 'translation', interpolation: 'LINEAR', times: Float32Array.of(0, 1), values: Float32Array.of(0, 1, 0, 0, 1.1, 0) },
      ],
    }, 1, from, to)
    expect(out.channels.map((c) => c.path)).toEqual(['rotation', 'translation'])
    expect(out.channels[1]!.values[4]).toBeCloseTo(0.8 + 0.1 * 0.8, 5)
  })
})
