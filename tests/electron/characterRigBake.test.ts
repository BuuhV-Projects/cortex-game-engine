/**
 * Conta pura do "Gravar no GLB do jogo" (SPEC-0704): limite de junta, auxiliares,
 * continuidade de sinal e JSON do skin.
 *
 * Gabarito `fixtures/characterRigHelpers.golden.json`: extraído do
 * `D:/jogos/port-hollow/assets/personagens/player/LUC-01-skinned.glb` (exportado pelo
 * Blender, auxiliares calculados pelo `character_skin.py`) por um script node que lê o
 * chunk JSON + BIN do GLB e grava, nos clipes `walk`, `run` e `pistolIdle` (quadros 0, 7
 * e 15), o `node.rotation` (repouso local) do osso de baixo e do auxiliar dos 4 pares e
 * os quatérnions animados de ambos (faixa `.rotation`, arredondados a 1e-7).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { JsonObject } from '../../electron/renderer/characterRigSelection.js'
import { ZERO_OFFSETS, quatFromAxisAngle, quatInv, quatMul, type Quat } from '../../electron/renderer/characterRigArmSpace.js'
import { quatAngleDeg, quatDistance } from '../../electron/renderer/characterRigPose.js'
import { DEFAULT_GRIP } from '../../electron/renderer/characterRigWeapon.js'
import {
  HELPER_PAIRS,
  bakedSidecar,
  clampJoint,
  helperQuat,
  limitOf,
  keepContinuous,
  partOf,
  type BakeEntry,
} from '../../electron/renderer/characterRigBake.js'

const TOL = 1e-6
const DEG_TOL = 1e-6
const FOREARM_LIMIT = 115

interface Golden {
  rests: Record<string, Quat>
  samples: Array<{ clip: string; frame: number; lower: string; helper: string; qLower: Quat; qHelper: Quat }>
}
const golden = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/characterRigHelpers.golden.json', import.meta.url)), 'utf8')) as Golden

const REST: Quat = quatFromAxisAngle([0, 0, 1], 30)
const AXIS: [number, number, number] = [1, 2, 3]

describe('limite de junta', () => {
  it('dentro do limite devolve o próprio q', () => {
    const q = quatMul(REST, quatFromAxisAngle(AXIS, 90))
    expect(clampJoint(REST, q, FOREARM_LIMIT)).toBe(q)
  })

  it('fora do limite: ângulo em relação ao repouso = limite, mesmo eixo', () => {
    const q = quatMul(REST, quatFromAxisAngle(AXIS, 150))
    const c = clampJoint(REST, q, FOREARM_LIMIT)
    const b = quatMul(quatInv(REST), c)
    expect(quatAngleDeg(b)).toBeCloseTo(FOREARM_LIMIT, 6)
    expect(quatDistance(b, quatFromAxisAngle(AXIS, FOREARM_LIMIT))).toBeLessThan(TOL)
  })

  it('base com w < 0 (mesma rotação) limita igual', () => {
    const q = quatMul(REST, quatFromAxisAngle(AXIS, 150)).map((v) => -v) as Quat
    const b = quatMul(quatInv(REST), clampJoint(REST, q, FOREARM_LIMIT))
    expect(Math.abs(quatAngleDeg(b) - FOREARM_LIMIT)).toBeLessThan(DEG_TOL)
  })

  it('jointLimitsDeg casa pela parte sem o lado', () => {
    expect(partOf('LeftForeArm')).toBe('ForeArm')
    expect(partOf('RightUpLeg')).toBe('UpLeg')
    expect(partOf('Hips')).toBe('Hips')
    expect(limitOf('RightForeArm', { ForeArm: FOREARM_LIMIT })).toBe(FOREARM_LIMIT)
    expect(limitOf('LeftArm', { ForeArm: FOREARM_LIMIT })).toBeNull()
  })
})

describe('auxiliares', () => {
  it('pares: o auxiliar segue o osso de baixo', () => {
    expect(HELPER_PAIRS['LeftElbowHelper']).toEqual(['LeftArm', 'LeftForeArm'])
    expect(HELPER_PAIRS['RightKneeHelper']).toEqual(['RightUpLeg', 'RightLeg'])
    for (const s of golden.samples) expect(HELPER_PAIRS[s.helper]![1]).toBe(s.lower)
  })

  it('gabarito do GLB do LUC-01: helperQuat bate com o auxiliar exportado (erro < 1e-6)', () => {
    expect(golden.samples.length).toBeGreaterThan(0)
    for (const s of golden.samples) {
      expect(golden.rests[s.helper]).toEqual(golden.rests[s.lower])
      const err = quatDistance(helperQuat(golden.rests[s.lower]!, s.qLower), s.qHelper)
      expect(err, `${s.clip}#${s.frame} ${s.helper}`).toBeLessThan(TOL)
    }
  })

  it('w < 0 na base: mesmo resultado que o caminho curto', () => {
    const q = quatMul(REST, quatFromAxisAngle(AXIS, 80))
    const neg = q.map((v) => -v) as Quat
    expect(quatDistance(helperQuat(REST, neg), helperQuat(REST, q))).toBeLessThan(TOL)
    expect(quatAngleDeg(quatMul(quatInv(REST), helperQuat(REST, neg)))).toBeCloseTo(40, 6)
  })

  it('no repouso o auxiliar fica no repouso', () => {
    expect(quatDistance(helperQuat(REST, REST), REST)).toBeLessThan(TOL)
  })
})

describe('continuidade', () => {
  it('troca o sinal quando dot < 0 e mantém quando ≥ 0', () => {
    const q: Quat = [0.1, 0.2, 0.3, 0.927]
    const neg = q.map((v) => -v) as Quat
    expect(keepContinuous(q, neg)).toEqual(q)
    expect(keepContinuous(q, q)).toEqual(q)
    expect(keepContinuous(null, neg)).toEqual(neg)
  })
})

const skin = (): JsonObject => ({
  bones: 26,
  clips: {
    idle: { loop: true, duration: 8.3333, armOffsets: { shoulderLift: 20, armSpace: -13 }, phase: 0.512, extra: 'x' },
    pistolIdle: { loop: true, duration: 2, stride: 0, phase: 0.1, marks: { a: 1 }, other: 7 },
  },
  tail: true,
})

const entry = (over: Partial<BakeEntry>): BakeEntry => ({
  name: 'idle',
  base: 'idle',
  arm: { ...ZERO_OFFSETS },
  pose: new Map(),
  follow: [],
  ...over,
})

const NECK_TURN = 10

describe('bakedSidecar', () => {
  it('clipe base: grava o desejado e preserva ordem e outros campos', () => {
    const neck = quatFromAxisAngle([0, 1, 0], NECK_TURN)
    const out = bakedSidecar(skin(), [entry({ arm: { ...ZERO_OFFSETS, armSpace: 5 }, pose: new Map([['Neck', neck]]) })], new Map())
    const idle = (out['clips'] as JsonObject)['idle'] as JsonObject
    expect(Object.keys(idle)).toEqual(['loop', 'duration', 'armOffsets', 'phase', 'extra', 'poseOffsets'])
    expect(idle['armOffsets']).toEqual({ armSpace: 5 })
    expect(Object.keys(idle['poseOffsets'] as JsonObject)).toEqual(['Neck'])
    expect(Object.keys(out)).toEqual(['bones', 'clips', 'tail'])
  })

  it('campos vazios somem (braços zero, sem pose, sem ligações)', () => {
    const src = skin()
    ;((src['clips'] as JsonObject)['idle'] as JsonObject)['follow'] = [{ bone: 'LeftHand' }]
    const idle = (bakedSidecar(src, [entry({})], new Map())['clips'] as JsonObject)['idle'] as JsonObject
    expect(idle).toEqual({ loop: true, duration: 8.3333, phase: 0.512, extra: 'x' })
  })

  it('variante herda loop/duration/stride/phase/marks do base e ganha clip e weapon', () => {
    const link = { bone: 'LeftHand', target: 'RightHand', offset: [0, 0.1, 0] as [number, number, number], rotation: [0, 0, 0, 1] as Quat }
    const out = bakedSidecar(skin(), [entry({ name: 'pistolIdle@ARM-02', base: 'pistolIdle', weapon: 'ARM-02', follow: [link] })], new Map())
    const v = (out['clips'] as JsonObject)['pistolIdle@ARM-02'] as JsonObject
    expect(v).toEqual({ loop: true, duration: 2, stride: 0, phase: 0.1, marks: { a: 1 }, clip: 'pistolIdle', weapon: 'ARM-02', follow: [{ bone: 'LeftHand', target: 'RightHand', offset: [0, 0.1, 0], rotation: [0, 0, 0, 1] }] })
    expect(Object.keys(out['clips'] as JsonObject)).toEqual(['idle', 'pistolIdle', 'pistolIdle@ARM-02'])
  })

  it('não altera o skin de entrada', () => {
    const src = skin()
    const before = JSON.stringify(src)
    bakedSidecar(src, [entry({ arm: { ...ZERO_OFFSETS, armSpace: 5 } })], new Map([['ARM-02', DEFAULT_GRIP]]))
    expect(JSON.stringify(src)).toBe(before)
  })

  it('weaponGrips: grava a pegada de cada arma; sem pegadas mantém o existente', () => {
    const out = bakedSidecar(skin(), [], new Map([['ARM-02', DEFAULT_GRIP]]))
    const grip = (out['weaponGrips'] as JsonObject)['ARM-02'] as JsonObject
    expect(grip['offset']).toEqual([0, 0.08, 0])
    expect(Object.keys(out)).toEqual(['bones', 'clips', 'tail', 'weaponGrips'])
    const kept = bakedSidecar(out, [], new Map())
    expect(kept['weaponGrips']).toEqual(out['weaponGrips'])
  })
})
