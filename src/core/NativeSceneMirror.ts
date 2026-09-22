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
import type { Object3D, Camera, BufferGeometry, Material, Vector3 } from 'three';
import { Frustum, Matrix4 } from 'three';
import { authoredCastShadow } from '../scene/ShadowCasterCulling.js';
import { geometryId } from '../render/GeometryDesc.js';
import { debug } from './debug.js';

/** Floats por nó na descrição inicial (ver `scene_mirror_shim.cpp`). */
const BUILD_FLOATS_PER_NODE = 20;
/** Posições do layout de construção que o M6 acrescentou (SPEC-0245). */
const BUILD_FLAGS = 13;
const BUILD_GEOMETRY_ID = 14;
const BUILD_BOUNDS_CENTER = 15;
const BUILD_BOUNDS_RADIUS = 18;

/** Bits de `flags` — espelham `NodeFlag` em `scene_mirror.h`. */
const FLAG_CAST_SHADOW = 1;
const FLAG_SKIP_ANGULAR_CULL = 2;
const FLAG_FRUSTUM_CULLED = 4;
const FLAG_DRAWABLE = 8;

/** `geometryId` deste valor = nó sem geometria (ver `kNoGeometry`). */
const NO_GEOMETRY = -1;
/** Floats por nó no buffer de sincronização (ver `scene_mirror.h`). */
const SYNC_FLOATS_PER_NODE = 12;
/** Posição do `visible` na linha de sincronização. */
const SYNC_VISIBLE = 11;
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
  worldMatrices(): Float64Array | undefined;
  syncBuffer(): Float64Array | undefined;
  update(changedNodes: number, planes: Float32Array): number;
  shadowCasters?(
    minRatio: number,
    cameraX: number,
    cameraY: number,
    cameraZ: number,
    planes: Float32Array,
  ): number | undefined;
}

/** Um `Object3D` com o que o espelho precisa saber para classificar o nó. */
type NoDaCena = Object3D & {
  isMesh?: boolean;
  isSkinnedMesh?: boolean;
  isInstancedMesh?: boolean;
  geometry?: BufferGeometry;
  material?: Material | Material[];
};

/**
 * Empacota num float a autoria estática do nó — o que o enumerador de casters
 * precisa e não pode inferir da matriz.
 *
 * É a AUTORIA, não o estado do frame: o `castShadow` que o `three` carrega foi
 * mexido pelo filtro angular (SPEC-0197), e quem reaplica esse filtro do lado
 * de lá é o C++. Mandar o valor já filtrado faria o filtro rodar duas vezes e
 * a contagem encolher a cada passada.
 */
function flagsDoNo(objeto: NoDaCena, temEsfera: boolean): number {
  let flags = 0;
  if (authoredCastShadow(objeto)) flags |= FLAG_CAST_SHADOW;
  if (objeto.frustumCulled) flags |= FLAG_FRUSTUM_CULLED;
  // Skinada e instanced ficam fora do filtro angular (o bounding sphere mente
  // com o rig / descreve uma instância só) — e quem não tem esfera também, ou
  // seria cortado por um raio inventado.
  if (objeto.isSkinnedMesh || objeto.isInstancedMesh || !temEsfera) {
    flags |= FLAG_SKIP_ANGULAR_CULL;
  }
  if (objeto.isMesh && objeto.geometry && materialVisivel(objeto.material)) flags |= FLAG_DRAWABLE;
  return flags;
}

/** `material.visible` do `_projectObject`; um array conta se QUALQUER parte desenha. */
function materialVisivel(material: Material | Material[] | undefined): boolean {
  if (material === undefined) return false;
  return Array.isArray(material) ? material.some((m) => m.visible) : material.visible;
}

function bridge(): SceneMirrorBridge | undefined {
  const api = (globalThis as { __cortexSceneMirror?: SceneMirrorBridge }).__cortexSceneMirror;
  return typeof api?.build === 'function' ? api : undefined;
}

/** `true` quando o host expõe o espelho (export nativo). */
export function nativeSceneMirrorAvailable(): boolean {
  return bridge() !== undefined;
}

/**
 * O espelho instalado no frame, quando há um.
 *
 * A cena é única e o espelho é instalado uma vez (o `build` não cresce depois),
 * então um ponteiro de módulo descreve o que é fato. Existe para quem enxerga a
 * sombra — o nó do CSM — poder pedir a contagem de casters sem que o `Game`
 * tenha de atravessar a iluminação para entregá-lo.
 */
export function activeSceneMirror(): NativeSceneMirror | undefined {
  return espelhoInstalado;
}

let espelhoInstalado: NativeSceneMirror | undefined;

export class NativeSceneMirror {
  private readonly _bridge = bridge();
  private _nodes: Object3D[] = [];
  private _sync: Float64Array | undefined;
  private _installed = false;
  private readonly _planes = new Float32Array(FRUSTUM_FLOATS);
  private readonly _frustum = new Frustum();
  private readonly _viewProjection = new Matrix4();
  /** Buffers do passe de sombra, separados para não brigar com o do frame. */
  private readonly _shadowPlanes = new Float32Array(FRUSTUM_FLOATS);
  private readonly _shadowFrustum = new Frustum();
  private readonly _shadowViewProjection = new Matrix4();

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

