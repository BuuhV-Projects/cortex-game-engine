/**
 * "Gravar no GLB do jogo" (SPEC-0704): sem o JSON do skin do build, nada é assado nem gravado.
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
