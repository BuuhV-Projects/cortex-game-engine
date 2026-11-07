/**
 * Assado da aba Animações no GLB do jogo (SPEC-0704), de ponta a ponta no LUC-01 real do Port Hollow:
 * carrega o GLB no GLTFLoader, posa a variante `pistolIdle@ARM-02` no store, assa, reescreve as animações
 * (ADR-0705), recarrega e confere que a variante assada é a base com a correção, quadro a quadro.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import * as THREE from 'three'
import type { Quat } from '../../electron/renderer/characterRigArmSpace'
import { ZERO_OFFSETS } from '../../electron/renderer/characterRigArmSpace'
import { poseDelta, quatDistance } from '../../electron/renderer/characterRigPose'
import { bakedSidecar } from '../../electron/renderer/characterRigBake'
import { parseConfigObject } from '../../electron/renderer/characterRigSelection'
import { replaceAnimations } from '../../electron/renderer/glbAnimations'
import { PoseStore } from '../../electron/renderer/rigPoseStore'
import { RigSkeleton, type UndoStack } from '../../electron/renderer/RigSkeleton'
import { bakeJob, bakeJobs, lostLinks, type BakeContext } from '../../electron/renderer/RigBake'
import type { RigArmAdjust } from '../../electron/renderer/RigArmAdjust'

const GLB = 'D:/jogos/port-hollow/assets/personagens/player/LUC-01-skinned.glb'
const SKIN = 'D:/jogos/port-hollow/assets/personagens/player/LUC-01-skinned.json'
const HAS_LUC = existsSync(GLB) && existsSync(SKIN)
const VARIANT = 'pistolIdle@ARM-02'
const TURN: Quat = [0, 0.258819, 0, 0.965926] // 30° em Y
const TOL = 1e-5
const PATH = 'cfg.json'
const CFG = JSON.stringify({ skinned: { clips: { pistolIdle: { weapons: { 'ARM-02': { pose: { LeftArm: TURN } } } }, idle: {} } } })

/** Braços sem ajuste (o RigArmAdjust de verdade monta DOM). */
const noArm = { apply() {}, restore() {}, undoStack: [], wanted: () => ZERO_OFFSETS, needsRegen: () => false } as unknown as RigArmAdjust

async function load(bytes: Uint8Array): Promise<{ scene: THREE.Object3D; clips: Map<string, THREE.AnimationClip> }> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
  const gltf = await new GLTFLoader().parseAsync(bytes.slice().buffer, '')
  return { scene: gltf.scene, clips: new Map(gltf.animations.map((a) => [a.name, a])) }
}

/** Quatérnion local do osso no quadro `i` da animação (valor da chave). */
function keyOf(clip: THREE.AnimationClip, bone: string, i: number): Quat {
  const t = clip.tracks.find((k) => k.name === `${bone}.quaternion`)!
  const n = t.times.length > i ? i : 0
  return Array.from(t.values.slice(n * 4, n * 4 + 4)) as Quat
}

describe.skipIf(!HAS_LUC)('RigBake — LUC-01 real', () => {
  let bytes: Uint8Array
  let store: PoseStore
  let sk: RigSkeleton
  let base: Map<string, THREE.AnimationClip>
  let skin: Record<string, unknown>

  beforeAll(async () => {
    // Node não decodifica JPEG: os stubs fazem o GLTFLoader aceitar a textura embutida
    vi.stubGlobal('createImageBitmap', async () => ({ width: 1, height: 1, close() {} }))
    vi.stubGlobal('self', globalThis)
    bytes = new Uint8Array(readFileSync(GLB))
    skin = JSON.parse(readFileSync(SKIN, 'utf8'))
    const g = await load(bytes)
    base = g.clips
    sk = new RigSkeleton()
    sk.setModel(g.scene)
    store = new PoseStore({ read: async () => CFG, write: async () => {} })
    store.setConfig(PATH, parseConfigObject(CFG))
    store.setGenerated(skin)
  })
  afterAll(() => vi.unstubAllGlobals())

  it('acha a variante a assar e não recusa', () => {
    const jobs = bakeJobs(store, noArm, store.baseClips(), store.variantKeys(), new Set(base.keys()))
    expect(jobs.map((j) => j.name)).toContain(VARIANT)
    expect(lostLinks(store, jobs.find((j) => j.name === VARIANT)!)).toBe(false)
  })

  it('a variante assada é a base com a correção, e o JSON novo para de pedir "gere de novo"', async () => {
    const ctx: BakeContext = { sk, arm: noArm, store, clips: base, limits: {} }
    const { clip, entry } = bakeJob(ctx, { name: VARIANT, anim: 'pistolIdle' })
    const next = replaceAnimations(bytes, [clip])
    const again = await load(next)
    const baked = again.clips.get(VARIANT)!
    expect(baked.tracks.length).toBe(base.get('pistolIdle')!.tracks.length)
    // esperado: base no quadro i + a mesma correção da prévia
    const pistol = base.get('pistolIdle')!
    const delta = poseDelta(store.wanted(VARIANT), store.generatedPose('pistolIdle'))
    for (const i of [0, 10, 30]) {
      for (const b of sk.allBones.values()) {
        const q = keyOf(pistol, b.name, i)
        b.quaternion.set(q[0], q[1], q[2], q[3])
      }
      const stack: UndoStack = []
      sk.applyPose(sk.readFrame(), delta, [], stack)
      sk.applyLimitsAndHelpers({}, stack)
      for (const n of ['LeftArm', 'LeftForeArm', 'LeftHand', 'LeftElbowHelper', 'Head']) {
        const want = sk.allBones.get(n)!.quaternion
        expect(quatDistance(keyOf(baked, n, i), [want.x, want.y, want.z, want.w])).toBeLessThan(TOL)
      }
      expect(quatDistance(keyOf(baked, 'Head', i), keyOf(pistol, 'Head', i))).toBeLessThan(TOL)
      expect(quatDistance(keyOf(baked, 'LeftArm', i), keyOf(pistol, 'LeftArm', i))).toBeGreaterThan(TOL)
    }
    const sidecar = bakedSidecar(skin, [entry], new Map())
    store.setGenerated(sidecar)
    expect(store.needsRegen(VARIANT, VARIANT)).toBe(false)
    expect((sidecar['clips'] as Record<string, Record<string, unknown>>)[VARIANT]!['weapon']).toBe('ARM-02')
  })
})

describe('RigBake — recusas', () => {
  it('clipe com shape key animada recusa o assado (gravar apagaria a faixa)', () => {
    const clip = new THREE.AnimationClip('idle', 1, [
      new THREE.QuaternionKeyframeTrack('Hips.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
      new THREE.NumberKeyframeTrack('Face.morphTargetInfluences', [0, 1], [0, 1]),
    ])
    const ctx = { sk: new RigSkeleton(), arm: noArm, store: new PoseStore({ read: async () => '', write: async () => {} }), clips: new Map([['idle', clip]]), limits: {} } as BakeContext
    expect(() => bakeJob(ctx, { name: 'idle', anim: 'idle' })).toThrow(/morphTargetInfluences/)
  })
})
