/**
 * Ajuste dos braços por animação (Character Arm-Space) da aba Animações do
 * painel auto-rig (SPEC-0349, adendo 4).
 */

import { describe, it, expect } from 'vitest'
import {
  applyArmOffsets,
  armOffsetsFromConfig,
  armOffsetsFromSkin,
  chestAxis,
  clampOffset,
  localAfterWorldRotation,
  offsetDelta,
  quatFromAxisAngle,
  quatMul,
  QUAT_IDENTITY,
  rotateVec,
  sideRotations,
  ZERO_OFFSETS,
  type ArmOffsets,
  type Quat,
  type Vec3,
} from '../../electron/renderer/characterRigArmSpace.js'
import { parseConfigObject, serializeConfig } from '../../electron/renderer/characterRigSelection.js'

// ── Mini esqueleto (Spine2 → Shoulder → Arm → Hand), como a prévia aplica ───

interface Node {
  parent: string | null
  pos: Vec3 // translação local
  rot: Quat // rotação local
}

function skeleton(): Record<string, Node> {
  const I = [...QUAT_IDENTITY] as Quat
  return {
    Spine2: { parent: null, pos: [0, 1.3, 0], rot: I },
    LeftShoulder: { parent: 'Spine2', pos: [0.05, 0.15, 0], rot: I },
    LeftArm: { parent: 'LeftShoulder', pos: [0.12, 0, 0], rot: I },
    LeftForeArm: { parent: 'LeftArm', pos: [0, -0.28, 0], rot: I }, // braço caído (A-pose fechada)
    LeftHand: { parent: 'LeftForeArm', pos: [0, -0.27, 0], rot: I },
    RightShoulder: { parent: 'Spine2', pos: [-0.05, 0.15, 0], rot: I },
    RightArm: { parent: 'RightShoulder', pos: [-0.12, 0, 0], rot: I },
    RightForeArm: { parent: 'RightArm', pos: [0, -0.28, 0], rot: I },
    RightHand: { parent: 'RightForeArm', pos: [0, -0.27, 0], rot: I },
  }
}

function world(sk: Record<string, Node>, name: string): { pos: Vec3; rot: Quat } {
  const n = sk[name]!
  if (!n.parent) return { pos: n.pos, rot: n.rot }
  const p = world(sk, n.parent)
  const d = rotateVec(p.rot, n.pos)
  return { pos: [p.pos[0] + d[0], p.pos[1] + d[1], p.pos[2] + d[2]], rot: quatMul(p.rot, n.rot) }
}

/** O que a prévia faz depois do `mixer.update`: clavícula, braço e antebraço, cada um com o pai já girado. */
function apply(sk: Record<string, Node>, partial: Partial<ArmOffsets>, spine2Rest: Quat = [...QUAT_IDENTITY] as Quat): void {
  const offsets: ArmOffsets = { ...ZERO_OFFSETS, ...partial }
  const axis = chestAxis(world(sk, 'Spine2').rot, spine2Rest)
  for (const [side, sign] of [['Left', 1], ['Right', -1]] as const) {
    const r = sideRotations(axis, sign, offsets)
    for (const [bone, rot] of [['Shoulder', r.shoulder], ['Arm', r.arm], ['ForeArm', r.foreArm]] as const) {
      const n = sk[`${side}${bone}`]!
      n.rot = localAfterWorldRotation(world(sk, n.parent!).rot, n.rot, rot)
    }
  }
}

