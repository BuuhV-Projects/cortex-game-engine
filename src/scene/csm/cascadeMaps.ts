/**
 * O mapa de profundidade de cada cascata quando o `three` não o criou (SPEC-0690).
 *
 * Quem cria o `shadow.map` de uma cascata é o `ShadowNode` do `three`, no `setup` — e ele só roda para um material
 * que o `three` desenha. Com todos os receptores no renderer nativo, nenhum roda: a cascata nunca ganha mapa, o C++
 * não tem onde desenhar e o receptor nativo não tem o que ler. Aqui o mapa nasce igual ao do `three`
 * (`ShadowNode.setupRenderTarget`, three 0.184) e a textura de GPU sai do próprio renderer (`initRenderTarget`).
 * Se um receptor do `three` aparecer depois, o `ShadowNode` troca o `shadow.map` pelo dele; o passe nativo pega o
 * alvo por identidade a cada quadro, então segue o novo.
 */
import {
  DepthTexture,
  GreaterEqualCompare,
  LessEqualCompare,
  LinearFilter,
  NearestFilter,
  PCFShadowMap,
  PCFSoftShadowMap,
  RenderTarget,
  type TextureDataType,
} from 'three';

/** Rótulo que o `three` dá à textura de profundidade do shadow map (usado como ASSERÇÃO, nunca para achar o alvo). */
export const SHADOW_DEPTH_TEXTURE_LABEL = 'ShadowDepthTexture';
/** Rótulo da textura de cor do alvo (`ShadowNode.setupRenderTarget`). */
const SHADOW_MAP_TEXTURE_LABEL = 'ShadowMap';

/** O mapa que esta criação deu a cada `shadow`: sai (dispose) quando o `ShadowNode` do `three` põe o dele. */
const criados = new WeakMap<object, RenderTarget>();

/** Os campos do renderer (o `three`) que a criação lê. */
export interface CascadeMapRenderer {
  coordinateSystem?: number;
  reversedDepthBuffer?: boolean;
  shadowMap?: { type?: number };
  initRenderTarget?(target: RenderTarget): void;
}

/** A `shadow` de uma cascata, como a criação a vê. */
export interface CascadeMapShadow {
  map?: unknown;
  mapSize: { width: number; height: number };
  mapType?: TextureDataType;
  camera?: { coordinateSystem: number; updateProjectionMatrix(): void };
}

/**
 * Garante o sistema de coordenadas da câmera da cascata e o mapa dela.
 *
 * A câmera nasce no do WebGL, e quem a passa para o do renderer é o mesmo `setup` do `ShadowNode`. Sem ele, a ortho
 * da cascata sai com z em [-1, 1]: o C++ desenharia com metade da profundidade cortada pelo clip do WebGPU.
 */
/**
 * Solta o mapa que {@link ensureCascadeMap} criou para esta `shadow` (teardown do nó CSM, SPEC-0690). Se o `three` já
 * trocou o mapa pelo dele, só o nosso sai: o dele é do `ShadowNode`.
 */
export function releaseCascadeMap(shadow: CascadeMapShadow): void {
  const nosso = criados.get(shadow);
  if (nosso === undefined) return;
  if (shadow.map === nosso) shadow.map = null;
  nosso.dispose();
  criados.delete(shadow);
}

export function ensureCascadeMap(shadow: CascadeMapShadow, renderer: CascadeMapRenderer): void {
  const camera = shadow.camera;
  const system = renderer.coordinateSystem;
  if (camera && system !== undefined && camera.coordinateSystem !== system) {
    camera.coordinateSystem = system;
    camera.updateProjectionMatrix();
  }
  const nosso = criados.get(shadow);
  if (shadow.map) {
    if (nosso !== undefined && shadow.map !== nosso) {
      nosso.dispose();
      criados.delete(shadow);
    }
    return;
  }
  const { width, height } = shadow.mapSize;
  const depth = new DepthTexture(width, height);
  depth.name = SHADOW_DEPTH_TEXTURE_LABEL;
  depth.compareFunction = renderer.reversedDepthBuffer ? GreaterEqualCompare : LessEqualCompare;
  const type = renderer.shadowMap?.type;
  const filter = type === PCFShadowMap || type === PCFSoftShadowMap ? LinearFilter : NearestFilter;
  depth.minFilter = filter;
  depth.magFilter = filter;
  const target = new RenderTarget(width, height);
  target.texture.name = SHADOW_MAP_TEXTURE_LABEL;
  if (shadow.mapType !== undefined) target.texture.type = shadow.mapType;
  target.depthTexture = depth;
  shadow.map = target;
  criados.set(shadow, target);
  renderer.initRenderTarget?.(target);
}
