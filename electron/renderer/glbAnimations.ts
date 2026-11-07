/**
 * Cirurgia do bloco de animação de um GLB (ADR-0705, SPEC-0704).
 *
 * Mantém o JSON e o BIN de tudo que não é animação (malha, imagem, skin) byte a byte e remonta só as
 * animações no fim do BIN. Puro: só Uint8Array/DataView/TextEncoder/TextDecoder.
 */

/** Uma faixa assada: tempos e valores de um canal de um nó (pelo nome). */
export interface BakedChannel {
  node: string
  path: 'rotation' | 'translation' | 'scale'
  interpolation: 'LINEAR' | 'STEP'
  times: Float32Array
  values: Float32Array
}

/** Um clipe assado: o nome da animação no GLB e as faixas dele. */
export interface BakedClip {
  name: string
  channels: BakedChannel[]
}

// glTF é JSON livre; tipamos só o que a cirurgia lê.
type Json = Record<string, any>

/** Canal interno: nó por índice, path/interpolação como vieram (inclui weights/CUBICSPLINE). */
interface RawChannel {
  node: number
  path: string
  interpolation: string
  times: Float32Array
  values: Float32Array
}

interface RawClip {
  /** Nome para casar com os clipes (o do arquivo, ou o padrão do three `animation_<i>` sem nome). */
  name: string
  /** A animação tinha `name` no arquivo (sem nome, continua sem nome ao regravar). */
  named: boolean
  /** Campos extras da animação original (extras/extensions), re-emitidos como estavam. */
  rest: Json
  channels: RawChannel[]
}

const GLB_MAGIC = 0x46546c67 // 'glTF'
const GLB_VERSION = 2
const CHUNK_JSON = 0x4e4f534a // 'JSON'
const CHUNK_BIN = 0x004e4942 // 'BIN\0'
const HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 8
const ALIGN = 4
const FLOAT_BYTES = 4
const COMPONENT_FLOAT = 5126
const JSON_PAD = 0x20
const CUBIC_FACTOR = 3 // CUBICSPLINE guarda tangente-entrada, valor, tangente-saída

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }
const PATH_TYPE: Record<string, string> = { rotation: 'VEC4', translation: 'VEC3', scale: 'VEC3' }

const align = (n: number): number => Math.ceil(n / ALIGN) * ALIGN

/** Separa um GLB em JSON (objeto) e BIN (vista sobre os bytes do buffer 0, sem o padding do chunk). */
export function parseGlb(glb: Uint8Array): { json: Json; bin: Uint8Array } {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
  if (glb.byteLength < HEADER_BYTES + CHUNK_HEADER_BYTES || view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error('GLB inválido: cabeçalho glTF ausente')
  }
  if (view.getUint32(4, true) !== GLB_VERSION) throw new Error('GLB inválido: só a versão 2 é suportada')
  let json: Json | null = null
  let bin: Uint8Array = new Uint8Array(0)
  let at = HEADER_BYTES
  while (at + CHUNK_HEADER_BYTES <= glb.byteLength) {
    const len = view.getUint32(at, true)
    const type = view.getUint32(at + 4, true)
    const start = at + CHUNK_HEADER_BYTES
    if (start + len > glb.byteLength) throw new Error('GLB inválido: chunk além do fim do arquivo')
    const data = glb.subarray(start, start + len)
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(data)) as Json
    else if (type === CHUNK_BIN) bin = data
    at = start + len
  }
  if (!json) throw new Error('GLB inválido: chunk JSON ausente')
  const declared = json.buffers?.[0]?.byteLength
  if (typeof declared === 'number' && declared <= bin.byteLength) bin = bin.subarray(0, declared)
  return { json, bin }
}

