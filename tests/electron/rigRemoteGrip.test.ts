/**
 * Conta da pegada por comando e teclado (SPEC-0746): cm e graus, soma no espaço do osso, giro em torno dos eixos do
 * RightHand e as teclas.
 */
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { DEFAULT_GRIP, type Grip } from '../../electron/renderer/characterRigWeapon.js'
import { gripView, keyNudge, nudgeGrip, patchGrip, readQuat4, readVec3 } from '../../electron/renderer/rigRemoteGrip.js'

const IDENTITY: Grip = { offset: [0, 0.08, 0], rotation: [0, 0, 0, 1] }
const EPS = 6

describe('rigRemoteGrip', () => {
  it('mostra a pegada em cm e graus', () => {
    const v = gripView({ offset: [0.01, 0.08, -0.005], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] })
    expect(v.offsetCm).toEqual([1, 8, -0.5])
    expect(v.rotationDeg[2]).toBeCloseTo(90, 3)
  })

  it('soma o deslocamento em cm e não mexe no giro', () => {
    const g = nudgeGrip(DEFAULT_GRIP, [0.1, -1, 0])
    expect(g.offset[0]).toBeCloseTo(0.001, EPS)
    expect(g.offset[1]).toBeCloseTo(0.07, EPS)
    expect(g.rotation).toEqual([...DEFAULT_GRIP.rotation])
  })

  it('gira em torno do eixo do osso (pré-multiplica)', () => {
    const start: Grip = { offset: [0, 0, 0], rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] } // 90° em Y
    const g = nudgeGrip(start, undefined, [90, 0, 0])
    const want = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2).multiply(new THREE.Quaternion(...start.rotation))
    expect(new THREE.Quaternion(...g.rotation).angleTo(want)).toBeLessThan(1e-6)
    expect(g.offset).toEqual([0, 0, 0])
  })

  it('patchGrip troca só o que veio; o quaternion vence os graus', () => {
    const a = patchGrip(IDENTITY, { offsetCm: [1, 2, 3] })
    expect(a.offset.map((m) => +m.toFixed(6))).toEqual([0.01, 0.02, 0.03])
    expect(a.rotation).toEqual([0, 0, 0, 1])
    const b = patchGrip(IDENTITY, { rotationDeg: [0, 0, 90] })
    expect(gripView(b).rotationDeg[2]).toBeCloseTo(90, 3)
    const c = patchGrip(IDENTITY, { rotationDeg: [0, 0, 90], rotation: [0, 1, 0, 0] })
    expect(c.rotation).toEqual([0, 1, 0, 0])
  })

  it('teclas: setas e PgUp/PgDn 1 mm; com Alt, 1°', () => {
    expect(keyNudge('ArrowRight', false)).toEqual({ moveCm: [0.1, 0, 0] })
    expect(keyNudge('ArrowDown', false)).toEqual({ moveCm: [0, -0.1, 0] })
    expect(keyNudge('PageUp', true)).toEqual({ rotateDeg: [0, 0, 1] })
    expect(keyNudge('a', false)).toBeNull()
  })

  it('lê vetores e quaternions dos argumentos, recusando o resto', () => {
    expect(readVec3(undefined, 'x')).toBeUndefined()
    expect(readVec3([1, 2, 3], 'x')).toEqual([1, 2, 3])
    expect(() => readVec3([1, 2], 'moveCm')).toThrow(/moveCm/)
    expect(readQuat4([0, 0, 0, 2], 'rotation')).toEqual([0, 0, 0, 1])
    expect(() => readQuat4([0, 0, 0, 0], 'rotation')).toThrow(/nulo/)
  })
})
