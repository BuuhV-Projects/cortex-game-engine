import {
  InstancedMesh,
  Mesh,
  Vector3,
  type BufferAttribute,
  type BufferGeometry,
  type InterleavedBufferAttribute,
  type Intersection,
  type Layers,
  type Object3D,
  type Raycaster,
} from 'three';
import { debug } from '../core/debug.js';
import { CROSSED_MIN_BVH_TRIS, ensureBoundsTree } from './raycastAccel.js';

/**
 * Raycast de colisão (câmera e personagem) no host nativo — ADR-0346 / SPEC-0347.
 *
 * `firstHitAmong` é o "1º acerto" de um raio entre candidatas (ordenadas pela entrada
 * na caixa, ou sem ordem). No export, com `__cortexRaycast`, as malhas que o C++
 * reproduz fielmente vão numa chamada só por raio; as outras (e tudo no browser/Studio)
 * seguem o caminho JS — o mesmo da SPEC-0328 — e o menor acerto vence.
 */

/** Token do host: a geometria/instâncias vivem no C++ enquanto o JS segura o token. */
export interface RaycastToken {
  readonly id: number;
}

/** A ponte `__cortexRaycast` (SPEC-0347). */
export interface RaycastBridge {
  addGeometry(
    positions: Float32Array,
    stride: number,
    offset: number,
    vertexCount: number,
    index: Uint16Array | Uint32Array | null,
  ): RaycastToken | null;
  addInstances(matrices: Float32Array, count: number): RaycastToken | null;
  setInstances(token: RaycastToken, matrices: Float32Array, count: number): boolean;
  first(
    ray: Float64Array,
    count: number,
    slots: Int32Array,
    matrices: readonly Float64Array[],
    entries: Float64Array,
    out: Float64Array,
  ): number;
}

/** Distância (m) acima da qual o modo de conferência conta divergência. */
export const CHECK_TOLERANCE = 1e-4;
/** A cada quantas consultas o modo de conferência loga o placar. */
const CHECK_LOG_EVERY = 600;
/** Inteiros por candidata em `slots`: geometria, lado, instâncias. */
const SLOT_INTS = 3;
const RAY_DOUBLES = 8;
const OUT_DOUBLES = 8;
const OUT_POINT = 1;
const OUT_NORMAL = 4;
const OUT_INSTANCE = 7;
const RAY_NEAR = 6;
const RAY_FAR = 7;
const NO_INSTANCES = -1;
/** Capacidade inicial dos buffers de candidatas (cresce sob demanda). */
const INITIAL_CAPACITY = 64;
const XYZ = 3;

let bridgeOverride: RaycastBridge | null | undefined;
let resolved: RaycastBridge | null | undefined;
let checkMode = false;

function queryFlag(name: string): string | null {
  try {
    if (typeof location === 'undefined') return null;
    return new URLSearchParams(location.search ?? '').get(name);
  } catch {
    return null;
  }
}

/** A ponte ativa: `__cortexRaycast` do host, a menos que `?nativeRaycast=0`. */
export function nativeRaycastBridge(): RaycastBridge | null {
  if (bridgeOverride !== undefined) return bridgeOverride;
  if (resolved === undefined) {
    const api = (globalThis as { __cortexRaycast?: RaycastBridge }).__cortexRaycast;
    resolved = api && queryFlag('nativeRaycast') !== '0' ? api : null;
    checkMode = resolved !== null && queryFlag('nativeRaycastCheck') === '1';
    if (api) debug('perf', `[nativeRaycast] ${resolved ? 'ativo' : 'desligado (?nativeRaycast=0)'}${checkMode ? ' + conferência' : ''}`);
  }
  return resolved;
}

/** Troca a ponte (testes). `undefined` volta a detectar o host; `check` liga a conferência. */
export function setNativeRaycastBridge(bridge: RaycastBridge | null | undefined, check = false): void {
  bridgeOverride = bridge;
  resolved = undefined;
  checkMode = bridge ? check : false;
  checks.queries = checks.mismatches = checks.hits = checks.nativeCandidates = checks.jsCandidates = 0;
}

/** Placar do modo de conferência (`?nativeRaycastCheck=1`). */
export const checks = { queries: 0, mismatches: 0, hits: 0, nativeCandidates: 0, jsCandidates: 0 };

const _hits: Intersection[] = [];

/**
 * O caminho JS (SPEC-0328): testa em ordem e para quando a próxima candidata entra
 * além do melhor acerto. `entry` nulo = sem ordem (testa todas).
 */
