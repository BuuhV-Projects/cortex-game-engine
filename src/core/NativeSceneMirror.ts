/**
 * Espelho de cena nativo, lado JS (SPEC-0234, fase 3 do ADR-0232).
 *
 * A travessia de matriz do `three` custa 4,5 ms por frame no host (SPEC-0227);
 * em C++ o mesmo trabalho custa 0,023 ms. Esta classe liga os dois lados sem
 * cair nas três armadilhas já pagas em medição:
 *
 * - **ponte por objeto** (15 us cada, SPEC-0225): há **uma** chamada por frame;
 * - **laço de aplicação em JS** (≥1,4 ms para 1.300 nós): o `matrixWorld` de
 *   cada objeto **aponta** para a memória do C++, então não há cópia nenhuma;
 * - **instancing** (revertido na SPEC-0012 do jogo): não é usado.
 */
import type { Object3D, Camera } from 'three';
import { Frustum, Matrix4 } from 'three';
import { debug } from './debug.js';

/** Floats por nó na descrição inicial (ver `scene_mirror_shim.cpp`). */
const BUILD_FLOATS_PER_NODE = 14;
/** Floats por nó no buffer de sincronização (ver `scene_mirror.h`). */
const SYNC_FLOATS_PER_NODE = 11;
/** Elementos de uma Matrix4. */
const MATRIX_ELEMENTS = 16;
/** Planos de um frustum, com 4 floats cada. */
const FRUSTUM_PLANES = 6;
const FRUSTUM_FLOATS = FRUSTUM_PLANES * 4;
/**
 * Raio de recorte usado quando o nó não tem geometria com esfera pronta. Vale
 * como "sempre visível" — cortar por um raio inventado esconderia objeto.
 */
const DEFAULT_RADIUS = 1e6;

/** A API que o host publica; ausente no browser, onde tudo isto é no-op. */
interface SceneMirrorBridge {
  build(description: Float32Array): boolean;
  worldMatrices(): Float32Array | undefined;
  syncBuffer(): Float32Array | undefined;
  update(changedNodes: number, planes: Float32Array): number;
}

function bridge(): SceneMirrorBridge | undefined {
  const api = (globalThis as { __cortexSceneMirror?: SceneMirrorBridge }).__cortexSceneMirror;
  return typeof api?.build === 'function' ? api : undefined;
}

/** `true` quando o host expõe o espelho (export nativo). */
export function nativeSceneMirrorAvailable(): boolean {
  return bridge() !== undefined;
}

export class NativeSceneMirror {
  private readonly _bridge = bridge();
  private _nodes: Object3D[] = [];
  private _sync: Float32Array | undefined;
  private _installed = false;
  private readonly _planes = new Float32Array(FRUSTUM_FLOATS);
  private readonly _frustum = new Frustum();
  private readonly _viewProjection = new Matrix4();

  get installed(): boolean {
    return this._installed;
  }

  get nodeCount(): number {
    return this._nodes.length;
  }

