/**
 * Ligação "seguir" entre juntas, por quadro (SPEC-0349, adendo 9): a conta do
 * pipeline (gabarito), a captura, o alcance, o encadeamento, a validação e a config.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  applyFollows,
  captureFollow,
  followConstraints,
  followProblem,
  followsFromConfig,
  followsFromSkin,
  jointHeads,
  sameFollows,
  withFollow,
  type FollowLink,
} from '../../electron/renderer/characterRigFollow.js'
import { blenderOrthogonal, quatDistance, quatNormalize, worldCorrections } from '../../electron/renderer/characterRigPose.js'
import { quatFromAxisAngle, quatMul, rotateVec, type Quat, type Vec3 } from '../../electron/renderer/characterRigArmSpace.js'
import { parseConfigObject, serializeConfig } from '../../electron/renderer/characterRigSelection.js'

interface Golden {
  parents: Record<string, string | null>
  order: string[]
  hip: Vec3
  restHeads: Record<string, Vec3>
  rest: Record<string, Quat>
  frame: Record<string, Quat>
  follow: FollowLink[]
  expected: Record<string, Quat>
  expectedHeads: Record<string, Vec3>
}

const golden = JSON.parse(readFileSync(join(__dirname, 'fixtures/characterRigFollow.golden.json'), 'utf8')) as Golden
const parentOf = (n: string): string | null => golden.parents[n] ?? null
// o fixture vem com 9 casas: normaliza para as comparações exatas
const unitMap = (o: Record<string, Quat>): Map<string, Quat> => new Map(Object.entries(o).map(([k, q]) => [k, quatNormalize(q)]))
const rest = unitMap(golden.rest)
const restHeads = new Map(Object.entries(golden.restHeads))
const frame = unitMap(golden.frame)
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const heads = (w: ReadonlyMap<string, Quat>): Map<string, Vec3> => jointHeads(golden.order, parentOf, rest, restHeads, w, golden.hip)
const run = (w: ReadonlyMap<string, Quat>, follows: FollowLink[]): Map<string, Quat> => followConstraints(golden.order, parentOf, rest, restHeads, w, golden.hip, follows)

describe('follow_constraints (gabarito do pipeline)', () => {
  it('reproduz expected (rotações) e expectedHeads (posições)', () => {
    const out = run(frame, golden.follow)
    for (const n of golden.order) expect(quatDistance(out.get(n)!, golden.expected[n]!)).toBeLessThan(1e-6)
    const h = heads(out)
    for (const n of golden.order) expect(dist(h.get(n)!, golden.expectedHeads[n]!)).toBeLessThan(1e-6)
  })

  it('sem ligações, nada muda', () => {
    const out = run(frame, [])
    for (const n of golden.order) expect(quatDistance(out.get(n)!, frame.get(n)!)).toBeLessThan(1e-12)
  })

  it('aplicar as correções osso a osso (como a prévia) dá o mesmo resultado', () => {
    const out = run(frame, golden.follow)
    const corr = worldCorrections(golden.order, parentOf, frame, out)
    const local = new Map<string, Quat>()
    for (const n of golden.order) {
      const p = parentOf(n)
      local.set(n, p ? quatMul([-frame.get(p)![0], -frame.get(p)![1], -frame.get(p)![2], frame.get(p)![3]], frame.get(n)!) : frame.get(n)!)
    }
    const now = new Map<string, Quat>()
    for (const n of golden.order) {
      const p = parentOf(n)
      let w = p ? quatMul(now.get(p)!, local.get(n)!) : local.get(n)!
      const x = corr.get(n)
      if (x) w = quatMul(x, w)
      now.set(n, w)
    }
    for (const n of golden.order) expect(quatDistance(now.get(n)!, golden.expected[n]!)).toBeLessThan(1e-6)
  })
})

describe('captura e conta', () => {
  it('capturar e aplicar no mesmo quadro não muda nada (no alcance)', () => {
    const link = captureFollow('RightHand', 'LeftHand', rest, frame, heads(frame))
    const out = run(frame, [link])
    for (const n of golden.order) expect(quatDistance(out.get(n)!, frame.get(n)!)).toBeLessThan(1e-9)
  })

  it('em outro quadro a junta segue o alvo: mesma distância e mesmo giro relativo', () => {
    const link = captureFollow('RightHand', 'Spine2', rest, frame, heads(frame))
    const before = heads(frame)
    const gap = dist(before.get('RightHand')!, before.get('Spine2')!)
    // o tronco gira 12° (o alvo leva a mão junto)
    const turn = quatFromAxisAngle([0, 1, 0], 12)
    const moved = new Map(frame)
    for (const n of ['Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand']) moved.set(n, quatMul(turn, frame.get(n)!))
    // e o braço direito do mocap "solta" a mão
    moved.set('RightForeArm', quatMul(quatFromAxisAngle([1, 0, 0], 25), moved.get('RightForeArm')!))
    moved.set('RightHand', quatMul(quatFromAxisAngle([1, 0, 0], 25), moved.get('RightHand')!))
    const out = run(moved, [link])
    const h = heads(out)
    expect(dist(h.get('RightHand')!, h.get('Spine2')!)).toBeCloseTo(gap, 6)
    const T = quatMul(out.get('Spine2')!, [-rest.get('Spine2')![0], -rest.get('Spine2')![1], -rest.get('Spine2')![2], rest.get('Spine2')![3]])
    expect(quatDistance(out.get('RightHand')!, quatMul(quatMul(T, link.rotation), rest.get('RightHand')!))).toBeLessThan(1e-9)
    // comprimentos da cadeia iguais aos do repouso
    expect(dist(h.get('RightForeArm')!, h.get('RightArm')!)).toBeCloseTo(dist(restHeads.get('RightForeArm')!, restHeads.get('RightArm')!), 9)
    expect(dist(h.get('RightHand')!, h.get('RightForeArm')!)).toBeCloseTo(dist(restHeads.get('RightHand')!, restHeads.get('RightForeArm')!), 9)
  })

  it('fora do alcance a cadeia estica na direção do alvo', () => {
    const link: FollowLink = { bone: 'LeftFoot', target: 'Head', offset: [0, 1, 0], rotation: [0, 0, 0, 1] }
    const out = run(frame, [link])
    const h = heads(out)
    const T = quatMul(out.get('Head')!, [-rest.get('Head')![0], -rest.get('Head')![1], -rest.get('Head')![2], rest.get('Head')![3]])
    const off = rotateVec(T, link.offset)
    const goal: Vec3 = [h.get('Head')![0] + off[0], h.get('Head')![1] + off[1], h.get('Head')![2] + off[2]]
    const s = h.get('LeftUpLeg')!
    const reach = dist(restHeads.get('LeftLeg')!, restHeads.get('LeftUpLeg')!) + dist(restHeads.get('LeftFoot')!, restHeads.get('LeftLeg')!)
    expect(dist(h.get('LeftFoot')!, s)).toBeCloseTo(reach, 5)
    // o pé fica na reta do quadril ao alvo
    const u = (v: Vec3): Vec3 => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l] }
    const a = u([h.get('LeftFoot')![0] - s[0], h.get('LeftFoot')![1] - s[1], h.get('LeftFoot')![2] - s[2]])
    const b = u([goal[0] - s[0], goal[1] - s[1], goal[2] - s[2]])
    expect(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]).toBeGreaterThan(1 - 1e-9)
  })

  it('ligação encadeada: a mão esquerda segue a direita já movida', () => {
    const toChest = captureFollow('RightHand', 'Spine2', rest, frame, heads(frame))
    const leftToRight = captureFollow('LeftHand', 'RightHand', rest, frame, heads(frame))
    const gap = dist(heads(frame).get('LeftHand')!, heads(frame).get('RightHand')!)
    const moved = new Map(frame)
    const turn = quatFromAxisAngle([0, 0, 1], 10)
    for (const n of ['Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand']) moved.set(n, quatMul(turn, frame.get(n)!))
    const h = heads(run(moved, [toChest, leftToRight]))
    expect(dist(h.get('LeftHand')!, h.get('RightHand')!)).toBeCloseTo(gap, 6)
  })

  it('alvo na própria cadeia é recusado (e ignorado na conta)', () => {
    expect(followProblem('RightHand', 'RightForeArm')).toBe('chain')
    expect(followProblem('RightHand', 'RightArm')).toBe('chain')
    expect(followProblem('RightHand', 'RightHand')).toBe('chain')
    expect(followProblem('LeftFoot', 'LeftUpLeg')).toBe('chain')
    expect(followProblem('Head', 'LeftHand')).toBe('bone')
    expect(followProblem('RightHand', 'Sword')).toBe('target')
    expect(followProblem('RightHand', 'RightShoulder')).toBeNull()
    const out = run(frame, [{ bone: 'RightHand', target: 'RightArm', offset: [0, 0, 0], rotation: [0, 0, 0, 1] }])
    for (const n of golden.order) expect(quatDistance(out.get(n)!, frame.get(n)!)).toBeLessThan(1e-12)
  })

  it('uma junta segue no máximo um alvo', () => {
    const a: FollowLink = { bone: 'RightHand', target: 'LeftHand', offset: [0, 0, 0], rotation: [0, 0, 0, 1] }
    const b: FollowLink = { bone: 'LeftFoot', target: 'Hips', offset: [0, 0, 0], rotation: [0, 0, 0, 1] }
    const c: FollowLink = { bone: 'RightHand', target: 'Head', offset: [0, 0, 0], rotation: [0, 0, 0, 1] }
    expect(withFollow([a, b], c).map((l) => l.target)).toEqual(['Hips', 'Head'])
  })

  it('polo de reserva igual ao Vector.orthogonal() do Blender', () => {
    // GLB (1, 0, 0) → Blender (1, 0, 0) → orthogonal (0, 1, 1) → GLB (0, 1, −1)
    expect(blenderOrthogonal([1, 0, 0])).toEqual([0, 1, -1])
    // GLB (0, 2, 0) → Blender (0, 0, 2) → (2, 2, 0) → GLB (2, 0, −2)
    expect(blenderOrthogonal([0, 2, 0])).toEqual([2, 0, -2])
  })
})

describe('config e JSON do skin', () => {
  const text = `{
 "skinned": {
  "clips": {
   "pistolShooting": { "file": "pistol/shoot.fbx", "loop": false, "pose": { "LeftArm": [0, 0, 0.258819, 0.965926] }, "follow": [ { "bone": "RightHand", "target": "LeftHand", "offset": [0.01, 0.02, 0.03], "rotation": [0, 0, 0, 1] }, { "bone": "RightHand", "target": "RightArm", "offset": [0, 0, 0], "rotation": [0, 0, 0, 1] } ], "armSpace": 5 },
   "idle": { "file": "idle.fbx", "loop": true }
  }
 },
 "budget": { "maxTriangles": 6000 }
}
`
  const cfg = parseConfigObject(text)

  it('lê as ligações (inválidas saem)', () => {
    const f = followsFromConfig(cfg)
    expect(f.get('pistolShooting')!.map((l) => `${l.bone}->${l.target}`)).toEqual(['RightHand->LeftHand'])
    expect(f.get('idle')).toEqual([])
    expect(followsFromSkin({ clips: { idle: { follow: [{ bone: 'LeftFoot', target: 'Hips', offset: [0, 0, 0], rotation: [0, 0, 0, 1] }] }, walk: {} } }).get('idle')!.length).toBe(1)
    expect(followsFromSkin(null).size).toBe(0)
  })

  it('grava: campo na posição, novo no fim, 6 casas, vazia remove, resto igual', () => {
    const link: FollowLink = { bone: 'LeftHand', target: 'Spine2', offset: [0.123456789, -0, 1], rotation: quatFromAxisAngle([1, 2, 3], 33) }
    const next = applyFollows(cfg, new Map([['pistolShooting', [link]], ['idle', [link]], ['ghost', [link]]]))
    const clips = (next['skinned'] as Record<string, Record<string, Record<string, unknown>>>)['clips']!
    expect(Object.keys(clips['pistolShooting']!)).toEqual(['file', 'loop', 'pose', 'follow', 'armSpace'])
    expect(Object.keys(clips['idle']!)).toEqual(['file', 'loop', 'follow'])
    expect((clips['idle']!['follow'] as Array<Record<string, number[]>>)[0]!['offset']).toEqual([0.123457, 0, 1])
    expect('ghost' in clips).toBe(false)
    expect(next['budget']).toEqual({ maxTriangles: 6000 })
    const back = followsFromConfig(parseConfigObject(serializeConfig(next)))
    expect(sameFollows(back.get('idle')!, [link])).toBe(true)
    const cleared = applyFollows(next, new Map([['idle', []]]))
    expect(Object.keys((cleared['skinned'] as Record<string, Record<string, Record<string, unknown>>>)['clips']!['idle']!)).toEqual(['file', 'loop'])
  })
})
