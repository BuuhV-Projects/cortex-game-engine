/**
 * AssetLoader — carregamento e cache de assets 3D (texturas, GLTF, áudio).
 *
 * Mantém um cache interno `Map<url, asset>` para evitar requisições duplicadas.
 * Usa `THREE.TextureLoader`, `THREE.AudioLoader` e `GLTFLoader` conforme
 * definido em ADR-0001.
 *
 * A integração com Three.js fica confinada a `src/core/` (ADR-0001); o restante
 * do motor referencia assets pelos tipos retornados sem importar Three.js
 * diretamente.
 *
 * Referência: ADR-0001 (Renderizador baseado em Three.js)
 */

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { CortexKtx2Loader } from './loadKtx2.js';

// ─── Re-exportação de GLTF ────────────────────────────────────────────────────

/**
 * Tipo GLTF retornado por `loadGLTF()`.
 * Re-exportado para que o restante do engine não precise importar do caminho
 * interno do Three.js, mantendo o isolamento definido em ADR-0001.
 */
export type { GLTF };

// ─── União dos tipos de asset gerenciados pelo loader ─────────────────────────

type Asset = THREE.Texture | GLTF | AudioBuffer | THREE.Group;

// ─── Dispose de árvore de objetos ─────────────────────────────────────────────

/**
 * Dispõe os recursos de uma árvore de objetos: geometrias (incluindo a árvore
 * BVH do three-mesh-bvh, se houver), materiais e texturas referenciadas. Usado
 * pelo despejo de caches (SPEC-0152) — o `Scene.disposeAll` cobre o que está NA
 * cena; isto cobre o que ficou só em cache (GLTF/FBX carregados).
 *
 * Seguro chamar sobre objetos já dispostos (dispose do three é idempotente).
 */
export function disposeObjectResources(root: THREE.Object3D): void {
  const seenTex = new Set<THREE.Texture>();
  const disposeMaterial = (m: THREE.Material): void => {
    for (const value of Object.values(m as unknown as Record<string, unknown>)) {
      if (value instanceof THREE.Texture && !seenTex.has(value)) {
        seenTex.add(value);
        value.dispose();
      }
    }
    m.dispose();
  };
  root.traverse((obj) => {
    const mesh = obj as Partial<THREE.Mesh>;
    const g = mesh.geometry as
      | (THREE.BufferGeometry & { boundsTree?: unknown; disposeBoundsTree?: () => void })
      | undefined;
    if (g) {
      // BVH do raycast (physics/raycastAccel): pendurada na geometria, não sai
      // no `geometry.dispose()` (que só libera GPU) — solta explicitamente.
      if (g.boundsTree) {
        if (g.disposeBoundsTree) g.disposeBoundsTree();
        else g.boundsTree = undefined;
      }
      g.dispose();
    }
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach(disposeMaterial);
    else if (mat) disposeMaterial(mat);
    if ((obj as Partial<THREE.InstancedMesh>).isInstancedMesh) {
      (obj as THREE.InstancedMesh).dispose();
    }
    // Luz (GLB pode embutir) e skeleton: shadow map e boneTexture só saem no
    // dispose dos PRÓPRIOS objetos, fora do caminho geometria/material.
    if ((obj as Partial<THREE.Light>).isLight) {
      (obj as THREE.Light).dispose();
    }
    if ((obj as Partial<THREE.SkinnedMesh>).isSkinnedMesh) {
      (obj as THREE.SkinnedMesh).skeleton?.dispose();
    }
  });
}

// ─── Classe AssetLoader ───────────────────────────────────────────────────────

export class AssetLoader {
  /** Cache interno: url → asset já carregado. */
  private readonly _cache = new Map<string, Asset>();

  /** Instâncias reutilizadas dos loaders do Three.js. */
  private readonly _textureLoader = new THREE.TextureLoader();
  private readonly _gltfLoader = new GLTFLoader();
  private readonly _fbxLoader = new FBXLoader();
  private readonly _audioLoader = new THREE.AudioLoader();

  constructor() {
    // Texturas KTX2/Basis embutidas em GLB (KHR_texture_basisu, ADR-0108):
    // transcoder C++ no host / KTX2Loader do three no browser. Sem isto, um GLB
    // com textura KTX2 falha ("requires KTX2Loader").
    this._gltfLoader.setKTX2Loader(new CortexKtx2Loader() as never);
  }

  // ─── Métodos de carregamento ────────────────────────────────────────────────

  /**
   * Carrega uma textura a partir da `url` e a armazena em cache.
   * Chamadas subsequentes com a mesma URL retornam a instância em cache sem
   * nova requisição de rede.
   *
   * @param url - Caminho ou URL absoluta para o arquivo de imagem.
   * @returns Promessa resolvida com `THREE.Texture`.
   */
  async loadTexture(url: string, options?: { pixelated?: boolean }): Promise<THREE.Texture> {
    let texture = this._cache.get(url) as THREE.Texture | undefined;
    if (texture === undefined) {
      texture = await this._textureLoader.loadAsync(url);
      this._cache.set(url, texture);
    }
    if (options?.pixelated) {
      // Pixel art: amostragem **nearest** (sem borrar) e sem mipmaps.
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
    }
    return texture;
  }

