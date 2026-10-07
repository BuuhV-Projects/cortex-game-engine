/**
 * Poda de subárvores na projeção do `three` (SPEC-0326).
 *
 * O `Renderer._projectObject` do `three` visita TODO nó com `visible !== false`
 * e testa cada malha contra o frustum, uma por uma. Uma subárvore compacta e
 * rígida (um ônibus, uma loja, um poste com luminária) que está inteira fora da
 * câmera é visitada nó a nó só para nada entrar na RenderList.
 *
 * Esta classe guarda, para cada subárvore candidata, uma esfera no espaço LOCAL
 * da raiz. No passe da câmera de jogo, antes de o `three` projetar a cena, ela
 * testa a esfera de cada candidata e esconde (`visible = false`) a raiz das que
 * estão fora; logo depois da projeção devolve o `visible` original. A janela em
 * que o `visible` fica alterado é SÓ a montagem da RenderList da câmera:
 *
 * - a passada de sombra (do `three` ou a nativa) roda depois e vê a cena
 *   intacta — caster fora da câmera mas dentro do frustum da luz continua
 *   projetando sombra;
 * - o espelho de cena nativo (`NativeSceneMirror`) já leu o `visible` no
 *   `update`, antes do render, e não percebe a poda.
 *
 * Só é candidata a subárvore em que o `three` cortaria cada malha por frustum
 * de qualquer jeito: sem luz, sem LOD, sem malha skinada/instanciada, sem
 * `frustumCulled = false`. Assim a poda nunca esconde algo que o `three`
 * desenharia — ela só antecipa o "não" que viria malha a malha.
 */
import { Frustum, Matrix4, Sphere } from 'three';
import type { Camera, Object3D } from 'three';
import { debug } from '../core/debug.js';

/**
 * Menor subárvore que vale uma candidata: a raiz continua visitada, então
 * podar menos de 3 nós poupa no máximo 1 visita e custa um teste de esfera.
 */
export const MIN_SUBTREE_NODES = 3;
/**
 * Raio (m) acima do qual a subárvore é espalhada demais para ser podada
 * inteira (um grupo "lojas" cobrindo o bairro sempre cruza a câmera): a
 * busca desce aos filhos, que costumam ser compactos.
 */
export const MAX_CANDIDATE_RADIUS = 40;
/**
 * Folga multiplicativa na esfera local. Cobre movimento RELATIVO pequeno
 * dentro da subárvore (roda que gira, porta, pisca) entre dois recálculos.
 */
export const SPHERE_MARGIN_SCALE = 1.25;
/** Folga absoluta (m) somada ao raio, pelo mesmo motivo. */
export const SPHERE_MARGIN_METERS = 1;
/**
 * Candidatas cuja esfera local é remedida por passe, em rodízio. Põe um teto
 * no tempo em que uma esfera fica velha se algo se mexer dentro da subárvore.
 */
export const REFRESH_PER_PASS = 4;
/**
 * Passes entre duas remontagens completas. Filho novo FORA de uma candidata
 * (grupo espalhado que ganhou um ônibus, subárvore que reapareceu) não é
 * risco — sem candidata o `three` faz o trabalho de sempre —, só fica sem
 * poda até a próxima remontagem; por isso não precisa de evento.
 */
export const REBUILD_EVERY_PASSES = 120;
/** Passes entre duas linhas de estatística no `debug('perf')`. */
const STATS_EVERY_PASSES = 300;

/**
 * Subárvore podável. `local` é a esfera da geometria desenhável no espaço da
 * raiz; `always` marca a subárvore SEM nada desenhável para a câmera (só
 * grupos, ou malhas noutra camada — os bonecos em lote do DDD 61), que o
 * `three` visitaria inteira para não empurrar nada: sai sem teste de esfera.
 */
interface Candidate {
  root: Object3D;
  local: Sphere;
  nodes: number;
  always: boolean;
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
  isSprite?: boolean;
  isSkinnedMesh?: boolean;
  isInstancedMesh?: boolean;
  isBatchedMesh?: boolean;
  isMesh?: boolean;
  isLine?: boolean;
  isPoints?: boolean;
  isScene?: boolean;
  frustumCulled: boolean;
  geometry?: { boundingSphere: Sphere | null; computeBoundingSphere(): void };
}

/** Luz, LOD e grupos especiais: o `three` faz algo neles mesmo fora da tela. */
function structuralBlock(n: TypedNode): boolean {
  return Boolean(n.isLight || n.isLOD || n.isBundleGroup || n.isClippingGroup);
}

/** Desenhável que a esfera não representa: o `three` não o corta (ou corta por outra regra). */
function drawableBlock(n: TypedNode): boolean {
  if (n.isSprite || n.isSkinnedMesh || n.isInstancedMesh || n.isBatchedMesh) return true;
  return !n.frustumCulled;
}

/** Esfera de geometria (calculando se faltar) ou `null` sem geometria. */
function geometrySphere(n: TypedNode): Sphere | null {
  const g = n.geometry;
  if (!g) return null;
  if (g.boundingSphere === null) g.computeBoundingSphere();
  return g.boundingSphere;
}

/** Rascunhos de {@link measureSubtree} (roda no rodízio: sem alocar). */
const _scratchSphere = new Sphere();
const _stack: Object3D[] = [];
/** Sai da medição sem segurar referência a nós da cena. */
function bail(): number {
  _stack.length = 0;
  return -1;
}

/**
 * Mede uma subárvore para uma câmera de máscara `layerMask`: devolve quantos
 * nós ela tem, ou -1 se algum nó impede a poda. `out` recebe a esfera em
 * espaço de MUNDO do que é desenhável nessa câmera — vazia se nada é.
 *
 * Malha de outra camada não conta como desenhável: o `three` a visita e
 * descarta no `layers.test`, como faria com um grupo.
 */
