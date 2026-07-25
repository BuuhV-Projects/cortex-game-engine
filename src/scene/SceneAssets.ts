import { Box3, Vector3, SkinnedMesh } from 'three';
import type { Object3D, Mesh, Texture } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { AssetLoader, disposeObjectResources, type GLTF } from '../core/AssetLoader.js';
import { loadKtx2 } from '../core/loadKtx2.js';
import { Scene } from '../core/Scene.js';

/**
 * Helpers pra montar cena com modelos `.glb`: carregar (com cache), instanciar
 * (clonando + configurando sombras) e **posicionar pela base do bounding box**
 * — o pivô de cada `.glb` é arbitrário, então assentar por medida (e não por
 * `y` chutado) é o que evita peças flutuando/afundadas e conexões desalinhadas.
 *
 * Fluxo típico: \`loadGLB\` → \`instance\` → \`scene.add\` → \`placeOnGround\`, e use
 * as bordas retornadas (\`maxX\`/\`minX\`/\`topY\`...) pra encostar as peças vizinhas.
 */

/**
 * Caixa delimitadora (axis-aligned) de um objeto em **world space**, com os
 * limites desempacotados em escalares. Use `maxX`/`minX`/`maxZ`/`minZ` pra
 * conectar peças pela borda real e `topY` pra empilhar algo no topo.
 */
export interface Bounds {
  /** Canto mínimo (x,y,z) em world space. */
  min: Vector3;
  /** Canto máximo (x,y,z) em world space. */
  max: Vector3;
  /** Dimensões reais (largura, altura, profundidade). */
  size: Vector3;
  /** Centro geométrico. */
  center: Vector3;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Topo do objeto (= `max.y`) — apoie outra peça aqui pra empilhar. */
  topY: number;
  /** Base do objeto (= `min.y`). */
  bottomY: number;
}

/** Opções de sombra pra {@link instance} / {@link setShadows}. */
export interface ShadowOptions {
  /** O objeto projeta sombra. Default `true`. */
  castShadow?: boolean;
  /** O objeto recebe sombra. Default `true`. */
  receiveShadow?: boolean;
}

/** Opções de {@link placeOnGround}. */
export interface PlaceOptions {
  /** Centro horizontal X. Default `0`. */
  x?: number;
  /** Altura onde a BASE da geometria encosta. Default `0`. */
  y?: number;
  /** Centro horizontal Z. Default `0`. */
  z?: number;
  /** Rotação no eixo vertical, em radianos. Default `0`. */
  rotY?: number;
  /** Escala uniforme aplicada antes de medir. Default `1`. */
  scale?: number;
}

const _loader = new AssetLoader();
const _cache = new Map<string, GLTF>();
const _texCache = new Map<string, Texture>();

/**
 * **Despeja todos os caches de asset** do módulo (SPEC-0152): dispõe geometrias
 * (incluindo a árvore BVH do raycast), materiais, texturas e libera o PCM de
 * áudio no host nativo (`free`), então esvazia os Maps. Também aciona o hook do
 * host `__cortexClearObjectUrls` (ADR-0153) — os `blob:` URLs criados no parse
 * de GLB deixam de reter os bytes.
 *
 * Os caches são por URL e **propositalmente** não expiram sozinhos (trocar de
 * fase reusa peças de kit sem recarregar). Chame isto nos pontos de troca
 * "larga" — tipicamente via `game.reset({ releaseAssets: true })` ao voltar pro
 * menu/trocar de mundo. Depois disto, cada asset volta a custar carga completa.
 */
export function clearSceneAssetCaches(): void {
  for (const gltf of _cache.values()) disposeObjectResources(gltf.scene);
  _cache.clear();
  for (const tex of _texCache.values()) tex.dispose();
  _texCache.clear();
  _loader.disposeCache();
  (globalThis as { __cortexClearObjectUrls?: () => void }).__cortexClearObjectUrls?.();
}

/**
 * Carrega um `.glb`/`.gltf` (com cache por URL — chamadas repetidas reusam o
 * mesmo GLTF; clone com {@link instance} antes de adicionar à cena).
 *
 * @param url - Caminho relativo à raiz do projeto (ex.: `'assets/tree.glb'`).
 */
export async function loadGLB(url: string): Promise<GLTF> {
  let gltf = _cache.get(url);
  if (!gltf) {
    gltf = await _loader.loadGLTF(url);
    markCachedResources(gltf.scene);
    _cache.set(url, gltf);
  }
  return gltf;
}