      // M6 (SPEC-0245): o que o enumerador de casters precisa — a esfera da
      // GEOMETRIA (em espaço local) e o id que liga o nó aos buffers já
      // registrados. Sem eles o C++ tem a hierarquia e nenhuma ideia do que
      // cada nó desenha.
      const noDaCena = objeto as NoDaCena;
      const geometria = noDaCena.isMesh ? noDaCena.geometry : undefined;
      if (geometria && !geometria.boundingSphere) geometria.computeBoundingSphere();
      const esfera = geometria?.boundingSphere ?? null;
      descricao[base + BUILD_FLAGS] = flagsDoNo(noDaCena, esfera !== null);
      descricao[base + BUILD_GEOMETRY_ID] = geometria ? geometryId(geometria) : NO_GEOMETRY;
      descricao[base + BUILD_BOUNDS_CENTER] = esfera ? esfera.center.x : 0;
      descricao[base + BUILD_BOUNDS_CENTER + 1] = esfera ? esfera.center.y : 0;
      descricao[base + BUILD_BOUNDS_CENTER + 2] = esfera ? esfera.center.z : 0;
      descricao[base + BUILD_BOUNDS_RADIUS] = esfera ? esfera.radius : 0;
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
      // `Float64Array` do mesmo tamanho, que ele indexa igual. Tem de ser
      // DUPLA: com `Float32Array`, na escala de uma cidade (centenas de metros),
      // a matriz perde dígitos suficientes para o shadow map sair em bandas —
      // foi exatamente o que apareceu na pista na primeira versão desta fase.
      objeto.matrixWorld.elements = matrizes.subarray(
        i * MATRIX_ELEMENTS,
        i * MATRIX_ELEMENTS + MATRIX_ELEMENTS,
      ) as unknown as Matrix4['elements'];
      // Sem isto o `three` recalcularia por cima e o ganho sumiria em silêncio.
      objeto.matrixWorldAutoUpdate = false;
    }

    this._installed = true;
    espelhoInstalado = this;
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
      // Vai por frame, não só no `build` (SPEC-0245): esconder um objeto é tão
      // comum quanto movê-lo, e o C++ precisa podar a subárvore como o `three`.
      sync[base + SYNC_VISIBLE] = objeto.visible ? 1 : 0;
    }

    camera.updateMatrixWorld();
    this._viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._viewProjection);
    escreverPlanos(this._frustum, this._planes);

    api.update(this._nodes.length, this._planes);
  }

  /**
   * Quantos nós o `three` desenharia no passe de sombra deste frame, contados
   * em C++ (SPEC-0245, passo 1).
   *
   * **Ainda não desenha nada.** Serve para conferir a enumeração nativa contra
   * o que o `three` submete — a regra de medição 2 da SPEC-0245 manda validar
   * todo contador novo num caso de resposta conhecida antes de concluir dele.
   *
   * Tem de rodar DEPOIS de {@link update} no mesmo frame: o C++ lê as matrizes
   * de mundo que o `update` acabou de compor.
   *
   * @param shadowCamera - A ortho da CASCATA, não a câmera do jogo.
   * @param cameraPosition - Posição da câmera do jogo (a do filtro angular).
   * @param minRatio - Limiar `raio/distância` da SPEC-0197.
   * @returns A contagem, ou `undefined` no browser/Studio (sem host).
   */
  countShadowCasters(
    shadowCamera: Camera,
    cameraPosition: Vector3,
    minRatio: number,
  ): number | undefined {
    const api = this._bridge;
    if (!api?.shadowCasters || !this._installed) return undefined;

    shadowCamera.updateMatrixWorld();
    this._shadowViewProjection.multiplyMatrices(
      shadowCamera.projectionMatrix,
      shadowCamera.matrixWorldInverse,
    );
    // O sistema de coordenadas VEM DA CÂMERA, como no `_projectObject`: em
    // WebGPU o NDC em z vai de 0 a 1, e derivar os planos pela convenção do
    // WebGL daria um near/far deslocado — casters cortados que o `three`
    // desenha, ou o contrário.
    const comCoordenadas = shadowCamera as Camera & {
      coordinateSystem?: number;
      reversedDepth?: boolean;
    };
    this._shadowFrustum.setFromProjectionMatrix(
      this._shadowViewProjection,
      comCoordenadas.coordinateSystem,
      comCoordenadas.reversedDepth,
    );
    escreverPlanos(this._shadowFrustum, this._shadowPlanes);

    return api.shadowCasters(
      minRatio,
      cameraPosition.x,
      cameraPosition.y,
      cameraPosition.z,
      this._shadowPlanes,
    );
  }
}

/** Achata os 6 planos do frustum no buffer que atravessa a ponte. */
function escreverPlanos(frustum: Frustum, destino: Float32Array): void {
  for (let i = 0; i < FRUSTUM_PLANES; i++) {
    const plano = frustum.planes[i]!;
    const base = i * 4;
    destino[base] = plano.normal.x;
    destino[base + 1] = plano.normal.y;
    destino[base + 2] = plano.normal.z;
    destino[base + 3] = plano.constant;
  }
}
