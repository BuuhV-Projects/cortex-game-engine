/**
 * Layout "animação no fim" do GLB (SPEC-0745): a cirurgia do bloco de animação (ADR-0705) corta o BIN no
 * primeiro byte de animação. O Blender põe a matriz do skin depois das animações; aqui os acessores e
 * bufferViews fora de animação vão para a frente, com os índices renumerados. Puro.
 */

// glTF é JSON livre; tipamos só o que a reordenação lê.
type Json = Record<string, any>

const ALIGN = 4
const align = (n: number): number => Math.ceil(n / ALIGN) * ALIGN

/** Extensões que citam acessor ou bufferView por um caminho que a renumeração não conhece. */
const UNSUPPORTED_EXTENSIONS = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'EXT_mesh_gpu_instancing']

/** Índices dos acessores usados por animações. */
export function animationAccessors(json: Json): Set<number> {
  const set = new Set<number>()
  for (const anim of json.animations ?? []) {
    for (const s of anim.samplers ?? []) {
      set.add(s.input)
      set.add(s.output)
    }
  }
  return set
}

/** bufferViews dos acessores de animação e dos outros (acessores, sparse e imagens). */
function viewGroups(json: Json, animAcc: Set<number>): { anim: Set<number>; other: Set<number> } {
  const anim = new Set<number>()
  const other = new Set<number>()
  ;(json.accessors ?? []).forEach((a: Json, i: number) => {
    const into = animAcc.has(i) ? anim : other
    if (a.bufferView !== undefined) into.add(a.bufferView)
    if (a.sparse?.indices?.bufferView !== undefined) other.add(a.sparse.indices.bufferView)
    if (a.sparse?.values?.bufferView !== undefined) other.add(a.sparse.values.bufferView)
  })
  for (const img of json.images ?? []) if (img.bufferView !== undefined) other.add(img.bufferView)
  return { anim, other }
}

/** O layout já é "animação no fim": acessores, bufferViews e bytes de animação depois de todo o resto. */
function alreadyAtEnd(json: Json, animAcc: Set<number>, animViews: Set<number>): boolean {
  const accessors: Json[] = json.accessors ?? []
  const views: Json[] = json.bufferViews ?? []
  if (Math.min(...animAcc) !== accessors.length - animAcc.size) return false
  if (Math.min(...animViews) !== views.length - animViews.size) return false
  const byte = Math.min(...[...animViews].map((v) => views[v]?.byteOffset ?? 0))
  return views.every((v, i) => animViews.has(i) || (v.byteOffset ?? 0) + v.byteLength <= byte)
}

/** Troca os índices de acessor das malhas, do skin e das animações pelo mapa `acc`. */
function remapAccessorRefs(json: Json, acc: Map<number, number>): void {
  const at = (i: number): number => acc.get(i) ?? i
  for (const mesh of json.meshes ?? []) {
    for (const p of mesh.primitives ?? []) {
      for (const k of Object.keys(p.attributes ?? {})) p.attributes[k] = at(p.attributes[k])
      if (p.indices !== undefined) p.indices = at(p.indices)
      for (const t of p.targets ?? []) for (const k of Object.keys(t)) t[k] = at(t[k])
    }
  }
  for (const s of json.skins ?? []) if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = at(s.inverseBindMatrices)
  for (const anim of json.animations ?? []) {
    for (const s of anim.samplers ?? []) {
      s.input = at(s.input)
      s.output = at(s.output)
    }
  }
}

/**
 * Põe as animações no fim do GLB: acessores fora de animação primeiro (na ordem do arquivo), depois os de
 * animação; os bufferViews e os bytes deles idem. Se o layout já é esse, devolve o mesmo JSON e BIN (byte a
 * byte). Um bufferView dividido entre animação e malha (ou mais de um buffer) volta como está, para o corte recusar com a mensagem dele.
 * @throws Error se o GLB usa extensão que cita acessor ou bufferView (Draco, meshopt, instancing).
 */
export function normalizeLayout(json: Json, bin: Uint8Array): { json: Json; bin: Uint8Array } {
  const animAcc = animationAccessors(json)
  if (animAcc.size === 0) return { json, bin }
  const accessors: Json[] = json.accessors ?? []
  const views: Json[] = json.bufferViews ?? []
  // mais de um buffer: o corte recusa com a mensagem dele
  if ((json.buffers?.length ?? 0) > 1 || views.some((v) => (v.buffer ?? 0) !== 0)) return { json, bin }
  if ([...animAcc].some((i) => accessors[i]?.bufferView === undefined)) return { json, bin }
  const groups = viewGroups(json, animAcc)
  if ([...groups.anim].some((v) => groups.other.has(v))) return { json, bin }
  if (alreadyAtEnd(json, animAcc, groups.anim)) return { json, bin }
  const ext = (json.extensionsUsed ?? []).find((e: string) => UNSUPPORTED_EXTENSIONS.includes(e))
  if (ext) throw new Error(`layout intercalado com a extensão ${ext}: não suportado`)

  const accOrder = [...accessors.keys()].sort((a, b) => Number(animAcc.has(a)) - Number(animAcc.has(b)) || a - b)
  const viewOrder = [...views.keys()].sort((a, b) => Number(groups.anim.has(a)) - Number(groups.anim.has(b)) || a - b)
  const accMap = new Map(accOrder.map((old, i) => [old, i]))
  const viewMap = new Map(viewOrder.map((old, i) => [old, i]))
  const viewAt = (i: number): number => viewMap.get(i) ?? i

  const size = viewOrder.reduce((n, v) => align(n) + views[v]!.byteLength, 0)
  const newBin = new Uint8Array(align(size))
  let pos = 0
  const newViews = viewOrder.map((v) => {
    const old = views[v]!
    const from = old.byteOffset ?? 0
    pos = align(pos)
    newBin.set(bin.subarray(from, from + old.byteLength), pos)
    const moved = { ...old, byteOffset: pos }
    pos += old.byteLength
    return moved
  })

  const out = structuredClone(json)
  out.bufferViews = newViews
  out.accessors = accOrder.map((i) => {
    const a = structuredClone(accessors[i]!)
    if (a.bufferView !== undefined) a.bufferView = viewAt(a.bufferView)
    if (a.sparse?.indices?.bufferView !== undefined) a.sparse.indices.bufferView = viewAt(a.sparse.indices.bufferView)
    if (a.sparse?.values?.bufferView !== undefined) a.sparse.values.bufferView = viewAt(a.sparse.values.bufferView)
    return a
  })
  for (const img of out.images ?? []) if (img.bufferView !== undefined) img.bufferView = viewAt(img.bufferView)
  remapAccessorRefs(out, accMap)
  out.buffers = [{ ...(json.buffers?.[0] ?? {}), byteLength: newBin.byteLength }]
  return { json: out, bin: newBin }
}
