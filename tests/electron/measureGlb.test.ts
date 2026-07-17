/**
 * Testes do parser de medição de .glb em Node puro (tool `measure_glb`):
 * header GLB, hierarquia de nós (TRS, matrix, aninhamento), agregação dos
 * min/max dos accessors POSITION, flag de skinned mesh (bbox de bind pose)
 * e erros legíveis pra binário inválido / cena sem geometria.
 */
import { describe, it, expect } from 'vitest'
import { measureGlb, parseGlbJson } from '../../electron/agent/assets/measureGlb.js'

/** Monta um buffer GLB válido (header + chunk JSON) a partir do JSON glTF. */
function glb(json: object): Buffer {
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8')
  const pad = (4 - (jsonBuf.length % 4)) % 4
  const padded = Buffer.concat([jsonBuf, Buffer.alloc(pad, 0x20)])
  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0) // 'glTF'
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + 8 + padded.length, 8)
  const chunk = Buffer.alloc(8)
  chunk.writeUInt32LE(padded.length, 0)
  chunk.writeUInt32LE(0x4e4f534a, 4) // 'JSON'
  return Buffer.concat([header, chunk, padded])
}

/** glTF mínimo: um mesh cujo POSITION tem o min/max dado, montável em N nós. */
function gltfWithBox(
  min: number[],
  max: number[],
  nodes: object[],
  rootIndices: number[] = [0],
): object {
  return {
    scene: 0,
    scenes: [{ nodes: rootIndices }],
    nodes,
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ min, max }],
  }
}

const UNIT_MIN = [-0.5, -0.5, -0.5]
const UNIT_MAX = [0.5, 0.5, 0.5]

describe('parseGlbJson', () => {
  it('rejeita magic errado, versão != 2 e chunk truncado', () => {
    expect(() => parseGlbJson(Buffer.from('nao é glb, só texto longo'))).toThrow(/magic/)

    const wrongVersion = glb({})
    wrongVersion.writeUInt32LE(1, 4)
    expect(() => parseGlbJson(wrongVersion)).toThrow(/versão/)

    const truncated = glb(gltfWithBox(UNIT_MIN, UNIT_MAX, [{ mesh: 0 }]))
    expect(() => parseGlbJson(truncated.subarray(0, 24))).toThrow(/truncado/)
  })
})

describe('measureGlb', () => {
  it('mede um cubo unitário num nó sem transform', () => {
    const m = measureGlb(glb(gltfWithBox(UNIT_MIN, UNIT_MAX, [{ mesh: 0 }])))
    expect(m.size).toEqual({ x: 1, y: 1, z: 1 })
    expect(m.min).toEqual({ x: -0.5, y: -0.5, z: -0.5 })
    expect(m.max).toEqual({ x: 0.5, y: 0.5, z: 0.5 })
    expect(m.meshNodeCount).toBe(1)
    expect(m.hasSkinnedMesh).toBe(false)
  })

  it('aplica translation e scale do nó', () => {
    const m = measureGlb(
      glb(gltfWithBox(UNIT_MIN, UNIT_MAX, [{ mesh: 0, translation: [10, 0, 0], scale: [2, 1, 1] }])),
    )
    expect(m.size.x).toBeCloseTo(2)
    expect(m.min.x).toBeCloseTo(9)
    expect(m.max.x).toBeCloseTo(11)
  })

  it('aplica rotation (90° em Y troca largura por profundidade)', () => {
    const s = Math.SQRT1_2 // sin/cos de 45° → quaternion de 90° em Y
    const m = measureGlb(
      glb(gltfWithBox([-1, -0.5, -2], [1, 0.5, 2], [{ mesh: 0, rotation: [0, s, 0, s] }])),
    )
    expect(m.size.x).toBeCloseTo(4)
    expect(m.size.y).toBeCloseTo(1)
    expect(m.size.z).toBeCloseTo(2)
  })

  it('acumula transforms de pai pra filho na hierarquia', () => {
    const m = measureGlb(
      glb(
        gltfWithBox(UNIT_MIN, UNIT_MAX, [
          { children: [1], translation: [0, 10, 0], scale: [2, 2, 2] },
          { mesh: 0, translation: [0, 1, 0] },
        ]),
      ),
    )
    // filho: cubo em y=1 local → pai escala ×2 e sobe 10 → centro em y=12
    expect(m.min.y).toBeCloseTo(11)
    expect(m.max.y).toBeCloseTo(13)
    expect(m.size.x).toBeCloseTo(2)
  })

  it('respeita `matrix` explícita no nó', () => {
    // Matriz column-major: escala 3 em X + translação (5, 0, 0)
    const matrix = [3, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1]
    const m = measureGlb(glb(gltfWithBox(UNIT_MIN, UNIT_MAX, [{ mesh: 0, matrix }])))
    expect(m.size.x).toBeCloseTo(3)
    expect(m.min.x).toBeCloseTo(3.5)
    expect(m.max.x).toBeCloseTo(6.5)
  })

  it('une bboxes de múltiplos nós com mesh e conta meshNodeCount', () => {
    const m = measureGlb(
      glb(
        gltfWithBox(
          UNIT_MIN,
          UNIT_MAX,
          [{ mesh: 0 }, { mesh: 0, translation: [4, 0, 0] }],
          [0, 1],
        ),
      ),
    )
    expect(m.meshNodeCount).toBe(2)
    expect(m.min.x).toBeCloseTo(-0.5)
    expect(m.max.x).toBeCloseTo(4.5)
  })

  it('marca hasSkinnedMesh quando o nó tem skin (bbox = bind pose)', () => {
    const json = {
      ...gltfWithBox(UNIT_MIN, UNIT_MAX, [{ mesh: 0, skin: 0 }]),
      skins: [{ joints: [0] }],
    }
    expect(measureGlb(glb(json)).hasSkinnedMesh).toBe(true)
  })

  it('ignora nós sem mesh e primitivas sem min/max no accessor', () => {
    const json = {
      scene: 0,
      scenes: [{ nodes: [0, 1] }],
      nodes: [{}, { mesh: 0 }],
      meshes: [
        {
          primitives: [
            { attributes: { POSITION: 0 } },
            { attributes: { POSITION: 1 } }, // accessor sem min/max — pulado
          ],
        },
      ],
      accessors: [{ min: UNIT_MIN, max: UNIT_MAX }, {}],
    }
    const m = measureGlb(glb(json))
    expect(m.size).toEqual({ x: 1, y: 1, z: 1 })
    expect(m.meshNodeCount).toBe(1)
  })

  it('lança erro legível quando a cena não tem geometria mensurável', () => {
    const json = { scene: 0, scenes: [{ nodes: [0] }], nodes: [{}] }
    expect(() => measureGlb(glb(json))).toThrow(/sem geometria mensurável/)
  })
})