/** Monta um GLB a partir do JSON e do BIN (JSON com padding de espaços, BIN com zeros). */
export function buildGlb(json: Json, bin: Uint8Array): Uint8Array {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json))
  const jsonLen = align(jsonBytes.byteLength)
  const binLen = align(bin.byteLength)
  const hasBin = bin.byteLength > 0
  const total = HEADER_BYTES + CHUNK_HEADER_BYTES + jsonLen + (hasBin ? CHUNK_HEADER_BYTES + binLen : 0)
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  view.setUint32(0, GLB_MAGIC, true)
  view.setUint32(4, GLB_VERSION, true)
  view.setUint32(8, total, true)
  view.setUint32(HEADER_BYTES, jsonLen, true)
  view.setUint32(HEADER_BYTES + 4, CHUNK_JSON, true)
  const jsonAt = HEADER_BYTES + CHUNK_HEADER_BYTES
  out.set(jsonBytes, jsonAt)
  out.fill(JSON_PAD, jsonAt + jsonBytes.byteLength, jsonAt + jsonLen)
  if (hasBin) {
    const binHeader = jsonAt + jsonLen
    view.setUint32(binHeader, binLen, true)
    view.setUint32(binHeader + 4, CHUNK_BIN, true)
    out.set(bin, binHeader + CHUNK_HEADER_BYTES) // o resto já é zero
  }
  return out
}

/** Nomes das animações do GLB, na ordem do arquivo. */
export function animationNames(glb: Uint8Array): string[] {
  return (parseGlb(glb).json.animations ?? []).map((a: Json, i: number) => a.name ?? `${UNNAMED_PREFIX}${i}`)
}

/** Lê as animações do GLB como clipes (nó pelo nome que o three usa, o mesmo que `replaceAnimations` casa; '' sem nome). */
export function readAnimations(glb: Uint8Array): BakedClip[] {
  const { json, bin } = parseGlb(glb)
  return readRaw(json, bin).map((clip) => ({
    name: clip.name,
    channels: clip.channels.map((c) => ({
      node: sanitizeNodeName(json.nodes?.[c.node]?.name ?? ''),
      path: c.path as BakedChannel['path'],
      interpolation: c.interpolation as BakedChannel['interpolation'],
      times: c.times,
      values: c.values,
    })),
  }))
}

/** Copia os floats de um acessor de animação (respeita byteOffset e byteStride). */
function readFloats(json: Json, bin: Uint8Array, index: number): Float32Array {
  const acc = json.accessors?.[index]
  if (!acc) throw new Error(`acessor ${index} não existe`)
  if (acc.sparse) throw new Error(`acessor ${index} é esparso: não suportado`)
  if (acc.componentType !== COMPONENT_FLOAT) throw new Error(`acessor ${index} de animação não é float`)
  const comps = COMPONENTS[acc.type]
  if (!comps) throw new Error(`acessor ${index}: tipo ${acc.type} não suportado em animação`)
  const bv = json.bufferViews?.[acc.bufferView]
  if (!bv) throw new Error(`acessor ${index} sem bufferView`)
  const elem = comps * FLOAT_BYTES
  const stride = bv.byteStride ?? elem
  const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0)
  if (base + stride * (acc.count - 1) + elem > bin.byteLength) {
    throw new Error(`acessor ${index} aponta além do BIN`)
  }
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength)
  const out = new Float32Array(acc.count * comps)
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < comps; c++) out[i * comps + c] = view.getFloat32(base + i * stride + c * FLOAT_BYTES, true)
  }
  return out
}

/** Nome que o GLTFLoader dá à animação sem nome (`animation_<índice>`). */
const UNNAMED_PREFIX = 'animation_'
/** Paths que a cirurgia sabe regravar. */
const KNOWN_PATHS = new Set(['rotation', 'translation', 'scale', 'weights'])
/** O que um clipe do Studio pode trazer (o tipo TS não chega em runtime: o clipe vem de outro módulo). */
const BAKED_PATHS = new Set(['rotation', 'translation', 'scale'])
const BAKED_INTERPOLATIONS = new Set(['LINEAR', 'STEP'])

