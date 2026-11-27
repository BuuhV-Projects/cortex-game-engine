/**
 * AssetLoader — carregamento e cache de assets 3D (texturas, GLTF, áudio).
 *
 * Mantém um cache interno `Map<url, asset>` para evitar requisições duplicadas, e
 * divide a carga em andamento da mesma URL entre chamadas paralelas (SPEC-0753).
 * Usa `THREE.TextureLoader`, `THREE.AudioLoader` e `GLTFLoader` conforme
 * definido em ADR-0001.
 *
 * A integração com Three.js fica confinada a `src/core/` (ADR-0001); o restante
 * do motor referencia assets pelos tipos retornados sem importar Three.js
 * diretamente.
 *
 * Referência: ADR-0001 (Renderizador baseado em Three.js)
 */
import { bootAcc } from './bootProfile.js';
import { yieldOnBudget } from './frameYield.js';

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { CortexKtx2Loader, releaseKtx2DataAfterUpload } from './loadKtx2.js';

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

/** Opções de {@link disposeObjectResources}. */
export interface DisposeObjectResourcesOptions {
  /**
   * Fecha também a imagem decodificada de cada textura (`texture.source.data.close?.()`: o `ImageBitmap` do
   * navegador, o bitmap do shim no host nativo, SPEC-0748), que o `dispose()` do three deixa para o GC
   * (SPEC-0753). Só peça quando ninguém mais usa as texturas: imagem fechada não sobe para a GPU de novo.
   */
  closeImages?: boolean;
}

/**
 * Fecha a imagem decodificada da textura, uma vez por imagem (`closed` guarda as já fechadas: texturas
 * clonadas dividem a mesma `source`). No-op quando a imagem não tem `close()` (canvas, dado cru do KTX2).
 */
function closeTextureImage(texture: THREE.Texture, closed: Set<unknown>): void {
  const data = (texture.source as { data?: { close?: () => void } } | undefined)?.data;
  if (!data || closed.has(data)) return;
  closed.add(data);
  data.close?.();
}

/**
 * Dispõe os recursos de uma árvore de objetos: geometrias (incluindo a árvore
 * BVH do three-mesh-bvh, se houver), materiais e texturas referenciadas. Usado
 * pelo despejo de caches (SPEC-0152) — o `Scene.disposeAll` cobre o que está NA
 * cena; isto cobre o que ficou só em cache (GLTF/FBX carregados).
 *
 * Seguro chamar sobre objetos já dispostos (dispose do three é idempotente).
 *
 * @param root - Raiz da árvore (a `scene` do GLTF, o grupo do FBX).
 * @param options - `closeImages: true` fecha também as imagens decodificadas (SPEC-0753).
 */
