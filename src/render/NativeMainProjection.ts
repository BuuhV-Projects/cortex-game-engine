/**
 * Projeção do passe principal em C++ (SPEC-0332, etapa (a) do ADR-0330).
 *
 * O `_projectObject` do `three` percorre a árvore visível em JS (~1,5–2,2 ms
 * por quadro no DDD 61, ~10 mil nós). Aqui a travessia, a visibilidade herdada,
 * o culling pela esfera da geometria e o `z` de ordenação rodam no host, a
 * partir do `SceneMirror`; o JS recebe a lista de candidatos e faz só o que
 * depende de JS: camadas, material (array/grupo, `material.visible`) e o
 * `renderList.push` — os mesmos argumentos que o `three` passaria.
 *
 * A ordem final da RenderList é a do sort do `three` (`groupOrder`,
 * `renderOrder`, `z`, `id`), uma ordem TOTAL — por isso a ordem de inserção
 * diferente da travessia em profundidade não muda a imagem. Com
 * `sortObjects = false` a inserção importaria, e a projeção é recusada.
 *
 * Recusa (o `three` projeta o quadro): cena que não é a espelhada, chamada
 * aninhada (`groupOrder` ≠ 0), `ArrayCamera`, espelho desligado, host sem a
 * ponte, ou nó alcançável que o C++ não reproduz (`LOD`, `ClippingGroup`,
 * `BundleGroup`, `Group` com `renderOrder`).
 */
import type { Camera, Material, Object3D } from 'three';
import { Frustum, Matrix4, Vector4 } from 'three';
import { debug } from '../core/debug.js';
import { mainPassBridge, type MainPassBridge, type NativeSceneMirror } from '../core/NativeSceneMirror.js';
import { MainPassKind } from './MainPassKind.js';
import { queryFlagRequested } from './TransformOnlyRefresh.js';

const QUERY_KEY = 'nativeProjection=';
/** Interruptor geral do passe principal nativo (ADR-0330). */
const MAIN_PASS_QUERY_KEY = 'nativeMainPass=';
const MATRIX_ELEMENTS = 16;
const FRUSTUM_PLANES = 6;
const FLOATS_PER_PLANE = 4;
/** Código de recusa do host (`kProjectRefused`): o índice do nó vai em `indices[0]`. */
const PROJECT_REFUSED = -1;

/** O que se lê de um candidato. */
type Candidato = Object3D & {
  geometry: { groups: { materialIndex?: number }[]; boundingSphere: { center: unknown } | null; computeBoundingSphere(): void };
  material: Material | Material[];
  isSprite?: boolean;
};

/** A parte da RenderList do `three` que a projeção usa. */
export interface RenderListLike {
  push(object: Object3D, geometry: unknown, material: Material, groupOrder: number, z: number, group: unknown, clippingContext: unknown): unknown;
  pushLight(light: Object3D): void;
}

/** Os internos do renderer que este módulo embrulha/lê. */
export interface ProjectingRendererLike {
  _projectObject?: (object: Object3D, camera: Camera, groupOrder: number, renderList: RenderListLike, clippingContext: unknown) => void;
  sortObjects?: boolean;
}

/** Contadores para o trace e os testes. */
export interface NativeProjectionStats {
  /** Projeções feitas em C++. */
  native: number;
  /** Projeções da cena espelhada devolvidas ao `three` (recusa do host ou pré-condição). */
  refused: number;
  /** Candidatos do último quadro nativo. */
  candidates: number;
}

/** Handle da projeção instalada. */
export interface NativeProjection {
  readonly stats: NativeProjectionStats;
  uninstall(): void;
}

/** Liga? Padrão do chamador (host nativo); `?nativeMainPass=0` ou `?nativeProjection=0` desligam. */
export function nativeProjectionRequested(fallback: boolean): boolean {
  return queryFlagRequested(MAIN_PASS_QUERY_KEY, fallback) && queryFlagRequested(QUERY_KEY, fallback);
}

/**
 * Faz a projeção da cena espelhada pelo host. `false` = recusou, e quem chamou
 * deixa o `three` projetar. Exportada para os testes montarem a ponte falsa.
 */
export class MainProjector {
  private readonly _frustum = new Frustum();
  private readonly _viewProjection = new Matrix4();
  private readonly _vp = new Float64Array(MATRIX_ELEMENTS);
  private readonly _planes = new Float64Array(FRUSTUM_PLANES * FLOATS_PER_PLANE);
  private readonly _depth = new Vector4();
  private _indices = new Int32Array(0);
  private _depths = new Float64Array(0);
  private _lastRefusal = '';

  constructor(
    private readonly _mirror: NativeSceneMirror,
    private readonly _bridge: MainPassBridge,
    private readonly _stats: NativeProjectionStats,
  ) {}

