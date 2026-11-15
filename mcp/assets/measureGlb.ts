/**
 * Mede o bounding box de um `.glb` em **Node puro** (sem Blender): parseia o
 * header GLB + chunk JSON, percorre a hierarquia de nós acumulando as matrizes
 * de transformação e agrega os `min`/`max` dos accessors POSITION de cada
 * primitiva. É o fast-path de medição do Chat IA (tool `measure_glb`): quando
 * a IA só precisa das DIMENSÕES de um asset (regra de proporção em metros),
 * não paga o custo do `inspect_assets` (Blender headless + render).
 *
 * Limitação conhecida: mesh **skinned** reporta o bbox da bind pose — os
 * accessors não refletem a pose animada (o "SkinnedMesh mente no bbox"). O
 * resultado marca `hasSkinnedMesh` pra tool avisar o modelo.
 *
 * Eixos: glTF Y-up (x = largura, y = altura, z = profundidade), unidades do
 * engine (metros).
 */

/** Vetor 3 nomeado nos eixos glTF Y-up. */
export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface GlbMeasure {
  /** Dimensões do bounding box (max − min). */
  size: Vec3
  /** Canto mínimo em world-space da cena default. */
  min: Vec3
  /** Canto máximo em world-space da cena default. */
  max: Vec3
  /** Quantidade de nós com mesh medidos. */
  meshNodeCount: number
  /** True se algum nó medido tem `skin` — bbox é da bind pose (pode "mentir"). */
  hasSkinnedMesh: boolean
}

/** Subconjunto do JSON glTF que a medição usa. */
interface GltfJson {
  scene?: number
  scenes?: Array<{ nodes?: number[] }>
  nodes?: GltfNode[]
  meshes?: Array<{ primitives?: Array<{ attributes?: { POSITION?: number } }> }>
  accessors?: Array<{ min?: number[]; max?: number[] }>
}

interface GltfNode {
  mesh?: number
  skin?: number
  children?: number[]
  matrix?: number[]
  translation?: number[]
  rotation?: number[]
  scale?: number[]
}

type Mat4 = number[]

const GLB_MAGIC = 0x46546c67 // 'glTF'
const CHUNK_JSON = 0x4e4f534a // 'JSON'

function mat4Identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
}

/** Multiplica matrizes 4×4 column-major (convenção glTF): out = a·b. */
function mat4Mul(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0)
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) out[c * 4 + r]! += a[k * 4 + r]! * b[c * 4 + k]!
  return out
}

/** Matriz local do nó: `matrix` explícita ou composta de TRS (ordem glTF T·R·S). */
function nodeMatrix(n: GltfNode): Mat4 {
  if (n.matrix) return n.matrix
  const [tx, ty, tz] = n.translation ?? [0, 0, 0]
  const [qx, qy, qz, qw] = n.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = n.scale ?? [1, 1, 1]
  const x2 = qx! + qx!,
    y2 = qy! + qy!,
    z2 = qz! + qz!
  const xx = qx! * x2,
    xy = qx! * y2,
    xz = qx! * z2,
    yy = qy! * y2,
    yz = qy! * z2,
    zz = qz! * z2
  const wx = qw! * x2,
    wy = qw! * y2,
    wz = qw! * z2
  return [
    (1 - (yy + zz)) * sx!,
    (xy + wz) * sx!,
    (xz - wy) * sx!,
    0,
    (xy - wz) * sy!,
    (1 - (xx + zz)) * sy!,
    (yz + wx) * sy!,
    0,
    (xz + wy) * sz!,
    (yz - wx) * sz!,
    (1 - (xx + yy)) * sz!,
    0,
    tx!,
    ty!,
    tz!,
    1,
  ]
}

function applyMat(m: Mat4, x: number, y: number, z: number): [number, number, number] {
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
  ]
}

/** Extrai e parseia o chunk JSON de um buffer GLB. Lança em formato inválido. */
export function parseGlbJson(buf: Buffer): GltfJson {
  if (buf.length < 20) throw new Error('arquivo muito curto para ser um .glb')
  if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error('não é um .glb (magic "glTF" ausente)')
  const version = buf.readUInt32LE(4)
  if (version !== 2) throw new Error(`versão glTF ${version} não suportada (só 2)`)
  const jsonLen = buf.readUInt32LE(12)
  if (buf.readUInt32LE(16) !== CHUNK_JSON) throw new Error('primeiro chunk não é JSON')
  if (20 + jsonLen > buf.length) throw new Error('chunk JSON maior que o arquivo (truncado?)')
  return JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8')) as GltfJson
}

/**
 * Mede o bounding box world-space da cena default de um `.glb`.
 * Lança `Error` com mensagem legível se o arquivo for inválido ou não tiver
 * geometria mensurável (nenhum accessor POSITION com min/max).
 */
export function measureGlb(buf: Buffer): GlbMeasure {
  const gltf = parseGlbJson(buf)
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  let meshNodeCount = 0
  let hasSkinnedMesh = false

  const walk = (idx: number, parent: Mat4): void => {
    const n = gltf.nodes?.[idx]
    if (!n) return
    const m = mat4Mul(parent, nodeMatrix(n))
    if (n.mesh !== undefined) {
      let measured = false
      for (const prim of gltf.meshes?.[n.mesh]?.primitives ?? []) {
        const posIdx = prim.attributes?.POSITION
        if (posIdx === undefined) continue
        const acc = gltf.accessors?.[posIdx]
        if (!acc?.min || !acc?.max) continue
        measured = true
        // 8 cantos da bbox do accessor transformados pro espaço da cena
        for (const cx of [acc.min[0]!, acc.max[0]!])
          for (const cy of [acc.min[1]!, acc.max[1]!])
            for (const cz of [acc.min[2]!, acc.max[2]!]) {
              const p = applyMat(m, cx, cy, cz)
              for (let i = 0; i < 3; i++) {
                min[i] = Math.min(min[i]!, p[i]!)
                max[i] = Math.max(max[i]!, p[i]!)
              }
            }
      }
      if (measured) {
        meshNodeCount++
        if (n.skin !== undefined) hasSkinnedMesh = true
      }
    }
    for (const c of n.children ?? []) walk(c, m)
  }

  const scene = gltf.scenes?.[gltf.scene ?? 0]
  for (const root of scene?.nodes ?? []) walk(root, mat4Identity())

  if (!Number.isFinite(min[0]!)) {
    throw new Error('sem geometria mensurável (nenhum accessor POSITION com min/max na cena)')
  }
  const v = (a: number[]): Vec3 => ({ x: a[0]!, y: a[1]!, z: a[2]! })
  return {
    size: v(max.map((m2, i) => m2 - min[i]!)),
    min: v(min),
    max: v(max),
    meshNodeCount,
    hasSkinnedMesh,
  }
}
