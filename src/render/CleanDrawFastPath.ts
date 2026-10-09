/**
 * Desenho direto de render objects limpos (SPEC-0333, passo b.1 do ADR-0330).
 *
 * O `_renderObjectDirect` do `three` gasta ~55 µs por draw no Hermes, e para os
 * objetos que nada mudou quase tudo é VERIFICAÇÃO genérica (SPEC-0331):
 * `ChainMap`, chave dinâmica com hash, `equals` sobre a lista inteira de
 * uniforms, ~30 campos de pipeline, `updateNode` em todos os nós. Este módulo
 * troca essa verificação por uma ESPECIALIZADA: quando o `three` desenha um
 * render object elegível, grava um instantâneo numérico só do que os nós dele
 * leem; no quadro seguinte, se o instantâneo bate, desenha direto
 * (`updateBefore`, nós de render/quadro e grupos compartilhados, `draw`).
 * Qualquer divergência cai no caminho do `three`, que regrava.
 *
 * Elegível = sem nó animado, plano do `RenderIdRefresh` disponível, sem
 * skin/morph/batch, e todo nó de update por OBJETO é: escopo de matriz do
 * `ModelNode` (ou `modelNormalMatrix`/`modelWorldMatrixInverse`), grupo,
 * `ReferenceNode` (material, névoa, objeto) ou `TextureNode`.
 */
import { modelNormalMatrix, modelWorldMatrixInverse } from 'three/tsl';
import { debug } from '../core/debug.js';
import { buildRenderIdPlan } from './RenderIdRefresh.js';
import { applyPlan, queryFlagRequested, type NodeFrameLike, type UniformsGroupLike } from './TransformOnlyRefresh.js';

const QUERY_KEY = 'cleanDraw=';
const MAIN_PASS_QUERY_KEY = 'nativeMainPass=';
const UPDATE_OBJECT = 'object';
/** Chamadas de `render()` entre relatos no `debug('perf')`. */
const REPORT_RENDER_CALLS = 1200;
const MATRIX_ELEMENTS = 16;
/** Marca de "ausente" no instantâneo (nenhum valor real é este). */
const AUSENTE = -1.2345678e300;
/** Escopos do `ModelNode` que dependem só da matriz de mundo. */
const ESCOPOS_DA_MATRIZ = new Set(['worldMatrix', 'position', 'scale', 'direction', 'radius']);

// ── Instantâneo numérico ─────────────────────────────────────────────────────

type Valor = unknown;

/**
 * Acrescenta um valor ao instantâneo. `false` = tipo que não se sabe conferir
 * (o render object não é gravado — recusa, nunca aproximação).
 */
export function pushValue(out: number[], v: Valor): boolean {
  if (v === null || v === undefined) {
    out.push(AUSENTE);
    return true;
  }
  if (typeof v === 'number') {
    out.push(v);
    return true;
  }
  if (typeof v === 'boolean') {
    out.push(v ? 1 : 0);
    return true;
  }
  if (typeof v !== 'object') return false;
  const o = v as Record<string, unknown> & {
    isTexture?: boolean; isColor?: boolean; isVector2?: boolean; isVector3?: boolean; isVector4?: boolean;
    isMatrix3?: boolean; isMatrix4?: boolean; elements?: ArrayLike<number>;
  };
  if (o.isTexture) {
    const t = o as unknown as {
      id: number; version: number; rotation: number; matrixAutoUpdate: boolean;
      offset: { x: number; y: number }; repeat: { x: number; y: number }; center: { x: number; y: number };
    };
    out.push(t.id, t.version, t.offset.x, t.offset.y, t.repeat.x, t.repeat.y, t.rotation, t.center.x, t.center.y, t.matrixAutoUpdate ? 1 : 0);
    return true;
  }
  if (o.isColor) {
    out.push(o['r'] as number, o['g'] as number, o['b'] as number);
    return true;
  }
  if (o.isVector2) {
    out.push(o['x'] as number, o['y'] as number);
    return true;
  }
  if (o.isVector3) {
    out.push(o['x'] as number, o['y'] as number, o['z'] as number);
    return true;
  }
  if (o.isVector4) {
    out.push(o['x'] as number, o['y'] as number, o['z'] as number, o['w'] as number);
    return true;
  }
  if ((o.isMatrix3 || o.isMatrix4) && o.elements) {
    for (let i = 0; i < o.elements.length; i++) out.push(o.elements[i]!);
    return true;
  }
  return false;
}

