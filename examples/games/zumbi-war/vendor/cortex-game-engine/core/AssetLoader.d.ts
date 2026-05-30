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
import { type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
/**
 * Tipo GLTF retornado por `loadGLTF()`.
 * Re-exportado para que o restante do engine não precise importar do caminho
 * interno do Three.js, mantendo o isolamento definido em ADR-0001.
 */
export type { GLTF };
type Asset = THREE.Texture | GLTF | AudioBuffer | THREE.Group;
export declare class AssetLoader {
    /** Cache interno: url → asset já carregado. */
    private readonly _cache;
    /** Instâncias reutilizadas dos loaders do Three.js. */
    private readonly _textureLoader;
    private readonly _gltfLoader;
    private readonly _fbxLoader;
    private readonly _audioLoader;
    /**
     * Carrega uma textura a partir da `url` e a armazena em cache.
     * Chamadas subsequentes com a mesma URL retornam a instância em cache sem
     * nova requisição de rede.
     *
     * @param url - Caminho ou URL absoluta para o arquivo de imagem.
     * @returns Promessa resolvida com `THREE.Texture`.
     */
    loadTexture(url: string): Promise<THREE.Texture>;
    /**
     * Carrega um modelo GLTF/GLB a partir da `url` e o armazena em cache.
     * Chamadas subsequentes com a mesma URL retornam o objeto em cache.
     *
     * @param url - Caminho ou URL absoluta para o arquivo `.gltf` ou `.glb`.
     * @returns Promessa resolvida com o objeto `GLTF`.
     */
    loadGLTF(url: string): Promise<GLTF>;
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
    loadFBX(url: string): Promise<THREE.Group>;
    /**
     * Carrega um arquivo de áudio a partir da `url` e o armazena em cache.
     * Chamadas subsequentes com a mesma URL retornam o buffer em cache.
     *
     * @param url - Caminho ou URL absoluta para o arquivo de áudio.
     * @returns Promessa resolvida com `AudioBuffer`.
     */
    loadAudio(url: string): Promise<AudioBuffer>;
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
    preload(urlArray: string[]): Promise<Asset[]>;
    /**
     * Número de entradas atualmente no cache.
     * Útil para diagnóstico e testes.
     */
    get cacheSize(): number;
    /**
     * Remove todas as entradas do cache interno.
     * Não descarta texturas da GPU — chamar `texture.dispose()` manualmente
     * se necessário antes de limpar.
     */
    clearCache(): void;
    /**
     * Despacha para o loader correto com base na extensão da URL.
     */
    private _dispatchLoad;
}
//# sourceMappingURL=AssetLoader.d.ts.map