  /**
   * Carrega um modelo GLTF/GLB a partir da `url` e o armazena em cache.
   * Chamadas subsequentes com a mesma URL retornam o objeto em cache.
   *
   * @param url - Caminho ou URL absoluta para o arquivo `.gltf` ou `.glb`.
   * @returns Promessa resolvida com o objeto `GLTF`.
   */
  async loadGLTF(url: string): Promise<GLTF> {
    const cached = this._cache.get(url);
    if (cached !== undefined) {
      return cached as GLTF;
    }

    const gltf = await this._gltfLoader.loadAsync(url);
    this._cache.set(url, gltf);
    return gltf;
  }

  /**
   * Carrega um modelo FBX a partir da `url` e o armazena em cache.
   * Chamadas subsequentes com a mesma URL retornam o grupo em cache.
   *
   * O `THREE.Group` retornado tem `.animations` populado com os
   * `AnimationClip`s embarcados no FBX — passe pra um `AnimationMixer`
   * pra tocar (`mixer.clipAction(group.animations[0]).play()`).
   *
   * Suporte adicionado pra abrir caminho a assets de bancos públicos
   * (Mixamo, Sketchfab) que frequentemente entregam só `.fbx` com rig
   * e animações. GLTF/GLB continua sendo o formato preferido por ser
   * mais leve e otimizado pra web.
   *
   * @param url - Caminho ou URL absoluta para o arquivo `.fbx`.
   * @returns Promessa resolvida com `THREE.Group` (com `animations`).
   */
  async loadFBX(url: string): Promise<THREE.Group> {
    const cached = this._cache.get(url);
    if (cached !== undefined) {
      return cached as THREE.Group;
    }

    const group = await this._fbxLoader.loadAsync(url);
    this._cache.set(url, group);
    return group;
  }

  /**
   * Carrega um arquivo de áudio a partir da `url` e o armazena em cache.
   * Chamadas subsequentes com a mesma URL retornam o buffer em cache.
   *
   * @param url - Caminho ou URL absoluta para o arquivo de áudio.
   * @returns Promessa resolvida com `AudioBuffer`.
   */
  async loadAudio(url: string): Promise<AudioBuffer> {
    const cached = this._cache.get(url);
    if (cached !== undefined) {
      return cached as AudioBuffer;
    }

    const buffer = await this._audioLoader.loadAsync(url);
    this._cache.set(url, buffer);
    return buffer;
  }

  /**
   * Pré-carrega um conjunto de URLs em paralelo.
   *
   * O tipo de loader é inferido pela extensão do arquivo:
   * - `.gltf` / `.glb` → `loadGLTF`
   * - `.fbx` → `loadFBX`
   * - `.mp3` / `.wav` / `.ogg` / `.aac` / `.m4a` → `loadAudio`
   * - qualquer outra extensão → `loadTexture` (png, jpg, webp, etc.)
   *
   * Assets já presentes no cache são retornados imediatamente sem nova
   * requisição.
   *
   * @param urlArray - Lista de URLs a pré-carregar.
   * @returns Promessa resolvida com array de assets na mesma ordem da entrada.
   */
  preload(
    urlArray: string[],
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<Asset[]> {
    const total = urlArray.length;
    let loaded = 0;
    return Promise.all(
      urlArray.map(async (url) => {
        const asset = await this._dispatchLoad(url);
        loaded += 1;
        onProgress?.(loaded, total);
        return asset;
      }),
    );
  }

  // ─── Utilitários do cache ───────────────────────────────────────────────────

  /**
   * Número de entradas atualmente no cache.
   * Útil para diagnóstico e testes.
   */
  get cacheSize(): number {
    return this._cache.size;
  }

  /**
   * Remove todas as entradas do cache interno.
   * Não descarta texturas da GPU — chamar `texture.dispose()` manualmente
   * se necessário antes de limpar (ou usar {@link disposeCache}).
   */
  clearCache(): void {
    this._cache.clear();
  }

  /**
   * **Despeja** o cache liberando os recursos de cada asset (SPEC-0152):
   * texturas → `dispose()`; GLTF/FBX → {@link disposeObjectResources}
   * (geometria + BVH + materiais/texturas); áudio → `free?.()` (existe no
   * wrapper de `AudioBuffer` do host nativo, que solta o PCM decodificado do
   * lado C++ — ADR-0153; no browser é no-op). Depois disto, cada URL volta a
   * custar uma carga completa na próxima requisição.
   */
  disposeCache(): void {
    for (const asset of this._cache.values()) {
      if (asset instanceof THREE.Texture) {
        asset.dispose();
      } else if (asset instanceof THREE.Group) {
        disposeObjectResources(asset);
      } else if ((asset as GLTF).scene) {
        disposeObjectResources((asset as GLTF).scene);
      } else {
        (asset as { free?: () => void }).free?.();
      }
    }
    this._cache.clear();
  }

  // ─── Helpers privados ───────────────────────────────────────────────────────

  /**
   * Despacha para o loader correto com base na extensão da URL.
   */
  private _dispatchLoad(url: string): Promise<Asset> {
    const ext = url.split('.').pop()?.toLowerCase() ?? '';

    if (ext === 'gltf' || ext === 'glb') {
      return this.loadGLTF(url);
    }

    if (ext === 'fbx') {
      return this.loadFBX(url);
    }

    if (ext === 'mp3' || ext === 'wav' || ext === 'ogg' || ext === 'aac' || ext === 'm4a') {
      return this.loadAudio(url);
    }

    // Padrão: tratado como textura (png, jpg, webp, bmp, tga…)
    return this.loadTexture(url);
  }
}
