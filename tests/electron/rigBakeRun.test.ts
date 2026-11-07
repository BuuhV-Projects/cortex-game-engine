/**
 * "Gravar no GLB do jogo" (SPEC-0704): sem o JSON do skin do build, nada é assado nem gravado.
 * Só a pegada mudada também grava (SPEC-0709).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bakeFlow, runBake, type BakeRunInput } from '../../electron/renderer/RigBakeRun.js'
import { ZERO_OFFSETS } from '../../electron/renderer/characterRigArmSpace.js'
import { parseConfigObject } from '../../electron/renderer/characterRigSelection.js'
import { PoseStore } from '../../electron/renderer/rigPoseStore.js'
import type { RigArmAdjust } from '../../electron/renderer/RigArmAdjust.js'

function input(skin: unknown): BakeRunInput {
  return { projectDir: 'P', glb: 'a.glb', clips: 'a.json', pose: {} as BakeRunInput['pose'], arm: {} as BakeRunInput['arm'], gltfClips: new Map(), skin }
}

describe('runBake', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('JSON do skin ilegível recusa antes de assar ou gravar', async () => {
    const api = { confirmDialog: vi.fn(), readFileBase64: vi.fn(), characterRigWriteBake: vi.fn() }
    vi.stubGlobal('window', { electronAPI: api })
    await expect(runBake(input(null))).rejects.toThrow()
    expect(api.confirmDialog).not.toHaveBeenCalled()
    expect(api.characterRigWriteBake).not.toHaveBeenCalled()
  })

  it('bakeFlow devolve a recusa como mensagem de aviso, sem recarregar', async () => {
    vi.stubGlobal('window', { electronAPI: { characterRigWriteBake: vi.fn() } })
    const reload = vi.fn()
    const msg = await bakeFlow(input('quebrado'), async () => true, reload)
    expect(msg?.warn).toBe(true)
    expect(reload).not.toHaveBeenCalled()
  })
})

const TURN = [0, 0.258819, 0, 0.965926]
const LINK = { bone: 'LeftHand', target: 'RightHand', offset: [0.1, 0, 0], rotation: [0, 0, 0, 1] }
const noArm = { wanted: () => ZERO_OFFSETS, generatedOf: () => ZERO_OFFSETS, needsRegen: () => false } as unknown as RigArmAdjust

/** Entrada com um PoseStore de verdade: `cfg` = config salva, `skin` = o JSON do skin do build. */
function withStore(cfg: unknown, skin: Record<string, unknown>, clips: string[]): BakeRunInput {
  const text = JSON.stringify(cfg)
  const store = new PoseStore({ read: async () => text, write: async () => {} })
  store.setConfig('cfg.json', parseConfigObject(text))
  store.setGenerated(skin)
  const pose = { store, skeleton: null, limits: {} } as unknown as BakeRunInput['pose']
  return { ...input(skin), pose, arm: noArm, gltfClips: new Map(clips.map((c) => [c, {}])) as unknown as BakeRunInput['gltfClips'] }
}