// ── Formas mínimas dos internos do three 0.184 ──────────────────────────────

interface NoLike {
  type?: string;
  scope?: string;
  properties?: string[];
  object?: unknown;
  material?: unknown;
  isMaterialReferenceNode?: boolean;
  isTextureNode?: boolean;
  node?: unknown;
  value?: unknown;
  getUpdateType(): string;
  getUpdateBeforeType?(): string;
  getUpdateAfterType?(): string;
}

interface GeometryLike {
  id: number;
  attributes: Record<string, { id: number; version: number }>;
  index: { id: number; version: number } | null;
  drawRange: { start: number; count: number };
}

interface ObjectLike {
  matrixWorld: { elements: ArrayLike<number> };
  geometry: GeometryLike;
  receiveShadow: boolean;
  isSkinnedMesh?: boolean;
  isBatchedMesh?: boolean;
  isInstancedMesh?: boolean;
  morphTargetInfluences?: unknown;
  count?: number;
  instanceMatrix?: { version: number };
  instanceColor?: { version: number } | null;
}

export interface CleanRoLike {
  object: ObjectLike;
  material: Record<string, unknown>;
  geometry: GeometryLike;
  camera: unknown;
  drawRange: unknown;
  group: unknown;
  bundle: unknown;
  onDispose: () => void;
  getMonitor(): { hasNode: boolean; hasAnimation: boolean; renderId: number; needsVelocity?(renderer: unknown): boolean };
  getNodeBuilderState(): { updateNodes: NoLike[]; updateBeforeNodes: NoLike[]; updateAfterNodes: NoLike[] };
  getBindings(): unknown[];
}

/** Onde um valor vigiado mora, resolvido por render object na gravação. */
interface Vigia {
  holder: unknown;
  properties: string[];
  /** Forma do valor na última gravação ({@link VigiaKind}); decide a conferência rápida. */
  kind: number;
}

/** Forma de um valor vigiado — a conferência rápida não despacha tipo por quadro. */
const enum VigiaKind {
  Prim = 0,
  Color = 1,
  Texture = 2,
  Vec2 = 3,
  Vec3 = 4,
  Vec4 = 5,
  Other = 6,
}

function kindOf(v: unknown): VigiaKind {
  if (v === null || typeof v !== 'object') return VigiaKind.Prim;
  const o = v as { isColor?: boolean; isTexture?: boolean; isVector2?: boolean; isVector3?: boolean; isVector4?: boolean };
  if (o.isTexture) return VigiaKind.Texture;
  if (o.isColor) return VigiaKind.Color;
  if (o.isVector2) return VigiaKind.Vec2;
  if (o.isVector3) return VigiaKind.Vec3;
  if (o.isVector4) return VigiaKind.Vec4;
  return VigiaKind.Other;
}

/** A codificação de primitivo do instantâneo (a mesma de `SnapshotCursor.v`). */
function prim(x: unknown): number {
  return typeof x === 'number' ? x : x === true ? 1 : x === false ? 0 : AUSENTE;
}

/** Objeto da cena com a gravação mais recente pendurada (ver `gravar`). */
type ComGravacao = { _cxGravacao?: Gravacao };

/** O que se grava de um render object. */
interface Gravacao {
  ro: CleanRoLike;
  material: unknown;
  context: unknown;
  passId: unknown;
  lights: unknown;
  clipping: unknown;
  envKey: unknown;
  contextNodeVersion: number;
  vigias: Vigia[];
  instantaneo: Float64Array;
  plan: NonNullable<ReturnType<typeof buildRenderIdPlan>>;
}

/**
 * Os vigias de um render object, ou `null` se algum nó de objeto não é
 * conferível. Exportada para os testes.
 */