export function disposeObjectResources(root: THREE.Object3D, options?: DisposeObjectResourcesOptions): void {
  const seenTex = new Set<THREE.Texture>();
  const closedImages = new Set<unknown>();
  const closeImages = options?.closeImages === true;
  const disposeMaterial = (m: THREE.Material): void => {
    for (const value of Object.values(m as unknown as Record<string, unknown>)) {
      if (value instanceof THREE.Texture && !seenTex.has(value)) {
        seenTex.add(value);
        value.dispose();
        if (closeImages) closeTextureImage(value, closedImages);
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

/**
 * Solta um asset do cache conforme o tipo: textura → `dispose()` (e a imagem, com `closeImages`); GLTF/FBX →
 * {@link disposeObjectResources}; áudio → `free?.()` (o PCM do host nativo, ADR-0153; no browser, no-op).
 */
function disposeAsset(asset: Asset, closeImages: boolean): void {
  if (asset instanceof THREE.Texture) {
    asset.dispose();
    if (closeImages) closeTextureImage(asset, new Set());
  } else if (asset instanceof THREE.Group) {
    disposeObjectResources(asset, { closeImages });
  } else if ((asset as GLTF).scene) {
    disposeObjectResources((asset as GLTF).scene, { closeImages });
  } else {
    (asset as { free?: () => void }).free?.();
  }
}

/**
 * Anisotropia aplicada às texturas de MODELOS (SPEC-0160). O default do three
 * (1) faz linhas finas periódicas — as raias dos decks do kit aquapark —
 * virarem moiré em pente na minificação rasante (visto em GPU real; o
 * SwiftShader mascara). 8 é o ponto custo/benefício; no WebGPU o sampler
 * clampa sozinho ao máximo do device.
 */
const MODEL_TEXTURE_ANISOTROPY = 8;

/**
 * Aplica {@link MODEL_TEXTURE_ANISOTROPY} em todas as texturas dos materiais
 * de `root` — chamada uma vez por carga de modelo (o cache preserva).
 */
function applyModelTextureAnisotropy(root: THREE.Object3D): void {
  const seen = new Set<THREE.Texture>();
  root.traverse((obj) => {
    const mat = (obj as Partial<THREE.Mesh>).material;
    const materials = Array.isArray(mat) ? mat : mat ? [mat] : [];
    for (const m of materials) {
      for (const value of Object.values(m as unknown as Record<string, unknown>)) {
        if (value instanceof THREE.Texture && !seen.has(value)) {
          seen.add(value);
          value.anisotropy = MODEL_TEXTURE_ANISOTROPY;
          value.needsUpdate = true;
        }
      }
    }
  });
}

// ─── Classe AssetLoader ───────────────────────────────────────────────────────

export class AssetLoader {
  /** Cache interno: url → asset já carregado. */
  private readonly _cache = new Map<string, Asset>();

  /**
   * Cargas em andamento: url → promessa (SPEC-0753). Duas chamadas paralelas da mesma URL recebem a mesma
   * promessa; a entrada sai ao terminar (com sucesso o asset já está no `_cache`; com falha, a próxima chamada
   * tenta de novo).
   */
  private readonly _inflight = new Map<string, Promise<Asset>>();

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
    const texture = await bootAcc('AssetLoader.loadTexture', () => this._loadTextureInner(url, options));
    await yieldOnBudget(); // ver loadGLTF
    return texture;
  }

  private async _loadTextureInner(url: string, options?: { pixelated?: boolean }): Promise<THREE.Texture> {
    const texture = await this._shared(url, () => this._textureLoader.loadAsync(url));
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
    const gltf = await bootAcc('AssetLoader.loadGLTF', () => this._loadGLTFInner(url));
    // Devolve o controle ao host de tempos em tempos (SPEC-0219): no host o
    // `fetch` é síncrono, então uma sequência de cargas roda numa virada única
    // de JS e a tela congela. Cede por ORÇAMENTO — não a cada asset.
    await yieldOnBudget();
    return gltf;
  }

  private _loadGLTFInner(url: string): Promise<GLTF> {
    return this._shared(url, () => this._fetchGLTF(url));
  }

  private async _fetchGLTF(url: string): Promise<GLTF> {
    const gltf = await this._gltfLoader.loadAsync(url);
    // Filtragem anisotrópica nos materiais do modelo (SPEC-0160): sem isto,
    // linhas finas dos decks viram moiré em pente em ângulo rasante.
    applyModelTextureAnisotropy(gltf.scene);
    // Cópias em CPU do que já vai pra GPU (SPEC-0286): o parser retém o GLB
    // inteiro e os mips KTX2 ficam em RAM depois do upload. No host, isso é
    // memória externa do Hermes — um mapa com LODs estourava o teto de 2 GB.
    Reflect.deleteProperty(gltf, 'parser');
    releaseKtx2DataAfterUpload(gltf.scene);
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
  loadFBX(url: string): Promise<THREE.Group> {
    return this._shared(url, async () => {
      const group = await this._fbxLoader.loadAsync(url);
      applyModelTextureAnisotropy(group);
      return group;
    });
  }

  /**
   * Carrega um arquivo de áudio a partir da `url` e o armazena em cache.
   * Chamadas subsequentes com a mesma URL retornam o buffer em cache.
   *
   * @param url - Caminho ou URL absoluta para o arquivo de áudio.
   * @returns Promessa resolvida com `AudioBuffer`.
   */
  loadAudio(url: string): Promise<AudioBuffer> {
    return this._shared(url, () => this._audioLoader.loadAsync(url));
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
   * Tira **uma** URL do cache, sem dispor o asset (o hot reload de GLB, SPEC-0697,
   * decide o dispose depois de trocar os clones). A próxima carga da URL vai à rede.
   *
   * @param url - A mesma chave usada na carga.
   */
  evict(url: string): void {
    this._cache.delete(url);
  }

  /**
   * **Solta uma** URL já carregada (SPEC-0753): GLTF/FBX → {@link disposeObjectResources} com `closeImages`;
   * textura → `dispose()` e fecha a imagem decodificada; áudio → `free?.()`. Tira a URL do cache; a próxima
   * carga vai à rede. Quem chama garante que ninguém mais usa o asset (nem clones dele): a imagem fechada não
   * sobe para a GPU de novo.
   *
   * @param url - A mesma chave usada na carga.
   * @returns `true` se havia asset pronto e ele foi solto; `false` para URL nunca pedida ou ainda em carga
   *   (nada é feito).
   */
  release(url: string): boolean {
    const asset = this._cache.get(url);
    if (asset === undefined) return false;
    this._cache.delete(url);
    disposeAsset(asset, true);
    return true;
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
    for (const asset of this._cache.values()) disposeAsset(asset, false);
    this._cache.clear();
  }

  // ─── Helpers privados ───────────────────────────────────────────────────────

  /**
   * Devolve o asset em cache, a carga em andamento da mesma URL ou começa uma (SPEC-0753). O `load` só roda
   * depois de a promessa estar no mapa (um `throw` síncrono nele não deixa entrada presa). Sucesso grava no
   * cache; falha tira a URL do mapa e deixa a próxima chamada tentar de novo.
   */
  private _shared<T extends Asset>(url: string, load: () => Promise<T>): Promise<T> {
    const cached = this._cache.get(url);
    if (cached !== undefined) return Promise.resolve(cached as T);
    const pending = this._inflight.get(url);
    if (pending !== undefined) return pending as Promise<T>;
    const promise = Promise.resolve()
      .then(load)
      .then(
        (asset) => {
          this._inflight.delete(url);
          this._cache.set(url, asset);
          return asset;
        },
        (error: unknown) => {
          this._inflight.delete(url);
          throw error;
        },
      );
    this._inflight.set(url, promise);
    return promise;
  }

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