export function measureSubtree(root: Object3D, out: Sphere, layerMask: number): number {
  out.makeEmpty();
  const scratch = _scratchSphere;
  const stack = _stack;
  stack.length = 0;
  stack.push(root);
  let count = 0;
  while (stack.length > 0) {
    const node = stack.pop() as Object3D;
    const typed = node as unknown as TypedNode;
    if (structuralBlock(typed)) return bail();
    count++;
    const drawable = typed.isMesh || typed.isLine || typed.isPoints || typed.isSprite;
    if (drawable && (node.layers.mask & layerMask) !== 0) {
      if (drawableBlock(typed)) return bail();
      const s = geometrySphere(typed);
      if (!s) return bail(); // malha sem esfera calculável: o `three` falharia igual
      out.union(scratch.copy(s).applyMatrix4(node.matrixWorld));
    }
    for (let i = 0; i < node.children.length; i++) stack.push(node.children[i]);
  }
  return count;
}

/**
 * Poda de subárvores fora do frustum na projeção do `three` (SPEC-0326).
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
  private readonly _hidden: Object3D[] = [];
  private readonly _subscribed = new WeakSet<Object3D>();
  private readonly _frustum = new Frustum();
  private readonly _viewProj = new Matrix4();
  private readonly _inverse = new Matrix4();
  private readonly _world = new Sphere();
  private readonly _onStructure = (): void => {
    this._dirty = true;
  };
  private _passes = 0;
  private _culled = 0;
  private _skipped = 0;
  private _rebuilds = 0;
  private _sinceRebuild = 0;
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
      // ArrayCamera (XR) usa um frustum por vista no `three`: fica de fora.
      const arrayCamera = (camera as Camera & { isArrayCamera?: boolean }).isArrayCamera;
      if (camera !== pruner.camera || arrayCamera || !(object as unknown as TypedNode).isScene) {
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
    this._viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(
      this._viewProj,
      camera.coordinateSystem,
      (camera as Camera & { reversedDepth?: boolean }).reversedDepth ?? false,
    );
    const world = this._world;
    for (let i = 0; i < this._candidates.length; i++) {
      const c = this._candidates[i];
      if (!c.root.visible) continue;
      if (!c.always) {
        world.copy(c.local).applyMatrix4(c.root.matrixWorld);
        if (this._frustum.intersectsSphere(world)) continue;
      }
      c.root.visible = false;
      this._hidden.push(c.root);
      this._skipped += c.nodes - 1;
    }
    this._culled += this._hidden.length;
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

  /**
   * Escuta mudança de estrutura DENTRO de uma candidata (o `three` não
   * propaga): é aí que um filho novo invalidaria a esfera em cache.
   */
  private _subscribe(root: Object3D): void {
    root.traverse((node) => {
      if (this._subscribed.has(node)) return;
      this._subscribed.add(node);
      node.addEventListener('childadded', this._onStructure);
      node.addEventListener('childremoved', this._onStructure);
    });
  }

  private _collect(node: Object3D): void {
    // Subárvore escondida: o `three` já não entra nela. Se reaparecer, fica sem
    // poda (seguro) até a próxima remontagem.
    if (!node.visible) return;
    const local = new Sphere();
    const count = this._measureLocal(node, local);
    // Pequena e podável: nada lá dentro compensa.
    if (count >= 0 && count < MIN_SUBTREE_NODES) return;
    const always = local.isEmpty();
    if (count >= 0 && (always || local.radius <= MAX_CANDIDATE_RADIUS)) {
      this._candidates.push({ root: node, local, nodes: count, always });
      this._subscribe(node);
      return;
    }
    // Espalhada demais ou com algo que bloqueia a poda: desce aos filhos.
    for (let i = 0; i < node.children.length; i++) this._collect(node.children[i]);
  }

  /**
   * {@link measureSubtree} levada ao espaço local da raiz, já com a folga.
   * `out` fica vazia quando nada ali é desenhável nesta câmera.
   */
  private _measureLocal(root: Object3D, out: Sphere): number {
    const count = measureSubtree(root, this._world, this._layerMask);
    if (count < 0) return count;
    if (this._world.isEmpty()) {
      out.makeEmpty();
      return count;
    }
    if (this._inverse.copy(root.matrixWorld).determinant() === 0) return -1;
    this._inverse.invert();
    out.copy(this._world).applyMatrix4(this._inverse);
    out.radius = out.radius * SPHERE_MARGIN_SCALE + SPHERE_MARGIN_METERS;
    return count;
  }

  /** Remede algumas candidatas por passe (movimento relativo dentro delas). */
  private _refreshSlice(): void {
    const n = this._candidates.length;
    for (let k = 0; k < REFRESH_PER_PASS && k < n; k++) {
      this._refreshCursor = (this._refreshCursor + 1) % n;
      const c = this._candidates[this._refreshCursor];
      const count = this._measureLocal(c.root, c.local);
      // Deixou de ser podável (ganhou luz, `frustumCulled` desligado, malha
      // trocou de camada...) ou mudou de tamanho sem evento: remonta tudo.
      if (count !== c.nodes || c.local.isEmpty() !== c.always) this._dirty = true;
    }
  }

  private _stats(): void {
    if (++this._passes < STATS_EVERY_PASSES) return;
    const p = this._passes;
    debug(
      'perf',
      `[projectionPrune] candidatas=${this._candidates.length} podadas/q=${(this._culled / p).toFixed(1)} ` +
        `nosPoupados/q=${(this._skipped / p).toFixed(0)} ms/q=${(this._ms / p).toFixed(3)} remontagens=${this._rebuilds}`,
    );
    this._passes = this._culled = this._skipped = this._rebuilds = 0;
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