export function watchersFor(ro: CleanRoLike): Vigia[] | null {
  const estado = ro.getNodeBuilderState();
  for (const n of estado.updateBeforeNodes) if (n.getUpdateBeforeType?.() === UPDATE_OBJECT) return null;
  for (const n of estado.updateAfterNodes) if (n.getUpdateAfterType?.() === UPDATE_OBJECT) return null;
  const vigias: Vigia[] = [];
  const saidasDeReferencia = new Set<unknown>();
  const texturas: NoLike[] = [];
  for (const n of estado.updateNodes) {
    if (n.getUpdateType() !== UPDATE_OBJECT) continue;
    if (n === (modelNormalMatrix as unknown) || n === (modelWorldMatrixInverse as unknown)) continue;
    if (n.type === 'ModelNode' && ESCOPOS_DA_MATRIZ.has(n.scope ?? '')) continue;
    if (n.type === 'UniformGroupNode') continue;
    if (Array.isArray(n.properties)) {
      // `ReferenceNode`: material (o do render object, ou um fixo), um objeto
      // fixo (névoa) ou o próprio objeto desenhado.
      const holder = n.isMaterialReferenceNode
        ? (n.material ?? ro.material)
        : (n.object ?? ro.object);
      vigias.push({ holder, properties: n.properties, kind: VigiaKind.Prim });
      if (n.node) saidasDeReferencia.add(n.node);
      continue;
    }
    if (n.isTextureNode || n.type === 'TextureNode') {
      texturas.push(n);
      continue;
    }
    return null;
  }
  // `TextureNode` que é a saída de uma referência já é vigiado por ela (o
  // valor dele é sobrescrito a cada update). Os outros têm textura fixa.
  for (const t of texturas) {
    if (!saidasDeReferencia.has(t)) vigias.push({ holder: t, properties: ['value'], kind: VigiaKind.Prim });
  }
  return vigias;
}

/**
 * Percorre o instantâneo escrevendo (gravação) ou conferindo (desenho direto).
 *
 * Um percurso só para os dois modos: escrever e conferir com códigos
 * separados seria o jeito clássico de os dois divergirem. Conferindo, para no
 * primeiro valor diferente — o caso comum de quem mudou é a matriz, a primeira.
 */
export class SnapshotCursor {
  buf: Float64Array = new Float64Array(0);
  i = 0;
  comparando = false;
  igual = true;

  begin(comparando: boolean, buf?: Float64Array): void {
    this.comparando = comparando;
    this.igual = true;
    this.i = 0;
    if (buf) this.buf = buf;
  }

  /** Número, booleano ou ausente — o caminho quente, sem despacho de tipo de objeto. */
  v(x: unknown): void {
    const n = typeof x === 'number' ? x : x === true ? 1 : x === false ? 0 : AUSENTE;
    if (this.comparando) {
      if (this.buf[this.i] !== n) this.igual = false;
    } else {
      if (this.i >= this.buf.length) {
        const maior = new Float64Array(Math.max(SNAPSHOT_MIN_CAPACITY, this.buf.length * 2));
        maior.set(this.buf);
        this.buf = maior;
      }
      this.buf[this.i] = n;
    }
    this.i++;
  }

  /** Qualquer valor vigiado; `false` = tipo não conferível. */
  valor(x: unknown): boolean {
    if (x === null || x === undefined || typeof x !== 'object') {
      if (typeof x === 'function' || typeof x === 'string' || typeof x === 'symbol' || typeof x === 'bigint') return false;
      this.v(x);
      return true;
    }
    const tmp: number[] = [];
    if (!pushValue(tmp, x)) return false;
    for (let k = 0; k < tmp.length; k++) this.v(tmp[k]);
    return true;
  }
}

/** Capacidade inicial do buffer do instantâneo (cresce dobrando). */
const SNAPSHOT_MIN_CAPACITY = 64;

/** Os campos de pipeline, com acesso LITERAL (no Hermes, `obj[chave]` computada custa bem mais). */
function camposDePipeline(m: Record<string, unknown>, c: SnapshotCursor): void {
  c.v(m['version']); c.v(m['visible']); c.v(m['transparent']); c.v(m['blending']); c.v(m['premultipliedAlpha']);
  c.v(m['blendSrc']); c.v(m['blendDst']); c.v(m['blendEquation']); c.v(m['blendSrcAlpha']); c.v(m['blendDstAlpha']);
  c.v(m['blendEquationAlpha']); c.v(m['colorWrite']); c.v(m['depthWrite']); c.v(m['depthTest']); c.v(m['depthFunc']);
  c.v(m['stencilWrite']); c.v(m['stencilFunc']); c.v(m['stencilFail']); c.v(m['stencilZFail']); c.v(m['stencilZPass']);
  c.v(m['stencilFuncMask']); c.v(m['stencilWriteMask']); c.v(m['stencilRef']); c.v(m['side']); c.v(m['alphaToCoverage']);
  c.v(m['alphaTest']); c.v(m['wireframe']);
}