describe('runBake — antes de assar', () => {
  afterEach(() => vi.unstubAllGlobals())
  const api = (): Record<string, ReturnType<typeof vi.fn>> => {
    const a = { confirmDialog: vi.fn(async () => false), readFileBase64: vi.fn(), characterRigWriteBake: vi.fn() }
    vi.stubGlobal('window', { electronAPI: a })
    return a
  }

  it('config igual ao build: nada a gravar, sem perguntar', async () => {
    const a = api()
    const out = await runBake(withStore({ skinned: { clips: { idle: {} } } }, { clips: { idle: {} } }, ['idle']))
    expect(out).toEqual({ kind: 'none' })
    expect(a.confirmDialog).not.toHaveBeenCalled()
  })

  it('ligação gravada no build e tirada da config: recusa com o clipe, sem perguntar', async () => {
    const a = api()
    const out = await runBake(withStore({ skinned: { clips: { walk: {} } } }, { clips: { walk: { follow: [LINK] } } }, ['walk']))
    expect(out).toEqual({ kind: 'refused', name: 'walk' })
    expect(a.confirmDialog).not.toHaveBeenCalled()
  })

  it('cancelar a confirmação não lê nem grava o GLB', async () => {
    const a = api()
    const out = await runBake(withStore({ skinned: { clips: { idle: { pose: { Head: TURN } } } } }, { clips: { idle: {} } }, ['idle']))
    expect(out).toEqual({ kind: 'cancelled' })
    expect(a.confirmDialog).toHaveBeenCalledOnce()
    expect(a.readFileBase64).not.toHaveBeenCalled()
    expect(a.characterRigWriteBake).not.toHaveBeenCalled()
  })

  it('bakeFlow: config que não salva para tudo (sem assar nem recarregar)', async () => {
    const a = api()
    const reload = vi.fn()
    expect(await bakeFlow(withStore({ skinned: { clips: { idle: {} } } }, { clips: {} }, ['idle']), async () => false, reload)).toBeNull()
    expect(a.confirmDialog).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('runBake — só a pegada (SPEC-0709)', () => {
  afterEach(() => vi.unstubAllGlobals())
  const GRIP = { offset: [0.04, -0.01, 0.02], rotation: [0, 0, 0, 1] }
  const cfg = { skinned: { clips: { idle: {} }, weaponGrips: { 'ARM-01': GRIP } } }
  const GLB = 'R0xCLWlndWFs'

  it('pegada igual no JSON do skin: nada a gravar', async () => {
    const a = { confirmDialog: vi.fn(), readFileBase64: vi.fn(), characterRigWriteBake: vi.fn() }
    vi.stubGlobal('window', { electronAPI: a })
    const skin = { clips: { idle: {} }, weaponGrips: { 'ARM-01': { rotation: GRIP.rotation, offset: GRIP.offset } } }
    expect(await runBake(withStore(cfg, skin, ['idle']))).toEqual({ kind: 'none' })
    expect(a.confirmDialog).not.toHaveBeenCalled()
  })

  it('pegada nova sem clipe a assar: grava o JSON do skin com ela e o GLB igual', async () => {
    const a = { confirmDialog: vi.fn(async () => true), readFileBase64: vi.fn(async () => GLB), characterRigWriteBake: vi.fn() }
    vi.stubGlobal('window', { electronAPI: a })
    const out = await runBake(withStore(cfg, { clips: { idle: {} } }, ['idle']))
    expect(out).toEqual({ kind: 'done', count: 0, grips: 1, file: 'a.glb' })
    const [, glb, json, glbB64, sidecar] = a.characterRigWriteBake.mock.calls[0]!
    expect([glb, json, glbB64]).toEqual(['a.glb', 'a.json', GLB])
    expect(JSON.parse(sidecar as string).weaponGrips).toEqual({ 'ARM-01': GRIP })
  })

  it('com personagens: a do player vai ao JSON dele e a do NPC ao dos NPCs, sem trocar (SPEC-0711)', async () => {
    const NPC = { offset: [0.03, 0.05, 0], rotation: [0, 0, 0, 1] }
    const chars = { group: 'NPC', glb: 'v.glb', clips: 'v.json', preview: 'p', codes: ['npc-001'] }
    const c = { code: 'LUC-01', skinned: { characters: chars, clips: { idle: {} }, weaponGrips: { 'ARM-01': GRIP, 'ARM-01#npc-001': NPC } } }
    const a = { confirmDialog: vi.fn(async () => true), readFileBase64: vi.fn(async () => GLB), readFile: vi.fn(async () => '{"clips":{}}'), characterRigWriteBake: vi.fn() }
    vi.stubGlobal('window', { electronAPI: a })
    const out = await runBake({ ...withStore(c, { clips: { idle: {} } }, ['idle']), player: 'LUC-01' })
    expect(out).toEqual({ kind: 'done', count: 0, grips: 2, file: 'a.glb + v.glb' })
    const written = new Map(a.characterRigWriteBake.mock.calls.map((call) => [call[2], JSON.parse(call[4] as string).weaponGrips]))
    expect(written.get('a.json')).toEqual({ 'ARM-01': GRIP })
    expect(written.get('v.json')).toEqual({ 'ARM-01#npc-001': NPC })
  })
})