/** Nome do nó como o three o guarda (o `PropertyBinding.sanitizeNodeName`): espaço vira `_`, `[].:/` somem. */
export function sanitizeNodeName(name: string): string {
  return name.replace(/\s/g, '_').replace(/[[\].:/]/g, '')
}

function readRaw(json: Json, bin: Uint8Array): RawClip[] {
  return (json.animations ?? []).map((anim: Json, i: number) => {
    const { channels = [], samplers = [], name, ...rest } = anim
    const label = name ?? `${UNNAMED_PREFIX}${i}`
    return {
      name: label,
      named: name !== undefined,
      rest,
      channels: channels.map((ch: Json) => {
        const s = samplers[ch.sampler]
        if (!s) throw new Error(`animação ${label}: sampler ${ch.sampler} não existe`)
        // o que a cirurgia não reproduz é recusado, não perdido em silêncio (ADR-0705)
        if (typeof ch.target?.node !== 'number' || !KNOWN_PATHS.has(ch.target.path)) throw new Error(`animação ${label}: canal sem nó ou com path ${ch.target?.path} não suportado`)
        if (ch.target.extensions || ch.target.extras || ch.extensions || ch.extras || s.extensions || s.extras) throw new Error(`animação ${label}: canal ou sampler com extensions/extras não suportado`)
        return {
          node: ch.target.node,
          path: ch.target.path,
          interpolation: s.interpolation ?? 'LINEAR',
          times: readFloats(json, bin, s.input),
          values: readFloats(json, bin, s.output),
        }
      }),
    }
  })
}

/** Índices dos acessores usados por animações. */
function animationAccessors(json: Json): Set<number> {
  const set = new Set<number>()
  for (const anim of json.animations ?? []) {
    for (const s of anim.samplers ?? []) {
      set.add(s.input)
      set.add(s.output)
    }
  }
  return set
}

/**
 * Valida o layout "animação no fim" e devolve onde cortar: quantos acessores e bufferViews ficam
 * (os primeiros, sem animação) e o byte do BIN em que começa o bloco de animação.
 */
function findCut(json: Json, bin: Uint8Array): { accessors: number; bufferViews: number; byte: number } {
  const accessors: Json[] = json.accessors ?? []
  const views: Json[] = json.bufferViews ?? []
  if ((json.buffers?.length ?? 0) > 1) throw new Error('GLB com mais de um buffer: não suportado')
  if (views.some((v) => (v.buffer ?? 0) !== 0)) throw new Error('bufferView fora do buffer 0: não suportado')
  const animAcc = animationAccessors(json)
  const animViews = new Set<number>()
  for (const i of animAcc) {
    const v = accessors[i]?.bufferView
    if (v === undefined) throw new Error(`acessor ${i} de animação sem bufferView`)
    animViews.add(v)
  }
  if (animAcc.size === 0) return { accessors: accessors.length, bufferViews: views.length, byte: bin.byteLength }

  // Tudo que não é animação e usa bufferView (acessores, imagens): não pode tocar o bloco de animação.
  const otherViews = new Set<number>()
  accessors.forEach((a, i) => {
    if (!animAcc.has(i) && a.bufferView !== undefined) otherViews.add(a.bufferView)
  })
  for (const img of json.images ?? []) if (img.bufferView !== undefined) otherViews.add(img.bufferView)
  for (const v of otherViews) {
    if (animViews.has(v)) throw new Error(`bufferView ${v} compartilhado entre animação e malha/imagem`)
  }

  // Malha (atributos, índices, morph) e skin (IBM) não podem usar acessor de animação.
  const meshRefs: number[] = []
  for (const mesh of json.meshes ?? []) {
    for (const p of mesh.primitives ?? []) {
      meshRefs.push(...Object.values<number>(p.attributes ?? {}))
      if (p.indices !== undefined) meshRefs.push(p.indices)
      for (const t of p.targets ?? []) meshRefs.push(...Object.values<number>(t))
    }
  }
  for (const s of json.skins ?? []) if (s.inverseBindMatrices !== undefined) meshRefs.push(s.inverseBindMatrices)
  const shared = meshRefs.find((i) => animAcc.has(i))
  if (shared !== undefined) throw new Error(`acessor ${shared} compartilhado entre animação e malha/skin`)

  const firstAnimAcc = Math.min(...animAcc)
  if (firstAnimAcc !== accessors.length - animAcc.size) {
    throw new Error('layout intercalado: há acessor fora de animação depois dos de animação')
  }
  const firstAnimView = Math.min(...animViews)
  if (firstAnimView !== views.length - animViews.size) {
    throw new Error('layout intercalado: há bufferView fora de animação depois dos de animação')
  }
  const byte = Math.min(...[...animViews].map((v) => views[v].byteOffset ?? 0))
  views.slice(0, firstAnimView).forEach((v, i) => {
    if ((v.byteOffset ?? 0) + v.byteLength > byte) {
      throw new Error(`layout intercalado: bufferView ${i} (fora de animação) passa do início das animações`)
    }
  })
  return { accessors: firstAnimAcc, bufferViews: firstAnimView, byte }
}

