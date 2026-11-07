/**
 * Cirurgia do bloco de animação do GLB (SPEC-0704 / ADR-0705): prefixo do BIN e JSON fora de
 * animação intactos, troca e acréscimo de clipes, um tempo por sequência de chaves, recusas. Usa um
 * GLB sintético e, quando existe, o LUC-01 real do Port Hollow (recarregado no GLTFLoader).
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  animationNames,
  buildGlb,
  parseGlb,
  readAnimations,
  replaceAnimations,
  type BakedClip,
} from '../../electron/renderer/glbAnimations.js'

const LUC_PATH = 'D:/jogos/port-hollow/assets/personagens/player/LUC-01-skinned.glb'
const HAS_LUC = existsSync(LUC_PATH)
const LUC_ANIMATIONS = 35
const LUC_CHANNELS = 78
const FLOAT_BYTES = 4
const VERTS = 3
const VEC3 = 3

const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')

/** GLB mínimo: 1 nó "Bone", 1 acessor de malha (3 vértices) e 1 animação "idle" de rotação com 2 chaves. */
function syntheticGlb(opts: { interleaved?: boolean; shared?: boolean } = {}): Uint8Array {
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
  const times = new Float32Array([0, 1])
  const rot = new Float32Array([0, 0, 0, 1, 0, 0, Math.SQRT1_2, Math.SQRT1_2])
  const parts = opts.interleaved ? [times, rot, pos] : [pos, times, rot]
  const bin = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0))
  const views: object[] = []
  let at = 0
  for (const p of parts) {
    bin.set(new Uint8Array(p.buffer), at)
    views.push({ buffer: 0, byteLength: p.byteLength, byteOffset: at })
    at += p.byteLength
  }
  const [posView, timeView, rotView] = opts.interleaved ? [2, 0, 1] : [0, 1, 2]
  const json = {
    asset: { version: '2.0', generator: 'teste' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'Bone', mesh: 0 }],
    meshes: [{ name: 'Tri', primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [
      { bufferView: posView, componentType: 5126, count: VERTS, max: [1, 1, 0], min: [0, 0, 0], type: 'VEC3' },
      { bufferView: timeView, componentType: 5126, count: 2, max: [1], min: [0], type: 'SCALAR' },
      { bufferView: opts.shared ? posView : rotView, componentType: 5126, count: 2, type: 'VEC4' },
    ],
    bufferViews: views,
    animations: [
      {
        name: 'idle',
        channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }],
        samplers: [{ input: 1, interpolation: 'LINEAR', output: 2 }],
      },
    ],
    buffers: [{ byteLength: bin.byteLength }],
  }
  return buildGlb(json, bin)
}

const spin = (name: string, node = 'Bone', keys = [0, 0.5, 1]): BakedClip => ({
  name,
  channels: [
    {
      node,
      path: 'rotation',
      interpolation: 'LINEAR',
      times: new Float32Array(keys),
      values: new Float32Array(keys.flatMap((t) => [0, Math.sin(t / 2), 0, Math.cos(t / 2)])),
    },
  ],
})

/** JSON sem o que é de animação (animations, acessores/bufferViews a partir do corte, byteLength). */
function nonAnimationJson(glb: Uint8Array, accessors: number, views: number): unknown {
  const { json } = parseGlb(glb)
  const { animations: _a, buffers: _b, ...rest } = json
  return { ...rest, accessors: json.accessors.slice(0, accessors), bufferViews: json.bufferViews.slice(0, views) }
}