/** Percorre o instantâneo do render object. `false` = algo não conferível. */
export function walkSnapshot(ro: CleanRoLike, vigias: Vigia[], c: SnapshotCursor): boolean {
  const o = ro.object;
  const m = o.matrixWorld.elements;
  for (let i = 0; i < MATRIX_ELEMENTS; i++) c.v(m[i]);
  if (!c.igual) return true;
  c.v(o.receiveShadow);
  if (o.isInstancedMesh) {
    c.v(o.count ?? 0);
    c.v(o.instanceMatrix?.version);
    c.v(o.instanceColor?.version);
  }
  const g = o.geometry;
  c.v(g.id); c.v(g.drawRange.start); c.v(g.drawRange.count);
  c.v(g.index ? g.index.id : undefined); c.v(g.index ? g.index.version : undefined);
  for (const nome in g.attributes) {
    const a = g.attributes[nome]!;
    c.v(a.id);
    c.v(a.version);
  }
  camposDePipeline(ro.material, c);
  if (!c.igual) return true;
  for (let k = 0; k < vigias.length; k++) {
    const vg = vigias[k]!;
    let valor: unknown = vg.holder;
    const props = vg.properties;
    for (let j = 0; j < props.length; j++) valor = valor === null || valor === undefined ? undefined : (valor as Record<string, unknown>)[props[j]!];
    if (!c.comparando) vg.kind = kindOf(valor);
    if (!c.valor(valor)) return false;
  }
  return true;
}

/** Lê o valor vigiado (caminho de propriedades a partir do dono). */
function lerVigia(vg: Vigia): unknown {
  let valor: unknown = vg.holder;
  const props = vg.properties;
  for (let j = 0; j < props.length; j++) valor = valor === null || valor === undefined ? undefined : (valor as Record<string, unknown>)[props[j]!];
  return valor;
}

type Mat = Record<string, unknown> & {
  version: number; visible: boolean; transparent: boolean; blending: number; premultipliedAlpha: boolean;
  blendSrc: number; blendDst: number; blendEquation: number; colorWrite: boolean; depthWrite: boolean;
  depthTest: boolean; depthFunc: number; stencilWrite: boolean; stencilFunc: number; stencilFail: number;
  stencilZFail: number; stencilZPass: number; stencilFuncMask: number; stencilWriteMask: number; stencilRef: number;
  side: number; alphaToCoverage: boolean; alphaTest: number;
};
type Tex = { id: number; version: number; rotation: number; matrixAutoUpdate: boolean; isTexture?: boolean;
  offset: { x: number; y: number }; repeat: { x: number; y: number }; center: { x: number; y: number } };
type Vec = { x: number; y: number; z: number; w: number; r: number; g: number; b: number };

/**
 * Confere o instantâneo gravado com código LITERAL — sem chamada por campo. É
 * o caminho quente (todo draw direto passa aqui); no Hermes, sem inline, as
 * ~70 chamadas de método do {@link SnapshotCursor} custavam ~15 µs por objeto.
 * Tem de codificar exatamente como {@link walkSnapshot} (o teste confere).
 */
export function quickMatch(ro: CleanRoLike, vigias: Vigia[], inst: Float64Array): boolean {
  return matrixMatch(ro, inst) && restMatch(ro, vigias, inst);
}

/** Só a matriz de mundo (o começo do instantâneo). */
export function matrixMatch(ro: CleanRoLike, inst: Float64Array): boolean {
  const m = ro.object.matrixWorld.elements;
  for (let k = 0; k < MATRIX_ELEMENTS; k++) if (inst[k] !== m[k]) return false;
  return true;
}