/**
 * Marca geometrias/materiais/texturas de um GLTF cacheado como **residentes**
 * (`userData.cortexCached`): o `Scene.disposeAll` PULA o dispose deles na troca
 * de fase (SPEC-0152). Sem isso, cada troca destruía e re-subia ~1 GB de
 * texturas do kit — além do custo de load, o alocador do wgpu cresce em blocos
 * (~256 MB) que nunca devolve (churn = VRAM/RAM subindo em degraus no export).
 * O despejo EXPLÍCITO ({@link clearSceneAssetCaches}) continua liberando tudo.
 */
function markCachedResources(root: { traverse(cb: (o: unknown) => void): void }): void {
  root.traverse((o) => {
    const mesh = o as {
      geometry?: { userData: Record<string, unknown> };
      material?: { userData: Record<string, unknown> } | Array<{ userData: Record<string, unknown> }>;
    };
    if (mesh.geometry) mesh.geometry.userData['cortexCached'] = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) {
      m.userData['cortexCached'] = true;
      for (const value of Object.values(m as unknown as Record<string, unknown>)) {
        const tex = value as { isTexture?: boolean; userData?: Record<string, unknown> } | null;
        if (tex?.isTexture && tex.userData) tex.userData['cortexCached'] = true;
      }
    }
  });
}

/**
 * Carrega uma **textura** (png/jpg/webp) com cache por URL — para sprites 2D /
 * spritesheets. A textura cacheada é compartilhada; quem precisar animar
 * independente (cada sprite com seu recorte UV) deve cloná-la (o
 * {@link createAnimatedSprite} já faz isso).
 *
 * Texturas **`.ktx2`** (Basis, ADR-0108) são roteadas pro {@link loadKtx2}
 * (transcoder nativo no host / `KTX2Loader` no browser) — comprimidas e
 * portáveis pro console; o `pixelated` é ignorado (KTX2 usa linear + mipmaps).
 *
 * @param url - Caminho relativo à raiz do projeto (ex.: `'assets/hero.png'`).
 * @param pixelated - Nearest filter (pixel art). Default `true`. Ignorado p/ KTX2.
 */
export async function loadTexture(url: string, pixelated = true): Promise<Texture> {
  let tex = _texCache.get(url);
  if (!tex) {
    tex = /\.ktx2$/i.test(url) ? await loadKtx2(url) : await _loader.loadTexture(url, { pixelated });
    tex.userData['cortexCached'] = true; // residente entre fases (ver markCachedResources)
    _texCache.set(url, tex);
  }
  return tex;
}

/**
 * Liga/desliga sombras em todos os meshes de um objeto. Use pra **excluir um
 * objeto específico** do shadowMap (ex.: água, decals, props pequenos):
 * `setShadows(water, { castShadow: false })`.
 *
 * @param object - O objeto (ou grupo) a configurar.
 * @param options - Quais sombras ligar. Campos omitidos não são alterados.
 */
export function setShadows(object: Object3D, options: ShadowOptions): void {
  object.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    if (options.castShadow !== undefined) mesh.castShadow = options.castShadow;
    if (options.receiveShadow !== undefined) mesh.receiveShadow = options.receiveShadow;
  });
}

/**
 * Liga/desliga a **névoa da cena** nos materiais de um objeto.
 *
 * A `fog` é global e tinge tudo em função da distância — inclusive o que está
 * longe **de propósito**: um planeta, uma montanha, um marco de horizonte cuja
 * função é justamente ser lido de longe. Com névoa forte esses marcos perdem a
 * cor própria e viram todos do mesmo tom. Isentá-los devolve a cor sem abrir
 * mão da profundidade que a névoa dá ao resto da cena.
 *
 * @param object - O objeto (ou grupo) a configurar.
 * @param enabled - `false` exclui o objeto da névoa.
 *
 * @example
 * setFog(planet, false) // o planeta de fundo mantém a cor própria
 */
export function setFog(object: Object3D, enabled: boolean): void {
  eachMat(object, (mat) => {
    if (mat.fog === undefined) return; // materiais sem suporte a fog
    mat.fog = enabled;
    mat.needsUpdate = true; // a névoa entra no shader: precisa recompilar
  });
}

/** Opções de {@link setMatte}. */
export interface MatteOptions {
  /** Aspereza (0 = espelho/brilhoso, 1 = fosco total). Default `1`. */
  roughness?: number;
  /** Metalicidade (0 = dielétrico, sem reflexo metálico). Default `0`. */
  metalness?: number;
  /** Intensidade do reflexo do ambiente (0 = nenhum). Default `0`. */
  envMapIntensity?: number;
}

