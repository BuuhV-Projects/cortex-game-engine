/**
 * PostFX — pós-processamento consolidado (WebGPU).
 *
 * Encapsula o boilerplate de `RenderPipeline` (three/webgpu) + nós TSL
 * (`pass`, `bloom`): você cria um `PostFX` e chama `postfx.render()` no loop no
 * lugar de `renderer.render(scene, camera)`.
 *
 * É o caminho de pós-processamento do engine porque ele é WebGPU-only
 * (ADR-0032/0035): o `EffectComposer` clássico é WebGL e não funciona aqui.
 * Para efeitos fora do que o PostFX cobre, use `RenderPipeline`/`pass`/`bloom`
 * diretamente (todos re-exportados por `cortex-game-engine`).
 *
 * A integração com Three.js fica confinada a `src/core/` (ADR-0001).
 */

import * as THREE from 'three';
import { RenderPipeline } from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import type { Renderer } from './Renderer.js';
import type { Scene } from './Scene.js';

/** Ajustes do bloom. Todos os campos podem ser alterados em runtime via `postfx.bloom`. */
export interface BloomConfig {
  /** Intensidade do brilho. @default 0.8 */
  strength?: number;
  /** Raio de espalhamento [0..1]. @default 0 */
  radius?: number;
  /** Luminância mínima pra brilhar [0..1]. @default 0 */
  threshold?: number;
}

export interface PostFXOptions {
  /**
   * Liga o bloom. `true` usa os defaults; um objeto ajusta
   * `strength`/`radius`/`threshold`.
   * @default false
   */
  bloom?: boolean | BloomConfig;
}

/** Nó de bloom retornado por `bloom()` — expõe `strength`/`radius`/`threshold` (UniformNode com `.value`). */
type BloomPass = ReturnType<typeof bloom>;

export class PostFX {
  private readonly _renderer: Renderer;
  private readonly _pipeline: RenderPipeline;
  private readonly _bloom: BloomPass | null;

  /**
   * @param renderer Renderer do engine (usa o `WebGPURenderer` interno).
   * @param scene Cena a renderizar.
   * @param camera Câmera ativa.
   * @param options Efeitos a aplicar (ex.: `{ bloom: true }`).
   *
   * @example
   * const postfx = new PostFX(renderer, scene, camera, { bloom: { strength: 0.9 } });
   * // no loop, em vez de renderer.render(scene.getThreeScene(), camera):
   * postfx.render();
   */
  constructor(renderer: Renderer, scene: Scene, camera: THREE.Camera, options: PostFXOptions = {}) {
    this._renderer = renderer;
    this._pipeline = new RenderPipeline(renderer.threeRenderer);

    const scenePass = pass(scene.getThreeScene(), camera);
    const scenePassColor = scenePass.getTextureNode();

    if (options.bloom) {
      const cfg = options.bloom === true ? {} : options.bloom;
      this._bloom = bloom(scenePassColor, cfg.strength ?? 0.8, cfg.radius ?? 0, cfg.threshold ?? 0);
      this._pipeline.outputNode = scenePassColor.add(this._bloom);
    } else {
      this._bloom = null;
      this._pipeline.outputNode = scenePassColor;
    }
  }

  /**
   * Renderiza a cena com os efeitos. Chame uma vez por frame no lugar de
   * `renderer.render(...)`. No-op enquanto o backend WebGPU ainda inicializa
   * (mesma guarda do `Renderer.render`).
   */
  render(): void {
    if (!this._renderer.isReady) return;
    this._pipeline.render();
  }

  /**
   * Nó de bloom (ou `null` se desligado), pra ajuste em runtime:
   * `postfx.bloom?.strength.value = 1.2`.
   */
  get bloom(): BloomPass | null {
    return this._bloom;
  }

  /** Libera os recursos GPU do pipeline. */
  dispose(): void {
    this._pipeline.dispose();
  }
}
