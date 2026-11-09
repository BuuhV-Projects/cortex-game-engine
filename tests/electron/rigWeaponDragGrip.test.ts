/** Arrasto da pegada relativo ao começo (SPEC-0721): o proxy fora de lugar não injeta pegada. */
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { RigWeapon } from '../../electron/renderer/RigWeapon.js'
import { gripToJson, type Grip } from '../../electron/renderer/characterRigWeapon.js'

const START: Grip = { offset: [0.010082, -0.0097, 0.028036], rotation: [-0.654684, -0.037918, -0.025036, 0.754535] }

function setup(): { w: RigWeapon; hand: THREE.Object3D } {
  const scene = new THREE.Scene()
  const hand = new THREE.Object3D()
  hand.position.set(0.3, 1.2, 0.1)
  hand.quaternion.setFromEuler(new THREE.Euler(0.4, -1.1, 0.7))
  scene.add(hand)
  return { w: new RigWeapon(scene), hand }
}

// proxy em outro lugar e com outro giro (ex.: ficou na arma da prévia de um NPC)
const STALE = { pos: new THREE.Vector3(1, 2, 3), quat: new THREE.Quaternion(0, Math.SQRT1_2, Math.SQRT1_2, 0) }

describe('RigWeapon.dragGrip (SPEC-0721)', () => {
  it('proxy fora de lugar e parado devolve a pegada do começo', () => {
    const { w, hand } = setup()
    const g = w.dragGrip(hand, START, STALE, { pos: STALE.pos.clone(), quat: STALE.quat.clone() })
    expect(gripToJson(g)).toEqual(gripToJson(START))
  })

  it('mover o proxy 1 cm move a pegada 1 cm no mundo, sem mudar o giro', () => {
    const { w, hand } = setup()
    const g = w.dragGrip(hand, START, STALE, { pos: STALE.pos.clone().add(new THREE.Vector3(0.01, 0, 0)), quat: STALE.quat.clone() })
    hand.updateWorldMatrix(true, false)
    const before = hand.localToWorld(new THREE.Vector3(...START.offset))
    const after = hand.localToWorld(new THREE.Vector3(...g.offset))
    expect(after.sub(before).toArray().map((v) => Number(v.toFixed(6)) + 0)).toEqual([0.01, 0, 0])
    expect(gripToJson(g).rotation).toEqual(gripToJson(START).rotation)
  })
})
