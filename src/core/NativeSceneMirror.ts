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
import type { Camera, BufferGeometry, Material, Vector3 } from 'three';
import { BackSide, DoubleSide, FrontSide, Frustum, Matrix4, Object3D } from 'three';
import { authoredCastShadow } from '../scene/ShadowCasterCulling.js';
import { geometryId } from '../render/GeometryDesc.js';
import { debug } from './debug.js';

/** Floats por nó na descrição inicial (ver `scene_mirror_shim.cpp`). */
const BUILD_FLOATS_PER_NODE = 21;
/** Posições do layout de construção que o M6 acrescentou (SPEC-0245). */
const BUILD_FLAGS = 13;
const BUILD_GEOMETRY_ID = 14;
const BUILD_BOUNDS_CENTER = 15;
const BUILD_BOUNDS_RADIUS = 18;
/**
 * `material.visible` INICIAL. O valor por frame chega pelo buffer de
 * sincronização; o `build` só precisa de um estado de partida, porque o
 * primeiro frame enumera antes de qualquer `update`.
 */
const BUILD_MATERIAL_VISIBLE = 19;
/**
 * Lado da face do passe de sombra INICIAL (ver {@link ladoDaSombra}). Como o
 * `material.visible`, o valor de verdade viaja por frame; aqui vai só o estado
 * de partida.
 */
const BUILD_SHADOW_SIDE = 20;

/** Bits de `flags` — espelham `NodeFlag` em `scene_mirror.h`. */
const FLAG_CAST_SHADOW = 1;
const FLAG_SKIP_ANGULAR_CULL = 2;
const FLAG_FRUSTUM_CULLED = 4;
/** É malha com geometria. `material.visible` NÃO entra: ele viaja por frame. */
const FLAG_DRAWABLE = 8;
/** Motivos de recusa do gate (SPEC-0245, E3) — ver `ShadowGateRefusal`. */
const FLAG_SKINNED = 16;
const FLAG_INSTANCED = 32;
const FLAG_MATERIAL_ARRAY = 64;
const FLAG_ALPHA_CLIP = 128;
const FLAG_POSITION_NODE = 256;

/** `geometryId` deste valor = nó sem geometria (ver `kNoGeometry`). */
const NO_GEOMETRY = -1;
/**
 * Codificação de "pai dentro do próprio LOTE" no campo `parent` da descrição
 * (ver `kBatchParentBase` em `scene_mirror.h`).
 *
 * A subárvore nova atravessa a ponte numa chamada só; o pai dos nós de dentro
 * só ganha índice durante o append, então viaja como posição no lote.
 */
const BATCH_PARENT_BASE = -2;
/** Código de `appendNodes` para estouro de capacidade (ver o shim). */
const APPEND_ERROR_CAPACITY = -1;
/** Floats por nó no buffer de sincronização (ver `scene_mirror.h`). */
const SYNC_FLOATS_PER_NODE = 12;
/**
 * Posição das flags do FRAME na linha de sincronização (ver `SyncFlag`).
 *
 * Campo de bits, e não um float por booleano: o que o `three` reavalia a cada
 * travessia cabe num slot só, e acrescentar um estado novo aqui não alarga a
 * linha nem renumera o layout.
 */
const SYNC_FLAGS = 11;
/** Bits de {@link SYNC_FLAGS} — espelham `SyncFlag` em `scene_mirror.h`. */
const SYNC_VISIBLE = 1;
const SYNC_MATERIAL_VISIBLE = 2;
/** Deslocamento dos dois bits de lado da face (ver `kSyncShadowSideShift`). */
const SYNC_SHADOW_SIDE_SHIFT = 2;

/**
 * Lado da face com que o passe de sombra desenha o caster — espelha
 * `ShadowSide` em `scene_mirror.h`.
 *
 * Não é o `material.side` cru: é o lado EFETIVO do passe de sombra, com a
 * tabela do `three` já aplicada (ver {@link LADO_DA_SOMBRA}).
 */
