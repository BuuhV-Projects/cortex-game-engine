/**
 * Pose por clipe, junta a junta, da aba Animações do painel auto-rig
 * (SPEC-0349, adendo 8): a conta do pipeline (gabarito), a edição, o IK de dois
 * ossos, apontar o pai e a config.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  POSE_BONES,
  POSE_PARENTS,
  aimParent,
  applyPoseToAll,
  applyPoses,
  correctionOf,
  editPose,
  editRotation,
  moveKind,
  parentTurn,
  poseCorrections,
  poseDelta,
  poseOffsets,
  posesFromConfig,
  posesFromSkin,
  quatAngleDeg,
  quatDistance,
  quatFromTo,
  samePose,
  twoBoneIk,
} from '../../electron/renderer/characterRigPose.js'
import { QUAT_IDENTITY, quatFromAxisAngle, quatInv, quatMul, rotateVec, type Quat, type Vec3 } from '../../electron/renderer/characterRigArmSpace.js'
import { parseConfigObject, serializeConfig } from '../../electron/renderer/characterRigSelection.js'

interface Golden {
  parents: Record<string, string | null>
  order: string[]
  rest: Record<string, Quat>
  frame: Record<string, Quat>
  pose: Record<string, Quat>
  expected: Record<string, Quat>
}

const golden = JSON.parse(readFileSync(join(__dirname, 'fixtures/characterRigPose.golden.json'), 'utf8')) as Golden
const asMap = (o: Record<string, Quat>): Map<string, Quat> => new Map(Object.entries(o))
const TOL = 1e-6

function expectSameRot(a: Quat, b: Quat, tol = TOL): void {
  expect(quatDistance(a, b)).toBeLessThan(tol)
}

function expectVec(a: Vec3, b: Vec3, digits = 6): void {
  for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i]!, digits)
}

const len = (v: Vec3): number => Math.hypot(v[0], v[1], v[2])
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

describe('pose_offsets (gabarito do pipeline)', () => {
  const parentOf = (n: string): string | null => golden.parents[n] ?? null
  const rest = asMap(golden.rest)
  const frame = asMap(golden.frame)
  const pose = asMap(golden.pose)

  it('reproduz o expected do Blender', () => {
    const out = poseOffsets(golden.order, parentOf, rest, frame, pose)
    for (const n of golden.order) expectSameRot(out.get(n)!, golden.expected[n]!)
  })

  it('sem pose, nada muda', () => {
    const out = poseOffsets(golden.order, parentOf, rest, frame, new Map())
    for (const n of golden.order) expectSameRot(out.get(n)!, golden.frame[n]!)
  })

  it('aplicar as correções osso a osso (como a prévia, o filho acompanhando o pai) dá o mesmo resultado', () => {
    const corr = poseCorrections(golden.order, parentOf, rest, frame, pose)
    expect([...corr.keys()].sort()).toEqual(Object.keys(golden.pose).sort())
    // simula a hierarquia: o mundo de cada osso = (mundo do pai) · (local); a correção X gira o mundo do osso
    const local = new Map<string, Quat>()
    for (const n of golden.order) {
      const p = parentOf(n)
      local.set(n, p ? quatMul(quatInv(frame.get(p)!), frame.get(n)!) : frame.get(n)!)
    }
    const worldNow = new Map<string, Quat>()
    for (const n of golden.order) {
      const p = parentOf(n)
      let w = p ? quatMul(worldNow.get(p)!, local.get(n)!) : local.get(n)!
      const x = corr.get(n)
      if (x) w = quatMul(x, w)
      worldNow.set(n, w)
    }
    for (const n of golden.order) expectSameRot(worldNow.get(n)!, golden.expected[n]!)
  })

  it('ida e volta R → G → R: a rotação de mundo da edição volta ao mesmo R', () => {
    const P = parentTurn('LeftArm', rest, frame)
    const posed = poseOffsets(golden.order, parentOf, rest, frame, pose)
    const C = correctionOf('LeftArm', frame, posed)
    const rOld = pose.get('LeftForeArm')!
    const rNew = quatFromAxisAngle([0.3, -0.5, 0.8], 37)
    const g = editRotation(rOld, rNew, P, C)
    expectSameRot(editPose(rOld, P, C, g), rNew)
    // e G é mesmo o giro do osso posado no quadro: W'(R_novo) = G · W'(R_velho)
    const after = poseOffsets(golden.order, parentOf, rest, frame, new Map([...pose, ['LeftForeArm', rNew]]))
    expectSameRot(after.get('LeftForeArm')!, quatMul(g, posed.get('LeftForeArm')!))
  })

  it('editar sem pose antes (R = identidade, C = identidade) gira o osso exatamente por G', () => {
    const empty = new Map<string, Quat>()
    const posed = poseOffsets(golden.order, parentOf, rest, frame, empty)
    const P = parentTurn('Spine1', rest, frame)
    const C = correctionOf('Spine1', frame, posed)
    const g = quatFromAxisAngle([0, 0, 1], 25)
    const r = editPose(QUAT_IDENTITY, P, C, g)
    const after = poseOffsets(golden.order, parentOf, rest, frame, new Map([['Spine2', r]]))
    expectSameRot(after.get('Spine2')!, quatMul(g, frame.get('Spine2')!))
  })
})

describe('mover junta', () => {
  it('IK de dois ossos: a ponta chega ao alvo, comprimentos iguais, plano da dobra mantido', () => {
    const a: Vec3 = [0.2, 1.4, 0]
    const b: Vec3 = [0.45, 1.3, -0.05]
    const c: Vec3 = [0.6, 1.1, 0.15]
    const target: Vec3 = [0.5, 1.05, 0.3]
    const { upper, lower } = twoBoneIk(a, b, c, target)
    const bNew = add(a, rotateVec(upper, sub(b, a)))
    const cNew = add(bNew, rotateVec(quatMul(lower, upper), sub(c, b)))
    expectVec(cNew, target)
    expect(len(sub(bNew, a))).toBeCloseTo(len(sub(b, a)), 9)
    expect(len(sub(cNew, bNew))).toBeCloseTo(len(sub(c, b)), 9)
    // o cotovelo novo fica no plano (raiz, alvo, cotovelo de antes) e do mesmo lado
    const n = cross(sub(target, a), sub(b, a))
    expect(dot(sub(bNew, a), n)).toBeCloseTo(0, 9)
    const dir = sub(target, a)
    const poleOld = sub(sub(b, a), [dir[0] * dot(sub(b, a), dir) / dot(dir, dir), dir[1] * dot(sub(b, a), dir) / dot(dir, dir), dir[2] * dot(sub(b, a), dir) / dot(dir, dir)])
    expect(dot(sub(bNew, a), poleOld)).toBeGreaterThan(0)
  })

  it('IK fora do alcance estica na direção do alvo', () => {
    const a: Vec3 = [0, 0, 0]
    const b: Vec3 = [0.3, -0.05, 0]
    const c: Vec3 = [0.55, 0.05, 0]
    const target: Vec3 = [0, -2, 1]
    const { upper, lower } = twoBoneIk(a, b, c, target)
    const bNew = rotateVec(upper, b)
    const cNew = add(bNew, rotateVec(quatMul(lower, upper), sub(c, b)))
    const reach = len(b) + len(sub(c, b))
    expect(len(cNew)).toBeCloseTo(reach, 9)
    const t = Math.hypot(0, -2, 1)
    expectVec(cNew, [0, (-2 / t) * reach, (1 / t) * reach])
  })

  it('apontar o pai gira pelo menor arco', () => {
    const parent: Vec3 = [0, 1, 0]
    const joint: Vec3 = [0.3, 1, 0]
    const target: Vec3 = [0, 1.5, 0]
    const q = aimParent(parent, joint, target)
    expectVec(add(parent, rotateVec(q, sub(joint, parent))), [0, 1.3, 0])
    expect(quatAngleDeg(q)).toBeCloseTo(90, 6)
    // eixo perpendicular às duas direções (menor arco = sem torção em volta do osso)
    const axis: Vec3 = [q[0], q[1], q[2]]
    expect(dot(axis, [1, 0, 0])).toBeCloseTo(0, 9)
    expect(dot(axis, [0, 1, 0])).toBeCloseTo(0, 9)
    expectSameRot(quatFromTo([1, 0, 0], [1, 0, 0]), [0, 0, 0, 1])
  })

  it('o que gira ao mover cada junta', () => {
    expect(moveKind('LeftHand')).toEqual({ kind: 'ik', upper: 'LeftArm', lower: 'LeftForeArm' })
    expect(moveKind('RightFoot')).toEqual({ kind: 'ik', upper: 'RightUpLeg', lower: 'RightLeg' })
    expect(moveKind('LeftForeArm')).toEqual({ kind: 'aim', parent: 'LeftArm' })
    expect(moveKind('Hips')).toEqual({ kind: 'none' })
    expect(POSE_BONES).toHaveLength(22)
    for (const n of POSE_BONES) {
      const p = POSE_PARENTS[n]
      if (p) expect(POSE_BONES.indexOf(p)).toBeLessThan(POSE_BONES.indexOf(n))
    }
  })
})

describe('config e JSON do skin', () => {
  const text = `{
 "code": "LUC-01",
 "skinned": {
  "fbx": "assets/animations/characters",
  "clips": {
   "idle": { "file": "basic-locomotion/idle.fbx", "loop": true, "pose": { "LeftArm": [0, 0, 0.258819, 0.965926], "Head": [0, 0, 0, 1] }, "armSpace": 5 },
   "walk": { "file": "basic-locomotion/walking.fbx", "loop": true }
  }
 },
 "budget": { "maxTriangles": 6000 }
}
`
  const cfg = parseConfigObject(text)

  it('lê a pose da config (identidade e osso fora dos 22 somem)', () => {
    const poses = posesFromConfig(cfg)
    expect([...poses.keys()]).toEqual(['idle', 'walk'])
    expect([...poses.get('idle')!.keys()]).toEqual(['LeftArm'])
    expect(quatAngleDeg(poses.get('idle')!.get('LeftArm')!)).toBeCloseTo(30, 3)
    expect(poses.get('walk')!.size).toBe(0)
  })

  it('grava a pose: campo na posição, novo no fim, 6 casas, identidade some, resto igual', () => {
    const q = quatFromAxisAngle([1, 2, 3], 12.3456789)
    const next = applyPoses(cfg, new Map([
      ['idle', new Map<string, Quat>([['LeftArm', [0, 0, 0.258819, 0.965926]], ['LeftForeArm', q], ['Neck', [0, 0, 0, -1]]])],
      ['walk', new Map<string, Quat>([['RightHand', [0, 0, 0, 1]]])],
      ['ghost', new Map<string, Quat>([['Head', q]])],
    ]))
    const clips = (next['skinned'] as Record<string, Record<string, Record<string, unknown>>>)['clips']!
    expect(Object.keys(clips['idle']!)).toEqual(['file', 'loop', 'pose', 'armSpace'])
    expect(Object.keys(clips['idle']!['pose']!)).toEqual(['LeftArm', 'LeftForeArm'])
    const saved = (clips['idle']!['pose'] as Record<string, number[]>)['LeftForeArm']!
    for (const c of saved) expect(Math.round(c * 1e6) / 1e6).toBe(c)
    expect('pose' in clips['walk']!).toBe(false)
    expect('ghost' in clips).toBe(false)
    expect(next['budget']).toEqual({ maxTriangles: 6000 })
    // sem ossos remove o campo
    const cleared = applyPoses(next, new Map([['idle', new Map()]]))
    const idle = (cleared['skinned'] as Record<string, Record<string, Record<string, unknown>>>)['clips']!['idle']!
    expect(Object.keys(idle)).toEqual(['file', 'loop', 'armSpace'])
    // ida e volta pelo texto
    expect(samePose(posesFromConfig(parseConfigObject(serializeConfig(next))).get('idle')!, new Map([['LeftArm', [0, 0, 0.258819, 0.965926] as Quat], ['LeftForeArm', q]]))).toBe(true)
  })

  it('aplicar a todos os clipes', () => {
    const pose = new Map<string, Quat>([['Spine', quatFromAxisAngle([1, 0, 0], 10)]])
    const next = posesFromConfig(applyPoseToAll(cfg, pose))
    expect([...next.keys()]).toEqual(['idle', 'walk'])
    for (const p of next.values()) expect(samePose(p, pose)).toBe(true)
  })

  it('lê o poseOffsets do JSON do skin (ausente = vazio)', () => {
    const skin = { clips: { idle: { loop: true, poseOffsets: { LeftArm: [0, 0, 0.258819, 0.965926] } }, walk: { loop: true } } }
    const gen = posesFromSkin(skin)
    expect([...gen.get('idle')!.keys()]).toEqual(['LeftArm'])
    expect(gen.get('walk')!.size).toBe(0)
    expect(posesFromSkin(null).size).toBe(0)
  })

  it('diferença desejado × gerado: D = R_desejado · R_gerado⁻¹, igual some', () => {
    const a = quatFromAxisAngle([0, 0, 1], 30)
    const b = quatFromAxisAngle([0, 1, 0], 20)
    const wanted = new Map<string, Quat>([['LeftArm', a], ['Head', b]])
    const generated = new Map<string, Quat>([['LeftArm', a], ['Spine', b]])
    const d = poseDelta(wanted, generated)
    expect([...d.keys()]).toEqual(['Spine', 'Head'])
    expectSameRot(d.get('Head')!, b)
    expectSameRot(d.get('Spine')!, quatInv(b))
    expect(poseDelta(wanted, wanted).size).toBe(0)
    expect(samePose(wanted, generated)).toBe(false)
    expect(samePose(new Map([['Head', [0, 0, 0, 1] as Quat]]), new Map())).toBe(true)
  })
})