function jsFirstHit(
  raycaster: Raycaster,
  cand: readonly Object3D[],
  entry: readonly number[] | null,
  skip: ((o: Object3D) => boolean) | undefined,
  best: Intersection | null = null,
): Intersection | null {
  for (let i = 0; i < cand.length; i++) {
    if (best && entry && entry[i]! > best.distance) break; // nada daqui pra frente acerta antes
    const o = cand[i]!;
    if (!o.layers.test(raycaster.layers)) continue;
    // o raio cruza a caixa: árvore já a partir de poucos triângulos (SPEC-0328)
    if (!(o as { geometry?: { boundsTree?: unknown } }).geometry?.boundsTree) ensureBoundsTree(o, CROSSED_MIN_BVH_TRIS);
    _hits.length = 0;
    o.raycast(raycaster, _hits);
    for (let h = 0; h < _hits.length; h++) {
      const hit = _hits[h]!;
      if ((best === null || hit.distance < best.distance) && !(skip && skip(hit.object))) best = hit;
    }
  }
  _hits.length = 0;
  return best;
}

interface GeometryEntry {
  id: number; // -1 = o nativo não reproduz esta geometria
  token: RaycastToken | null;
  position: unknown;
  positionVersion: number;
  index: unknown;
  indexVersion: number;
}

const geometries = new WeakMap<BufferGeometry, GeometryEntry>();
const instanceSets = new WeakMap<InstancedMesh, { token: RaycastToken; version: number; count: number }>();

type PositionAttr = (BufferAttribute | InterleavedBufferAttribute) & { isInterleavedBufferAttribute?: boolean };

function attrVersion(a: PositionAttr): number {
  return a.isInterleavedBufferAttribute ? (a as InterleavedBufferAttribute).data.version : (a as BufferAttribute).version;
}

/** Id da geometria no host (registra/re-registra quando muda), ou -1 se o nativo não a reproduz. */
function geometryId(bridge: RaycastBridge, g: BufferGeometry): number {
  const pos = g.attributes['position'] as PositionAttr | undefined;
  const idx = g.index;
  const e = geometries.get(g);
  if (
    e &&
    e.position === pos &&
    e.index === idx &&
    (!pos || e.positionVersion === attrVersion(pos)) &&
    e.indexVersion === (idx ? idx.version : -1)
  ) {
    return e.id;
  }
  const token = pos ? register(bridge, g, pos) : null;
  geometries.set(g, {
    id: token ? token.id : -1,
    token,
    position: pos,
    positionVersion: pos ? attrVersion(pos) : -1,
    index: idx,
    indexVersion: idx ? idx.version : -1,
  });
  return token ? token.id : -1;
}

function register(bridge: RaycastBridge, g: BufferGeometry, pos: PositionAttr): RaycastToken | null {
  if (pos.itemSize < XYZ || pos.normalized) return null;
  if ((g.morphAttributes['position']?.length ?? 0) > 0) return null;
  const interleaved = pos.isInterleavedBufferAttribute === true;
  const array = interleaved ? (pos as InterleavedBufferAttribute).data.array : (pos as BufferAttribute).array;
  if (!(array instanceof Float32Array)) return null;
  const idx = g.index;
  const indexArray = idx ? idx.array : null;
  if (indexArray && !(indexArray instanceof Uint16Array) && !(indexArray instanceof Uint32Array)) return null;
  const total = idx ? idx.count : pos.count;
  if (g.drawRange.start !== 0 || g.drawRange.count < total) return null; // drawRange parcial: fica no JS
  const stride = interleaved ? (pos as InterleavedBufferAttribute).data.stride : pos.itemSize;
  const offset = interleaved ? (pos as InterleavedBufferAttribute).offset : 0;
  return bridge.addGeometry(array, stride, offset, pos.count, indexArray as Uint16Array | Uint32Array | null);
}

/** Id do conjunto de instâncias no host (sobe as matrizes quando `version`/`count` mudam). */
function instancesId(bridge: RaycastBridge, m: InstancedMesh): number {
  const im = m.instanceMatrix;
  const s = instanceSets.get(m);
  if (s && s.version === im.version && s.count === m.count) return s.token.id;
  const array = im.array as Float32Array;
  if (s) {
    if (!bridge.setInstances(s.token, array, m.count)) return -1;
    s.version = im.version;
    s.count = m.count;
    return s.token.id;
  }
  const token = bridge.addInstances(array, m.count);
  if (!token) return -1;
  instanceSets.set(m, { token, version: im.version, count: m.count });
  return token.id;
}

const enum Route {
  Native,
  Js,
  /** Sem material: o `three` não acerta nada nela. */
  Nothing,
}