const SHADOW_SIDE_BACK = 0;
const SHADOW_SIDE_FRONT = 1;
const SHADOW_SIDE_DOUBLE = 2;
/** Lado que o passe nativo não reproduz — o gate RECUSA o frame (nunca aproxima). */
const SHADOW_SIDE_UNSUPPORTED = 3;

/**
 * A tabela `_shadowSide` do `three` (`Renderer.js`), no caminho de
 * `isShadowPassMaterial`: fora do VSM ele desenha a sombra com o lado da face
 * INVERTIDO, `overrideMaterial.side = material.shadowSide ?? _shadowSide[material.side]`.
 *
 * É a premissa 4 do contrato do `three` (SPEC-0246) e está travada por teste:
 * se ele parar de inverter, a suíte quebra antes de a imagem estragar.
 *
 * O ramo VSM (que NÃO inverte) não precisa estar aqui: o gate recusa o frame
 * inteiro quando `shadowMap.type === VSMShadowMap`.
 */
const LADO_DA_SOMBRA: ReadonlyMap<number, number> = new Map([
  [FrontSide, SHADOW_SIDE_BACK],
  [BackSide, SHADOW_SIDE_FRONT],
  [DoubleSide, SHADOW_SIDE_DOUBLE],
]);

/** O mesmo mapa para um `shadowSide` AUTORADO, que o `three` usa sem inverter. */
const LADO_AUTORADO: ReadonlyMap<number, number> = new Map([
  [FrontSide, SHADOW_SIDE_FRONT],
  [BackSide, SHADOW_SIDE_BACK],
  [DoubleSide, SHADOW_SIDE_DOUBLE],
]);
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
  /**
   * Acrescenta uma subárvore ao espelho sem reconstruí-lo. Devolve quantos nós
   * entraram (escrevendo o índice de cada um em `out`) ou um código negativo.
   */
  appendNodes?(description: Float32Array, out: Int32Array): number;
  /** Tira do espelho o nó e a subárvore dele. Devolve quantos saíram. */
  removeNode?(index: number): number;
  drawShadowPass?(
    minRatio: number,
    cameraX: number,
    cameraY: number,
    cameraZ: number,
    planes: Float32Array,
    viewProjection: Float64Array,
    target: unknown,
    sceneNodeCount: number,
    vsmShadowMap: boolean,
    out: Float64Array,
  ): number | undefined;
}

/**
 * Motivos de recusa do gate, na ordem de `ShadowGateRefusal`
 * (`shadow_pass_gate.h`). O índice É o código que o C++ devolve.
 */
export const SHADOW_GATE_REASONS = [
  'aceito',
  'divergencia-de-nos',
  'vsm',
  'skinned',
  'instanced',
  'material-em-array',
  'recorte-alfa',
  'position-node',
  'geometria-ausente',
  'lado-nao-reproduzivel',
] as const;

export type ShadowGateReason = (typeof SHADOW_GATE_REASONS)[number];

/** Posições do vetor de saída do gate (ver `kGateOut*` em `scene_mirror_shim.cpp`). */
const GATE_OUT_TOTAL_CASTERS = SHADOW_GATE_REASONS.length + 1;
const GATE_OUT_FLOATS = SHADOW_GATE_REASONS.length + 2;

/** Resultado de {@link NativeSceneMirror.drawShadowPass} (SPEC-0245, E5). */
export interface ShadowPassOutcome {
  /** Casters desenhados em C++; `0` quando recusado. */
  drawn: number;
  /** O gate recusou o frame — o `three` mantém o passe dele. */
  refused: boolean;
  /** Motivo da recusa, ou `'aceito'`. */
  reason: ShadowGateReason;
  /** Casters enumerados no frame. */
  totalCasters: number;
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
  // Desenhável é estrutural: malha com geometria. O `material.visible` saiu
  // daqui no E3 do passo 2 (SPEC-0245) e passou a viajar por frame — o `three`
  // o reavalia em toda travessia, e uma foto do `build` envelhecia em silêncio.
  if (objeto.isMesh && objeto.geometry) flags |= FLAG_DRAWABLE;

