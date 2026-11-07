/**
 * Retarget dos clipes do player para o esqueleto do NPC na prévia do Studio (SPEC-0708, ADR-0707): a mesma conta do
 * jogo (Port Hollow, SPEC-0196 §3) — em cada quadro, a rotação de mundo do osso do NPC = a do player × (repouso de
 * mundo do player⁻¹ × repouso de mundo do NPC); a local sai da de mundo do pai; o quadril escala pela altura de
 * repouso dele. Os dois esqueletos têm os mesmos nomes de osso (Mixamo).
 */
import * as THREE from 'three'

const HIPS = 'Hips'
const QUAT = 4
const VEC3 = 3
const Y = 1

/** Ossos de um esqueleto por nome, com o pai (dentro do esqueleto) e o repouso local e de mundo. */
export interface RetargetRig {
  names: string[]
  parent: Map<string, string | null>
  restLocal: Map<string, THREE.Quaternion>
  restWorld: Map<string, THREE.Quaternion>
  hipsRest: THREE.Vector3 | null
}

/** O esqueleto de `root` (os ossos com nome em `names`, ou todos os `Bone`) no repouso atual. */
export function retargetRig(root: THREE.Object3D, names?: readonly string[]): RetargetRig {
  const bones = new Map<string, THREE.Object3D>()
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone && (!names || names.includes(o.name))) bones.set(o.name, o)
  })
  const ordered: string[] = []
  const visit = (o: THREE.Object3D): void => {
    if (bones.has(o.name) && !ordered.includes(o.name)) ordered.push(o.name)
    o.children.forEach(visit)
  }
  visit(root)
  const parent = new Map<string, string | null>()
  const restLocal = new Map<string, THREE.Quaternion>()
  const restWorld = new Map<string, THREE.Quaternion>()
  for (const n of ordered) {
    const b = bones.get(n)!
    let p = b.parent
    while (p && !bones.has(p.name)) p = p.parent
    const pn = p ? p.name : null
    parent.set(n, pn)
    restLocal.set(n, b.quaternion.clone())
    restWorld.set(n, pn ? restWorld.get(pn)!.clone().multiply(b.quaternion) : b.quaternion.clone())
  }
  const hips = bones.get(HIPS)
  return { names: ordered, parent, restLocal, restWorld, hipsRest: hips ? hips.position.clone() : null }
}

/** O clipe do player (`from`) no esqueleto do NPC (`to`), com o mesmo nome e os tempos da 1ª trilha de rotação. */
export function retargetAnimation(clip: THREE.AnimationClip, from: RetargetRig, to: RetargetRig): THREE.AnimationClip {
  const tracks = new Map(clip.tracks.map((t) => [t.name, t]))
  const first = clip.tracks.find((t) => t.name.endsWith('.quaternion'))
  if (!first) return clip
  const times = Array.from(first.times)
  const sample = new Map(from.names.map((n) => [n, tracks.get(`${n}.quaternion`)?.InterpolantFactoryMethodLinear()]))
  const offset = new Map(to.names.filter((n) => from.restWorld.has(n)).map((n) => [n, from.restWorld.get(n)!.clone().invert().multiply(to.restWorld.get(n)!)]))
  const out = new Map(to.names.map((n) => [n, new Float32Array(times.length * QUAT)]))
  const q = new THREE.Quaternion()
  times.forEach((time, f) => {
    const worldFrom = new Map<string, THREE.Quaternion>()
    for (const n of from.names) {
      const at = sample.get(n)
      if (at) q.fromArray(at.evaluate(time))
      else q.copy(from.restLocal.get(n)!)
      const p = from.parent.get(n)
      worldFrom.set(n, p ? worldFrom.get(p)!.clone().multiply(q) : q.clone())
    }
    const worldTo = new Map<string, THREE.Quaternion>()
    for (const n of to.names) {
      const o = offset.get(n)
      const w = o ? worldFrom.get(n)!.clone().multiply(o) : to.restWorld.get(n)!.clone()
      worldTo.set(n, w)
      const p = to.parent.get(n)
      const local = p ? worldTo.get(p)!.clone().invert().multiply(w) : w
      local.toArray(out.get(n)!, f * QUAT)
    }
  })
  const result: THREE.KeyframeTrack[] = to.names.map((n) => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, times, Array.from(out.get(n)!)))
  const pos = tracks.get(`${HIPS}.position`)
  if (pos && from.hipsRest && to.hipsRest) {
    const scale = to.hipsRest.getComponent(Y) / from.hipsRest.getComponent(Y)
    const values = Array.from(pos.values).map((v, i) => to.hipsRest!.getComponent(i % VEC3) + (v - from.hipsRest!.getComponent(i % VEC3)) * scale)
    result.push(new THREE.VectorKeyframeTrack(`${HIPS}.position`, Array.from(pos.times), values))
  }
  return new THREE.AnimationClip(clip.name, clip.duration, result)
}
