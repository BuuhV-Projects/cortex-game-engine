import * as THREE from 'three'

/**
 * Medida das mãos contra a arma (SPEC-0746): distância de um ponto até a malha (triângulos em mundo) e se o ponto está
 * dentro dela (paridade dos cruzamentos de um raio). Sem DOM: a malha chega como lista de triângulos.
 */

/** Floats por triângulo (3 vértices × xyz). */
export const TRI_FLOATS = 9
/** Direção do raio de dentro/fora: torta de propósito, para não passar por aresta ou vértice alinhado. */
const RAY_DIR = new THREE.Vector3(0.5773, 0.5774, 0.5775).normalize()
/** Centímetros por metro. */
const CM_PER_M = 100
const CM_DECIMALS = 2

/** O que a medida devolve por ponto. */
export interface PointMeasure {
  name: string
  distCm: number
  inside: boolean
}

/** Uma mão: cada ponto e o mais perto da arma (um dentro conta como 0). */
export interface HandMeasure {
  points: PointMeasure[]
  closest: PointMeasure | null
}

const tri = new THREE.Triangle()
const a = new THREE.Vector3()
const b = new THREE.Vector3()
const c = new THREE.Vector3()
const closest = new THREE.Vector3()
const hit = new THREE.Vector3()

function loadTri(tris: Float32Array, i: number): void {
  const o = i * TRI_FLOATS
  a.set(tris[o]!, tris[o + 1]!, tris[o + 2]!)
  b.set(tris[o + 3]!, tris[o + 4]!, tris[o + 5]!)
  c.set(tris[o + 6]!, tris[o + 7]!, tris[o + 8]!)
}

/** Menor distância (m) de `p` até os triângulos; sem triângulos, `Infinity`. */
export function distanceToMesh(p: THREE.Vector3, tris: Float32Array): number {
  let best = Infinity
  const count = tris.length / TRI_FLOATS
  for (let i = 0; i < count; i++) {
    loadTri(tris, i)
    tri.set(a, b, c).closestPointToPoint(p, closest)
    best = Math.min(best, closest.distanceTo(p))
  }
  return best
}

/** `p` está dentro da malha fechada: o raio cruza um número ímpar de triângulos. */
export function insideMesh(p: THREE.Vector3, tris: Float32Array): boolean {
  const ray = new THREE.Ray(p, RAY_DIR)
  let crossings = 0
  const count = tris.length / TRI_FLOATS
  for (let i = 0; i < count; i++) {
    loadTri(tris, i)
    if (ray.intersectTriangle(a, b, c, false, hit)) crossings++
  }
  return crossings % 2 === 1
}

/** Mede cada ponto nomeado contra a malha. */
export function measureHand(points: ReadonlyArray<{ name: string; pos: THREE.Vector3 }>, tris: Float32Array): HandMeasure {
  const f = 10 ** CM_DECIMALS
  const out = points.map(({ name, pos }) => ({
    name,
    distCm: Math.round(distanceToMesh(pos, tris) * CM_PER_M * f) / f,
    inside: insideMesh(pos, tris),
  }))
  const score = (m: PointMeasure): number => (m.inside ? -1 : m.distCm)
  const closestPoint = out.reduce<PointMeasure | null>((best, m) => (!best || score(m) < score(best) ? m : best), null)
  return { points: out, closest: closestPoint }
}

/** Triângulos em mundo das malhas sob `root` (com índice ou sem). */
export function worldTriangles(root: THREE.Object3D): Float32Array {
  const out: number[] = []
  const v = new THREE.Vector3()
  root.updateWorldMatrix(true, true)
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    const pos = mesh.isMesh ? mesh.geometry?.getAttribute('position') : undefined
    if (!pos) return
    const index = mesh.geometry.getIndex()
    const n = index ? index.count : pos.count
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld)
      out.push(v.x, v.y, v.z)
    }
  })
  return new Float32Array(out)
}
