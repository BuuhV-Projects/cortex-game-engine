/**
 * Estado da pose do auto-rig (SPEC-0349 adendos 8 e 9; SPEC-0703): variante por
 * arma partindo do clipe base, gravação (base, variante e pegada), "gere de novo",
 * desfazer e aplicar a todos.
 */

import { describe, it, expect } from 'vitest'
import { parseConfigObject, type JsonObject } from '../../electron/renderer/characterRigSelection.js'
import type { Quat } from '../../electron/renderer/characterRigArmSpace.js'
import { DEFAULT_GRIP } from '../../electron/renderer/characterRigWeapon.js'
import { PoseStore } from '../../electron/renderer/rigPoseStore.js'

const TURN: Quat = [0, 0.707107, 0, 0.707107]
const TILT: Quat = [0.707107, 0, 0, 0.707107]
const PATH = 'cfg.json'
const LINK = { bone: 'LeftHand', target: 'RightHand', offset: [0.1, 0, 0.2], rotation: [0, 0, 0, 1] }
const TEXT = JSON.stringify({
  skinned: { clips: { idle: { file: 'idle.fbx', pose: { Head: TURN }, follow: [LINK] }, walk: { file: 'walk.fbx' } } },
}, null, 2) + '\n'

function storeWith(text = TEXT): { store: PoseStore; files: Map<string, string> } {
  const files = new Map([[PATH, text]])
  const store = new PoseStore({ read: async (p) => files.get(p)!, write: async (p, t) => void files.set(p, t) })
  store.setConfig(PATH, parseConfigObject(text))
  return { store, files }
}

const clipsOf = (text: string): Record<string, JsonObject> =>
  (parseConfigObject(text)['skinned'] as Record<string, Record<string, JsonObject>>)['clips']!

describe('PoseStore', () => {
  it('variante sem nada parte do clipe base e é editável pelo clipe', () => {
    const { store } = storeWith()
    expect(store.editable('idle@ARM-02')).toBe(true)
    expect(store.editable('run@ARM-02')).toBe(false)
    expect([...store.wanted('idle@ARM-02').keys()]).toEqual(['Head'])
    expect(store.isUnsaved('idle@ARM-02')).toBe(false)
  })

  it('editar a variante não mexe no clipe base', () => {
    const { store } = storeWith()
    store.setPose('idle@ARM-02', new Map([['Head', TURN], ['Spine', TILT]]))
    expect(store.isUnsaved('idle@ARM-02')).toBe(true)
    expect([...store.wanted('idle').keys()]).toEqual(['Head'])
  })

  it('grava a variante em weapons e a pegada em weaponGrips', async () => {
    const { store, files } = storeWith()
    store.setPose('walk@ARM-02', new Map([['Spine', TILT]]))
    store.setGrip('walk@ARM-02', { offset: [0, 0.1, 0], rotation: TURN })
    expect(await store.save()).toBe(2)
    const text = files.get(PATH)!
    expect(clipsOf(text)['walk']).toEqual({ file: 'walk.fbx', weapons: { 'ARM-02': { pose: { Spine: TILT } } } })
    expect((parseConfigObject(text)['skinned'] as JsonObject)['weaponGrips']).toEqual({ 'ARM-02': { offset: [0, 0.1, 0], rotation: TURN } })
    expect(store.anyUnsaved()).toBe(false)
    expect(store.grip('idle@ARM-02').offset).toEqual([0, 0.1, 0])
  })

  it('nada pendente não regrava o arquivo', async () => {
    const { store, files } = storeWith()
    files.set(PATH, 'mudou por fora')
    expect(await store.save()).toBe(0)
    expect(files.get(PATH)).toBe('mudou por fora')
  })

  it('variante salva que o build não tem pede "gere de novo"', async () => {
    const { store } = storeWith()
    store.setGenerated({ clips: { idle: { poseOffsets: { Head: TURN }, follow: [LINK] } } })
    expect(store.needsRegen('idle@ARM-02', 'idle')).toBe(false)
    store.setPose('idle@ARM-02', new Map([['Spine', TILT]]))
    await store.save()
    expect(store.needsRegen('idle@ARM-02', 'idle')).toBe(true)
    store.setGenerated({ clips: { 'idle@ARM-02': { poseOffsets: { Spine: TILT }, follow: [LINK] } } })
    expect(store.needsRegen('idle@ARM-02', 'idle@ARM-02')).toBe(false)
  })

  it('Ctrl+Z volta a pose e a pegada', () => {
    const { store } = storeWith()
    store.pushUndo('idle@ARM-02', true)
    store.setPose('idle@ARM-02', new Map())
    store.setGrip('idle@ARM-02', { offset: [1, 2, 3], rotation: TURN })
    expect(store.undoLast('idle@ARM-02')).toBe(true)
    expect([...store.wanted('idle@ARM-02').keys()]).toEqual(['Head'])
    expect(store.grip('idle@ARM-02')).toEqual(DEFAULT_GRIP)
    expect(store.undoLast('idle@ARM-02')).toBe(false)
  })

  it('aplicar a todos com arma grava a variante em todos os clipes', async () => {
    const { store, files } = storeWith()
    store.setPose('idle@ESC-01', new Map([['Spine', TILT]]))
    expect(await store.applyToAll('idle@ESC-01', async () => true)).toBe(2)
    const clips = clipsOf(files.get(PATH)!)
    for (const c of ['idle', 'walk']) expect((clips[c]!['weapons'] as JsonObject)['ESC-01']).toEqual({ pose: { Spine: TILT } })
    expect(clips['idle']!['pose']).toEqual({ Head: TURN })
  })

  it('aplicar a todos cancelado não grava', async () => {
    const { store, files } = storeWith()
    expect(await store.applyToAll('idle', async () => false)).toBe(null)
    expect(files.get(PATH)).toBe(TEXT)
  })

  it('mesma config mantém a edição; outra config começa do disco', () => {
    const { store } = storeWith()
    store.setPose('walk', new Map([['Head', TILT]]))
    store.setConfig(PATH, parseConfigObject(TEXT))
    expect(store.isUnsaved('walk')).toBe(true)
    store.setConfig('outra.json', parseConfigObject(TEXT))
    expect(store.isUnsaved('walk')).toBe(false)
  })

  it('variante salva só com pose ainda herda as ligações do clipe base', async () => {
    const { store } = storeWith()
    store.setPose('idle@ARM-02', new Map([['Spine', TILT]]))
    await store.save()
    expect(store.wantedFollow('idle@ARM-02')).toHaveLength(1)
    expect(store.isUnsaved('idle@ARM-02')).toBe(false)
  })

  it('zerar a pose da variante fica gravado e não volta a herdar a do base', async () => {
    const { store, files } = storeWith()
    store.setPose('idle@ARM-02', new Map())
    await store.save()
    expect(store.wanted('idle@ARM-02').size).toBe(0)
    expect((clipsOf(files.get(PATH)!)['idle']!['weapons'] as JsonObject)['ARM-02']).toEqual({ pose: {} })
  })

  it('Ctrl+Z devolve a variante a "sem edição" e o save não grava o campo herdado', async () => {
    const { store, files } = storeWith()
    store.pushUndo('idle@ARM-02')
    store.setPose('idle@ARM-02', new Map([['Spine', TILT]]))
    store.setFollow('walk', [])
    store.undoLast('idle@ARM-02')
    expect(store.isUnsaved('idle@ARM-02')).toBe(false)
    await store.save()
    expect(clipsOf(files.get(PATH)!)['idle']!['weapons']).toBeUndefined()
  })
})