  // Motivos de recusa do gate. São marcados aqui, e não inferidos lá, porque
  // só o JS enxerga o material — e o gate tem de recusar em vez de aproximar.
  if (objeto.isSkinnedMesh) flags |= FLAG_SKINNED;
  if (objeto.isInstancedMesh) flags |= FLAG_INSTANCED;
  if (Array.isArray(objeto.material)) flags |= FLAG_MATERIAL_ARRAY;
  if (temRecorteAlfa(objeto.material)) flags |= FLAG_ALPHA_CLIP;
  if (temPositionNode(objeto.material)) flags |= FLAG_POSITION_NODE;
  return flags;
}

/**
 * Lado da face com que o passe de sombra desenharia este nó.
 *
 * Resolve aqui a tabela do `three` porque o JS é o único lado que enxerga o
 * material; o C++ recebe o resultado e só escolhe o `cullMode`. Duas coisas
 * viram {@link SHADOW_SIDE_UNSUPPORTED} — e recusa do gate, nunca aproximação:
 *
 * - um `side` (ou `shadowSide`) fora da tabela, que é valor que o `three`
 *   pode ganhar numa versão futura;
 * - materiais do MESMO nó discordando entre si: o passe desenha a geometria
 *   inteira de uma vez, com um `cullMode` só, então não há como honrar dois
 *   lados. (Material em array já é recusa por conta própria; isto é a rede.)
 *
 * Nó sem material devolve {@link SHADOW_SIDE_BACK}: ele não desenha nada, e o
 * valor 0 é o do caso comum.
 */
function ladoDaSombra(material: Material | Material[] | undefined): number {
  const lista = materiais(material);
  if (lista.length === 0) return SHADOW_SIDE_BACK;
  let resolvido = -1;
  for (const m of lista) {
    const comLado = m as Material & { shadowSide?: number | null; side?: number };
    const autorado = comLado.shadowSide ?? null;
    const lado =
      autorado !== null
        ? (LADO_AUTORADO.get(autorado) ?? SHADOW_SIDE_UNSUPPORTED)
        : (LADO_DA_SOMBRA.get(comLado.side ?? FrontSide) ?? SHADOW_SIDE_UNSUPPORTED);
    if (lado === SHADOW_SIDE_UNSUPPORTED) return SHADOW_SIDE_UNSUPPORTED;
    if (resolvido !== -1 && resolvido !== lado) return SHADOW_SIDE_UNSUPPORTED;
    resolvido = lado;
  }
  return resolvido;
}

/** `material.visible` do `_projectObject`; um array conta se QUALQUER parte desenha. */
function materialVisivel(material: Material | Material[] | undefined): boolean {
  if (material === undefined) return false;
  return Array.isArray(material) ? material.some((m) => m.visible) : material.visible;
}

/** Os materiais de um nó, como lista — o array é o caso raro, não o comum. */
function materiais(material: Material | Material[] | undefined): Material[] {
  if (material === undefined) return [];
  return Array.isArray(material) ? material : [material];
}

/**
 * Recorte alfa (`alphaTest > 0` ou `alphaMap`).
 *
 * O `three` COPIA os dois para o material do passe de sombra
 * (`isShadowPassMaterial`, em `Renderer.js`), então a silhueta da sombra é
 * recortada pela textura — e um passe depth-only em C++ não amostra textura
 * nenhuma. Desenhar assim daria a sombra do retângulo inteiro de uma folhagem.
 */
function temRecorteAlfa(material: Material | Material[] | undefined): boolean {
  return materiais(material).some((m) => {
    const comAlfa = m as Material & { alphaTest?: number; alphaMap?: unknown };
    return (comAlfa.alphaTest ?? 0) > 0 || (comAlfa.alphaMap ?? null) !== null;
  });
}

/**
 * `positionNode`: deslocamento de vértice em TSL, que o `three` também copia
 * para o passe de sombra. A casca de contorno do engine tem um — reproduzi-lo
 * exigiria compilar o nó em C++, então é recusa.
 */
