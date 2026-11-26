/**
 * Layout "animação no fim" (SPEC-0745): o GLB do Blender com o skin depois das animações grava, com os
 * índices renumerados e os bytes de cada bufferView fora de animação iguais; o que já está no fim fica byte a
 * byte; extensão que cita bufferView é recusada. Usa um GLB sintético e, quando existe, o LUC-01 do Port Hollow.
 */
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { buildGlb, parseGlb, readAnimations, replaceAnimations, type BakedClip } from '../../electron/renderer/glbAnimations.js'
import { normalizeLayout } from '../../electron/renderer/glbLayout.js'

const LUC_PATH = 'F:/dev-jogos/port-hollow/assets/personagens/player/LUC-01-skinned.glb'
const HAS_LUC = existsSync(LUC_PATH)
const MAT4_FLOATS = 16
const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47]

type Json = Record<string, any>

/** Malha, tempos, rotação, IBM e imagem; a ordem dos bytes e dos acessores é a do Blender (skin no fim). */
function blenderGlb(extensionsUsed?: string[]): Uint8Array {
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
  const times = new Float32Array([0, 1])
  const rot = new Float32Array([0, 0, 0, 1, 0, 0, Math.SQRT1_2, Math.SQRT1_2])
  const ibm = new Float32Array(MAT4_FLOATS).map((_, i) => (i % 5 === 0 ? 1 : 0))
  const img = new Uint8Array(PNG_BYTES)
  const parts = [pos, times, rot, ibm, img].map((p) => new Uint8Array(p.buffer, p.byteOffset, p.byteLength))
  const size = parts.reduce((n, p) => n + Math.ceil(p.byteLength / 4) * 4, 0)
  const bin = new Uint8Array(size)
  const views: Json[] = []
  let at = 0
  for (const p of parts) {
    bin.set(p, at)
    views.push({ buffer: 0, byteLength: p.byteLength, byteOffset: at })
    at += Math.ceil(p.byteLength / 4) * 4
  }
  const json: Json = {
    asset: { version: '2.0', generator: 'Khronos glTF Blender I/O' },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [{ name: 'Bone' }, { name: 'Body', mesh: 0, skin: 0 }],
    meshes: [{ name: 'Tri', primitives: [{ attributes: { POSITION: 0 } }] }],
    skins: [{ joints: [0], inverseBindMatrices: 3 }],
    images: [{ bufferView: 4, mimeType: 'image/png' }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, max: [1, 1, 0], min: [0, 0, 0], type: 'VEC3' },
      { bufferView: 1, componentType: 5126, count: 2, max: [1], min: [0], type: 'SCALAR' },
      { bufferView: 2, componentType: 5126, count: 2, type: 'VEC4' },
      { bufferView: 3, componentType: 5126, count: 1, type: 'MAT4' },
    ],
    bufferViews: views,
    animations: [{ name: 'idle', channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }], samplers: [{ input: 1, interpolation: 'LINEAR', output: 2 }] }],
    buffers: [{ byteLength: bin.byteLength }],
  }
  if (extensionsUsed) json.extensionsUsed = extensionsUsed
  return buildGlb(json, bin)
}

/** Bytes de um bufferView. */
function viewBytes(json: Json, bin: Uint8Array, view: number): number[] {
  const v = json.bufferViews[view]
  return [...bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength)]
}

const spin: BakedClip = {
  name: 'pistolIdle@ARM-04',
  channels: [{ node: 'Bone', path: 'rotation', interpolation: 'LINEAR', times: new Float32Array([0, 1]), values: new Float32Array([0, 0, 0, 1, 0, 1, 0, 0]) }],
}