describe('glbAnimations — GLB sintético', () => {
  it('lê nomes e floats da animação', () => {
    const glb = syntheticGlb()
    expect(animationNames(glb)).toEqual(['idle'])
    const [idle] = readAnimations(glb)
    expect(idle.channels[0].node).toBe('Bone')
    expect([...idle.channels[0].times]).toEqual([0, 1])
  })

  it('sem clipes re-emite as animações iguais e o mesmo prefixo', () => {
    const glb = syntheticGlb()
    const out = replaceAnimations(glb, [])
    expect(readAnimations(out)).toEqual(readAnimations(glb))
    const prefix = VERTS * VEC3 * FLOAT_BYTES
    expect(sha(parseGlb(out).bin.subarray(0, prefix))).toBe(sha(parseGlb(glb).bin.subarray(0, prefix)))
  })

  it('substitui o clipe de mesmo nome e mantém o acessor da malha no índice 0', () => {
    const out = replaceAnimations(syntheticGlb(), [spin('idle')])
    const [idle] = readAnimations(out)
    expect(idle.channels[0].times).toEqual(new Float32Array([0, 0.5, 1]))
    expect(idle.channels[0].values).toEqual(spin('idle').channels[0].values)
    const { json } = parseGlb(out)
    expect(json.meshes[0].primitives[0].attributes.POSITION).toBe(0)
    expect(json.accessors[0].count).toBe(VERTS)
  })

  it('acrescenta clipe de nome novo no fim', () => {
    const out = replaceAnimations(syntheticGlb(), [spin('pistolIdle@ARM-02')])
    expect(animationNames(out)).toEqual(['idle', 'pistolIdle@ARM-02'])
  })

  it('cabeçalho, chunks e buffers[0].byteLength coerentes e alinhados a 4', () => {
    const out = replaceAnimations(syntheticGlb(), [spin('a', 'Bone', [0, 0.1, 0.2, 0.3, 0.4])])
    const view = new DataView(out.buffer)
    expect(view.getUint32(8, true)).toBe(out.byteLength)
    const jsonLen = view.getUint32(12, true)
    expect(jsonLen % FLOAT_BYTES).toBe(0)
    const binLen = view.getUint32(20 + jsonLen, true)
    expect(binLen % FLOAT_BYTES).toBe(0)
    expect(parseGlb(out).json.buffers[0].byteLength).toBe(binLen)
    for (const bv of parseGlb(out).json.bufferViews) expect(bv.byteOffset % FLOAT_BYTES).toBe(0)
  })

  it('recusa nó desconhecido', () => {
    expect(() => replaceAnimations(syntheticGlb(), [spin('idle', 'Nope')])).toThrow(/nó "Nope" não existe/)
  })

  it('recusa layout intercalado', () => {
    expect(() => replaceAnimations(syntheticGlb({ interleaved: true }), [])).toThrow(/intercalado/)
  })

  it('recusa bufferView compartilhado', () => {
    expect(() => replaceAnimations(syntheticGlb({ shared: true }), [])).toThrow(/compartilhado/)
  })

  it('recusa valores incoerentes com as chaves e nome repetido', () => {
    const bad = spin('idle')
    bad.channels[0].values = new Float32Array(VEC3)
    expect(() => replaceAnimations(syntheticGlb(), [bad])).toThrow(/valores para 3 chaves/)
    expect(() => replaceAnimations(syntheticGlb(), [spin('x'), spin('x')])).toThrow(/repetido/)
  })
})