/** Tudo menos a matriz: o objeto que só se moveu passa aqui (ver o desenho direto). */
export function restMatch(ro: CleanRoLike, vigias: Vigia[], inst: Float64Array): boolean {
  const o = ro.object;
  let k = MATRIX_ELEMENTS;
  if (inst[k++] !== (o.receiveShadow ? 1 : 0)) return false;
  if (o.isInstancedMesh) {
    if (inst[k++] !== (o.count ?? 0)) return false;
    if (inst[k++] !== prim(o.instanceMatrix?.version)) return false;
    if (inst[k++] !== prim(o.instanceColor?.version)) return false;
  }
  const g = o.geometry;
  if (inst[k++] !== g.id || inst[k++] !== g.drawRange.start || inst[k++] !== g.drawRange.count) return false;
  const idx = g.index;
  if (inst[k++] !== (idx ? idx.id : AUSENTE) || inst[k++] !== (idx ? idx.version : AUSENTE)) return false;
  for (const nome in g.attributes) {
    const a = g.attributes[nome]!;
    if (inst[k++] !== a.id || inst[k++] !== a.version) return false;
  }
  const t = ro.material as Mat;
  if (
    inst[k++] !== t.version || inst[k++] !== (t.visible ? 1 : 0) || inst[k++] !== (t.transparent ? 1 : 0) ||
    inst[k++] !== t.blending || inst[k++] !== (t.premultipliedAlpha ? 1 : 0) || inst[k++] !== t.blendSrc ||
    inst[k++] !== t.blendDst || inst[k++] !== t.blendEquation || inst[k++] !== prim(t['blendSrcAlpha']) ||
    inst[k++] !== prim(t['blendDstAlpha']) || inst[k++] !== prim(t['blendEquationAlpha']) ||
    inst[k++] !== (t.colorWrite ? 1 : 0) || inst[k++] !== (t.depthWrite ? 1 : 0) || inst[k++] !== (t.depthTest ? 1 : 0) ||
    inst[k++] !== t.depthFunc || inst[k++] !== (t.stencilWrite ? 1 : 0) || inst[k++] !== t.stencilFunc ||
    inst[k++] !== t.stencilFail || inst[k++] !== t.stencilZFail || inst[k++] !== t.stencilZPass ||
    inst[k++] !== t.stencilFuncMask || inst[k++] !== t.stencilWriteMask || inst[k++] !== t.stencilRef ||
    inst[k++] !== t.side || inst[k++] !== (t.alphaToCoverage ? 1 : 0) || inst[k++] !== t.alphaTest ||
    inst[k++] !== prim(t['wireframe'])
  ) {
    return false;
  }
  for (let i = 0; i < vigias.length; i++) {
    const vg = vigias[i]!;
    const v = lerVigia(vg);
    switch (vg.kind) {
      case VigiaKind.Prim:
        if ((v !== null && typeof v === 'object') || inst[k++] !== prim(v)) return false;
        break;
      case VigiaKind.Color: {
        const c = v as Vec | null;
        if (!c || inst[k++] !== c.r || inst[k++] !== c.g || inst[k++] !== c.b) return false;
        break;
      }
      case VigiaKind.Texture: {
        const x = v as Tex | null;
        if (
          !x || x.isTexture !== true || inst[k++] !== x.id || inst[k++] !== x.version || inst[k++] !== x.offset.x ||
          inst[k++] !== x.offset.y || inst[k++] !== x.repeat.x || inst[k++] !== x.repeat.y || inst[k++] !== x.rotation ||
          inst[k++] !== x.center.x || inst[k++] !== x.center.y || inst[k++] !== (x.matrixAutoUpdate ? 1 : 0)
        ) {
          return false;
        }
        break;
      }
      case VigiaKind.Vec2: {
        const x = v as Vec | null;
        if (!x || inst[k++] !== x.x || inst[k++] !== x.y) return false;
        break;
      }
      case VigiaKind.Vec3: {
        const x = v as Vec | null;
        if (!x || inst[k++] !== x.x || inst[k++] !== x.y || inst[k++] !== x.z) return false;
        break;
      }
      case VigiaKind.Vec4: {
        const x = v as Vec | null;
        if (!x || inst[k++] !== x.x || inst[k++] !== x.y || inst[k++] !== x.z || inst[k++] !== x.w) return false;
        break;
      }
      default: {
        // Forma rara (matriz): o caminho genérico, que aloca.
        const tmp: number[] = [];
        if (!pushValue(tmp, v)) return false;
        for (let j = 0; j < tmp.length; j++) if (inst[k++] !== tmp[j]) return false;
      }
    }
  }
  return k === inst.length;
}

/** Instantâneo como lista (gravação e testes). `false` = algo não conferível. */
export function snapshot(ro: CleanRoLike, vigias: Vigia[], out: number[]): boolean {
  const c = new SnapshotCursor();
  c.begin(false);
  if (!walkSnapshot(ro, vigias, c)) return false;
  out.length = 0;
  for (let i = 0; i < c.i; i++) out.push(c.buf[i]!);
  return true;
}



// ── Instalação ──────────────────────────────────────────────────────────────