describe('normalizeLayout (SPEC-0745)', () => {
  it('põe o skin e a imagem antes das animações, renumerando os índices', () => {
    const { json, bin } = parseGlb(blenderGlb())
    const out = normalizeLayout(json, bin)
    expect(out.json.skins[0].inverseBindMatrices).toBe(1)
    expect(out.json.meshes[0].primitives[0].attributes.POSITION).toBe(0)
    expect(out.json.animations[0].samplers[0]).toMatchObject({ input: 2, output: 3 })
    expect(out.json.images[0].bufferView).toBe(2)
    expect(viewBytes(out.json, out.bin, out.json.accessors[1].bufferView)).toEqual(viewBytes(json, bin, 3))
    expect(viewBytes(out.json, out.bin, 2)).toEqual(PNG_BYTES)
  })

  it('o que já está no fim volta igual (mesmo objeto)', () => {
    const first = parseGlb(replaceAnimations(blenderGlb(), []))
    const again = normalizeLayout(first.json, first.bin)
    expect(again.json).toBe(first.json)
    expect(again.bin).toBe(first.bin)
  })

  it('recusa reordenar com Draco', () => {
    expect(() => replaceAnimations(blenderGlb(['KHR_draco_mesh_compression']), [])).toThrow(/KHR_draco_mesh_compression/)
  })
})

describe('replaceAnimations com o skin no fim (SPEC-0745)', () => {
  it('grava o clipe novo e mantém o skin e as animações antigas', () => {
    const glb = blenderGlb()
    const out = replaceAnimations(glb, [spin])
    const { json, bin } = parseGlb(out)
    const before = parseGlb(glb)
    expect(readAnimations(out).map((c) => c.name)).toEqual(['idle', spin.name])
    expect(readAnimations(out)[0]).toEqual(readAnimations(glb)[0])
    const ibm = json.accessors[json.skins[0].inverseBindMatrices]
    expect(viewBytes(json, bin, ibm.bufferView)).toEqual(viewBytes(before.json, before.bin, 3))
  })

  it('regravar o resultado sem clipe é byte a byte', () => {
    const once = replaceAnimations(blenderGlb(), [spin])
    expect([...replaceAnimations(once, [])]).toEqual([...once])
  })

  it.runIf(HAS_LUC)('o LUC-01 do Port Hollow grava, com malha, skin e imagem iguais', () => {
    const glb = new Uint8Array(readFileSync(LUC_PATH))
    const before = parseGlb(glb)
    const out = replaceAnimations(glb, [{ ...spin, channels: [{ ...spin.channels[0]!, node: 'RightHand' }] }])
    const after = parseGlb(out)
    const names = readAnimations(out).map((c) => c.name)
    expect(names).toEqual([...readAnimations(glb).map((c) => c.name), spin.name])
    const ibmOf = (p: { json: Json; bin: Uint8Array }): number[] => viewBytes(p.json, p.bin, p.json.accessors[p.json.skins[0].inverseBindMatrices].bufferView)
    expect(ibmOf(after)).toEqual(ibmOf(before))
    const posOf = (p: { json: Json; bin: Uint8Array }): number[] => viewBytes(p.json, p.bin, p.json.accessors[p.json.meshes[0].primitives[0].attributes.POSITION].bufferView)
    expect(posOf(after)).toEqual(posOf(before))
    expect(viewBytes(after.json, after.bin, after.json.images[0].bufferView)).toEqual(viewBytes(before.json, before.bin, before.json.images[0].bufferView))
  }, 60_000)

  it.runIf(HAS_LUC)('o LUC-01 regravado carrega no GLTFLoader com o skin e o clipe novo', async () => {
    // Node não decodifica a imagem: os stubs fazem o GLTFLoader aceitar a textura embutida.
    vi.stubGlobal('createImageBitmap', async () => ({ width: 1, height: 1, close() {} }))
    vi.stubGlobal('self', globalThis)
    try {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      const glb = new Uint8Array(readFileSync(LUC_PATH))
      const out = replaceAnimations(glb, [{ ...spin, channels: [{ ...spin.channels[0]!, node: 'RightHand' }] }])
      const [a, b] = await Promise.all([glb, out].map((g) => new GLTFLoader().parseAsync(g.slice().buffer, '')))
      expect(b!.animations.at(-1)!.name).toBe(spin.name)
      const bonesOf = (g: typeof a): number[][] => {
        const mats: number[][] = []
        g!.scene.traverse((o: any) => o.isSkinnedMesh && mats.push(...o.skeleton.boneInverses.map((m: any) => [...m.elements])))
        return mats
      }
      expect(bonesOf(b).length).toBeGreaterThan(0)
      expect(bonesOf(b)).toEqual(bonesOf(a))
    } finally {
      vi.unstubAllGlobals()
    }
  }, 60_000)
})
