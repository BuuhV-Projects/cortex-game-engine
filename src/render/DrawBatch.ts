/**
 * Lote de desenhos diretos (SPEC-0333, passo b.2 do ADR-0330).
 *
 * O desenho direto da b.1 ainda chamava o `backend.draw` do `three` por
 * objeto: ~9 µs de estado em JS (`getBindings`, `getVertexBuffers`,
 * `currentSets`) e 3–8 travessias de ponte. Aqui a RECEITA do render object —
 * os mesmos handles de GPU que o `three` usou no último desenho dele — é
 * gravada no host uma vez (`__cortexDrawBatch.record`), e uma sequência
 * contígua de desenhos diretos sai numa chamada só (`flush`), com a
 * eliminação de estado redundante em C++.
 *
 * Contrato com o `three`: qualquer desenho dele no meio exige despachar o lote
 * ANTES (a ordem da RenderList é a ordem na tela — transparentes inclusive), e
 * depois de despachar o cache de estado do encoder do `three` (`currentSets`)
 * é zerado, porque o host mexeu no encoder sem ele saber.
 */
import { debug } from '../core/debug.js';

/** Inteiros por comando (ver `kCommandInts` em `draw_batch.h`). */
const COMMAND_INTS = 4;
/** Comandos iniciais do buffer (cresce dobrando). */
const INITIAL_COMMANDS = 256;
/** Receita inválida (`kNoRecipe`). */
const NO_RECIPE = -1;

/** A ponte do host; ausente no browser e em host antigo. */
export interface DrawBatchBridge {
  record(pipeline: unknown, groups: unknown[], vertexBuffers: unknown[], index: unknown, index32: boolean): number;
  release(id: number): void;
  flush(pass: unknown, commands: Int32Array, count: number): number;
}

export function drawBatchBridge(): DrawBatchBridge | undefined {
  const api = (globalThis as { __cortexDrawBatch?: DrawBatchBridge }).__cortexDrawBatch;
  return typeof api?.flush === 'function' ? api : undefined;
}

// ── Formas mínimas dos internos do three 0.184 ──────────────────────────────

interface AttributeLike {
  array: ArrayLike<number>;
}

export interface BatchRoLike {
  object: { isBatchedMesh?: boolean };
  material: { stencilWrite?: boolean };
  pipeline: unknown;
  context: unknown;
  camera: { isArrayCamera?: boolean } | unknown;
  getBindings(): { bindings: { groupNode?: { shared?: boolean } }[] }[];
  getVertexBuffers(): unknown[];
  getIndex(): AttributeLike | null;
  getIndirect(): unknown;
  getDrawParameters(): { vertexCount: number; firstVertex: number; instanceCount: number } | null;
}

export interface BatchBackendLike {
  get(object: unknown): Record<string, unknown>;
}

export interface BatchInfoLike {
  update(object: unknown, count: number, instanceCount: number): void;
}

/** A receita de um render object, do lado JS. */
interface Receita {
  id: number;
  pipeline: unknown;
  /** Handles de GPU dos grupos, por índice — os compartilhados são reconferidos. */
  grupos: unknown[];
  /** Índices dos grupos compartilhados (câmera, luzes): o `three` pode recriá-los. */
  compartilhados: number[];
  vertexBuffers: unknown[];
  index: unknown;
}

export interface DrawBatchStats {
  /** Desenhos que saíram pelo lote. */
  batched: number;
  /** Chamadas de `flush` (sequências contíguas). */
  flushes: number;
  /** Receitas gravadas no host. */
  recorded: number;
  /** Desenhos diretos que não puderam ir em lote (indireto, stencil, oclusão...). */
  unbatchable: number;
}

/**
 * O lote. Um por renderer; `add` acumula, `flush` despacha. Quem chama garante
 * o `flush` antes de qualquer desenho do `three`.
 */
export class DrawBatch {
  readonly stats: DrawBatchStats = { batched: 0, flushes: 0, recorded: 0, unbatchable: 0 };
  private _commands = new Int32Array(INITIAL_COMMANDS * COMMAND_INTS);
  private _count = 0;
  private _pass: unknown = null;
  private _contextData: Record<string, unknown> | null = null;
  private readonly _receitas = new WeakMap<object, Receita>();

  constructor(
    private readonly _bridge: DrawBatchBridge,
    private readonly _backend: BatchBackendLike,
  ) {}

  /**
   * (Re)grava a receita do render object a partir do que o `three` acabou de
   * usar para desenhá-lo. Só atravessa a ponte quando algum handle mudou.
   */
  capture(ro: BatchRoLike): void {
    const r = this._lerReceita(ro);
    const atual = this._receitas.get(ro);
    if (r === null) {
      if (atual) this._soltar(ro, atual);
      return;
    }
    if (atual && mesmaReceita(atual, r)) return;
    if (atual) this._soltar(ro, atual);
    const indice = ro.getIndex();
    r.id = this._bridge.record(r.pipeline, r.grupos, r.vertexBuffers, r.index, indice !== null && !(indice.array instanceof Uint16Array));
    if (r.id === NO_RECIPE) return;
    this._receitas.set(ro, r);
    this.stats.recorded++;
  }