/**
 * Deixa os materiais de um objeto **foscos** — mata o brilho plástico/PBR que os
 * `.glb` stylized vêm por padrão. Zera o specular e o reflexo do ambiente
 * (`roughness=1`, `metalness=0`, `envMapIntensity=0`), dando o aspecto
 * **cartoon/fosco/desenho** em vez do "brilhoso". As texturas (mapas de cor)
 * continuam intactas. Aplique no objeto instanciado, ou na raiz da cena pra
 * deixar tudo fosco de uma vez.
 *
 * @example
 * const tree = instance(await loadGLB('assets/tree.glb'))
 * scene.add(tree); setMatte(tree)
 * // ou tudo de uma vez: setMatte(scene.getThreeScene())
 */
interface PbrMat {
  roughness?: number;
  metalness?: number;
  envMapIntensity?: number;
  fog?: boolean;
  needsUpdate?: boolean;
  userData?: Record<string, unknown>;
}

const MATTE_CACHE = 'cortexOrigPBR';
const MATTE_FLAG = 'cortexMatte';

function eachMat(object: Object3D, fn: (mat: PbrMat) => void): void {
  object.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) fn(m as unknown as PbrMat);
  });
}

export function setMatte(object: Object3D, options: MatteOptions = {}): void {
  const { roughness = 1, metalness = 0, envMapIntensity = 0 } = options;
  eachMat(object, (mat) => {
    // Cacheia o original UMA vez, pra {@link clearMatte} poder restaurar.
    if (mat.userData && mat.userData[MATTE_CACHE] === undefined) {
      mat.userData[MATTE_CACHE] = {
        roughness: mat.roughness,
        metalness: mat.metalness,
        envMapIntensity: mat.envMapIntensity,
      };
    }
    if (mat.roughness !== undefined) mat.roughness = roughness;
    if (mat.metalness !== undefined) mat.metalness = metalness;
    if (mat.envMapIntensity !== undefined) mat.envMapIntensity = envMapIntensity;
    mat.needsUpdate = true;
  });
  object.userData[MATTE_FLAG] = true;
}

/**
 * Desfaz o {@link setMatte}: restaura roughness/metalness/envMapIntensity originais
 * (cacheados no primeiro `setMatte`). É o "desligar" do toggle de material do editor.
 */
export function clearMatte(object: Object3D): void {
  eachMat(object, (mat) => {
    const orig = mat.userData?.[MATTE_CACHE] as
      | { roughness?: number; metalness?: number; envMapIntensity?: number }
      | undefined;
    if (!orig) return;
    if (orig.roughness !== undefined) mat.roughness = orig.roughness;
    if (orig.metalness !== undefined) mat.metalness = orig.metalness;
    if (orig.envMapIntensity !== undefined) mat.envMapIntensity = orig.envMapIntensity;
    if (mat.userData) delete mat.userData[MATTE_CACHE];
    mat.needsUpdate = true;
  });
  object.userData[MATTE_FLAG] = false;
}

/** `true` se o objeto está fosco (via {@link setMatte}). Pro estado do toggle. */
export function isMatte(object: Object3D): boolean {
  return object.userData?.[MATTE_FLAG] === true;
}

/**
 * Clona a cena de um GLTF (seguro pra `SkinnedMesh`) e configura sombras nos
 * meshes. Clonar permite spawnar N cópias do mesmo GLTF carregado uma vez.
 *
 * Pra um objeto **sem sombra** (não entra no shadowMap), passe
 * `{ castShadow: false, receiveShadow: false }` — ou ajuste depois com
 * {@link setShadows}.
 *
 * @param gltf - O GLTF carregado (via {@link loadGLB}).
 * @param shadows - Configuração de sombra. Default: projeta e recebe.
 * @returns Um novo `Object3D` pronto pra `scene.add(...)`.
 */
export function instance(gltf: GLTF, shadows: ShadowOptions = {}): Object3D {
  const obj = clone(gltf.scene);
  setShadows(obj, {
    castShadow: shadows.castShadow ?? true,
    receiveShadow: shadows.receiveShadow ?? true,
  });
  fixCulling(obj, (gltf.animations?.length ?? 0) > 0);
  return obj;
}

