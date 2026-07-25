/**
 * Scene — encapsula THREE.Scene expondo uma API de gerenciamento de objetos.
 *
 * Esta classe é uma camada fina sobre Three.js: não tem dependência do ECS
 * nem de nenhum outro subsistema do motor. O propósito é manter a integração
 * com Three.js confinada a `src/core/` (ADR-0001) e oferecer uma superfície
 * de teste desacoplada.
 *
 * Referência: ADR-0001 (Renderizador baseado em Three.js)
 */

import * as THREE from 'three';
import { PMREMGenerator } from 'three/webgpu';

// ─── Classe Scene ──────────────────────────────────────────────────────────────

export class Scene {
  private readonly _scene: THREE.Scene;
  /** RenderTarget do PMREM do environment — NOSSO, disposto no {@link disposeAll}. */
  private _envRT: { texture: THREE.Texture; dispose(): void } | null = null;
  /** Textura-FONTE do PMREM atual — pra reusar a RT quando a mesma fonte volta. */
  private _envSource: THREE.Texture | null = null;

  constructor() {
    this._scene = new THREE.Scene();
  }

  /**
   * Define o **environment** (IBL) a partir de uma textura equiretangular,
   * com o PMREM gerado e **possuído pelo engine** (SPEC-0152).
   *
   * Atribuir a textura crua a `scene.environment` deixa o three gerar o PMREM
   * por dentro (PMREMNode) — e os RenderTargets dele (2× 3072×4096 half-float,
   * ~190 MB) ficam presos em caches internos SEM caminho de dispose: cada troca
   * de fase somava um PMREM novo na VRAM (medido no soak do export). Gerando
   * aqui, o three recebe a textura JÁ em CubeUV (pula o caminho interno) e o
   * {@link disposeAll} devolve a RT na troca.
   *
   * Passe `null` pra limpar (dispõe a RT atual). A textura-fonte continua sua:
   * dispose dela é com o chamador (ou com o `disposeAll`, se ela também for o
   * `background`).
   */
  setEnvironment(renderer: { threeRenderer: unknown }, texture: THREE.Texture | null): void {
    // MESMA fonte (ex.: skybox cacheado do mundo, re-entrada de fase): reusa a
    // RT já gerada — zero regen, zero churn no alocador (SPEC-0152/0155).
    if (texture && texture === this._envSource && this._envRT) {
      this._scene.environment = this._envRT.texture;
      return;
    }
    this._envRT?.dispose();
    this._envRT = null;
    this._envSource = null;
    if (!texture) {
      this._scene.environment = null;
      return;
    }
    const generator = new PMREMGenerator(renderer.threeRenderer as never);
    const rt = generator.fromEquirectangular(texture) as unknown as { texture: THREE.Texture; dispose(): void };
    generator.dispose();
    // A geração roda FORA do ciclo de frame (durante o load) e deixa o render
    // target corrente apontando pra RT do PMREM — sem restaurar, o PRIMEIRO
    // frame da fase renderiza pro alvo errado e a tela fica presa na splash
    // (a 2ª entrada funcionava porque reusa a RT sem regen). SPEC-0155.
    (renderer.threeRenderer as { setRenderTarget?: (t: unknown) => void }).setRenderTarget?.(null);
    this._envRT = rt;
    this._envSource = texture;
    this._scene.environment = rt.texture;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Adiciona um ou mais objetos Three.js à cena.
   * Equivale a `THREE.Scene.add()`; o objeto passado deve ser uma instância
   * de `THREE.Object3D` (Mesh, Light, Group, etc.).
   */
  add(...objects: THREE.Object3D[]): this {
    this._scene.add(...objects);
    return this;
  }

  /**
   * Remove um ou mais objetos Three.js da cena.
   * Equivale a `THREE.Scene.remove()`.
   */
  remove(...objects: THREE.Object3D[]): this {
    this._scene.remove(...objects);
    return this;
  }

  /**
   * Remove todos os objetos filhos da cena de uma vez.
   * Equivale a `THREE.Scene.clear()`.
   */
  clear(): this {
    this._scene.clear();
    return this;
  }

  /**
   * Remove TODOS os filhos E libera os recursos de GPU deles (geometrias,
   * materiais e texturas). Diferente de {@link clear} (que só desanexa e deixa
   * a GPU vazar): use ao **trocar de cena/fase** pra não acumular memória de
   * vídeo. Também limpa `background`/`environment`.
   *
   * **Exceção:** PRESERVA (não remove nem dispõe) os overlays do editor — filhos
   * marcados `userData.editorInternal` (gizmo de seleção/eixos, contornos de
   * collider, anel de pincel) ou `userData.cortexKeep` (helpers de luz/câmera, a
   * câmera livre). São chrome de edição que sobrevive à troca de fase junto dos
   * sistemas `keepOnClear`; dispô-los deixava os eixos sumirem ao voltar ao menu
   * e entrar noutra fase. Ver attachEditor / World.clear. Em produção não há
   * editor (esses objetos não existem), então dispõe tudo normalmente.
   */
  disposeAll(): this {
    // Recursos CACHEADOS (`userData.cortexCached`, ver SceneAssets) ficam
    // RESIDENTES na GPU entre fases: destruir e re-subir o kit inteiro a cada
    // troca fazia o alocador do wgpu crescer em blocos (~256 MB) que não
    // devolve (VRAM/RAM subindo em degraus no export), além de pagar o
    // re-upload no load. O despejo explícito (`clearSceneAssetCaches`)
    // continua liberando tudo (SPEC-0152).
    const cached = (o: { userData?: Record<string, unknown> } | null | undefined): boolean =>
      o?.userData?.['cortexCached'] === true;
    const seenTex = new Set<THREE.Texture>();
    const disposeMaterial = (m: THREE.Material): void => {
      for (const value of Object.values(m as unknown as Record<string, unknown>)) {
        if (value instanceof THREE.Texture && !seenTex.has(value)) {
          seenTex.add(value);
          if (!cached(value)) value.dispose();
        }
      }
      if (!cached(m)) m.dispose();
    };
    for (const child of [...this._scene.children]) {
      const ud = child.userData as Record<string, unknown>;
      if (ud['editorInternal'] === true || ud['cortexKeep'] === true) continue; // overlay do editor: sobrevive
      child.traverse((obj) => {
        const mesh = obj as Partial<THREE.Mesh>;
        if (!cached(mesh.geometry)) mesh.geometry?.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach(disposeMaterial);
        else if (mat) disposeMaterial(mat);
        // InstancedMesh (vegetação etc.): o `instanceMatrix` só sai com o
        // dispose do PRÓPRIO mesh, não o da geometria (SPEC-0152).
        if ((obj as Partial<THREE.InstancedMesh>).isInstancedMesh) {
          (obj as THREE.InstancedMesh).dispose();
        }
        // Luz com sombra: a RenderTarget do shadow map só sai no dispose da
        // PRÓPRIA luz — cada fase criava as suas e as RTs acumulavam (SPEC-0152).
        if ((obj as Partial<THREE.Light>).isLight) {
          const light = obj as THREE.Light & {
            shadow?: {
              shadowNode?: {
                dispose?: () => void;
                /** ShadowNodes das CASCATAS do CSM — cada um com RT própria. */
                _shadowNodes?: Array<{ dispose?: () => void }>;
              } | null;
            } | null;
          };
          // shadowNode CUSTOMIZADO (ex.: CSM do OutdoorLighting, 4096² por
          // fase): o listener interno do three só dispõe o node padrão — e o
          // `CSMShadowNode.dispose()` do three NÃO dispõe os `_shadowNodes`
          // das cascatas (bug upstream): sem isto, cada fase somava um shadow
          // map 4096² (cor+depth, ~130 MB) que nunca voltava.
          const node = light.shadow?.shadowNode;
          node?._shadowNodes?.forEach((cascade) => cascade.dispose?.());
          node?.dispose?.();
          if (light.shadow) light.shadow.shadowNode = null;
          light.dispose();
        }
        // SkinnedMesh: a boneTexture vive no skeleton, fora de geometria/material.
        if ((obj as Partial<THREE.SkinnedMesh>).isSkinnedMesh) {
          (obj as THREE.SkinnedMesh).skeleton?.dispose();
        }
      });
      this._scene.remove(child);
    }
    const asAny = this._scene as unknown as { background?: unknown; environment?: THREE.Texture | null };
    if (asAny.environment) asAny.environment.dispose();
    // O background também é GPU: skybox equiretangular (o dispose dispara o
    // listener do three que devolve o CUBO de conversão — 2048³×6 por fase) ou
    // cor (sem dispose). Antes, environment===background e um dispose cobria os
    // dois; com o PMREM próprio (setEnvironment) eles divergem (SPEC-0152).
    // Background CACHEADO (skybox do mundo via SceneAssets) fica residente.
    const bg = asAny.background as THREE.Texture | undefined;
    if (bg?.isTexture && !cached(bg)) bg.dispose();
    asAny.background = null;
    asAny.environment = null;
    // PMREM possuído pelo engine (setEnvironment): fonte CACHEADA (skybox do
    // mundo) mantém a RT viva pra reuso na re-entrada; senão, devolve à GPU.
    if (!(this._envSource && cached(this._envSource))) {
      this._envRT?.dispose();
      this._envRT = null;
      this._envSource = null;
    }
    return this;
  }

  /**
   * Retorna a instância interna do `THREE.Scene`.
   * Necessário para passar ao `Renderer.render(scene, camera)`.
   * Prefira sempre os métodos desta classe para manipular a cena.
   */
  getThreeScene(): THREE.Scene {
    return this._scene;
  }
}