/** O renderer visto por este módulo. */
export interface CleanDrawRendererLike {
  _renderObjectDirect?: (...args: unknown[]) => void;
  _nodes?: {
    updateBefore(ro: unknown): void;
    getNodeFrameForRender(ro: unknown): { renderId: number; updateNode(n: unknown): void };
    getCacheKey(scene: unknown, lightsNode: unknown): unknown;
  };
  _bindings?: { _update(group: unknown, groups: unknown): void };
  _pipelines?: { isReady(ro: unknown): boolean };
  backend?: { draw?: (ro: unknown, info: unknown) => void; updateBinding?: (binding: UniformsGroupLike) => void };
  _currentRenderContext?: unknown;
  _currentRenderBundle?: unknown;
  info?: { calls?: number };
  contextNode?: { version: number };
}

export interface CleanDrawStats {
  /** Desenhos diretos (pulou o caminho do three). */
  direct: number;
  /** Dos diretos, os que só se moveram (plano de transformação aplicado). */
  moved: number;
  /** Desenhos pelo caminho do three. */
  three: number;
  /** Render objects gravados. */
  recorded: number;
  /** Recusados na gravação (nó não conferível, tipo etc.). */
  ineligible: number;
}

export interface CleanDrawFastPath {
  readonly stats: CleanDrawStats;
  uninstall(): void;
}

/** Liga? Padrão do chamador (host); `?nativeMainPass=0` ou `?cleanDraw=0` desligam. */
export function cleanDrawRequested(fallback: boolean): boolean {
  return queryFlagRequested(MAIN_PASS_QUERY_KEY, fallback) && queryFlagRequested(QUERY_KEY, fallback);
}

/**
 * Instala no renderer JÁ inicializado. `null`, sem tocar em nada, se os
 * internos do `three` não tiverem a forma esperada.
 */
