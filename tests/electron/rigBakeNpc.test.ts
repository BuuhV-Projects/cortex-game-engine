/**
 * Assado num NPC com os dados reais do Port Hollow (SPEC-0708): a visão do NPC (a malha de prévia dele com os clipes
 * do player retargetados) assa a chave `idle#npc-007` e grava no GLB dos NPCs (o esqueleto deles, sem malha).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import * as THREE from 'three'
import type { Quat } from '../../electron/renderer/characterRigArmSpace.js'
import { ZERO_OFFSETS } from '../../electron/renderer/characterRigArmSpace.js'
import { quatDistance } from '../../electron/renderer/characterRigPose.js'
import { parseConfigObject } from '../../electron/renderer/characterRigSelection.js'
import { retargetAnimation, retargetRig } from '../../electron/renderer/characterRigRetarget.js'
import { replaceAnimations } from '../../electron/renderer/glbAnimations.js'
import { PoseStore } from '../../electron/renderer/rigPoseStore.js'
import { RigSkeleton } from '../../electron/renderer/RigSkeleton.js'
import { bakeJob, bakeJobs, type BakeContext } from '../../electron/renderer/RigBake.js'
import { keysForView } from '../../electron/renderer/RigBakeCharacters.js'
import type { RigArmAdjust } from '../../electron/renderer/RigArmAdjust.js'

const GAME = 'D:/jogos/port-hollow/.claude/worktrees/claude-npc-skeleton-sampler'
const PLAYER_GLB = `${GAME}/assets/personagens/player/LUC-01-skinned.glb`
const NPC_GLB = `${GAME}/dev-assets/personagens/npcs-preview/npc-007.glb`
const VARIANTS_GLB = `${GAME}/assets/personagens/npc-variants.glb`
const HAS = [PLAYER_GLB, NPC_GLB, VARIANTS_GLB].every((p) => existsSync(p))
const TURN: Quat = [0, 0.258819, 0, 0.965926]
const TOL = 1e-5
const CHARS = { group: 'NPC', glb: 'v.glb', clips: 'v.json', preview: 'p', codes: ['npc-007'] }
const CFG = JSON.stringify({ code: 'LUC-01', skinned: { characters: CHARS, clips: { idle: { characters: { 'npc-007': { pose: { LeftArm: TURN } } } } } } })
const noArm = { apply() {}, restore() {}, undoStack: [], wanted: () => ZERO_OFFSETS, needsRegen: () => false } as unknown as RigArmAdjust

async function load(path: string): Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
  return new GLTFLoader().parseAsync(new Uint8Array(readFileSync(path)).slice().buffer, '')
}

describe.skipIf(!HAS)('assado num NPC, dados reais (SPEC-0708)', () => {
  let clips: Map<string, THREE.AnimationClip>
  let sk: RigSkeleton
  beforeAll(async () => {
    vi.stubGlobal('createImageBitmap', async () => ({ width: 1, height: 1, close() {} }))
    vi.stubGlobal('self', globalThis)
    const player = await load(PLAYER_GLB)
    const npc = await load(NPC_GLB)
    const from = retargetRig(player.scene)
    const to = retargetRig(npc.scene)
    clips = new Map(player.animations.map((a) => [a.name, retargetAnimation(a, from, to)]))
    sk = new RigSkeleton()
    sk.setModel(npc.scene)
  })
  afterAll(() => vi.unstubAllGlobals())

  it('a visão do NPC assa idle#npc-007 e o GLB dos NPCs recarrega com ela, com o braço girado', async () => {
    const store = new PoseStore({ read: async () => CFG, write: async () => {} })
    store.setConfig('c.json', parseConfigObject(CFG))
    store.setGenerated({ clips: {} })
    const view = keysForView(store, store.variantKeys(), 'npc-007', 'LUC-01')
    expect(view.own).toEqual(['idle#npc-007'])
    const jobs = bakeJobs(store, noArm, [], view.own, new Set(clips.keys()))
    expect(jobs).toEqual([{ name: 'idle#npc-007', anim: 'idle' }])
    const ctx: BakeContext = { sk, arm: noArm, store, clips, limits: {} }
    const { clip } = bakeJob(ctx, jobs[0]!)
    const out = replaceAnimations(new Uint8Array(readFileSync(VARIANTS_GLB)), [clip])
    const { writeFileSync, mkdtempSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const path = join(mkdtempSync(join(tmpdir(), 'npc-bake-')), 'v.glb')
    writeFileSync(path, out)
    const again = await load(path)
    const baked = again.animations.find((a) => a.name === 'idle#npc-007')!
    expect(baked).toBeTruthy()
    const key = (c: THREE.AnimationClip, bone: string): Quat => Array.from(c.tracks.find((t) => t.name === `${bone}.quaternion`)!.values.slice(0, 4)) as Quat
    const base = clips.get('idle')!
    expect(quatDistance(key(baked, 'LeftArm'), key(base, 'LeftArm'))).toBeGreaterThan(TOL) // o ajuste do NPC
    expect(quatDistance(key(baked, 'Head'), key(base, 'Head'))).toBeLessThan(TOL) // o resto, o clipe do player retargetado
  })
})