function sameFloats(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false
  return true
}

/** Converte um clipe do Studio para o formato interno (nó por índice), validando nó e tamanhos. */
function toRaw(clip: BakedClip, nodeIndex: Map<string, number>, rest: Json, named = true): RawClip {
  return {
    name: clip.name,
    named,
    rest,
    channels: clip.channels.map((c) => {
      const node = nodeIndex.get(c.node)
      if (node === undefined) throw new Error(`clipe ${clip.name}: nó "${c.node}" não existe no GLB`)
      if (!BAKED_PATHS.has(c.path) || !BAKED_INTERPOLATIONS.has(c.interpolation)) throw new Error(`clipe ${clip.name}: canal ${c.path}/${c.interpolation} do nó ${c.node} não suportado`)
      return { node, path: c.path, interpolation: c.interpolation, times: c.times, values: c.values }
    }),
  }
}

/** Acumula os bytes do novo bloco de animação e os acessores/bufferViews dele. */
class AnimationWriter {
  readonly chunks: Uint8Array[] = []
  size: number

  constructor(
    private readonly accessors: Json[],
    private readonly views: Json[],
    start: number,
  ) {
    this.size = start
  }

  /** Grava os floats num bufferView próprio e devolve o índice do acessor novo. */
  push(data: Float32Array, type: string, count: number, minMax: boolean): number {
    const bytes = new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
    this.views.push({ buffer: 0, byteLength: bytes.byteLength, byteOffset: this.size })
    this.chunks.push(bytes)
    this.size += align(bytes.byteLength)
    const acc: Json = { bufferView: this.views.length - 1, componentType: COMPONENT_FLOAT, count }
    if (minMax) {
      let min = Infinity
      let max = -Infinity
      for (const t of data) {
        min = Math.min(min, t)
        max = Math.max(max, t)
      }
      acc.max = [max]
      acc.min = [min]
    }
    acc.type = type
    this.accessors.push(acc)
    return this.accessors.length - 1
  }

  /** Emite uma animação: um acessor de tempo por sequência de tempos distinta dentro do clipe. */
  writeClip(clip: RawClip): Json {
    const inputs: { times: Float32Array; index: number }[] = []
    const samplers: Json[] = []
    const channels: Json[] = []
    for (const ch of clip.channels) {
      const type = PATH_TYPE[ch.path] ?? 'SCALAR' // weights: SCALAR por alvo de morph
      const per = (COMPONENTS[type] ?? 1) * (ch.interpolation === 'CUBICSPLINE' ? CUBIC_FACTOR : 1)
      if (ch.times.length === 0 || ch.values.length % (ch.times.length * per) !== 0) {
        throw new Error(`clipe ${clip.name}: ${ch.path} do nó ${ch.node} com ${ch.values.length} valores para ${ch.times.length} chaves`)
      }
      let input = inputs.find((i) => sameFloats(i.times, ch.times))
      if (!input) {
        input = { times: ch.times, index: this.push(ch.times, 'SCALAR', ch.times.length, true) }
        inputs.push(input)
      }
      const output = this.push(ch.values, type, ch.values.length / (COMPONENTS[type] ?? 1), false)
      samplers.push({ input: input.index, interpolation: ch.interpolation, output })
      channels.push({ sampler: samplers.length - 1, target: { node: ch.node, path: ch.path } })
    }
    return { channels, ...(clip.named ? { name: clip.name } : {}), samplers, ...clip.rest }
  }
}

