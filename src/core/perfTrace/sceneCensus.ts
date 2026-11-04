/**
 * Censo da cena do perf-trace (SPEC-0198, SPEC-0227, SPEC-0334): tamanho da árvore, matrizes paradas, nós por
 * nó de cena e o que está no frustum. Saiu do `PerfTrace.ts` (SPEC-0688) para ele caber em 500 linhas; o
 * `PerfTrace.ts` declara os tipos e as fachadas públicas; este módulo é só implementação.
 */
import { Frustum, Matrix4, type Camera, type Mesh, type Object3D } from 'three';
import type { SceneWalkResult, VisibleNode } from '../PerfTrace.js';

/** Elementos de uma Matrix4. */
const MATRIX_ELEMENTS = 16;

/** Triângulos que uma malha desenha (indexada ou não). */
export function triangleCount(mesh: Mesh): number {
  const geometry = mesh.geometry;
  if (!geometry) return 0;
  const index = geometry.index;
  const position = geometry.getAttribute('position');
  const count = index ? index.count : (position?.count ?? 0);
  return Math.floor(count / 3);
}

/**
 * Sobe a hierarquia até o nó de cena (`userData.cortexSceneNode`) e devolve o
 * `id` dele. Malha fora de um nó de cena (chrome do editor, malha criada por
 * código) cai no nome próprio — o trace registra o que existe, sem inventar.
 */
export function sceneNodeIdOf(obj: Object3D): string {
  let current: Object3D | null = obj;
  while (current) {
    if ((current.userData as Record<string, unknown>)['cortexSceneNode'] === true) {
      return current.name || '(sem id)';
    }
    current = current.parent;
  }
  return obj.name || '(avulso)';
}

const _frustum = new Frustum();
const _matrix = new Matrix4();

/**
 * Tamanho da árvore de cena (SPEC-0227). Duas contagens porque as duas fases
 * mais caras do render percorrem conjuntos diferentes: o `updateMatrixWorld`
 * desce em TODOS os nós, inclusive invisíveis; o culling para em subárvore
 * invisível.
 */
export function countNodes(scene: Object3D): { total: number; visible: number } {
  let total = 0;
  let visible = 0;
  const visitar = (obj: Object3D, paiVisivel: boolean): void => {
    total++;
    const visivel = paiVisivel && obj.visible;
    if (visivel) visible++;
    for (const child of obj.children) visitar(child, visivel);
  };
  visitar(scene, true);
  return { total, visible };
}

/**
 * Quantos nós tiveram a **matriz local inalterada** desde a amostra anterior.
 *
 * É o número que dimensiona a poda de recomposição de matriz: só quem nunca
 * muda pode ter o compose desligado com segurança. Medido na corrida de
 * verdade, não na cena parada — com a cena parada a resposta seria "todos", que
 * é verdadeira e inútil.
 *
 * Compara a matriz composta, e não `position`/`quaternion`, porque é ela que o
 * `updateMatrix` recalcula; guardar 16 floats por nó duas vezes por segundo é
 * barato perto de recompor 1.271 matrizes 60 vezes por segundo. Em `Float64Array`
 * e não `Float32`: arredondar faria mudança pequena passar por "sem mudança" e
 * inflaria justamente o número que decide se a poda vale.
 */
export function countUnchangedMatrices(scene: Object3D, previous: Map<number, Float64Array>): number {
  let unchanged = 0;
  scene.traverse((obj) => {
    if (matrixUnchanged(obj, previous)) unchanged++;
  });
  return unchanged;
}

/**
 * A matriz local de `obj` é igual à guardada em `previous`? Guarda a atual
 * para a próxima comparação. Primeira vez de um nó = `false`.
 */
function matrixUnchanged(obj: Object3D, previous: Map<number, Float64Array>): boolean {
  const elements = obj.matrix.elements;
  const before = previous.get(obj.id);
  if (!before) {
    const copia = new Float64Array(MATRIX_ELEMENTS);
    for (let i = 0; i < MATRIX_ELEMENTS; i++) copia[i] = elements[i];
    previous.set(obj.id, copia);
    return false;
  }
  let igual = true;
  for (let i = 0; i < MATRIX_ELEMENTS; i++) {
    if (before[i] !== elements[i]) {
      igual = false;
      break;
    }
  }
  if (!igual) for (let i = 0; i < MATRIX_ELEMENTS; i++) before[i] = elements[i];
  return igual;
}

/**
 * **Censo da cena em rodízio** (SPEC-0334): UMA travessia iterativa que anda
 * `budget` nós por chamada e, ao fechar a volta, publica em {@link result}
 * o que antes custava três travessias completas por amostra (`countNodes`,
 * `countUnchangedMatrices`, `collectVisible` — ~25 ms em 10 mil nós no
 * Hermes, 2×/s, o que inflava o p95 de toda medição).
 *
 * A pilha é própria (três arrays paralelos, sem alocar por nó) e carrega o id
 * do nó de cena herdado, então a malha não sobe a hierarquia atrás dele.
 * A árvore pode mudar no meio da volta: nó removido ainda conta nesta volta,
 * nó novo entra na próxima. O frustum é o da câmera no quadro da visita.
 */
