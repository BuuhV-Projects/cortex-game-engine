/** Retarget da prévia (SPEC-0708): o giro de mundo a partir do repouso é o mesmo no player e no NPC, como no jogo. */
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { retargetAnimation, retargetRig } from '../../electron/renderer/characterRigRetarget.js'

const TOL = 1e-5
const NAMES = ['Hips', 'Spine', 'Spine2', 'LeftArm', 'LeftForeArm']
const PARENT: Record<string, string | null> = { Hips: null, Spine: 'Hips', Spine2: 'Spine', LeftArm: 'Spine2', LeftForeArm: 'LeftArm' }

/** Um esqueleto com os mesmos nomes e repouso sorteado pela semente. */
function skeleton(seed: number, hipsY: number): THREE.Group {
  const root = new THREE.Group()
  const bones = new Map<string, THREE.Bone>()
  NAMES.forEach((n, i) => {
    const b = new THREE.Bone()
    b.name = n
    b.position.set(0, i === 0 ? hipsY : 0.2, 0)
    b.quaternion.setFromEuler(new THREE.Euler(0.3 * Math.sin(seed + i), 0.4 * Math.cos(seed * 2 + i), 0.2 * Math.sin(seed * 3 + i)))
    ;(PARENT[n] ? bones.get(PARENT[n]!)! : root).add(b)
    bones.set(n, b)
  })
  return root
}

function clipOn(root: THREE.Group): THREE.AnimationClip {
  const times = [0, 0.5, 1]
  const tracks: THREE.KeyframeTrack[] = NAMES.map((n, i) => {
    const rest = (root.getObjectByName(n) as THREE.Bone).quaternion
    const values = times.flatMap((t) => rest.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(t + i * 0.1, -t, t * 0.5))).toArray())
    return new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, times, values)
  })
  tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, times.flatMap((t) => [0, 1 + 0.1 * t, 0])))
  return new THREE.AnimationClip('walk', 1, tracks)
}

describe('retarget da prévia (SPEC-0708)', () => {
  const player = skeleton(1, 1)
  const npc = skeleton(5, 0.8)
  const from = retargetRig(player)
  const to = retargetRig(npc)
  const clip = clipOn(player)
  const out = retargetAnimation(clip, from, to)

  it('em cada quadro o giro de mundo a partir do repouso é o mesmo nos dois', () => {
    const world = (rig: typeof from, c: THREE.AnimationClip, f: number): Map<string, THREE.Quaternion> => {
      const m = new Map<string, THREE.Quaternion>()
      for (const n of rig.names) {
        const t = c.tracks.find((k) => k.name === `${n}.quaternion`)!
        const q = new THREE.Quaternion().fromArray(t.values, f * 4)
        const p = rig.parent.get(n)
        m.set(n, p ? m.get(p)!.clone().multiply(q) : q)
      }
      return m
    }
    for (const f of [0, 1, 2]) {
      const wf = world(from, clip, f)
      const wt = world(to, out, f)
      for (const n of NAMES) {
        const df = wf.get(n)!.clone().multiply(from.restWorld.get(n)!.clone().invert())
        const dt = wt.get(n)!.clone().multiply(to.restWorld.get(n)!.clone().invert())
        expect(1 - Math.abs(df.dot(dt)), `${n} ${f}`).toBeLessThan(TOL)
      }
    }
  })

  it('o quadril sobe na escala da altura de repouso do NPC', () => {
    const pos = out.tracks.find((t) => t.name === 'Hips.position')!
    expect(pos.values[2 * 3 + 1]! - 0.8).toBeCloseTo(0.1 * 0.8, 5)
  })
})
