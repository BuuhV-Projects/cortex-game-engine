/**
 * Layout de dados do espelho de cena (SPEC-0234/0245/0322/0332): o que cada nó
 * manda ao host na construção e por quadro, e as funções puras que leem a
 * autoria do nó (flags, lado da sombra, esfera). Saiu do `NativeSceneMirror.ts`
 * na divisão da SPEC-0678; os números espelham `scene_mirror.h`.
 */
import type { BufferGeometry, Frustum, Material, Object3D } from 'three';
import { BackSide, DoubleSide, FrontSide, Quaternion, Vector3 } from 'three';
import { authoredCastShadow } from '../../scene/ShadowCasterCulling.js';
import { geometryId } from '../../render/GeometryDesc.js';
import { mainPassNodeFlags, SYNC_FRUSTUM_CULLED, SYNC_MAIN_UNSUPPORTED } from '../../render/MainPassKind.js';
import type { ObjetoEnganchado } from './mirrorHooks.js';

/** Floats por nó na descrição inicial (ver `scene_mirror_shim.cpp`). */
export const BUILD_FLOATS_PER_NODE = 21;
/** Posições do layout de construção que o M6 acrescentou (SPEC-0245). */
export const BUILD_FLAGS = 13;
export const BUILD_GEOMETRY_ID = 14;
export const BUILD_BOUNDS_CENTER = 15;
export const BUILD_BOUNDS_RADIUS = 18;
/**
 * `material.visible` INICIAL. O valor por frame chega pelo buffer de
 * sincronização; o `build` só precisa de um estado de partida, porque o
 * primeiro frame enumera antes de qualquer `update`.
 */
export const BUILD_MATERIAL_VISIBLE = 19;
/**
 * Lado da face do passe de sombra INICIAL (ver {@link ladoDaSombra}). Como o
 * `material.visible`, o valor de verdade viaja por frame; aqui vai só o estado
 * de partida.
 */
export const BUILD_SHADOW_SIDE = 20;

/** Bits de `flags` — espelham `NodeFlag` em `scene_mirror.h`. */
export const FLAG_CAST_SHADOW = 1;
export const FLAG_SKIP_ANGULAR_CULL = 2;
export const FLAG_FRUSTUM_CULLED = 4;
/** É malha com geometria. `material.visible` NÃO entra: ele viaja por frame. */
export const FLAG_DRAWABLE = 8;
/** Motivos de recusa do gate (SPEC-0245, E3) — ver `ShadowGateRefusal`. */
export const FLAG_SKINNED = 16;
export const FLAG_INSTANCED = 32;
export const FLAG_MATERIAL_ARRAY = 64;
export const FLAG_ALPHA_CLIP = 128;
export const FLAG_POSITION_NODE = 256;

/** `geometryId` deste valor = nó sem geometria (ver `kNoGeometry`). */
export const NO_GEOMETRY = -1;
/**
 * Codificação de "pai dentro do próprio LOTE" no campo `parent` da descrição
 * (ver `kBatchParentBase` em `scene_mirror.h`).
 *
 * A subárvore nova atravessa a ponte numa chamada só; o pai dos nós de dentro
 * só ganha índice durante o append, então viaja como posição no lote.
 */
export const BATCH_PARENT_BASE = -2;
/** Código de `appendNodes` para estouro de capacidade (ver o shim). */
export const APPEND_ERROR_CAPACITY = -1;
/** Floats por nó no buffer de sincronização (ver `scene_mirror.h`). */
export const SYNC_FLOATS_PER_NODE = 12;
/**
 * Posição das flags do FRAME na linha de sincronização (ver `SyncFlag`).
 *
 * Campo de bits, e não um float por booleano: o que o `three` reavalia a cada
 * travessia cabe num slot só, e acrescentar um estado novo aqui não alarga a
 * linha nem renumera o layout.
 */