  /**
   * Acumula o desenho direto. `false` = não dá para ir em lote — quem chama
   * despacha o lote e desenha pelo `three`.
   */
  add(ro: BatchRoLike, info: BatchInfoLike): boolean {
    const receita = this._receitas.get(ro);
    if (receita === undefined) return false;
    const dadosDoContexto = this._backend.get(ro.context);
    const pass = dadosDoContexto['currentPass'];
    if (!pass || dadosDoContexto['occlusionQuerySet'] !== undefined) {
      this.stats.unbatchable++;
      return false;
    }
    // Os grupos compartilhados podem ter sido recriados pelo `_update` do
    // quadro (textura de sombra nova, luzes): receita velha = desenho errado.
    const bindings = ro.getBindings();
    for (let k = 0; k < receita.compartilhados.length; k++) {
      const i = receita.compartilhados[k]!;
      if (this._backend.get(bindings[i])['group'] !== receita.grupos[i]) return false;
    }
    const params = ro.getDrawParameters();
    if (params === null) return true; // o `three` também não desenha nada
    if (pass !== this._pass) this.flush();
    this._pass = pass;
    this._contextData = dadosDoContexto;
    this._push(receita.id, params.vertexCount, params.instanceCount, params.firstVertex);
    info.update(ro.object, params.vertexCount, params.instanceCount);
    return true;
  }

  /** Despacha o que está acumulado e zera o cache de estado do encoder do `three`. */
  flush(): void {
    if (this._count === 0) return;
    const desenhados = this._bridge.flush(this._pass, this._commands, this._count);
    if (desenhados < 0) debug('perf', `[drawBatch] flush recusado (${this._count} comandos)`);
    this.stats.batched += this._count;
    this.stats.flushes++;
    this._count = 0;
    const dados = this._contextData;
    if (dados) dados['currentSets'] = { attributes: {}, bindingGroups: [], pipeline: null, index: null };
  }

  /** O render object foi descartado pelo `three`: a receita sai do host. */
  forget(ro: object): void {
    const r = this._receitas.get(ro);
    if (r) this._soltar(ro, r);
  }

  private _soltar(ro: object, r: Receita): void {
    // O id pode estar num comando ainda não despachado.
    this.flush();
    this._bridge.release(r.id);
    this._receitas.delete(ro);
  }

  private _push(id: number, count: number, instances: number, first: number): void {
    const base = this._count * COMMAND_INTS;
    if (base + COMMAND_INTS > this._commands.length) {
      const maior = new Int32Array(this._commands.length * 2);
      maior.set(this._commands);
      this._commands = maior;
    }
    const c = this._commands;
    c[base] = id;
    c[base + 1] = count;
    c[base + 2] = instances;
    c[base + 3] = first;
    this._count++;
  }

  /** Os handles que o `_draw` do `three` usaria; `null` = não vai em lote. */
  private _lerReceita(ro: BatchRoLike): Receita | null {
    if (ro.object.isBatchedMesh || ro.getIndirect() !== null) return null;
    if ((ro.camera as { isArrayCamera?: boolean } | null)?.isArrayCamera) return null;
    // Stencil: o `three` seta a referência por material no encoder.
    if (ro.material.stencilWrite === true) return null;
    const dadosDoPipeline = this._backend.get(ro.pipeline);
    if (dadosDoPipeline['error'] === true || !dadosDoPipeline['pipeline']) return null;
    const grupos: unknown[] = [];
    const compartilhados: number[] = [];
    const bindings = ro.getBindings();
    for (let i = 0; i < bindings.length; i++) {
      const g = this._backend.get(bindings[i])['group'];
      if (!g) return null;
      grupos.push(g);
      if (bindings[i]!.bindings[0]?.groupNode?.shared === true) compartilhados.push(i);
    }
    const vertexBuffers: unknown[] = [];
    for (const vb of ro.getVertexBuffers()) {
      const b = this._backend.get(vb)['buffer'];
      if (!b) return null;
      vertexBuffers.push(b);
    }
    const indice = ro.getIndex();
    let index: unknown = null;
    if (indice !== null) {
      index = this._backend.get(indice)['buffer'];
      if (!index) return null;
    }
    return { id: NO_RECIPE, pipeline: dadosDoPipeline['pipeline'], grupos, compartilhados, vertexBuffers, index };
  }
}

function mesmaReceita(a: Receita, b: Receita): boolean {
  if (a.pipeline !== b.pipeline || a.index !== b.index) return false;
  if (a.grupos.length !== b.grupos.length || a.vertexBuffers.length !== b.vertexBuffers.length) return false;
  for (let i = 0; i < a.grupos.length; i++) if (a.grupos[i] !== b.grupos[i]) return false;
  for (let i = 0; i < a.vertexBuffers.length; i++) if (a.vertexBuffers[i] !== b.vertexBuffers[i]) return false;
  return true;
}