export function installCleanDrawFastPath(renderer: CleanDrawRendererLike): CleanDrawFastPath | null {
  const nodes = renderer._nodes;
  const bindings = renderer._bindings;
  const pipelines = renderer._pipelines;
  const backend = renderer.backend;
  const original = renderer._renderObjectDirect;
  const drawOriginal = backend?.draw;
  if (
    !nodes || !bindings || !pipelines || !backend || typeof original !== 'function' || typeof drawOriginal !== 'function' ||
    typeof nodes.getCacheKey !== 'function' || typeof bindings._update !== 'function'
  ) {
    debug('perf', '[cleanDraw] internos do three ausentes: nao instalado');
    return null;
  }
  const stats: CleanDrawStats = { direct: 0, moved: 0, three: 0, recorded: 0, ineligible: 0 };
  /**
   * Gravações por objeto, por contexto de render e por `passId`. O contexto
   * entra na chave para o passe de sombra do `three` (quando roda) não
   * disputar a vaga do passe principal a cada quadro.
   */
  const gravacoes = new WeakMap<object, Map<unknown, Map<unknown, Gravacao>>>();
  const gravacaoDe = (object: object, context: unknown, passId: unknown): Gravacao | undefined =>
    gravacoes.get(object)?.get(context)?.get(passId);
  /** Chave de ambiente memoizada por chamada de render (`info.calls`). */
  const ambiente = { scene: undefined as unknown, lights: undefined as unknown, calls: -1, key: undefined as unknown };
  const chaveDeAmbiente = (r: CleanDrawRendererLike, scene: unknown, lightsNode: unknown): unknown => {
    const calls = r.info?.calls ?? -1;
    if (ambiente.scene !== scene || ambiente.lights !== lightsNode || ambiente.calls !== calls) {
      ambiente.scene = scene;
      ambiente.lights = lightsNode;
      ambiente.calls = calls;
      ambiente.key = nodes.getCacheKey(scene, lightsNode);
    }
    return ambiente.key;
  };
  const cursor = new SnapshotCursor();
  /** Buffer de escrita da gravação, reaproveitado. */
  let escrita: Float64Array = new Float64Array(SNAPSHOT_MIN_CAPACITY);
  /**
   * Grupos compartilhados (câmera, luzes) e nós de render: uma vez por chamada
   * de `render()`, não uma por objeto — valem para todos os objetos dela.
   */
  const feitoNaChamada = new WeakMap<object, number>();
  /** `renderId` do quadro de nós desta chamada de `render()`. */
  const renderIdDaChamada = { calls: -1, renderId: 0 };
  let ultimoDesenhado: CleanRoLike | null = null;
  const relato = { calls: -1 };

  backend.draw = function draw(this: unknown, ro: unknown, info: unknown): void {
    ultimoDesenhado = ro as CleanRoLike;
    drawOriginal.call(this, ro, info);
  };

  /** O que não muda num render object: vigias e plano (ou `null` = inelegível). */
  const preparados = new WeakMap<object, { vigias: Vigia[]; plan: Gravacao['plan'] } | null>();
  /** Render objects descartados pelo `three` (material/geometria `dispose`). */
  const descartados = new WeakSet<object>();

  const preparar = (ro: CleanRoLike): { vigias: Vigia[]; plan: Gravacao['plan'] } | null => {
    let p = preparados.get(ro);
    if (p !== undefined) return p;
    const o = ro.object;
    const monitor = ro.getMonitor();
    const elegivel =
      ro.bundle === null && !monitor.hasNode && !monitor.hasAnimation && !o.isSkinnedMesh && !o.isBatchedMesh &&
      !o.morphTargetInfluences;
    const vigias = elegivel ? watchersFor(ro) : null;
    const plan = vigias ? buildRenderIdPlan(ro as never) : null;
    p = vigias && plan ? { vigias, plan } : null;
    preparados.set(ro, p);
    if (p === null) {
      stats.ineligible++;
    } else {
      const aoDescartar = ro.onDispose;
      ro.onDispose = () => {
        descartados.add(ro);
        aoDescartar();
      };
    }
    return p;
  };

  const gravar = (
    r: CleanDrawRendererLike, ro: CleanRoLike, scene: unknown, lightsNode: unknown, clipping: unknown, passId: unknown,
  ): void => {
    const p = preparar(ro);
    if (p === null) return;
    cursor.begin(false, escrita);
    if (!walkSnapshot(ro, p.vigias, cursor)) return;
    escrita = cursor.buf;
    const n = cursor.i;
    const o = ro.object;
    let porContexto = gravacoes.get(o);
    if (!porContexto) {
      porContexto = new Map();
      gravacoes.set(o, porContexto);
    }
    let porPasse = porContexto.get(r._currentRenderContext);
    if (!porPasse) {
      porPasse = new Map();
      porContexto.set(r._currentRenderContext, porPasse);
    }
    let g = porPasse.get(passId);
    if (g === undefined || g.ro !== ro) {
      g = {
        ro, material: ro.material, context: r._currentRenderContext, passId, lights: lightsNode, clipping,
        envKey: undefined, contextNodeVersion: 0, vigias: p.vigias, instantaneo: new Float64Array(n), plan: p.plan,
      };
      porPasse.set(passId, g);
    }
    // Regravação no lugar: objeto que se move passa por aqui todo quadro.
    g.lights = lightsNode;
    g.clipping = clipping;
    // A mais recente fica no próprio objeto: o caso comum (um contexto, um
    // passe) resolve com uma leitura de campo, sem as três buscas em mapa.
    (o as ComGravacao)._cxGravacao = g;
    g.envKey = chaveDeAmbiente(r, scene, lightsNode);
    g.contextNodeVersion = r.contextNode?.version ?? 0;
    if (g.instantaneo.length !== n) g.instantaneo = new Float64Array(n);
    g.instantaneo.set(escrita.subarray(0, n));
    stats.recorded++;
  };

  const updateBinding = backend.updateBinding?.bind(backend);

  /** O caminho do three, e a (re)gravação de quem ele desenhou. */
  const tresCaminho = (
    r: CleanDrawRendererLike, object: unknown, material: unknown, scene: unknown, camera: unknown, lightsNode: unknown,
    group: unknown, clippingContext: unknown, passId: unknown,
  ): void => {
    ultimoDesenhado = null;
    original.call(r, object, material, scene, camera, lightsNode, group, clippingContext, passId);
    stats.three++;
    const desenhado = ultimoDesenhado as CleanRoLike | null;
    if (desenhado !== null && desenhado.object === object && r._currentRenderBundle === null) {
      gravar(r, desenhado, scene, lightsNode, clippingContext, passId);
    }
  };

  renderer._renderObjectDirect = function renderObjectDirect(
    this: CleanDrawRendererLike,
    object: unknown,
    material: unknown,
    scene: unknown,
    camera: unknown,
    lightsNode: unknown,
    group: unknown,
    clippingContext: unknown,
    passId: unknown,
  ): void {
    const calls = this.info?.calls ?? 0;
    if (calls !== relato.calls) {
      relato.calls = calls;
      if (calls % REPORT_RENDER_CALLS === 0) {
        debug('perf', `[cleanDraw] diretos=${stats.direct} movidos=${stats.moved} three=${stats.three} gravados=${stats.recorded} inelegiveis=${stats.ineligible}`);
      }
    }
    const contexto = this._currentRenderContext;
    let g: Gravacao | undefined;
    if (this._currentRenderBundle === null) {
      g = (object as ComGravacao)._cxGravacao;
      if (g === undefined || g.context !== contexto || g.passId !== passId) g = gravacaoDe(object as object, contexto, passId);
    }
    if (
      g !== undefined && !descartados.has(g.ro) && g.material === material && g.context === this._currentRenderContext &&
      restMatch(g.ro, g.vigias, g.instantaneo) &&
      g.lights === lightsNode && g.clipping === clippingContext && g.ro.geometry === (object as ObjectLike).geometry &&
      g.contextNodeVersion === (this.contextNode?.version ?? 0) &&
      chaveDeAmbiente(this, scene, lightsNode) === g.envKey
    ) {
      const ro = g.ro;
      ro.camera = camera;
      ro.drawRange = (object as ObjectLike).geometry.drawRange;
      ro.group = group;
      // O que o refresh do three garante para o render, deduplicado por ele
      // mesmo: `updateBefore`, nós de render/quadro e grupos compartilhados
      // (câmera, luzes). Sem isso a câmera congela (ADR-0215).
      // `updateBefore` e nós de render são do SHADER: render objects com o
      // mesmo `NodeBuilderState` têm os mesmos nós, então basta o primeiro de
      // cada estado por chamada (são nós RENDER/FRAME — OBJECT é inelegível).
      const estado = ro.getNodeBuilderState() as object;
      if (feitoNaChamada.get(estado) !== calls) {
        feitoNaChamada.set(estado, calls);
        nodes.updateBefore(ro);
        const frame = nodes.getNodeFrameForRender(ro);
        renderIdDaChamada.calls = calls;
        renderIdDaChamada.renderId = frame.renderId;
        const renderNodes = g.plan.renderNodes;
        for (let k = 0; k < renderNodes.length; k++) frame.updateNode(renderNodes[k]);
      } else if (renderIdDaChamada.calls !== calls) {
        renderIdDaChamada.calls = calls;
        renderIdDaChamada.renderId = nodes.getNodeFrameForRender(ro).renderId;
      }
      const shared = g.plan.shared;
      for (let k = 0; k < shared.length; k++) {
        const grupo = shared[k] as object;
        if (feitoNaChamada.get(grupo) === calls) continue;
        feitoNaChamada.set(grupo, calls);
        bindings._update(grupo, g.plan.groups);
      }
      const monitor = ro.getMonitor();
      monitor.renderId = renderIdDaChamada.renderId;
      if (!matrixMatch(ro, g.instantaneo)) {
        // Só a matriz mudou: o que o `TransformOnlyRefresh` (ADR-0290) faz
        // dentro do caminho do three — os nós de objeto e os UBOs do objeto
        // (um `writeBuffer` cada) —, sem o resto da verificação.
        const frame = nodes.getNodeFrameForRender(ro);
        if (updateBinding === undefined || monitor.needsVelocity?.((frame as { renderer?: unknown }).renderer) === true) {
          tresCaminho(this, object, material, scene, camera, lightsNode, group, clippingContext, passId);
          return;
        }
        applyPlan(frame as unknown as NodeFrameLike, g.plan.object, updateBinding);
        const m = (object as ObjectLike).matrixWorld.elements;
        for (let k = 0; k < MATRIX_ELEMENTS; k++) g.instantaneo[k] = m[k]!;
        stats.moved++;
      }
      if (pipelines.isReady(ro)) {
        backend.draw!(ro, this.info);
        stats.direct++;
      }
      return;
    }
    tresCaminho(this, object, material, scene, camera, lightsNode, group, clippingContext, passId);
  };

  debug('perf', '[cleanDraw] instalado');
  return {
    stats,
    uninstall(): void {
      Reflect.deleteProperty(renderer, '_renderObjectDirect');
      backend.draw = drawOriginal;
    },
  };
}