  /**
   * Espelha a cena e passa a mandar no `matrixWorld` dela.
   *
   * A ordem é **pai antes de filho** (travessia em largura), que é o contrato
   * do lado C++ — ele recusa a árvore fora de ordem em vez de produzir matriz
   * errada em silêncio.
   */
  install(scene: Object3D): boolean {
    const api = this._bridge;
    if (!api || this._installed) return false;

    this._nodes = [];
    const fila: Object3D[] = [scene];
    const indicePorObjeto = new Map<Object3D, number>();
    while (fila.length > 0) {
      const objeto = fila.shift() as Object3D;
      indicePorObjeto.set(objeto, this._nodes.length);
      this._nodes.push(objeto);
      for (const filho of objeto.children) fila.push(filho);
    }

    const descricao = new Float32Array(this._nodes.length * BUILD_FLOATS_PER_NODE);
    for (let i = 0; i < this._nodes.length; i++) {
      const objeto = this._nodes[i]!;
      const pai = objeto.parent;
      const paiIndice = pai && indicePorObjeto.has(pai) ? (indicePorObjeto.get(pai) as number) : -1;
      const base = i * BUILD_FLOATS_PER_NODE;
      descricao[base] = paiIndice;
      descricao[base + 1] = objeto.position.x;
      descricao[base + 2] = objeto.position.y;
      descricao[base + 3] = objeto.position.z;
      descricao[base + 4] = objeto.quaternion.x;
      descricao[base + 5] = objeto.quaternion.y;
      descricao[base + 6] = objeto.quaternion.z;
      descricao[base + 7] = objeto.quaternion.w;
      descricao[base + 8] = objeto.scale.x;
      descricao[base + 9] = objeto.scale.y;
      descricao[base + 10] = objeto.scale.z;
      descricao[base + 11] = DEFAULT_RADIUS;
      descricao[base + 12] = objeto.visible ? 1 : 0;
    }

    if (!api.build(descricao)) {
      debug('perf', '[sceneMirror] o host recusou a arvore (fora de ordem?)');
      return false;
    }

    const matrizes = api.worldMatrices();
    this._sync = api.syncBuffer();
    if (!matrizes || !this._sync) {
      debug('perf', '[sceneMirror] host sem buffers externos');
      return false;
    }

    // O ponto do desenho: o `elements` de cada objeto passa a SER a fatia da
    // memória nativa. O `three` só indexa `elements`, então ele lê a matriz que
    // o C++ escreveu — sem cópia e sem laço por frame.
    for (let i = 0; i < this._nodes.length; i++) {
      const objeto = this._nodes[i]!;
      // O tipo do `three` promete uma tupla de 16 números; o que entra é um
      // `Float32Array` do mesmo tamanho, que ele indexa igual. O cast é o preço
      // de trocar o dono da memória sem forkear o `three`.
      objeto.matrixWorld.elements = matrizes.subarray(
        i * MATRIX_ELEMENTS,
        i * MATRIX_ELEMENTS + MATRIX_ELEMENTS,
      ) as unknown as Matrix4['elements'];
      // Sem isto o `three` recalcularia por cima e o ganho sumiria em silêncio.
      objeto.matrixWorldAutoUpdate = false;
    }

    this._installed = true;
    debug('perf', `[sceneMirror] ${this._nodes.length} nos espelhados no host`);
    return true;
  }

  /**
   * Manda ao host o que mudou e recebe a cena atualizada — **uma** travessia de
   * ponte por frame.
   */
  update(camera: Camera): void {
    const api = this._bridge;
    const sync = this._sync;
    if (!api || !sync || !this._installed) return;

    // Escreve os transforms locais. Hoje são todos os nós; a SPEC-0234 prevê
    // reduzir isto à lista de dinâmicos (63 de 1.300 no kart-racer) — o número
    // que esta passada gasta é justamente o que a medição vai dizer se paga.
    for (let i = 0; i < this._nodes.length; i++) {
      const objeto = this._nodes[i]!;
      const base = i * SYNC_FLOATS_PER_NODE;
      sync[base] = i;
      sync[base + 1] = objeto.position.x;
      sync[base + 2] = objeto.position.y;
      sync[base + 3] = objeto.position.z;
      sync[base + 4] = objeto.quaternion.x;
      sync[base + 5] = objeto.quaternion.y;
      sync[base + 6] = objeto.quaternion.z;
      sync[base + 7] = objeto.quaternion.w;
      sync[base + 8] = objeto.scale.x;
      sync[base + 9] = objeto.scale.y;
      sync[base + 10] = objeto.scale.z;
    }

    camera.updateMatrixWorld();
    this._viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._viewProjection);
    for (let i = 0; i < FRUSTUM_PLANES; i++) {
      const plano = this._frustum.planes[i]!;
      const base = i * 4;
      this._planes[base] = plano.normal.x;
      this._planes[base + 1] = plano.normal.y;
      this._planes[base + 2] = plano.normal.z;
      this._planes[base + 3] = plano.constant;
    }

    api.update(this._nodes.length, this._planes);
  }
}
