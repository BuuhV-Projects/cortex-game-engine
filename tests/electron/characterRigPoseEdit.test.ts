/**
 * Edição de uma junta (SPEC-0349 adendo 8): mover/girar a partir do quadro do
 * começo do arrasto. Quadro e repouso identidade: P = C = identidade, então o R
 * novo do osso é G · R_velho, e na IK o de baixo herda o giro do de cima.
 */

import { describe, it, expect } from 'vitest'
import { quatInv, quatMul, type Quat, type Vec3 } from '../../electron/renderer/characterRigArmSpace'
import { POSE_BONES, quatDistance, twoBoneIk } from '../../electron/renderer/characterRigPose'
import { moveJointPose, rotateJointPose, wristTarget, type Snapshot } from '../../electron/renderer/characterRigPoseEdit'

const I: Quat = [0, 0, 0, 1]
const TURN: Quat = [0, 0.7071068, 0, 0.7071068]
const POS: Record<string, Vec3> = { LeftArm: [0.2, 1.4, 0], LeftForeArm: [0.5, 1.4, 0], LeftHand: [0.75, 1.4, 0.01], Spine: [0, 1, 0], Spine1: [0, 1.1, 0] }

function snapshot(): Snapshot {
  const frame = new Map(POSE_BONES.map((b) => [b, I]))
  return { frame, posed: new Map(frame), pos: new Map(Object.entries(POS)) }
}
const rest = new Map(POSE_BONES.map((b) => [b, I]))
const near = (a: Quat | undefined, b: Quat): void => expect(quatDistance(a!, b)).toBeLessThan(1e-9)

describe('characterRigPoseEdit', () => {
  it('girar: R novo = G · R velho e só no osso', () => {
    const next = rotateJointPose(new Map([['Head', TURN]]), snapshot(), rest, 'Head', TURN)
    near(next.get('Head'), quatMul(TURN, TURN))
    expect([...next.keys()]).toEqual(['Head'])
  })

  it('mover a mão: IK no braço e antebraço', () => {
    const target: Vec3 = [0.5, 1.1, 0.3]
    const next = moveJointPose(new Map(), snapshot(), rest, 'LeftHand', target)
    const { upper, lower } = twoBoneIk(POS['LeftArm']!, POS['LeftForeArm']!, POS['LeftHand']!, target)
    near(next.get('LeftArm'), upper)
    near(next.get('LeftForeArm'), quatMul(quatMul(quatInv(upper), lower), upper))
  })

  it('mover outra junta gira o pai; Hips não move', () => {
    const next = moveJointPose(new Map(), snapshot(), rest, 'Spine1', [0.1, 1.1, 0])
    expect([...next.keys()]).toEqual(['Spine'])
    expect(moveJointPose(new Map([['Head', TURN]]), snapshot(), rest, 'Hips', [1, 1, 1])).toEqual(new Map([['Head', TURN]]))
  })

  it('alvo do pulso põe a palma no ponto (a palma gira com a IK)', () => {
    const point: Vec3 = [0.45, 1.2, 0.3]
    const palm: Vec3 = [0.08, 0, 0]
    const wrist = wristTarget(snapshot(), 'LeftHand', point, palm)
    const { upper, lower } = twoBoneIk(POS['LeftArm']!, POS['LeftForeArm']!, POS['LeftHand']!, wrist)
    const r = quatMul(lower, upper)
    const p = quatMul(quatMul(r, [...palm, 0] as Quat), quatInv(r))
    const reached = wrist.map((w, i) => w + p[i]!)
    expect(Math.hypot(...reached.map((v, i) => v - point[i]!))).toBeLessThan(1e-3)
    expect(wristTarget(snapshot(), 'Head', point, palm)).toEqual(point)
  })
})