/**
 * Conserta o **frustum culling** de um GLB instanciado: recomputa a
 * `boundingSphere` de cada mesh (clones podem herdar uma esfera obsoleta, fazendo
 * o objeto **sumir mesmo no centro da tela**) e **desliga** o culling em malhas
 * cuja esfera estática não é confiável — `SkinnedMesh` ou qualquer mesh de um GLB
 * **animado** (ex.: baú que abre): a animação move os vértices pra fora da esfera
 * de descanso e o three corta a malha cedo demais.
 */
function fixCulling(obj: Object3D, animated: boolean): void {
  obj.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.computeBoundingSphere();
    if (animated || (child as SkinnedMesh).isSkinnedMesh) mesh.frustumCulled = false;
  });
}

/**
 * Mede o bounding box de um objeto em **world space** (sem movê-lo). Atualiza as
 * matrizes antes de medir, então reflete posição/rotação/escala atuais.
 */
export function getWorldBounds(object: Object3D): Bounds {
  object.updateWorldMatrix(true, true);
  return boundsOf(object);
}

/**
 * Assenta um objeto: aplica `rotY`/`scale`, posiciona o **centro horizontal** em
 * `(x, z)` e a **base** da geometria (ponto mais baixo do bbox) em `y` —
 * independente de onde está o pivô do `.glb`. Retorna os {@link Bounds} já
 * reposicionados, pra você conectar peças vizinhas por bordas reais.
 *
 * @param object - O objeto a assentar (tipicamente recém-adicionado à cena).
 * @param options - Posição/rotação/escala. Ver {@link PlaceOptions}.
 * @returns Os limites em world space após o posicionamento.
 *
 * @example
 * const a = placeOnGround(islandA, { x: 0, y: -1.5 })
 * const b = placeOnGround(islandB, { x: 25, y: -1.5 })
 * // ponte no meio do gap real, deck no topo das ilhas:
 * placeOnGround(bridge, { x: (a.maxX + b.minX) / 2, y: a.topY, z: a.center.z })
 */
export function placeOnGround(object: Object3D, options: PlaceOptions = {}): Bounds {
  const { x = 0, y = 0, z = 0, rotY = 0, scale = 1 } = options;
  object.rotation.y = rotY;
  object.scale.setScalar(scale);
  object.updateWorldMatrix(true, true);

  const box = new Box3().setFromObject(object);
  const center = box.getCenter(new Vector3());
  // Desloca: base -> y, centro horizontal -> (x, z). Soma o position atual pra
  // compensar pivôs deslocados (a bbox é world-space, o position é local).
  object.position.set(
    x - center.x + object.position.x,
    y - box.min.y + object.position.y,
    z - center.z + object.position.z,
  );
  object.updateWorldMatrix(true, true);
  return boundsOf(object);
}

/**
 * Espalha `count` cópias de um `.glb` aleatoriamente dentro de uma área
 * retangular, cada uma assentada no chão com rotação/escala variadas — pra
 * vegetação e detalhes em clusters naturais (não em grid).
 *
 * @param scene - Cena onde adicionar.
 * @param url - Caminho do `.glb`.
 * @param count - Quantas instâncias.
 * @param area - Centro `(x,z)`, tamanho `(w,d)` e altura da base `y`.
 * @param options - Faixas de escala/rotação e sombras.
 * @returns Os objetos criados.
 */
export async function scatter(
  scene: Scene,
  url: string,
  count: number,
  area: { x: number; z: number; w: number; d: number; y: number },
  options: { scale?: [number, number]; rotY?: [number, number]; shadows?: ShadowOptions } = {},
): Promise<Object3D[]> {
  const [sMin, sMax] = options.scale ?? [0.85, 1.15];
  const [rMin, rMax] = options.rotY ?? [0, Math.PI * 2];
  const gltf = await loadGLB(url);
  const placed: Object3D[] = [];
  for (let i = 0; i < count; i++) {
    const obj = instance(gltf, options.shadows);
    scene.add(obj);
    placeOnGround(obj, {
      x: area.x + (Math.random() - 0.5) * area.w,
      z: area.z + (Math.random() - 0.5) * area.d,
      y: area.y,
      rotY: rMin + Math.random() * (rMax - rMin),
      scale: sMin + Math.random() * (sMax - sMin),
    });
    placed.push(obj);
  }
  return placed;
}

function boundsOf(object: Object3D): Bounds {
  const box = new Box3().setFromObject(object);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  return {
    min: box.min.clone(),
    max: box.max.clone(),
    size,
    center,
    minX: box.min.x,
    maxX: box.max.x,
    minZ: box.min.z,
    maxZ: box.max.z,
    topY: box.max.y,
    bottomY: box.min.y,
  };
}
