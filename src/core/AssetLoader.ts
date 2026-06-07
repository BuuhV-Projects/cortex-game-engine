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

// ─── Re-exportação de GLTF ────────────────────────────────────────────────────

/**
 * Tipo GLTF retornado por `loadGLTF()`.
 * Re-exportado para que o restante do engine não precise importar do caminho
 * interno do Three.js, mantendo o isolamento definido em ADR-0001.
 */
export type { GLTF };

// ─── União dos tipos de asset gerenciados pelo loader ─────────────────────────

type Asset = THREE.Texture | GLTF | AudioBuffer | THREE.Group;

// ─── Classe AssetLoader ───────────────────────────────────────────────────────

export class AssetLoader {
  /** Cache interno: url → asset já carregado. */
  private readonly _cache = new Map<string, Asset>();

  /** Instâncias reutilizadas dos loaders do Three.js. */
  private readonly _textureLoader = new THREE.TextureLoader();
  private readonly _gltfLoader = new GLTFLoader();
  private readonly _fbxLoader = new FBXLoader();
  private readonly _audioLoader = new THREE.AudioLoader();

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
   * se necessário antes de limpar.
   */
  clearCache(): void {
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