export const SYNC_FLAGS = 11;
/** Bits de {@link SYNC_FLAGS} — espelham `SyncFlag` em `scene_mirror.h`. */
export const SYNC_VISIBLE = 1;
export const SYNC_MATERIAL_VISIBLE = 2;
/** Deslocamento dos dois bits de lado da face (ver `kSyncShadowSideShift`). */
export const SYNC_SHADOW_SIDE_SHIFT = 2;
/**
 * Em quantos quadros a varredura das flags do quadro dá a volta na cena
 * (SPEC-0322). É o atraso máximo de um `visible`/`material.visible`/`side`
 * mudado em runtime chegar ao passe de sombra nativo.
 */
export const SWEEP_PERIOD_FRAMES = 8;
/** Piso da fatia varrida por quadro: cena pequena é varrida inteira. */
export const SWEEP_MIN_NODES = 256;

/**
 * Lado da face com que o passe de sombra desenha o caster — espelha
 * `ShadowSide` em `scene_mirror.h`.
 *
 * Não é o `material.side` cru: é o lado EFETIVO do passe de sombra, com a
 * tabela do `three` já aplicada (ver {@link LADO_DA_SOMBRA}).
 */
export const SHADOW_SIDE_BACK = 0;
export const SHADOW_SIDE_FRONT = 1;
export const SHADOW_SIDE_DOUBLE = 2;
/** Lado que o passe nativo não reproduz — o gate RECUSA o frame (nunca aproxima). */
export const SHADOW_SIDE_UNSUPPORTED = 3;

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
export const LADO_DA_SOMBRA: ReadonlyMap<number, number> = new Map([
  [FrontSide, SHADOW_SIDE_BACK],
  [BackSide, SHADOW_SIDE_FRONT],
  [DoubleSide, SHADOW_SIDE_DOUBLE],
]);

/** O mesmo mapa para um `shadowSide` AUTORADO, que o `three` usa sem inverter. */
export const LADO_AUTORADO: ReadonlyMap<number, number> = new Map([
  [FrontSide, SHADOW_SIDE_FRONT],
  [BackSide, SHADOW_SIDE_BACK],
  [DoubleSide, SHADOW_SIDE_DOUBLE],
]);
/** Elementos de uma Matrix4. */
export const MATRIX_ELEMENTS = 16;
/** Planos de um frustum, com 4 floats cada. */
export const FRUSTUM_PLANES = 6;
export const FRUSTUM_FLOATS = FRUSTUM_PLANES * 4;
/**
 * Raio de recorte usado quando o nó não tem geometria com esfera pronta. Vale
 * como "sempre visível" — cortar por um raio inventado esconderia objeto.
 */
export const DEFAULT_RADIUS = 1e6;