describe('rotação dos braços', () => {
  it('armSpace +θ abre o braço esquerdo para +X e o direito para −X', () => {
    const sk = skeleton()
    const l0 = world(sk, 'LeftHand').pos
    const r0 = world(sk, 'RightHand').pos
    apply(sk, { shoulderLift: 0, armSpace: 20 })
    const l1 = world(sk, 'LeftHand').pos
    const r1 = world(sk, 'RightHand').pos
    expect(l1[0]).toBeGreaterThan(l0[0] + 0.1)
    expect(r1[0]).toBeLessThan(r0[0] - 0.1)
    expect(l1[1]).toBeGreaterThan(l0[1]) // a mão sobe ao abrir
    expect(l1[2]).toBeCloseTo(0, 9) // gira no plano frontal
    // o ombro não mexe com armSpace
    expect(world(sk, 'LeftArm').pos).toEqual(world(skeleton(), 'LeftArm').pos)
  })

  it('armSpace −θ fecha (mão do lado esquerdo vai para −X)', () => {
    const sk = skeleton()
    const l0 = world(sk, 'LeftHand').pos
    apply(sk, { shoulderLift: 0, armSpace: -10 })
    expect(world(sk, 'LeftHand').pos[0]).toBeLessThan(l0[0])
  })

  it('shoulderLift +θ sobe a ponta da clavícula dos dois lados e leva o braço junto', () => {
    const sk = skeleton()
    const l0 = world(sk, 'LeftArm').pos
    const r0 = world(sk, 'RightArm').pos
    const h0 = world(sk, 'LeftHand').pos
    apply(sk, { shoulderLift: 15, armSpace: 0 })
    expect(world(sk, 'LeftArm').pos[1]).toBeGreaterThan(l0[1] + 0.02)
    expect(world(sk, 'RightArm').pos[1]).toBeGreaterThan(r0[1] + 0.02)
    expect(world(sk, 'LeftHand').pos[1]).toBeGreaterThan(h0[1]) // hierarquia
    apply(sk, { shoulderLift: -30, armSpace: 0 }) // agora −15 no total
    expect(world(sk, 'LeftArm').pos[1]).toBeLessThan(l0[1])
  })

  it('braço: W\' = R(a, space) · R(a, lift) · W (igual ao arm_offsets do jogo)', () => {
    const sk = skeleton()
    sk['LeftArm']!.rot = quatFromAxisAngle([1, 0, 0], 25) // pose qualquer do clipe
    const w0 = world(sk, 'LeftArm').rot
    apply(sk, { shoulderLift: 7, armSpace: 12 })
    const expected = quatMul(quatFromAxisAngle([0, 0, 1], 12), quatMul(quatFromAxisAngle([0, 0, 1], 7), w0))
    const got = world(sk, 'LeftArm').rot
    const dot = Math.abs(got.reduce((s, v, i) => s + v * expected[i]!, 0))
    expect(dot).toBeCloseTo(1, 9)
  })

  it('o eixo acompanha o peito: personagem virado 90° abre no seu próprio plano frontal', () => {
    const sk = skeleton()
    sk['Spine2']!.rot = quatFromAxisAngle([0, 1, 0], 90) // frente +Z → +X; esquerda +X → −Z
    const l0 = world(sk, 'LeftHand').pos
    apply(sk, { shoulderLift: 0, armSpace: 20 })
    const l1 = world(sk, 'LeftHand').pos
    expect(l1[2]).toBeLessThan(l0[2] - 0.1) // abre para a esquerda dele (−Z)
    expect(l1[0]).toBeCloseTo(l0[0], 9)
  })

  it('elbowSpace +θ leva a mão esquerda para +X e a direita para −X sem mover o cotovelo', () => {
    const sk = skeleton()
    const el0 = world(sk, 'LeftForeArm').pos
    const er0 = world(sk, 'RightForeArm').pos
    const l0 = world(sk, 'LeftHand').pos
    const r0 = world(sk, 'RightHand').pos
    apply(sk, { elbowSpace: 20 })
    const el1 = world(sk, 'LeftForeArm').pos
    const er1 = world(sk, 'RightForeArm').pos
    for (let i = 0; i < 3; i++) {
      expect(el1[i]).toBeCloseTo(el0[i]!, 12) // pivô no cotovelo
      expect(er1[i]).toBeCloseTo(er0[i]!, 12)
    }
    expect(world(sk, 'LeftHand').pos[0]).toBeGreaterThan(l0[0] + 0.05)
    expect(world(sk, 'RightHand').pos[0]).toBeLessThan(r0[0] - 0.05)
  })

  it('antebraço: W\' = R(a, elbow) · R(a, space) · R(a, lift) · W (igual ao arm_offsets do jogo)', () => {
    const sk = skeleton()
    sk['LeftForeArm']!.rot = quatFromAxisAngle([1, 0, 0], -40) // cotovelo dobrado no clipe
    const w0 = world(sk, 'LeftForeArm').rot
    apply(sk, { shoulderLift: 5, armSpace: -8, elbowSpace: 15 })
    const z = (deg: number): Quat => quatFromAxisAngle([0, 0, 1], deg)
    const expected = quatMul(z(15), quatMul(z(-8), quatMul(z(5), w0)))
    const got = world(sk, 'LeftForeArm').rot
    expect(Math.abs(got.reduce((s, v, i) => s + v * expected[i]!, 0))).toBeCloseTo(1, 9)
  })

  it('0/0/0 não muda nada', () => {
    const sk = skeleton()
    apply(sk, {})
    expect(world(sk, 'LeftHand').pos).toEqual(world(skeleton(), 'LeftHand').pos)
  })
})