describe.skipIf(!HAS_LUC)('glbAnimations — LUC-01 real', () => {
  const load = (): Uint8Array => new Uint8Array(readFileSync(LUC_PATH))

  /** Variante de arma a partir do pistolIdle, com a rotação de cada osso levemente alterada. */
  function variant(glb: Uint8Array): BakedClip {
    const base = readAnimations(glb).find((c) => c.name === 'pistolIdle')!
    return {
      name: 'pistolIdle@ARM-02',
      channels: base.channels.map((c) => ({
        ...c,
        values: c.path === 'rotation' ? c.values.map((v) => v * 0.5) : c.values.slice(),
      })),
    }
  }

  function changedIdle(glb: Uint8Array): BakedClip {
    const idle = readAnimations(glb).find((c) => c.name === 'idle')!
    return { name: 'idle', channels: idle.channels.map((c) => ({ ...c, values: c.values.map((v) => v + 1) })) }
  }

  it('preserva o prefixo do BIN e o JSON fora de animação', () => {
    const glb = load()
    const { json, bin } = parseGlb(glb)
    const out = replaceAnimations(glb, [changedIdle(glb), variant(glb)])
    const animViews = json.animations.flatMap((a: any) =>
      a.samplers.flatMap((s: any) => [json.accessors[s.input].bufferView, json.accessors[s.output].bufferView]),
    )
    const cutView = Math.min(...animViews)
    const cutAcc = Math.min(...json.animations.flatMap((a: any) => a.samplers.map((s: any) => s.input)))
    const cut = json.bufferViews[cutView].byteOffset
    expect(sha(parseGlb(out).bin.subarray(0, cut))).toBe(sha(bin.subarray(0, cut)))
    expect(nonAnimationJson(out, cutAcc, cutView)).toEqual(nonAnimationJson(glb, cutAcc, cutView))
  })

  it('troca o idle, mantém as outras e acrescenta a variante no fim', () => {
    const glb = load()
    const before = readAnimations(glb)
    const out = replaceAnimations(glb, [changedIdle(glb), variant(glb)])
    const after = readAnimations(out)
    expect(after).toHaveLength(LUC_ANIMATIONS + 1)
    expect(after.map((c) => c.name).slice(0, LUC_ANIMATIONS)).toEqual(before.map((c) => c.name))
    expect(after[LUC_ANIMATIONS].name).toBe('pistolIdle@ARM-02')
    expect(after[0].channels[1].values).toEqual(changedIdle(glb).channels[1].values)
    expect(after.slice(1, LUC_ANIMATIONS)).toEqual(before.slice(1))
  })

  it('um acessor de tempo por sequência de chaves no clipe, com min/max', () => {
    const glb = load()
    const { json } = parseGlb(replaceAnimations(glb, [variant(glb)]))
    for (const anim of json.animations) {
      const inputs = new Set<number>(anim.samplers.map((s: any) => s.input))
      const counts = new Set([...inputs].map((i) => json.accessors[i].count))
      expect(inputs.size).toBe(counts.size)
      for (const i of inputs) expect(json.accessors[i].min).toHaveLength(1)
    }
  })

  it('recarrega no GLTFLoader com 78 canais por clipe', async () => {
    // Node não decodifica JPEG: os stubs de createImageBitmap/self fazem o GLTFLoader aceitar a textura embutida.
    vi.stubGlobal('createImageBitmap', async () => ({ width: 1, height: 1, close() {} }))
    vi.stubGlobal('self', globalThis) // GLTFLoader usa self.URL para o blob da imagem
    try {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      const glb = load()
      const out = replaceAnimations(glb, [variant(glb)])
      const gltf = await new GLTFLoader().parseAsync(out.slice().buffer, '')
      expect(gltf.animations).toHaveLength(LUC_ANIMATIONS + 1)
      for (const clip of gltf.animations) expect(clip.tracks).toHaveLength(LUC_CHANNELS)
      expect(gltf.animations.at(-1)!.name).toBe('pistolIdle@ARM-02')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

/** O GLB sintético com o JSON mexido por `edit`. */
function tweaked(edit: (json: Record<string, any>) => void): Uint8Array {
  const { json, bin } = parseGlb(syntheticGlb())
  edit(json)
  return buildGlb(json, bin)
}

describe('glbAnimations — revisão (SPEC-0704)', () => {
  it('animação sem nome continua sem nome ao regravar', () => {
    const glb = tweaked((j) => delete j.animations[0].name)
    const out = replaceAnimations(glb, [spin('pistolIdle@ARM-02')])
    const anims = parseGlb(out).json.animations
    expect('name' in anims[0]).toBe(false)
    expect(anims[1].name).toBe('pistolIdle@ARM-02')
  })

  it('canal com extensions é recusado, não perdido', () => {
    const glb = tweaked((j) => (j.animations[0].channels[0].target.extensions = { KHR_animation_pointer: { pointer: '/x' } }))
    expect(() => replaceAnimations(glb, [spin('novo')])).toThrow(/extensions/)
  })

  it('casa o nó pelo nome que o three usa (sem "." e com "_" no espaço)', () => {
    const glb = tweaked((j) => (j.nodes[0].name = 'Bone.L ok'))
    const out = replaceAnimations(glb, [spin('novo', 'BoneL_ok')])
    expect(parseGlb(out).json.animations[1].channels[0].target.node).toBe(0)
    // ida e volta: o que a leitura devolve a escrita aceita
    const read = readAnimations(glb)
    expect(read[0]!.channels[0]!.node).toBe('BoneL_ok')
    expect(readAnimations(replaceAnimations(glb, read))).toEqual(read)
  })

  it('canal fora de rotation/translation/scale ou LINEAR/STEP e animação repetida no GLB são recusados', () => {
    const bad = (over: Record<string, string>): BakedClip => ({ name: 'novo', channels: [{ ...spin('novo').channels[0]!, ...over } as BakedClip['channels'][number]] })
    expect(() => replaceAnimations(syntheticGlb(), [bad({ path: 'weights' })])).toThrow(/weights/)
    expect(() => replaceAnimations(syntheticGlb(), [bad({ interpolation: 'CUBICSPLINE' })])).toThrow(/CUBICSPLINE/)
    const twice = tweaked((j) => j.animations.push(structuredClone(j.animations[0])))
    expect(() => replaceAnimations(twice, [spin('idle')])).toThrow(/mais de uma animação idle/)
    expect(() => replaceAnimations(twice, [spin('outro')])).not.toThrow()
  })

  it('nó com nome repetido depois de normalizar é recusado', () => {
    const glb = tweaked((j) => {
      j.nodes[0].name = 'Bone.L'
      j.nodes.push({ name: 'BoneL' })
      j.scenes[0].nodes.push(1)
    })
    expect(() => replaceAnimations(glb, [spin('novo', 'BoneL')])).toThrow(/mais de uma vez/)
  })
})
