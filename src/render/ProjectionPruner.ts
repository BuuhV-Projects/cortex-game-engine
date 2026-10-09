/**
 * Poda de subárvores na projeção do `three` (SPEC-0326, ADR-0327).
 *
 * O `Renderer._projectObject` do `three` visita TODO nó com `visible !== false`.
 * Uma subárvore em que nada é desenhável pela câmera — só grupos, ou malhas
 * noutra camada (as peças dos bonecos do DDD 61 ficam na camada 27 e são
 * desenhadas por um lote instanciado) — é visitada nó a nó para não empurrar
 * nada na RenderList.
 *
 * Esta classe acha essas subárvores e, no passe da câmera do jogo, esconde
 * (`visible = false`) a raiz delas só durante a projeção, devolvendo o
 * `visible` logo depois. A RenderList sai IDÊNTICA — o que some é só a visita.
 * A janela do `visible` alterado é a montagem da RenderList da câmera:
 *
 * - a passada de sombra (do `three` ou a nativa) roda depois e vê a cena
 *   intacta;
 * - o espelho de cena nativo (`NativeSceneMirror`) confere `visible` no
 *   `update`, antes do render, e não percebe a poda;
 * - o `scene.onBeforeRender` (onde o lote de bonecos lê o `visible` das
 *   figuras) também roda antes da projeção.
 *
 * Poda por frustum (esfera por subárvore) foi tentada e retirada: filho que se
 * move dentro de um grupo parado deixa a esfera velha e o objeto some (medido
 * — ver SPEC-0326), e o ganho era ~1/6 do desta poda exata.
 */
import type { Camera, Object3D } from 'three';
import { debug } from '../core/debug.js';

/**
 * Menor subárvore que vale uma candidata: a raiz continua visitada, então
 * podar menos de 3 nós poupa no máximo 1 visita.
 */
export const MIN_SUBTREE_NODES = 3;
/**
 * Candidatas remedidas por passe, em rodízio: pega malha que trocou de camada
 * (ou ganhou desenhável) sem evento de estrutura.
 */
export const REFRESH_PER_PASS = 4;
/**
 * Passes entre duas remontagens completas. Filho novo FORA de uma candidata
 * não é risco — sem candidata o `three` faz o trabalho de sempre —, só fica
 * sem poda até a próxima remontagem; por isso não precisa de evento.
 */
export const REBUILD_EVERY_PASSES = 120;
/** Passes entre duas linhas de estatística no `debug('perf')`. */
const STATS_EVERY_PASSES = 300;
/** `measureSubtree` para subárvore que o `three` não pode pular. */
const NOT_PRUNABLE = -1;

/** Subárvore sem nada desenhável pela câmera: raiz + quantos nós ela tem. */
interface Candidate {
  root: Object3D;
  nodes: number;
}

/** O pedaço do `Renderer` do `three` que a poda embrulha. */
export interface ProjectingRenderer {
  _projectObject(object: Object3D, camera: Camera, ...rest: unknown[]): void;
}

type ProjectFn = ProjectingRenderer['_projectObject'];

/** Flags de tipo que o `three` põe nas instâncias (todas opcionais). */
interface TypedNode {
  isLight?: boolean;
  isLOD?: boolean;
  isBundleGroup?: boolean;
  isClippingGroup?: boolean;
  isMesh?: boolean;
  isLine?: boolean;
  isPoints?: boolean;
  isSprite?: boolean;
  isScene?: boolean;
}

/** Nó em que a visita do `three` faz algo para esta câmera. */
function doesWork(node: Object3D, layerMask: number): boolean {
  const n = node as unknown as TypedNode;
  // Luz e LOD agem mesmo fora da tela; grupos especiais trocam a RenderList.
  if (n.isLight || n.isLOD || n.isBundleGroup || n.isClippingGroup) return true;
  const drawable = n.isMesh || n.isLine || n.isPoints || n.isSprite;
  return Boolean(drawable) && (node.layers.mask & layerMask) !== 0;
}

/** Rascunho de {@link measureSubtree} (roda no rodízio: sem alocar). */
const _stack: Object3D[] = [];

/**
 * Quantos nós a subárvore tem, ou {@link NOT_PRUNABLE} se algum deles faz
 * trabalho na projeção de uma câmera com máscara `layerMask` (desenhável na
 * camada dela, luz, LOD...). Malha de OUTRA camada não conta: o `three` a
 * visita e a descarta no `layers.test`.
 */
export function measureSubtree(root: Object3D, layerMask: number): number {
  const stack = _stack;
  stack.length = 0;
  stack.push(root);
  let count = 0;
  while (stack.length > 0) {
    const node = stack.pop() as Object3D;
    if (doesWork(node, layerMask)) {
      stack.length = 0; // não segura referência a nós da cena
      return NOT_PRUNABLE;
    }
    count++;
    for (let i = 0; i < node.children.length; i++) stack.push(node.children[i]);
  }
  return count;
}

/**
 * Poda, na projeção do `three`, as subárvores sem nada desenhável pela câmera
 * do jogo (SPEC-0326).
 *
 * @example
 * const pruner = new ProjectionPruner();
 * pruner.attach(renderer.threeRenderer);
 * // a cada quadro, antes do render:
 * pruner.camera = cameraDoJogo; // null desliga (editor, aquecimento)
 */
export class ProjectionPruner {
  /** Câmera cujo passe é podado; qualquer outra (sombra, pós) passa intacta. */
  camera: Camera | null = null;