describe('valores', () => {
  it('clampOffset limita ao intervalo e arredonda ao passo de 0,5', () => {
    expect(clampOffset('shoulderLift', 25)).toBe(20)
    expect(clampOffset('shoulderLift', -25)).toBe(-20)
    expect(clampOffset('armSpace', 31)).toBe(30)
    expect(clampOffset('armSpace', -21)).toBe(-20)
    expect(clampOffset('elbowSpace', 31)).toBe(30)
    expect(clampOffset('elbowSpace', -31)).toBe(-30)
    expect(clampOffset('armSpace', 3.3)).toBe(3.5)
    expect(clampOffset('armSpace', 3.2)).toBe(3)
    expect(Object.is(clampOffset('armSpace', -0.1), 0)).toBe(true)
    expect(clampOffset('armSpace', Number.NaN)).toBe(0)
  })

  it('offsetDelta = desejado − gerado', () => {
    expect(offsetDelta({ shoulderLift: 5, armSpace: 10, elbowSpace: 0 }, { shoulderLift: 2, armSpace: 10, elbowSpace: 0 })).toEqual({ shoulderLift: 3, armSpace: 0, elbowSpace: 0 })
  })

  it('lê da config (ausente = 0) e do JSON do skin (armOffsets ausente = 0)', () => {
    const cfg = { skinned: { clips: { idle: { file: 'idle.fbx', loop: true, armSpace: 8, elbowSpace: -6 }, walk: { file: 'w.fbx' } } } }
    expect(armOffsetsFromConfig(cfg).get('idle')).toEqual({ shoulderLift: 0, armSpace: 8, elbowSpace: -6 })
    expect(armOffsetsFromConfig(cfg).get('walk')).toEqual({ shoulderLift: 0, armSpace: 0, elbowSpace: 0 })
    expect(armOffsetsFromConfig({}).size).toBe(0)
    const skin = { clips: { idle: { loop: true, armOffsets: { shoulderLift: -2, armSpace: 8, elbowSpace: 4 } }, walk: { loop: true } } }
    expect(armOffsetsFromSkin(skin).get('idle')).toEqual({ shoulderLift: -2, armSpace: 8, elbowSpace: 4 })
    expect(armOffsetsFromSkin(skin).get('walk')).toEqual({ shoulderLift: 0, armSpace: 0, elbowSpace: 0 })
    expect(armOffsetsFromSkin(null).size).toBe(0)
  })
})

describe('gravação na config', () => {
  const text = `${JSON.stringify({
    code: 'LUC-01',
    skinned: {
      fbx: 'assets/animations',
      clips: {
        idle: { file: 'idle.fbx', loop: true },
        walk: { file: 'walking.fbx', loop: true, armSpace: 4, rootMotion: true },
      },
      preview: [],
    },
    publish: { glb: 'x.glb' },
  }, null, 1)}\n`

  it('acrescenta no fim da entrada, mantém a posição do campo existente e omite 0', () => {
    const cfg = parseConfigObject(text)
    const next = applyArmOffsets(cfg, new Map([
      ['idle', { shoulderLift: 2.5, armSpace: 10, elbowSpace: -3 }],
      ['walk', { shoulderLift: 0, armSpace: 6, elbowSpace: 0 }],
      ['ghost', { shoulderLift: 1, armSpace: 1, elbowSpace: 0 }], // fora da config: ignorado
    ]))
    const clips = (next['skinned'] as Record<string, Record<string, unknown>>)['clips'] as Record<string, Record<string, unknown>>
    expect(Object.keys(clips['idle']!)).toEqual(['file', 'loop', 'shoulderLift', 'armSpace', 'elbowSpace'])
    expect(clips['idle']).toMatchObject({ shoulderLift: 2.5, armSpace: 10, elbowSpace: -3 })
    expect(Object.keys(clips['walk']!)).toEqual(['file', 'loop', 'armSpace', 'rootMotion'])
    expect(clips['walk']!['armSpace']).toBe(6)
    expect(clips['ghost']).toBeUndefined()
    expect(Object.keys(next)).toEqual(['code', 'skinned', 'publish'])
    expect(Object.keys(next['skinned'] as object)).toEqual(['fbx', 'clips', 'preview'])
    expect(cfg).toEqual(parseConfigObject(text)) // não muta a entrada
  })

  it('valor 0 remove o campo; sem mudança o texto fica igual', () => {
    const cfg = parseConfigObject(text)
    const zeroed = applyArmOffsets(cfg, new Map([['walk', { shoulderLift: 0, armSpace: 0, elbowSpace: 0 }]]))
    const walk = ((zeroed['skinned'] as Record<string, unknown>)['clips'] as Record<string, Record<string, unknown>>)['walk']!
    expect(Object.keys(walk)).toEqual(['file', 'loop', 'rootMotion'])
    const same = applyArmOffsets(cfg, new Map([['walk', { shoulderLift: 0, armSpace: 4, elbowSpace: 0 }], ['idle', { shoulderLift: 0, armSpace: 0, elbowSpace: 0 }]]))
    expect(serializeConfig(same)).toBe(text)
  })

  it('grava o valor já limitado ao intervalo', () => {
    const next = applyArmOffsets(parseConfigObject(text), new Map([['idle', { shoulderLift: 99, armSpace: -99, elbowSpace: 99 }]]))
    const idle = ((next['skinned'] as Record<string, unknown>)['clips'] as Record<string, Record<string, unknown>>)['idle']!
    expect(idle).toMatchObject({ shoulderLift: 20, armSpace: -20, elbowSpace: 30 })
  })
})

it('rotateVec gira pela regra da mão direita', () => {
  const v = rotateVec(quatFromAxisAngle([0, 0, 1], 90), [1, 0, 0])
  expect(v[0]).toBeCloseTo(0, 9)
  expect(v[1]).toBeCloseTo(1, 9)
})
