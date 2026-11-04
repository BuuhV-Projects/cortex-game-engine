/**
 * Instantâneo numérico do desenho direto (SPEC-0333, passo b.1 do ADR-0330): o que um render object
 * lê, gravado e conferido sem chamada por campo. Saiu do `CleanDrawFastPath.ts` na divisão da
 * SPEC-0682 (SPEC-0668); o `CleanDrawFastPath.ts` reexporta o que era público.
 */
import { modelNormalMatrix, modelWorldMatrixInverse } from 'three/tsl';
import type { buildRenderIdPlan } from './RenderIdRefresh.js';
import type { ServerInstance } from './RenderServer.js';

const UPDATE_OBJECT = 'object';
export const MATRIX_ELEMENTS = 16;
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

export interface NoLike {
  type?: string;
  scope?: string;
  properties?: string[];
  object?: unknown;
  material?: unknown;
  isMaterialReferenceNode?: boolean;
  isTextureNode?: boolean;
  node?: unknown;
  group?: { shared?: boolean } | null;
  value?: unknown;
  getUpdateType(): string;
  getUpdateBeforeType?(): string;
  getUpdateAfterType?(): string;
}

export interface GeometryLike {
  id: number;
  attributes: Record<string, { id: number; version: number }>;
  index: { id: number; version: number } | null;
  drawRange: { start: number; count: number };
}

export interface ObjectLike {
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
export interface Vigia {
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
export type ComGravacao = { _cxGravacao?: Gravacao };

/** O que se grava de um render object. */
export interface Gravacao {
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
  /** Referências de grupo compartilhado (névoa): atualizadas uma vez por render (RS1a). */
  sharedRefs: NoLike[];
  /** Instância do RenderServer (RS1b): `undefined` = recalcular; refeita a cada gravação. */
  server?: ServerInstance | null;
}

/**
 * Os vigias de um render object, ou `null` se algum nó de objeto não é
 * conferível. Exportada para os testes.
 *
 * Com `sharedRefs` (RS1a, SPEC-0425), a referência cujo uniforme mora num grupo
 * COMPARTILHADO (a névoa: `setGroup(renderGroup)` no `three`) vai para essa
 * lista em vez de virar vigia: o valor é um só para a chamada inteira, então
 * quem desenha direto o atualiza uma vez por render — e a troca de cor da
 * névoa deixa de derrubar todo objeto para o caminho do `three`.
 */
export function watchersFor(ro: CleanRoLike, sharedRefs?: NoLike[]): Vigia[] | null {
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
      if (sharedRefs && !n.isMaterialReferenceNode && n.object && n.group?.shared === true) {
        sharedRefs.push(n);
        continue;
      }
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

/** O que não muda num render object: vigias, plano e referências por render. */
export interface Preparado {
  vigias: Vigia[];
  plan: Gravacao['plan'];
  sharedRefs: NoLike[];
}

/** Capacidade inicial do buffer do instantâneo (cresce dobrando). */
export const SNAPSHOT_MIN_CAPACITY = 64;

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
