/**
 * Desenho da camada de UI de runtime no host nativo (ADR-0105, SPEC-0616, SPEC-0679).
 *
 * A UI vai para uma RenderTarget própria (linear, premultiplicada) e o host a
 * compõe sobre o jogo EM GAMA (`__cortexUiLayer`). Dois caminhos:
 *
 * - **nativo** (`?nativeUi=1`, SPEC-0616): a `NativeUiRenderer` lê a cena de UI
 *   como dado e desenha num passe só;
 * - **three** (padrão): o `WebGPURenderer` renderiza a cena na RT. O clear vai
 *   DENTRO do passe do render (`autoClear` só durante ele), não num `clear()`
 *   avulso: aquele era um passe e um `queue.submit` a mais por quadro (SPEC-0679).
 *
 * O desenho todo fica na seção `uiLayer` (aninhada na fatia `ui` do profiler):
 * `ui − uiLayer` é o update/sync dos widgets.
 */
import * as THREE from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { beginSection, endSection } from './RenderSections.js';
import { mainPassArm } from './MainPassArm.js';
import { createNativeUiRenderer, type NativeUiRenderer } from './native/ui/NativeUiRenderer.js';

/** A parte do `WebGPURenderer` que a camada usa (o teste monta uma falsa). */
export type UiLayerRendererLike = Pick<
  WebGPURenderer,
  | 'getClearColor'
  | 'getClearAlpha'
  | 'setClearColor'
  | 'setRenderTarget'
  | 'render'
  | 'autoClear'
  | 'autoClearColor'
  | 'autoClearDepth'
  | 'autoClearStencil'
>;

/** Cor de clear salva/restaurada a cada desenho — reaproveitada (SPEC-0334). */
const _prevClearColor = new THREE.Color();

export class UiLayerRender {
  private _target: THREE.RenderTarget | null = null;
  /** `undefined` = ainda não decidido (a decisão precisa do renderer iniciado). */
  private _nativeUi: NativeUiRenderer | null | undefined;

  constructor(
    private readonly _renderer: UiLayerRendererLike,
    private readonly _createNative: (r: unknown) => NativeUiRenderer | null = createNativeUiRenderer,
  ) {}

  /** Desenha a cena de UI e devolve o handle da GPUTexture para o host, ou `null`. */
  render(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number): unknown {
    beginSection('uiLayer');
    try {
      return this._desenhar(scene, camera, width, height);
    } finally {
      endSection('uiLayer');
    }
  }

  dispose(): void {
    this._target?.dispose();
    this._target = null;
    this._nativeUi?.dispose();
  }

  private _desenhar(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number): unknown {
    if (this._nativeUi === undefined) this._nativeUi = this._createNative(this._renderer);
    if (this._nativeUi && !mainPassArm.uiThree) {
      const texture = this._nativeUi.render(scene, camera, width, height);
      // The trace `draws` keeps counting the UI draws, as when the three drew them (SPEC-0616).
      const info = (this._renderer as unknown as { info?: { render?: { drawCalls: number } } }).info?.render;
      if (info) info.drawCalls += this._nativeUi.stats.draws;
      return texture;
    }
    const alvo = this._alvo(width, height);
    const r = this._renderer;
    // getClearColor do WebGPURenderer tipa `Color4` (com `.a`); em runtime aceita
    // um `Color` (só preenche r/g/b). O alpha vem do getClearAlpha à parte.
    (r.getClearColor as unknown as (t: THREE.Color) => void)(_prevClearColor);
    const prevAlpha = r.getClearAlpha();
    const { autoClear, autoClearColor, autoClearDepth, autoClearStencil } = r;
    r.setRenderTarget(alvo);
    r.setClearColor(0x000000, 0);
    // O clear transparente no passe do render: o mesmo `clear(true, false, false)`
    // de antes, sem o passe próprio (o `autoClear` global é false, ver Renderer).
    r.autoClear = true;
    r.autoClearColor = true;
    r.autoClearDepth = false;
    r.autoClearStencil = false;
    try {
      r.render(scene, camera);
    } finally {
      r.autoClear = autoClear;
      r.autoClearColor = autoClearColor;
      r.autoClearDepth = autoClearDepth;
      r.autoClearStencil = autoClearStencil;
      r.setRenderTarget(null);
      r.setClearColor(_prevClearColor, prevAlpha);
    }
    // Handle da GPUTexture do backend (o host embrulha as texturas com wrapHandle,
    // então este mesmo objeto desembrulha pro WGPUTexture no passe de composição).
    const backend = (r as unknown as { backend?: { get(t: unknown): { texture?: unknown } | undefined } }).backend;
    return backend?.get(alvo.texture)?.texture ?? null;
  }

  private _alvo(width: number, height: number): THREE.RenderTarget {
    if (this._target && this._target.width === width && this._target.height === height) return this._target;
    this._target?.dispose();
    this._target = new THREE.RenderTarget(width, height, {
      type: THREE.HalfFloatType, // linear em 16f: sem banding nos tons escuros do scrim
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    return this._target;
  }
}