  private _renderer: ProjectingRenderer | null = null;
  private _wrapper: ProjectFn | null = null;
  private _scene: Object3D | null = null;
  /** Máscara de camadas da câmera com que as candidatas foram medidas. */
  private _layerMask = 0;
  private _dirty = true;
  private _candidates: Candidate[] = [];
  private _refreshCursor = 0;
  private _sinceRebuild = 0;
  private readonly _hidden: Object3D[] = [];
  private readonly _subscribed = new WeakSet<Object3D>();
  private readonly _onStructure = (): void => {
    this._dirty = true;
  };
  private _passes = 0;
  private _skipped = 0;
  private _rebuilds = 0;
  private _ms = 0;

  /** Quantas candidatas há (para teste e diagnóstico). */
  get candidateCount(): number {
    return this._candidates.length;
  }

  /** Embrulha o `_projectObject` da instância. Idempotente. */
  attach(renderer: ProjectingRenderer): void {
    if (this._renderer) return;
    const pruner = this;
    // O original é resolvido NA CHAMADA pela cadeia de protótipos: uma sonda
    // que embrulhe o protótipo depois (RenderPhaseProbe) continua valendo.
    const proto = Object.getPrototypeOf(renderer) as ProjectingRenderer;
    const wrapper: ProjectFn = function (this: ProjectingRenderer, object, camera, ...rest) {
      const original = proto._projectObject;
      if (camera !== pruner.camera || !(object as unknown as TypedNode).isScene) {
        original.call(this, object, camera, ...rest);
        return;
      }
      pruner._hide(object, camera);
      // A recursão do `three` chama `this._projectObject`: aponta direto pro
      // original durante a travessia, sem passar por este embrulho a cada nó.
      this._projectObject = original;
      try {
        original.call(this, object, camera, ...rest);
      } finally {
        this._projectObject = wrapper;
        pruner._restore();
      }
    };
    this._renderer = renderer;
    this._wrapper = wrapper;
    renderer._projectObject = wrapper;
  }

  /** Desfaz o {@link attach}. */
  detach(): void {
    const r = this._renderer;
    if (r && r._projectObject === this._wrapper) delete (r as Partial<ProjectingRenderer>)._projectObject;
    this._renderer = null;
    this._wrapper = null;
  }

  /** Força remontar as candidatas no próximo passe. */
  invalidate(): void {
    this._dirty = true;
  }

  private _hide(scene: Object3D, camera: Camera): void {
    const t0 = performance.now();
    if (
      scene !== this._scene ||
      this._dirty ||
      camera.layers.mask !== this._layerMask ||
      ++this._sinceRebuild >= REBUILD_EVERY_PASSES
    ) {
      this._layerMask = camera.layers.mask;
      this._rebuild(scene);
    }
    this._refreshSlice();
    for (let i = 0; i < this._candidates.length; i++) {
      const c = this._candidates[i];
      if (!c.root.visible) continue;
      c.root.visible = false;
      this._hidden.push(c.root);
      this._skipped += c.nodes - 1;
    }
    this._ms += performance.now() - t0;
    this._stats();
  }

  private _restore(): void {
    for (let i = 0; i < this._hidden.length; i++) this._hidden[i].visible = true;
    this._hidden.length = 0;
  }

  private _rebuild(scene: Object3D): void {
    this._scene = scene;
    this._dirty = false;
    this._rebuilds++;
    this._sinceRebuild = 0;
    this._candidates = [];
    this._refreshCursor = 0;
    for (let i = 0; i < scene.children.length; i++) this._collect(scene.children[i]);
  }

  private _collect(node: Object3D): void {
    // Subárvore escondida: o `three` já não entra nela. Se reaparecer, fica sem
    // poda (seguro) até a próxima remontagem.
    if (!node.visible) return;
    const count = measureSubtree(node, this._layerMask);
    if (count >= MIN_SUBTREE_NODES) {
      this._candidates.push({ root: node, nodes: count });
      this._subscribe(node);
      return;
    }
    // Pequena demais para compensar.
    if (count !== NOT_PRUNABLE) return;
    for (let i = 0; i < node.children.length; i++) this._collect(node.children[i]);
  }

  /**
   * Escuta mudança de estrutura DENTRO de uma candidata (o `three` não
   * propaga): um filho novo ali pode ser desenhável.
   */
  private _subscribe(root: Object3D): void {
    root.traverse((node) => {
      if (this._subscribed.has(node)) return;
      this._subscribed.add(node);
      node.addEventListener('childadded', this._onStructure);
      node.addEventListener('childremoved', this._onStructure);
    });
  }

  /** Remede algumas candidatas por passe (malha que trocou de camada sem evento). */
  private _refreshSlice(): void {
    const n = this._candidates.length;
    for (let k = 0; k < REFRESH_PER_PASS && k < n; k++) {
      this._refreshCursor = (this._refreshCursor + 1) % n;
      const c = this._candidates[this._refreshCursor];
      if (measureSubtree(c.root, this._layerMask) !== c.nodes) this._dirty = true;
    }
  }

  private _stats(): void {
    if (++this._passes < STATS_EVERY_PASSES) return;
    const p = this._passes;
    debug(
      'perf',
      `[projectionPrune] candidatas=${this._candidates.length} nosPoupados/q=${(this._skipped / p).toFixed(0)} ` +
        `ms/q=${(this._ms / p).toFixed(3)} remontagens=${this._rebuilds}`,
    );
    this._passes = this._skipped = this._rebuilds = 0;
    this._ms = 0;
  }
}

/** `?projectionPrune=0` desliga a poda (A/B); o padrão é ligada no host nativo. */
export function projectionPruneEnabled(nativeHost: boolean): boolean {
  try {
    if (typeof location !== 'undefined' && (location.search ?? '').includes('projectionPrune=0')) return false;
  } catch {
    // host sem location: segue o padrão
  }
  return nativeHost;
}