export class SceneWalk {
  /** Última volta completa, ou `null` antes da primeira. */
  result: SceneWalkResult | null = null;

  private readonly _objs: Object3D[] = [];
  private readonly _parentVisible: boolean[] = [];
  private readonly _sceneIds: (string | null)[] = [];
  private readonly _previous = new Map<number, Float64Array>();
  private _byId = new Map<string, VisibleNode>();
  private _total = 0;
  private _visible = 0;
  private _unchanged = 0;
  private _frames = 0;

  /**
   * Avança a volta em até `budget` nós. A câmera precisa estar com
   * `matrixWorldInverse` em dia (o render do quadro já fez).
   */
  step(scene: Object3D, camera: Camera, budget: number): void {
    if (this._objs.length === 0) this.push(scene, true, null);
    this._frames++;
    _matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_matrix);
    for (let n = 0; n < budget && this._objs.length > 0; n++) {
      const obj = this._objs.pop()!;
      const parentVisible = this._parentVisible.pop()!;
      let sceneId = this._sceneIds.pop()!;
      if ((obj.userData as Record<string, unknown>)['cortexSceneNode'] === true) sceneId = obj.name || '(sem id)';
      const visible = parentVisible && obj.visible;
      this._total++;
      if (matrixUnchanged(obj, this._previous)) this._unchanged++;
      if (visible) {
        this._visible++;
        this.countIfInFrustum(obj, sceneId);
      }
      const children = obj.children;
      for (let i = 0; i < children.length; i++) this.push(children[i]!, visible, sceneId);
    }
    if (this._objs.length === 0) this.finishLap();
  }

  private push(obj: Object3D, parentVisible: boolean, sceneId: string | null): void {
    this._objs.push(obj);
    this._parentVisible.push(parentVisible);
    this._sceneIds.push(sceneId);
  }

  private countIfInFrustum(obj: Object3D, sceneId: string | null): void {
    const mesh = obj as Mesh & { isMesh?: boolean };
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    if (!_frustum.intersectsObject(mesh)) return;
    const id = sceneId ?? (mesh.name || '(avulso)');
    let entry = this._byId.get(id);
    if (!entry) {
      entry = { id, meshes: 0, tris: 0 };
      this._byId.set(id, entry);
    }
    entry.meshes++;
    entry.tris += triangleCount(mesh);
  }

  private finishLap(): void {
    this.result = {
      total: this._total,
      visible: this._visible,
      unchanged: this._unchanged,
      visibleNodes: [...this._byId.values()].sort((a, b) => b.tris - a.tris),
      frames: this._frames,
    };
    this._byId = new Map();
    this._total = 0;
    this._visible = 0;
    this._unchanged = 0;
    this._frames = 0;
  }
}

/**
 * Censo da árvore por nó de cena: quantos `Object3D` cada nó do `level.json`
 * carrega. Responde "quem são os 1.271 nós" — a pergunta que decide se vale
 * podar a travessia (cenário estático) ou reduzir malha (modelo com peças
 * demais), que são trabalhos completamente diferentes.
 */
export function censusBySceneNode(scene: Object3D, limit: number): [string, number][] {
  const byId = new Map<string, number>();
  const visitar = (obj: Object3D): void => {
    const id = sceneNodeIdOf(obj);
    byId.set(id, (byId.get(id) ?? 0) + 1);
    for (const child of obj.children) visitar(child);
  };
  visitar(scene);
  return [...byId.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

/**
 * Percorre a cena e agrega, por nó de cena, o que está DENTRO do frustum da
 * câmera. É o traverse mais caro do trace — roda uma vez por amostra, nunca por
 * frame.
 */
export function collectVisible(scene: Object3D, camera: Camera): VisibleNode[] {
  camera.updateMatrixWorld();
  _matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_matrix);

  const byId = new Map<string, VisibleNode>();
  // Travessia própria (e não `traverse`) porque ela PARA em subárvore invisível.
  // O `visible` do three é herdado: uma malha com `visible: true` dentro de um
  // pai escondido não desenha. Com `traverse` ela entrava na conta e inflava o
  // diagnóstico — no kart-racer, as variantes de roda da garagem, que ficam
  // todas na cena com só uma visível, apareciam como se desenhassem.
  const visitar = (obj: Object3D): void => {
    if (!obj.visible) return;
    const mesh = obj as Mesh & { isMesh?: boolean };
    if (mesh.isMesh && mesh.geometry) {
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      if (_frustum.intersectsObject(mesh)) {
        const id = sceneNodeIdOf(mesh);
        const entry = byId.get(id) ?? { id, meshes: 0, tris: 0 };
        entry.meshes++;
        entry.tris += triangleCount(mesh);
        byId.set(id, entry);
      }
    }
    for (const child of obj.children) visitar(child);
  };
  visitar(scene);
  return [...byId.values()].sort((a, b) => b.tris - a.tris);
}
