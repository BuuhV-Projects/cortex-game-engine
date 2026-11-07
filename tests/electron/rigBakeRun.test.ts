/**
 * "Gravar no GLB do jogo" (SPEC-0704): sem o JSON do skin do build, nada é assado nem gravado.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bakeFlow, runBake, type BakeRunInput } from '../../electron/renderer/RigBakeRun'

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
