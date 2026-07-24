/**
 * PostFX — pós-processamento consolidado (WebGPU).
 *
 * Encapsula o boilerplate de `RenderPipeline` (three/webgpu) + nós TSL: você
 * cria um `PostFX` com os efeitos desejados e chama `postfx.render()` no loop no
 * lugar de `renderer.render(scene, camera)`.
 *
 * Efeitos suportados (aplicados nesta ordem):
 *   1. bloom          — brilho em áreas claras (HDR)
 *   2. tone mapping + exposição — mapeia HDR→LDR (no renderer, via renderOutput)
 *   3. vignette       — escurece as bordas (LDR)
 *   4. fxaa           — anti-aliasing de pós (LDR, por último)
 *
 * É o caminho de pós-processamento do engine porque ele é WebGPU-only
 * (ADR-0032/0035): o `EffectComposer` clássico é WebGL e não funciona aqui.
 * Para efeitos fora do que o PostFX cobre, use `RenderPipeline`/`pass`/`bloom`/
 * etc. diretamente (todos re-exportados por `cortex-game-engine`).
 *
 * A integração com Three.js fica confinada a `src/core/` (ADR-0001).
 */

import * as THREE from 'three';
import { RenderPipeline } from 'three/webgpu';
import { pass, renderOutput, screenUV, vec2, length, smoothstep, oneMinus, mix, float } from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import { fxaa } from 'three/examples/jsm/tsl/display/FXAANode.js';
import type { Renderer } from './Renderer.js';
import type { Scene } from './Scene.js';
import { nativePostFXHost, type NativePostFXConfig } from './nativePostFX.js';

/** Ajustes do bloom. Alteráveis em runtime via `postfx.bloom`. */
export interface BloomConfig {
  /** Intensidade do brilho. @default 0.8 */
  strength?: number;
  /** Raio de espalhamento [0..1]. @default 0 */
  radius?: number;
  /** Luminância mínima pra brilhar [0..1]. @default 0 */
  threshold?: number;
}

/** Ajustes da vinheta (escurecimento das bordas). */
export interface VignetteConfig {
  /** Força do escurecimento [0..1]. @default 1 */
  intensity?: number;
  /** Raio (em UV de tela, do centro) onde a vinheta começa. @default 0.4 */
  inner?: number;
  /** Raio onde a vinheta fica no máximo. @default 0.75 */
  outer?: number;
}

export interface PostFXOptions {
  /** Liga o bloom. `true` usa defaults; objeto ajusta os parâmetros. @default false */
  bloom?: boolean | BloomConfig;
  /** Liga a vinheta. `true` usa defaults; objeto ajusta os parâmetros. @default false */
  vignette?: boolean | VignetteConfig;
  /** Liga o FXAA (anti-aliasing de pós-processamento). @default false */
  fxaa?: boolean;
  /**
   * Tone mapping aplicado na saída (ex.: `THREE.ACESFilmicToneMapping`,
   * `THREE.AgXToneMapping`). Quando omitido, mantém o do renderer.
   */
  toneMapping?: THREE.ToneMapping;
  /** Exposição do tone mapping. Quando omitido, mantém a do renderer. */
  exposure?: number;
}

/** Nó de bloom — expõe `strength`/`radius`/`threshold` (UniformNode com `.value`). */
type BloomPass = ReturnType<typeof bloom>;

export class PostFX {
  private readonly _renderer: Renderer;
  /** `null` no host nativo: lá o pós-FX roda em C++, não há grafo TSL. */
  private readonly _pipeline: RenderPipeline | null;
  private readonly _bloom: BloomPass | null;
  /** Delegado ao host (C++)? Guardado pra `render`/`dispose` saberem o caminho. */
  private readonly _native: ((c: NativePostFXConfig | null) => void) | null;
  private readonly _scene: THREE.Scene;
  private readonly _camera: THREE.Camera;