function temPositionNode(material: Material | Material[] | undefined): boolean {
  return materiais(material).some(
    (m) => ((m as Material & { positionNode?: unknown }).positionNode ?? null) !== null,
  );
}

/**
 * Escreve um nó no layout de construção (ver `kBuildFloatsPerNode`).
 *
 * É a MESMA descrição do `install` e do append de um nó que nasce depois: dois
 * vocabulários diferentes fariam o gate julgar por critérios diferentes
 * conforme o nó tivesse nascido antes ou depois (SPEC-0245, E6).
 */
function descreverNo(
  objeto: Object3D,
  paiIndice: number,
  destino: Float32Array,
  base: number,
): void {
  destino[base] = paiIndice;
  destino[base + 1] = objeto.position.x;
  destino[base + 2] = objeto.position.y;
  destino[base + 3] = objeto.position.z;
  destino[base + 4] = objeto.quaternion.x;
  destino[base + 5] = objeto.quaternion.y;
  destino[base + 6] = objeto.quaternion.z;
  destino[base + 7] = objeto.quaternion.w;
  destino[base + 8] = objeto.scale.x;
  destino[base + 9] = objeto.scale.y;
  destino[base + 10] = objeto.scale.z;
  destino[base + 11] = DEFAULT_RADIUS;
  destino[base + 12] = objeto.visible ? 1 : 0;

  // M6 (SPEC-0245): o que o enumerador de casters precisa — a esfera da
  // GEOMETRIA (em espaço local) e o id que liga o nó aos buffers já
  // registrados. Sem eles o C++ tem a hierarquia e nenhuma ideia do que cada
  // nó desenha.
  const noDaCena = objeto as NoDaCena;
  const geometria = noDaCena.isMesh ? noDaCena.geometry : undefined;
  if (geometria && !geometria.boundingSphere) geometria.computeBoundingSphere();
  const esfera = geometria?.boundingSphere ?? null;
  destino[base + BUILD_FLAGS] = flagsDoNo(noDaCena, esfera !== null);
  destino[base + BUILD_GEOMETRY_ID] = geometria ? geometryId(geometria) : NO_GEOMETRY;
  destino[base + BUILD_BOUNDS_CENTER] = esfera ? esfera.center.x : 0;
  destino[base + BUILD_BOUNDS_CENTER + 1] = esfera ? esfera.center.y : 0;
  destino[base + BUILD_BOUNDS_CENTER + 2] = esfera ? esfera.center.z : 0;
  destino[base + BUILD_BOUNDS_RADIUS] = esfera ? esfera.radius : 0;
  destino[base + BUILD_MATERIAL_VISIBLE] = materialVisivel(noDaCena.material) ? 1 : 0;
  destino[base + BUILD_SHADOW_SIDE] = ladoDaSombra(noDaCena.material);
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
 * A cena é única e o espelho é instalado uma vez, então um ponteiro de módulo
 * descreve o que é fato. Existe para quem enxerga a sombra — o nó do CSM —
 * poder pedir a contagem de casters sem que o `Game` tenha de atravessar a
 * iluminação para entregá-lo.
 */
export function activeSceneMirror(): NativeSceneMirror | undefined {
  return espelhoInstalado;
}

let espelhoInstalado: NativeSceneMirror | undefined;

export class NativeSceneMirror {
  private readonly _bridge = bridge();
  /** Um por slot do espelho; `undefined` é slot de nó que saiu da cena. */
  private _nodes: (Object3D | undefined)[] = [];
  private _sync: Float64Array | undefined;
  private _installed = false;
  private readonly _planes = new Float32Array(FRUSTUM_FLOATS);
  private readonly _frustum = new Frustum();
  private readonly _viewProjection = new Matrix4();
  /** Buffers do passe de sombra, separados para não brigar com o do frame. */
  private readonly _shadowPlanes = new Float32Array(FRUSTUM_FLOATS);
  private readonly _shadowFrustum = new Frustum();
  private readonly _shadowViewProjection = new Matrix4();
  /**
   * Saída do gate, reusada entre frames: o veredito é lido por frame e alocar
   * um vetor a cada um devolveria em GC o que o marco quer ganhar.
   */
  private readonly _gateOut = new Float64Array(GATE_OUT_FLOATS);
  /** Índice de cada objeto espelhado — o que o evento precisa resolver em O(1). */
  private _indicePorObjeto = new Map<Object3D, number>();
  /** As matrizes de mundo do host, cobrindo a CAPACIDADE (não só o tamanho). */
  private _matrizes: Float64Array | undefined;
  /** Nós vivos: `_nodes` guarda slots, e um removido vira buraco. */
  private _liveCount = 0;
  /** `true` depois de um estouro de capacidade — o espelho foi desligado. */
  private _overflowed = false;
  /**
   * Buffers do append, reaproveitados entre eventos: um *hazard* que nasce a
   * cada tiro não pode alocar um par de arrays por vez.
   */
  private _loteDescricao = new Float32Array(0);
  private _loteIndices = new Int32Array(0);
  get installed(): boolean {
    return this._installed;
  }

  /** Nós VIVOS no espelho — é o que se compara com a contagem da cena. */
  get nodeCount(): number {
    return this._liveCount;
  }

  /**
   * O espelho desligou-se por estouro de capacidade.
   *
   * Não é estado normal: é a saída de emergência que devolve o passe ao
   * `three` em vez de deixar o C++ desenhar por cima de memória que já não
   * descreve a cena (ver {@link _invalidarTudo}).
   */
  get overflowed(): boolean {
    return this._overflowed;
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
    const indicePorObjeto = this._indicePorObjeto;
    indicePorObjeto.clear();
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
      descreverNo(objeto, paiIndice, descricao, i * BUILD_FLOATS_PER_NODE);
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
      this._escutar(objeto);
    }

    this._matrizes = matrizes;
    this._liveCount = this._nodes.length;
    this._installed = true;
    espelhoInstalado = this;
    debug('perf', `[sceneMirror] ${this._nodes.length} nos espelhados no host`);
    return true;
  }

  // ── A cena que muda depois do `install` (SPEC-0245, E6) ──────────────────
  //
  // Contar nós não resolve: a contagem roda na travessia amortizada de 10
  // frames (`cullShadowCasters`), e nesses 10 frames um nó novo com
  // `castShadow` autorado — o projétil do kart — seria aceito sem estar no
  // espelho. Promover a travessia a por-frame é percorrer ~1.300 nós, que é o
  // custo que este marco existe para eliminar.
  //
  // O `three` dispara `childadded`/`childremoved` no PAI, e o `dispatchEvent`
  // sai cedo quando não há listener — custo zero para quem não escuta.
  // Escutando nos nós espelhados, o espelho sabe da mutação NO FRAME em que
  // ela acontece, O(1) por evento. Todos os caminhos do `three` passam por
  // `add`/`remove`: `attach`, `clear`, `removeFromParent` e `copy` chamam um
  // dos dois, e ninguém mexe em `children` por fora (conferido no fonte).

  /** Liga os dois eventos num nó espelhado. */
  private _escutar(objeto: Object3D): void {
    objeto.addEventListener('childadded', this._aoAdicionar);
    objeto.addEventListener('childremoved', this._aoRemover);
  }

  /** Desliga os dois eventos de um nó que saiu do espelho. */
  private _pararDeEscutar(objeto: Object3D): void {
    objeto.removeEventListener('childadded', this._aoAdicionar);
    objeto.removeEventListener('childremoved', this._aoRemover);
  }

  private readonly _aoAdicionar = (evento: { target?: unknown; child?: unknown }): void => {
    const pai = evento.target as Object3D | undefined;
    const filho = evento.child as Object3D | undefined;
    if (!this._installed || !pai || !filho) return;
    const paiIndice = this._indicePorObjeto.get(pai);
    if (paiIndice === undefined) return;
    try {
      this.appendSubtree(filho, paiIndice);
    } catch (erro) {
      // O evento roda DENTRO do `add()` de quem quer que tenha mexido na cena
      // (às vezes o próprio `three`, no CSM). Deixar a exceção subir mataria o
      // frame no meio de código alheio, então aqui ela vira desligamento do
      // espelho — que já aconteceu no `appendSubtree` — mais o relato.
      debug('perf', `[sceneMirror] append recusado no evento: ${String(erro)}`);
    }
  };

  private readonly _aoRemover = (evento: { child?: unknown }): void => {
    const filho = evento.child as Object3D | undefined;
    if (!this._installed || !filho) return;
    this.removeSubtree(filho);
  };

  /**
   * Põe no espelho uma subárvore que a cena acabou de ganhar.
   *
   * A subárvore inteira atravessa a ponte numa chamada só: uma travessia por
   * evento, não uma por nó (15 us cada, SPEC-0225).
   *
   * @throws quando o host recusa o append. Estouro de capacidade **não**
   *   realoca do lado C++ — realocar deixaria todo `matrixWorld.elements` já
   *   entregue sobre memória liberada (SPEC-0234). Antes de lançar, este
   *   método invalida os `elements` e devolve o passe ao `three`.
   */
  appendSubtree(raiz: Object3D, paiIndice: number): void {
    const api = this._bridge;
    if (!api?.appendNodes || !this._installed) return;

    // Pai antes de filho, como no `install`: é o contrato do lado C++.
    const novos: Object3D[] = [];
    const paiDoNovo: number[] = [];
    const fila: { objeto: Object3D; pai: number }[] = [{ objeto: raiz, pai: paiIndice }];
    while (fila.length > 0) {
      const { objeto, pai } = fila.shift() as { objeto: Object3D; pai: number };
      if (this._indicePorObjeto.has(objeto)) {
        // Já espelhado: não há caminho normal que leve aqui (uma troca de pai
        // remove antes de acrescentar), e mapear o mesmo objeto duas vezes
        // deixaria o espelho mentindo. Desliga em vez de seguir.
        this._invalidarTudo('no ja espelhado chegou como novo');
        throw new Error('[sceneMirror] no ja espelhado chegou no childadded');
      }
      const posicao = novos.length;
      novos.push(objeto);
      paiDoNovo.push(pai);
      for (const filho of objeto.children) {
        fila.push({ objeto: filho, pai: BATCH_PARENT_BASE - posicao });
      }
    }

    if (this._loteDescricao.length < novos.length * BUILD_FLOATS_PER_NODE) {
      this._loteDescricao = new Float32Array(novos.length * BUILD_FLOATS_PER_NODE);
      this._loteIndices = new Int32Array(novos.length);
    }
    const descricao = this._loteDescricao.subarray(0, novos.length * BUILD_FLOATS_PER_NODE);
    for (let i = 0; i < novos.length; i++) {
      descreverNo(novos[i]!, paiDoNovo[i]!, descricao, i * BUILD_FLOATS_PER_NODE);
    }

    const entraram = api.appendNodes(descricao, this._loteIndices);
    if (entraram !== novos.length) {
      const motivo =
        entraram === APPEND_ERROR_CAPACITY ? 'capacidade esgotada' : `codigo ${entraram}`;
      this._invalidarTudo(motivo);
      throw new Error(`[sceneMirror] append de ${novos.length} nos recusado: ${motivo}`);
    }

    const matrizes = this._matrizes;
    for (let i = 0; i < novos.length; i++) {
      const objeto = novos[i]!;
      const indice = this._loteIndices[i]!;
      this._nodes[indice] = objeto;
      this._indicePorObjeto.set(objeto, indice);
      if (matrizes) {
        objeto.matrixWorld.elements = matrizes.subarray(
          indice * MATRIX_ELEMENTS,
          indice * MATRIX_ELEMENTS + MATRIX_ELEMENTS,
        ) as unknown as Matrix4['elements'];
      }
      objeto.matrixWorldAutoUpdate = false;
      this._escutar(objeto);
    }
    this._liveCount += novos.length;
  }

  /**
   * Tira do espelho uma subárvore que saiu da cena.
   *
   * O slot vira lápide NO LUGAR, do lado C++: mudar o índice dos outros
   * obrigaria a reapontar o `matrixWorld` de todos, que é o laço em JS que a
   * SPEC-0234 eliminou. O objeto que sai recebe de volta um `elements` próprio
   * (com a última matriz que tinha) e o `matrixWorldAutoUpdate`, porque o slot
   * pode ser reaproveitado por outro nó — é o caso do pool de *hazards*.
   */
  removeSubtree(raiz: Object3D): void {
    const api = this._bridge;
    if (!this._installed) return;
    const indice = this._indicePorObjeto.get(raiz);
    if (indice === undefined) return;

    api?.removeNode?.(indice);
    const matrizes = this._matrizes;
    raiz.traverse((objeto) => {
      const slot = this._indicePorObjeto.get(objeto);
      if (slot === undefined) return;
      this._indicePorObjeto.delete(objeto);
      this._nodes[slot] = undefined;
      this._liveCount--;
      this._pararDeEscutar(objeto);
      if (matrizes) {
        objeto.matrixWorld.elements = matrizes.slice(
          slot * MATRIX_ELEMENTS,
          slot * MATRIX_ELEMENTS + MATRIX_ELEMENTS,
        ) as unknown as Matrix4['elements'];
      }
      objeto.matrixWorldAutoUpdate = true;
    });
  }

  /**
   * Desliga o espelho e devolve TODO `matrixWorld` ao `three`.
   *
   * É a saída de emergência de quando o espelho deixa de descrever a cena
   * (estouro de capacidade). Recusar assumir custa os milissegundos do marco;
   * seguir com um espelho errado custaria a imagem — e o erro apareceria como
   * artefato visual, não como exceção (SPEC-0234).
   */
  private _invalidarTudo(motivo: string): void {
    const matrizes = this._matrizes;
    for (let i = 0; i < this._nodes.length; i++) {
      const objeto = this._nodes[i];
      if (!objeto) continue;
      this._pararDeEscutar(objeto);
      if (matrizes) {
        objeto.matrixWorld.elements = matrizes.slice(
          i * MATRIX_ELEMENTS,
          i * MATRIX_ELEMENTS + MATRIX_ELEMENTS,
        ) as unknown as Matrix4['elements'];
      }
      objeto.matrixWorldAutoUpdate = true;
    }
    this._nodes = [];
    this._indicePorObjeto.clear();
    this._liveCount = 0;
    this._installed = false;
    this._overflowed = true;
    if (espelhoInstalado === this) espelhoInstalado = undefined;
    debug('perf', `[sceneMirror] DESLIGADO: ${motivo}`);
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
    // As linhas são COMPACTAS: um slot vazio (nó que saiu da cena) é pulado, e
    // o host recebe quantas linhas foram escritas. Mandar a linha de uma lápide
    // ressuscitaria um nó que o `three` já não tem.
    let linhas = 0;
    for (let i = 0; i < this._nodes.length; i++) {
      const objeto = this._nodes[i];
      if (!objeto) continue;
      const base = linhas * SYNC_FLOATS_PER_NODE;
      linhas++;
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
      // O `material.visible` viaja no mesmo slot, pelo mesmo motivo — era a
      // pendência E1 do passo 2, e o mesmo erro já corrigido no `visible`.
      const no = objeto as NoDaCena;
      let flagsDoFrame = objeto.visible ? SYNC_VISIBLE : 0;
      if (materialVisivel(no.material)) flagsDoFrame |= SYNC_MATERIAL_VISIBLE;
      // O lado da face do passe de sombra viaja nos mesmos bits, e pelo mesmo
      // motivo: o `three` reavalia `material.side` a cada travessia, e trocar
      // o lado em runtime (um material compartilhado que vira `DoubleSide`,
      // por exemplo) mudaria a sombra sem o C++ ficar sabendo. Fotografar no
      // `build` seria o TERCEIRO erro do mesmo tipo nesta série — os dois
      // anteriores foram o `visible` e o `material.visible`, e os dois viraram
      // sombra errada em silêncio. O custo aqui é zero: o material do nó já
      // está em mãos para o `material.visible`, e os bits já existiam no campo.
      flagsDoFrame |= ladoDaSombra(no.material) << SYNC_SHADOW_SIDE_SHIFT;
      sync[base + SYNC_FLAGS] = flagsDoFrame;
    }

    camera.updateMatrixWorld();
    this._viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._viewProjection);
    escreverPlanos(this._frustum, this._planes);

    api.update(linhas, this._planes);
  }

  /**
   * Desenha o passe de sombra da cascata em C++ (SPEC-0245, E5 do passo 2).
   *
   * Uma travessia de ponte faz o que o `three` faz em JS por objeto: enumera
   * os casters, passa pelo gate e, se ele deixar, desenha direto na
   * `ShadowDepthTexture`.
   *
   * Tem de rodar DEPOIS de {@link update} — o C++ lê as matrizes de mundo que
   * ele acabou de compor — e com a ortho da cascata já fixada por
   * `shadow.updateMatrices(luz)`: o `three` só a fixa dentro do `renderShadow`,
   * e enumerar antes usaria o frustum do frame passado. E porque, sem o
   * `updateMatrices`, o uniforme
   * `lightShadowMatrix` que o `three` usa para AMOSTRAR o mapa congela, e a
   * sombra fica presa ao mundo de um frame antigo.
   *
   * @param alvo - O `GPUTexture` de `shadow.map.depthTexture`, obtido por
   *   IDENTIDADE do objeto (`backend.get(...)`) e reaquirido por frame: o
   *   `three` recria a textura quando o `mapSize` muda.
   * @param viewProjection - `projectionMatrix × matrixWorldInverse` da ortho da
   *   cascata, em `Float64Array`. **Nunca `Float32Array`**: a multiplicação
   *   por `model` acontece em `double` no C++, e degradar antes é o caminho
   *   conhecido para as bandas da SPEC-0234.
   * @returns `{ drawn }` quando desenhou, `{ refused }` com o motivo quando
   *   não — e `undefined` no browser/Studio, onde não há host.
   */
  drawShadowPass(
    shadowCamera: Camera,
    cameraPosition: Vector3,
    minRatio: number,
    viewProjection: Float64Array,
    alvo: unknown,
    sceneNodeCount: number,
    vsmShadowMap: boolean,
  ): ShadowPassOutcome | undefined {
    const api = this._bridge;
    if (!api?.drawShadowPass || !this._installed) return undefined;

    this._escreverPlanosDaCascata(shadowCamera);
    const resposta = api.drawShadowPass(
      minRatio,
      cameraPosition.x,
      cameraPosition.y,
      cameraPosition.z,
      this._shadowPlanes,
      viewProjection,
      alvo ?? null,
      sceneNodeCount,
      vsmShadowMap,
      this._gateOut,
    );
    if (typeof resposta !== 'number') return undefined;

    const totalCasters = this._gateOut[GATE_OUT_TOTAL_CASTERS] ?? 0;
    if (resposta < 0) {
      const reason = SHADOW_GATE_REASONS[-resposta] ?? 'geometria-ausente';
      return { drawn: 0, refused: true, reason, totalCasters };
    }
    return { drawn: resposta, refused: false, reason: 'aceito', totalCasters };
  }

  /**
   * Deriva os planos da ortho da CASCATA em `_shadowPlanes`.
   *
   * O sistema de coordenadas VEM DA CÂMERA, como no `_projectObject`: em
   * WebGPU o NDC em z vai de 0 a 1, e derivar os planos pela convenção do
   * WebGL daria um near/far deslocado — casters cortados que o `three`
   * desenha, ou o contrário.
   */
  private _escreverPlanosDaCascata(shadowCamera: Camera): void {
    shadowCamera.updateMatrixWorld();
    this._shadowViewProjection.multiplyMatrices(
      shadowCamera.projectionMatrix,
      shadowCamera.matrixWorldInverse,
    );
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