let slots = new Int32Array(INITIAL_CAPACITY * SLOT_INTS);
let entries = new Float64Array(INITIAL_CAPACITY);
const matrices: Float64Array[] = [];
const objects: Object3D[] = [];
const jsCandidates: Object3D[] = [];
const rayBuf = new Float64Array(RAY_DOUBLES);
const outBuf = new Float64Array(OUT_DOUBLES);

/** Grava a candidata `o` no slot `n` (de `s`/`mats`) se o nativo a reproduz fielmente. */
function route(bridge: RaycastBridge, o: Object3D, n: number, s = slots, mats = matrices): Route {
  const m = o as Mesh & { isInstancedMesh?: boolean; isBatchedMesh?: boolean };
  if (!m.isMesh || m.isBatchedMesh) return Route.Js;
  const instanced = m.isInstancedMesh === true;
  // raycast sobrescrito (noRaycast, embrulho): só o JS sabe o que ele faz
  if (m.raycast !== (instanced ? InstancedMesh : Mesh).prototype.raycast) return Route.Js;
  const mat = m.material;
  if (mat === undefined) return Route.Nothing;
  if (Array.isArray(mat)) return Route.Js;
  const elements = m.matrixWorld.elements as unknown;
  if (!(elements instanceof Float64Array)) return Route.Js;
  const g = geometryId(bridge, m.geometry);
  if (g < 0) return Route.Js;
  const inst = instanced ? instancesId(bridge, o as InstancedMesh) : NO_INSTANCES;
  if (instanced && inst < 0) return Route.Js;
  const k = n * SLOT_INTS;
  s[k] = g;
  s[k + 1] = mat.side;
  s[k + 2] = inst;
  mats[n] = elements;
  return Route.Native;
}

function grow(need: number): void {
  if (entries.length >= need) return;
  const cap = Math.max(need, entries.length * 2);
  slots = new Int32Array(cap * SLOT_INTS);
  entries = new Float64Array(cap);
}

function nativeFirstHit(
  bridge: RaycastBridge,
  raycaster: Raycaster,
  cand: readonly Object3D[],
  entry: readonly number[] | null,
  skip: ((o: Object3D) => boolean) | undefined,
): Intersection | null {
  grow(cand.length);
  let n = 0;
  jsCandidates.length = 0;
  for (let i = 0; i < cand.length; i++) {
    const o = cand[i]!;
    if (!o.layers.test(raycaster.layers)) continue;
    if (skip && skip(o)) continue; // o acerto de uma malha é ela mesma: pular a candidata = pular os acertos
    const r = route(bridge, o, n);
    if (r === Route.Js) jsCandidates.push(o);
    if (r !== Route.Native) continue;
    entries[n] = entry ? entry[i]! : 0;
    objects[n] = o;
    n++;
  }
  const best = castNative(bridge, raycaster, n, slots, matrices, entries, objects);
  if (checkMode) {
    checks.nativeCandidates += n;
    checks.jsCandidates += jsCandidates.length;
  }
  objects.length = 0;
  // as que o nativo não reproduz: caminho JS, sem ordem (são poucas), o menor vence
  return jsCandidates.length > 0 ? jsFirstHit(raycaster, jsCandidates, null, skip, best) : best;
}

/** Um raio contra `n` candidatas já roteadas: UMA chamada ao C++. */
function castNative(
  bridge: RaycastBridge,
  raycaster: Raycaster,
  n: number,
  s: Int32Array,
  mats: readonly Float64Array[],
  ent: Float64Array,
  objs: readonly Object3D[],
): Intersection | null {
  if (n === 0) return null;
  const { origin, direction } = raycaster.ray;
  rayBuf[0] = origin.x;
  rayBuf[1] = origin.y;
  rayBuf[2] = origin.z;
  rayBuf[XYZ] = direction.x;
  rayBuf[XYZ + 1] = direction.y;
  rayBuf[XYZ + 2] = direction.z;
  rayBuf[RAY_NEAR] = raycaster.near;
  rayBuf[RAY_FAR] = raycaster.far;
  const k = bridge.first(rayBuf, n, s, mats, ent, outBuf);
  return k >= 0 ? toIntersection(objs[k]!) : null;
}

/**
 * Candidatas roteadas UMA vez para vários raios (SPEC-0646): o braço da câmera dispara
 * 5–6 raios quase iguais contra a mesma lista, e o roteamento por candidata (JS) se
 * repetia em cada um. Reaproveite a instância entre quadros (os buffers crescem sob demanda).
 */
export class PreparedCandidates {
  n = 0;
  slots = new Int32Array(INITIAL_CAPACITY * SLOT_INTS);
  /** Entradas zeradas: sem ordem, o C++ testa todas (a lista já é só a do feixe). */
  entries = new Float64Array(INITIAL_CAPACITY);
  readonly matrices: Float64Array[] = [];
  readonly objects: Object3D[] = [];
  /** As que o nativo não reproduz (todas, fora do host). */
  readonly js: Object3D[] = [];
}