  /**
   * @param renderer Renderer do engine (usa o `WebGPURenderer` interno).
   * @param scene Cena a renderizar.
   * @param camera Câmera ativa.
   * @param options Efeitos a aplicar (ex.: `{ bloom: true, fxaa: true }`).
   *
   * @example
   * const postfx = new PostFX(renderer, scene, camera, {
   *   bloom: { strength: 0.9 },
   *   vignette: true,
   *   fxaa: true,
   *   toneMapping: THREE.ACESFilmicToneMapping,
   *   exposure: 1.1,
   * });
   * // no loop, em vez de renderer.render(scene.getThreeScene(), camera):
   * postfx.render();
   */
  constructor(renderer: Renderer, scene: Scene, camera: THREE.Camera, options: PostFXOptions = {}) {
    this._renderer = renderer;
    this._scene = scene.getThreeScene();
    this._camera = camera;
    this._native = nativePostFXHost();

    // ── Caminho do HOST NATIVO (ADR-0147) ────────────────────────────────────
    // Lá o bloom e a vinheta rodam em C++, sobre o mesmo offscreen do SSAA. Não
    // é otimização prematura: no host o custo do bloom NÃO era de pixel (render
    // scale 1.0, com ¼ dos pixels, dava o mesmo FPS) e sim da travessia JS→NAPI
    // das ~12 passadas da pirâmide — ~4 ms/frame só de marshalling.
    if (this._native) {
      const cfg = options.bloom === true ? {} : (options.bloom || {});
      const vig = options.vignette === true ? {} : (options.vignette || null);
      this._native({
        strength: cfg.strength ?? 0.8,
        threshold: cfg.threshold ?? 0,
        radius: cfg.radius ?? 0,
        exposure: options.exposure ?? renderer.threeRenderer.toneMappingExposure,
        vignette: vig !== null,
        vignetteIntensity: vig?.intensity ?? 1,
        vignetteInner: vig?.inner ?? 0.4,
        vignetteOuter: vig?.outer ?? 0.75,
      });
      // ⚠️ O tone mapping FICA no JS. O host trabalha sobre a imagem já
      // tonemapeada porque o formato da canvas é do three (ele monta os
      // pipelines com ele); entregar HDR exigiria mover a configuração da canvas
      // pro host — ver a armadilha registrada no ADR-0147.
      if (options.toneMapping !== undefined) renderer.threeRenderer.toneMapping = options.toneMapping;
      if (options.exposure !== undefined) renderer.threeRenderer.toneMappingExposure = options.exposure;
      this._pipeline = null;
      this._bloom = null;
      return;
    }

    this._pipeline = new RenderPipeline(renderer.threeRenderer);
    // Aplicamos o tone mapping/colorspace manualmente via renderOutput() pra
    // controlar a ordem (vinheta/fxaa rodam DEPOIS, em LDR).
    this._pipeline.outputColorTransform = false;

    // Tone mapping/exposição ficam no renderer; renderOutput() os lê.
    if (options.toneMapping !== undefined) renderer.threeRenderer.toneMapping = options.toneMapping;
    if (options.exposure !== undefined) renderer.threeRenderer.toneMappingExposure = options.exposure;

    const scenePass = pass(scene.getThreeScene(), camera);
    // Acumulador do grafo de nós TSL: dinâmico por natureza (o "tipo" do nó muda
    // a cada efeito). A tipagem estrita do TSL não cobre uma cadeia mutável, então
    // usamos `any` localmente — a API pública do PostFX continua tipada.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let node: any = scenePass.getTextureNode();

    // ── HDR ──────────────────────────────────────────────────────────────────
    if (options.bloom) {
      const cfg = options.bloom === true ? {} : options.bloom;
      this._bloom = bloom(node, cfg.strength ?? 0.8, cfg.radius ?? 0, cfg.threshold ?? 0);
      node = node.add(this._bloom);
    } else {
      this._bloom = null;
    }

    // ── HDR → LDR (tone mapping + output color space) ─────────────────────────
    node = renderOutput(node);

    // ── LDR ──────────────────────────────────────────────────────────────────
    if (options.vignette) {
      const cfg = options.vignette === true ? {} : options.vignette;
      const intensity = cfg.intensity ?? 1;
      const inner = cfg.inner ?? 0.4;
      const outer = cfg.outer ?? 0.75;
      // distância do centro da tela; fator 1 no centro → 0 nas bordas.
      const dist = length(screenUV.sub(vec2(0.5, 0.5)));
      const factor = oneMinus(smoothstep(inner, outer, dist));
      node = node.mul(mix(float(1), factor, float(intensity)));
    }

    if (options.fxaa) {
      node = fxaa(node);
    }

    this._pipeline.outputNode = node;
  }

  /**
   * Renderiza a cena com os efeitos. Chame uma vez por frame no lugar de
   * `renderer.render(...)`. No-op enquanto o backend WebGPU ainda inicializa
   * (mesma guarda do `Renderer.render`).
   */
  render(): void {
    if (!this._renderer.isReady) return;
    // No host, o pós-FX é do C++: aqui só se desenha a cena (em HDR linear) no
    // offscreen, e o composite nativo faz o resto no present.
    if (!this._pipeline) {
      // ⚠️ Pelo `Renderer` do engine, NÃO pelo `threeRenderer` cru: é ele que dá
      // o `clear()` do frame. Sem isso o depth buffer do frame anterior fica de
      // pé e rejeita a geometria nova — a cena renderiza pela METADE, com peças
      // sumindo (foi o que aconteceu na 1ª versão deste caminho).
      this._renderer.render(this._scene, this._camera);
      return;
    }
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
    if (this._native) {
      // Desliga o bloom do host: sem isto a próxima fase herdaria o brilho.
      // O tone mapping não precisa de reset — ele nunca saiu do JS.
      this._native(null);
      return;
    }
    this._pipeline?.dispose();
  }
}