/**
 * Reescreve o bloco de animação do GLB: clipe de mesmo nome substitui a animação, nome novo vai no
 * fim e as outras animações são re-emitidas com os mesmos dados. Malha, imagem e skin (JSON e o
 * prefixo do BIN) ficam idênticos; os índices dos acessores fora de animação não mudam.
 * @throws Error se o layout não for "animação no fim", se houver bufferView compartilhado, se um
 *   canal citar nó inexistente ou se `clips` repetir um nome.
 * @example const out = replaceAnimations(glb, [{ name: 'pistolIdle@ARM-02', channels }])
 */
export function replaceAnimations(glb: Uint8Array, clips: readonly BakedClip[]): Uint8Array {
  const { json, bin } = parseGlb(glb)
  const cut = findCut(json, bin)
  // nó pelo nome que o three usa nas faixas; dois nós com o mesmo nome não têm como ser escolhidos
  const nodeIndex = new Map<string, number>()
  const twice = new Set<string>()
  ;(json.nodes ?? []).forEach((n: Json, i: number) => {
    if (typeof n.name !== 'string') return
    const key = sanitizeNodeName(n.name)
    if (nodeIndex.has(key)) twice.add(key)
    else nodeIndex.set(key, i)
  })
  for (const c of clips) for (const ch of c.channels) if (twice.has(ch.node)) throw new Error(`clipe ${c.name}: nó ${ch.node} aparece mais de uma vez no GLB`)
  const byName = new Map<string, BakedClip>()
  for (const c of clips) {
    if (byName.has(c.name)) throw new Error(`clipe ${c.name} repetido`)
    byName.set(c.name, c)
  }

  const existing = readRaw(json, bin)
  // duas animações com o mesmo nome no GLB: não há como saber qual o clipe substitui
  const seen = new Set<string>()
  for (const a of existing) {
    if (seen.has(a.name) && byName.has(a.name)) throw new Error(`o GLB tem mais de uma animação ${a.name}`)
    seen.add(a.name)
  }
  const final: RawClip[] = existing.map((old) => {
    const next = byName.get(old.name)
    return next ? toRaw(next, nodeIndex, old.rest, old.named) : old
  })
  const known = new Set(existing.map((c) => c.name))
  for (const c of clips) if (!known.has(c.name)) final.push(toRaw(c, nodeIndex, {}))

  const out = structuredClone(json)
  const accessors: Json[] = (json.accessors ?? []).slice(0, cut.accessors)
  const views: Json[] = (json.bufferViews ?? []).slice(0, cut.bufferViews)
  const writer = new AnimationWriter(accessors, views, align(cut.byte))
  const animations = final.map((c) => writer.writeClip(c))

  const newBin = new Uint8Array(writer.size)
  newBin.set(bin.subarray(0, cut.byte))
  let at = align(cut.byte)
  for (const chunk of writer.chunks) {
    newBin.set(chunk, at)
    at += align(chunk.byteLength)
  }
  if (accessors.length) out.accessors = accessors
  if (views.length) out.bufferViews = views
  if (animations.length) out.animations = animations
  else delete out.animations
  if (newBin.byteLength) out.buffers = [{ ...(json.buffers?.[0] ?? {}), byteLength: newBin.byteLength }]
  return buildGlb(out, newBin)
}