/** Roteia `cand` (só as da camada `layers`) em `out` — ver {@link PreparedCandidates}. */
export function prepareCandidates(cand: readonly Object3D[], layers: Layers, out: PreparedCandidates): PreparedCandidates {
  const bridge = nativeRaycastBridge();
  out.n = 0;
  out.js.length = out.objects.length = out.matrices.length = 0;
  if (bridge && out.entries.length < cand.length) {
    const cap = Math.max(cand.length, out.entries.length * 2);
    out.slots = new Int32Array(cap * SLOT_INTS);
    out.entries = new Float64Array(cap);
  }
  for (let i = 0; i < cand.length; i++) {
    const o = cand[i]!;
    if (!o.layers.test(layers)) continue;
    const r = bridge ? route(bridge, o, out.n, out.slots, out.matrices) : Route.Js;
    if (r === Route.Js) out.js.push(o);
    if (r === Route.Native) out.objects[out.n++] = o;
  }
  return out;
}

/** O 1º acerto do `raycaster` entre candidatas preparadas por {@link prepareCandidates}. */
export function firstHitPrepared(raycaster: Raycaster, p: PreparedCandidates): Intersection | null {
  const bridge = nativeRaycastBridge();
  const native = bridge ? castNative(bridge, raycaster, p.n, p.slots, p.matrices, p.entries, p.objects) : null;
  const hit = p.js.length > 0 ? jsFirstHit(raycaster, p.js, null, undefined, native) : native;
  if (checkMode) check(hit, jsFirstHit(raycaster, p.objects.concat(p.js), null, undefined));
  return hit;
}

function toIntersection(object: Object3D): Intersection {
  const instance = outBuf[OUT_INSTANCE]!;
  const hit: Intersection = {
    distance: outBuf[0]!,
    point: new Vector3(outBuf[OUT_POINT], outBuf[OUT_POINT + 1], outBuf[OUT_POINT + 2]),
    object,
    // a, b, c = -1: o host não devolve os índices dos vértices (ninguém da colisão os lê)
    face: {
      a: -1,
      b: -1,
      c: -1,
      normal: new Vector3(outBuf[OUT_NORMAL], outBuf[OUT_NORMAL + 1], outBuf[OUT_NORMAL + 2]),
      materialIndex: 0,
    },
  };
  if (instance >= 0) hit.instanceId = instance;
  return hit;
}

/**
 * O 1º acerto do `raycaster` entre `cand` (SPEC-0347). Com `entry` (distância de
 * entrada na caixa, crescente — o `alongRay`), para quando a próxima entra além do
 * melhor acerto. `skip` descarta o acerto (o próprio personagem). Ligue
 * `raycaster.firstHitOnly` pro caminho JS usar o `raycastFirst` da árvore.
 */
export function firstHitAmong(
  raycaster: Raycaster,
  cand: readonly Object3D[],
  entry: readonly number[] | null,
  skip?: (o: Object3D) => boolean,
): Intersection | null {
  const bridge = nativeRaycastBridge();
  if (!bridge) return jsFirstHit(raycaster, cand, entry, skip);
  const hit = nativeFirstHit(bridge, raycaster, cand, entry, skip);
  if (checkMode) check(hit, jsFirstHit(raycaster, cand, entry, skip));
  return hit;
}

/** `true` quando o raycast de colisão está indo pro host. */
export function nativeRaycastActive(): boolean {
  return nativeRaycastBridge() !== null;
}

function check(native: Intersection | null, js: Intersection | null): void {
  checks.queries++;
  if (js) checks.hits++;
  // a mesma distância basta: duas malhas coplanares podem trocar o `object` (SPEC-0328)
  const same =
    native === js || (native !== null && js !== null && Math.abs(native.distance - js.distance) <= CHECK_TOLERANCE);
  if (!same) {
    checks.mismatches++;
    debug(
      'perf',
      `[nativeRaycastCheck] divergência: nativo=${native ? `${native.object.name}@${native.distance.toFixed(4)}` : '-'} js=${js ? `${js.object.name}@${js.distance.toFixed(4)}` : '-'}`,
    );
  }
  if (checks.queries % CHECK_LOG_EVERY === 0) {
    debug('perf', `[nativeRaycastCheck] consultas=${checks.queries} acertos=${checks.hits} divergências=${checks.mismatches} candidatas nativo/js=${checks.nativeCandidates}/${checks.jsCandidates}`);
  }
}
