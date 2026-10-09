/**
 * Classificação de um nó para a projeção do passe principal em C++
 * (SPEC-0332, etapa (a) do ADR-0330).
 *
 * Espelha os ramos do `_projectObject` do `three` 0.184. Funções puras: quem
 * as chama é o `NativeSceneMirror` (ao descrever o nó) e a projeção nativa (ao
 * montar a RenderList). Os bits espelham `NodeFlag`/`SyncFlag` em
 * `native/src/scene/scene_mirror.h`.
 */
import type { Object3D } from 'three';

/** O que a projeção faz com o nó quando ele é alcançável. */
export const enum MainPassKind {
  /** Nada (grupo, câmera, `LineLoop`, malha sem geometria). */
  None = 0,
  /** Culling e `z` em C++, pela esfera da geometria. */
  NativeCull = 1,
  /** Entra quando visível; o JS faz o culling exato do `three`. */
  JsCull = 2,
  /** Luz: vai para a lista de luzes. */
  Light = 3,
}

/** Bits de autoria (`NodeFlag`) que a SPEC-0332 acrescentou. */
export const NODE_MAIN_CULL = 1 << 9;
export const NODE_MAIN_JS_CULL = 1 << 10;
export const NODE_LIGHT = 1 << 11;
export const NODE_MAIN_UNSUPPORTED = 1 << 12;
export const NODE_MAIN_FRUSTUM_CULLED = 1 << 13;

/** Bits do quadro (`SyncFlag`) que a SPEC-0332 acrescentou. */
export const SYNC_FRUSTUM_CULLED = 1 << 4;
export const SYNC_MAIN_UNSUPPORTED = 1 << 5;

/** O que este módulo lê de um nó — tudo opcional, como no `three`. */
type NoClassificavel = Object3D & {
  isMesh?: boolean;
  isLine?: boolean;
  isLineLoop?: boolean;
  isPoints?: boolean;
  isSprite?: boolean;
  isLight?: boolean;
  isGroup?: boolean;
  isLOD?: boolean;
  isClippingGroup?: boolean;
  isBundleGroup?: boolean;
  geometry?: unknown;
  /** `InstancedMesh`/`SkinnedMesh`/`BatchedMesh` têm esfera PRÓPRIA. */
  boundingSphere?: unknown;
};

/**
 * Ramo do `_projectObject` que o nó tomaria. A ordem dos testes é a do
 * `three`: `isGroup`/`isLOD` antes de luz, sprite antes de malha, `LineLoop`
 * antes de `Line` (o `three` recusa `LineLoop` com erro e não empurra nada).
 */
export function mainPassKind(objeto: Object3D): MainPassKind {
  const no = objeto as NoClassificavel;
  if (no.isGroup || no.isLOD) return MainPassKind.None;
  if (no.isLight) return MainPassKind.Light;
  if (no.isSprite) return MainPassKind.JsCull;
  if (no.isLineLoop) return MainPassKind.None;
  if (!(no.isMesh || no.isLine || no.isPoints) || !no.geometry) return MainPassKind.None;
  // A esfera que o `Frustum.intersectsObject` usa é a do OBJETO quando ele
  // tem uma — e o espelho só conhece a da geometria.
  return no.boundingSphere !== undefined ? MainPassKind.JsCull : MainPassKind.NativeCull;
}

/**
 * O nó tem algo que a projeção nativa não reproduz: `groupOrder` vindo de um
 * `Group` com `renderOrder`, `LOD` (troca filhos dentro da projeção),
 * `ClippingGroup` (muda o contexto de recorte) ou `BundleGroup`.
 */
export function mainPassUnsupported(objeto: Object3D): boolean {
  const no = objeto as NoClassificavel;
  return (no.isGroup === true && objeto.renderOrder !== 0) || mainPassUnsupportedType(objeto);
}

/** A parte de {@link mainPassUnsupported} que é do TIPO do nó (não muda em runtime). */
export function mainPassUnsupportedType(objeto: Object3D): boolean {
  const no = objeto as NoClassificavel;
  return no.isLOD === true || no.isClippingGroup === true || no.isBundleGroup === true;
}

/** Bits de autoria do passe principal para o layout de construção. */
export function mainPassNodeFlags(objeto: Object3D): number {
  let flags = 0;
  const tipo = mainPassKind(objeto);
  if (tipo === MainPassKind.NativeCull) flags |= NODE_MAIN_CULL;
  else if (tipo === MainPassKind.JsCull) flags |= NODE_MAIN_JS_CULL;
  else if (tipo === MainPassKind.Light) flags |= NODE_LIGHT;
  if (mainPassUnsupported(objeto)) flags |= NODE_MAIN_UNSUPPORTED;
  if (objeto.frustumCulled) flags |= NODE_MAIN_FRUSTUM_CULLED;
  return flags;
}

/** Bits do QUADRO do passe principal (a linha de sincronização). */
export function mainPassFrameFlags(objeto: Object3D): number {
  let flags = objeto.frustumCulled ? SYNC_FRUSTUM_CULLED : 0;
  if (mainPassUnsupported(objeto)) flags |= SYNC_MAIN_UNSUPPORTED;
  return flags;
}