  project(camera: Camera, renderList: RenderListLike, clippingContext: unknown): boolean {
    const view = this._mirror._projectionView();
    const capacidade = view.kinds.length;
    if (this._indices.length < capacidade) {
      this._indices = new Int32Array(capacidade);
      this._depths = new Float64Array(capacidade);
    }

    // Escrita feita depois do `update` do quadro (dentro do render) entra agora.
    this._mirror.syncPending();
    this._viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const comCoordenadas = camera as Camera & { coordinateSystem?: number; reversedDepth?: boolean };
    // O mesmo frustum do `_renderScene` do `three`: com o `coordinateSystem` da
    // câmera (WebGPU: z de 0 a 1) — a convenção do WebGL deslocaria o near.
    this._frustum.setFromProjectionMatrix(
      this._viewProjection,
      comCoordenadas.coordinateSystem,
      comCoordenadas.reversedDepth,
    );
    escreverPlanos(this._frustum, this._planes);
    this._vp.set(this._viewProjection.elements);

    const n = this._bridge.project(this._planes, this._vp, this._indices, this._depths);
    if (n < 0) {
      this._recusar(n === PROJECT_REFUSED ? `no ${this._indices[0]} nao reproduzivel` : `codigo ${n}`, view.nodes, n);
      return false;
    }

    const camadas = camera.layers;
    for (let k = 0; k < n; k++) {
      const slot = this._indices[k]!;
      const objeto = view.nodes[slot] as Candidato | undefined;
      if (!objeto || !objeto.layers.test(camadas)) continue;
      const tipo = view.kinds[slot];
      if (tipo === MainPassKind.Light) {
        renderList.pushLight(objeto);
        continue;
      }
      let z = this._depths[k]!;
      if (tipo === MainPassKind.JsCull) {
        // O teste exato do `three`, com a esfera do OBJETO (instâncias, rig).
        if (objeto.frustumCulled && !this._dentro(objeto)) continue;
        z = this._zDoThree(objeto);
      }
      empurrar(renderList, objeto, z, clippingContext);
    }
    this._stats.native++;
    this._stats.candidates = n;
    return true;
  }

  private _dentro(objeto: Candidato): boolean {
    return objeto.isSprite
      ? this._frustum.intersectsSprite(objeto as never)
      : this._frustum.intersectsObject(objeto);
  }

  /** O `z` que o `_projectObject` calcularia para quem o C++ não cortou. */
  private _zDoThree(objeto: Candidato): number {
    const v = this._depth;
    if (objeto.isSprite) {
      v.set(0, 0, 0, 1).applyMatrix4(objeto.matrixWorld);
    } else {
      if (objeto.geometry.boundingSphere === null) objeto.geometry.computeBoundingSphere();
      v.copy(objeto.geometry.boundingSphere!.center as Vector4).applyMatrix4(objeto.matrixWorld);
    }
    return v.applyMatrix4(this._viewProjection).z;
  }

  private _recusar(motivo: string, nodes: readonly (Object3D | undefined)[], codigo: number): void {
    this._stats.refused++;
    // Só relata quando o motivo muda: recusa é por quadro.
    const relato = codigo === PROJECT_REFUSED ? `${motivo} (${nodes[this._indices[0]!]?.type ?? '?'})` : motivo;
    if (relato === this._lastRefusal) return;
    this._lastRefusal = relato;
    debug('perf', `[nativeProjection] recusado: ${relato}`);
  }
}

/**
 * O `renderList.push` do `_projectObject`, com a mesma regra de material:
 * em array, um item por grupo da geometria cujo material existe e é visível.
 */
function empurrar(renderList: RenderListLike, objeto: Candidato, z: number, clippingContext: unknown): void {
  const { geometry, material } = objeto;
  if (Array.isArray(material)) {
    const grupos = geometry.groups;
    for (let i = 0; i < grupos.length; i++) {
      const grupo = grupos[i]!;
      const doGrupo = material[grupo.materialIndex ?? 0];
      if (doGrupo && doGrupo.visible) renderList.push(objeto, geometry, doGrupo, 0, z, grupo, clippingContext);
    }
  } else if (material.visible) {
    renderList.push(objeto, geometry, material, 0, z, null, clippingContext);
  }
}

/** Achata os 6 planos em doubles (a ponte é `double`, regra da SPEC-0234). */
function escreverPlanos(frustum: Frustum, destino: Float64Array): void {
  for (let i = 0; i < FRUSTUM_PLANES; i++) {
    const plano = frustum.planes[i]!;
    const base = i * FLOATS_PER_PLANE;
    destino[base] = plano.normal.x;
    destino[base + 1] = plano.normal.y;
    destino[base + 2] = plano.normal.z;
    destino[base + 3] = plano.constant;
  }
}

/**
 * Embrulha o `_projectObject` do renderer JÁ inicializado. Devolve `null` sem
 * tocar em nada se o host não publica a ponte ou se a forma do `three` mudou.
 */
export function installNativeProjection(
  renderer: ProjectingRendererLike,
  mirror: NativeSceneMirror,
  bridge: MainPassBridge | undefined = mainPassBridge(),
): NativeProjection | null {
  const original = renderer._projectObject;
  if (!bridge || typeof original !== 'function') {
    debug('perf', '[nativeProjection] host sem __cortexMainPass ou three sem _projectObject: nao instalado');
    return null;
  }
  const stats: NativeProjectionStats = { native: 0, refused: 0, candidates: 0 };
  const projector = new MainProjector(mirror, bridge, stats);
  const hadOwn = Object.prototype.hasOwnProperty.call(renderer, '_projectObject');

  renderer._projectObject = function projectObject(
    this: ProjectingRendererLike,
    object: Object3D,
    camera: Camera,
    groupOrder: number,
    renderList: RenderListLike,
    clippingContext: unknown,
  ): void {
    const raiz = groupOrder === 0 && mirror.installed && object === mirror.root;
    if (raiz && this.sortObjects !== false && !(camera as Camera & { isArrayCamera?: boolean }).isArrayCamera) {
      if (projector.project(camera, renderList, clippingContext)) return;
    } else if (raiz) {
      stats.refused++;
    }
    original.call(this, object, camera, groupOrder, renderList, clippingContext);
  };

  debug('perf', '[nativeProjection] instalado');
  return {
    stats,
    uninstall(): void {
      if (hadOwn) renderer._projectObject = original;
      else Reflect.deleteProperty(renderer, '_projectObject');
    },
  };
}