/** Um `Object3D` com o que o espelho precisa saber para classificar o nó. */
export type NoDaCena = Object3D & {
  isMesh?: boolean;
  count?: number;
  instanceMatrix?: { array: Float32Array; version: number };
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
export function flagsDoNo(objeto: NoDaCena, temEsfera: boolean): number {
  let flags = 0;
  if (authoredCastShadow(objeto)) flags |= FLAG_CAST_SHADOW;
  // `InstancedMesh` não é cortado pela esfera: a do nó é a da geometria-BASE
  // na origem do lote, não a do conjunto, e cortar por ela apagaria a sombra
  // da vegetação longe da origem (SPEC-0289, medido). Desenhar o lote numa
  // cascata que não o vê só é recortado — a profundidade sai igual.
  if (objeto.frustumCulled && !objeto.isInstancedMesh) flags |= FLAG_FRUSTUM_CULLED;
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
  // Passe principal (SPEC-0332): o ramo do `_projectObject` e o estado inicial
  // do que depois viaja por quadro.
  return flags | mainPassNodeFlags(objeto);
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
export function ladoDaSombra(material: Material | Material[] | undefined): number {
  // Sem lista intermediária (SPEC-0322): isto roda por nó varrido, e montar um
  // array por chamada eram 10 mil alocações por quadro no DDD 61.
  if (material === undefined) return SHADOW_SIDE_BACK;
  if (!Array.isArray(material)) return ladoDeUmMaterial(material);
  if (material.length === 0) return SHADOW_SIDE_BACK;
  let resolvido = -1;
  for (let i = 0; i < material.length; i++) {
    const lado = ladoDeUmMaterial(material[i]!);
    if (lado === SHADOW_SIDE_UNSUPPORTED) return SHADOW_SIDE_UNSUPPORTED;
    if (resolvido !== -1 && resolvido !== lado) return SHADOW_SIDE_UNSUPPORTED;
    resolvido = lado;
  }
  return resolvido;
}

/** A tabela de {@link ladoDaSombra} aplicada a um material só. */
export function ladoDeUmMaterial(m: Material): number {
  const comLado = m as Material & { shadowSide?: number | null; side?: number };
  const autorado = comLado.shadowSide ?? null;
  return autorado !== null
    ? (LADO_AUTORADO.get(autorado) ?? SHADOW_SIDE_UNSUPPORTED)
    : (LADO_DA_SOMBRA.get(comLado.side ?? FrontSide) ?? SHADOW_SIDE_UNSUPPORTED);
}

/** Bits de `_estaticoPorSlot`: o que do tipo do nó a varredura precisa (SPEC-0332). */
export const ESTATICO_TIPO_RECUSADO = 1;
export const ESTATICO_GRUPO = 2;
/**
 * Sem flag do quadro que mude sem gancho (SPEC-0678): não é `Group` e não tem
 * `material` (`Object3D` puro, `Bone`, câmera). A varredura pula o slot.
 */
export const ESTATICO_SEM_QUADRO = 4;

/** O bit {@link ESTATICO_SEM_QUADRO} do nó — calculado uma vez, na adoção. */
export function semFlagsDoQuadro(objeto: Object3D): boolean {
  return (objeto as Object3D & { isGroup?: boolean }).isGroup !== true && !('material' in objeto);
}

/**
 * As flags do QUADRO de um nó já enganchado (ver {@link SYNC_FLAGS}):
 * `visible`, `material.visible`, o lado da face do passe de sombra e, do passe
 * principal (SPEC-0332), `frustumCulled` cru e a recusa por tipo/`renderOrder`.
 *
 * Roda por nó varrido (~1.300/quadro no DDD 61), por isso lê o `visible` do
 * armazenamento do gancho (sem passar pelo acessor) e o tipo do nó de
 * `estatico` (calculado uma vez na adoção) — só o `renderOrder` de `Group` é
 * relido, porque muda em runtime.
 */
export function flagsDoQuadro(objeto: Object3D, estatico: number): number {
  const no = objeto as NoDaCena;
  let flags = (objeto as unknown as ObjetoEnganchado)._mVis ? SYNC_VISIBLE : 0;
  if (materialVisivel(no.material)) flags |= SYNC_MATERIAL_VISIBLE;
  flags |= ladoDaSombra(no.material) << SYNC_SHADOW_SIDE_SHIFT;
  if (objeto.frustumCulled) flags |= SYNC_FRUSTUM_CULLED;
  if ((estatico & ESTATICO_TIPO_RECUSADO) !== 0 || ((estatico & ESTATICO_GRUPO) !== 0 && objeto.renderOrder !== 0)) {
    flags |= SYNC_MAIN_UNSUPPORTED;
  }
  return flags;
}

/** `material.visible` do `_projectObject`; um array conta se QUALQUER parte desenha. */
export function materialVisivel(material: Material | Material[] | undefined): boolean {
  if (material === undefined) return false;
  return Array.isArray(material) ? material.some((m) => m.visible) : material.visible;
}

/** Os materiais de um nó, como lista — o array é o caso raro, não o comum. */
export function materiais(material: Material | Material[] | undefined): Material[] {
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
export function temRecorteAlfa(material: Material | Material[] | undefined): boolean {
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
export function temPositionNode(material: Material | Material[] | undefined): boolean {
  return materiais(material).some(
    (m) => ((m as Material & { positionNode?: unknown }).positionNode ?? null) !== null,
  );
}

export const _posicaoManual = new Vector3();
export const _rotacaoManual = new Quaternion();
export const _escalaManual = new Vector3();

/**
 * Nó com `matrixAutoUpdate = false` (SPEC-0658): a pose vive em `matrix` e o TRS
 * pode estar no padrão (as peças avulsas das células do Port Hollow). O host
 * recompõe a matriz pelo TRS, então manda o da `matrix` decomposta.
 * ponytail: decompose perde cisalhamento; matriz com shear sai aproximada.
 */
export function escreverTrsDaMatriz(objeto: Object3D, destino: Float32Array | Float64Array, inicio: number): void {
  objeto.matrix.decompose(_posicaoManual, _rotacaoManual, _escalaManual);
  destino[inicio] = _posicaoManual.x;
  destino[inicio + 1] = _posicaoManual.y;
  destino[inicio + 2] = _posicaoManual.z;
  destino[inicio + 3] = _rotacaoManual.x;
  destino[inicio + 4] = _rotacaoManual.y;
  destino[inicio + 5] = _rotacaoManual.z;
  destino[inicio + 6] = _rotacaoManual.w;
  destino[inicio + 7] = _escalaManual.x;
  destino[inicio + 8] = _escalaManual.y;
  destino[inicio + 9] = _escalaManual.z;
}

/**
 * Escreve um nó no layout de construção (ver `kBuildFloatsPerNode`).
 *
 * É a MESMA descrição do `install` e do append de um nó que nasce depois: dois
 * vocabulários diferentes fariam o gate julgar por critérios diferentes
 * conforme o nó tivesse nascido antes ou depois (SPEC-0245, E6).
 */
export function descreverNo(
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
  if (!objeto.matrixAutoUpdate) escreverTrsDaMatriz(objeto, destino, base + 1);
  destino[base + 11] = DEFAULT_RADIUS;
  destino[base + 12] = objeto.visible ? 1 : 0;

  // M6 (SPEC-0245): o que o enumerador de casters precisa — a esfera da
  // GEOMETRIA (em espaço local) e o id que liga o nó aos buffers já
  // registrados. Sem eles o C++ tem a hierarquia e nenhuma ideia do que cada
  // nó desenha.
  const noDaCena = objeto as NoDaCena;
  // A esfera serve ao passe principal também para `Line`/`Points` (SPEC-0332);
  // o id de geometria continua só de malha — é o registro do passe de sombra.
  const geometria = geometriaDeDesenho(noDaCena);
  if (geometria && !geometria.boundingSphere) geometria.computeBoundingSphere();
  const esfera = geometria?.boundingSphere ?? null;
  destino[base + BUILD_FLAGS] = flagsDoNo(noDaCena, esfera !== null);
  destino[base + BUILD_GEOMETRY_ID] =
    geometria && noDaCena.isMesh ? geometryId(geometria) : NO_GEOMETRY;
  destino[base + BUILD_BOUNDS_CENTER] = esfera ? esfera.center.x : 0;
  destino[base + BUILD_BOUNDS_CENTER + 1] = esfera ? esfera.center.y : 0;
  destino[base + BUILD_BOUNDS_CENTER + 2] = esfera ? esfera.center.z : 0;
  destino[base + BUILD_BOUNDS_RADIUS] = esfera ? esfera.radius : 0;
  destino[base + BUILD_MATERIAL_VISIBLE] = materialVisivel(noDaCena.material) ? 1 : 0;
  destino[base + BUILD_SHADOW_SIDE] = ladoDaSombra(noDaCena.material);
}

/** A geometria que o `_projectObject` corta pela esfera: malha, linha ou pontos. */
export function geometriaDeDesenho(no: NoDaCena): BufferGeometry | undefined {
  const comTipo = no as NoDaCena & { isLine?: boolean; isPoints?: boolean };
  return no.isMesh || comTipo.isLine || comTipo.isPoints ? no.geometry : undefined;
}

/** Achata os 6 planos do frustum no buffer que atravessa a ponte. */
export function escreverPlanos(frustum: Frustum, destino: Float32Array): void {
  for (let i = 0; i < FRUSTUM_PLANES; i++) {
    const plano = frustum.planes[i]!;
    const base = i * 4;
    destino[base] = plano.normal.x;
    destino[base + 1] = plano.normal.y;
    destino[base + 2] = plano.normal.z;
    destino[base + 3] = plano.constant;
  }
}
