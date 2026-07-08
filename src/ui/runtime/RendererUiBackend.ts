/**
 * Backend RENDERER da UI de runtime (ADR-0102) — CortexNative/console: cena
 * ortográfica desenhada POR CIMA do jogo no mesmo WebGPURenderer. Texto é
 * rasterizado NATIVAMENTE pelo host (`__cortexRasterText`, stb_truetype) em
 * branco e tingido pelo material (uma textura por Label, re-rasteriza só
 * quando o texto/tamanho muda).
 */
import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { abs, float, length, max, min, mix, smoothstep, uniform, uv, vec2, vec4 } from 'three/tsl';
import type { UiBackend } from './UiBackend.js';
import type { UiViewport } from './layout.js';
import { resolveRect } from './layout.js';
import { UiButton, UiLabel, UiPanel, type UiWidget } from './widgets.js';

/** Assinatura do raster nativo (host). */
type RasterTextFn = (
  text: string,
  fontSizePx: number,
) => { width: number; height: number; rgba: ArrayBuffer } | null;

/** Só o que precisamos do Renderer do engine (evita acoplamento). */
export interface UiRenderTarget {
  renderViewport(
    scene: THREE.Scene,
    camera: THREE.Camera,
    viewport: { x: number; y: number; width: number; height: number },
  ): void;
  /**
   * Caminho de composição em gama (ADR-0105): renderiza a UI numa RenderTarget
   * própria (linear) e devolve o GPUTexture do backend pro host compor sobre o
   * jogo. Opcional (mock de teste / hosts antigos não têm).
   */
  renderUiLayer?(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number): unknown;
}

/** O host expõe o raster? (é assim que o backend renderer é selecionado.) */
export function hasNativeTextRaster(): boolean {
  return typeof (globalThis as Record<string, unknown>)['__cortexRasterText'] === 'function';
}

/**
 * O host expõe o compositor de UI em gama (`__cortexUiLayer`, ADR-0105)? Quando
 * sim, a UI vai pra uma RenderTarget própria e o host compõe sobre o jogo em
 * gama (blend igual ao DOM). Quando não (host antigo), cai no caminho
 * `renderViewport` por cima do frame (blend linear, lavado).
 */
function hasUiCompositor(): boolean {
  return typeof (globalThis as Record<string, unknown>)['__cortexUiLayer'] === 'function';
}

/**
 * Blend pra escrever numa RenderTarget com ALPHA correto (ADR-0105): rgb
 * premultiplicado + alpha "over" reto. O `NormalBlending` do three elevaria o
 * alpha ao quadrado sobre o alvo transparente (scrim 0.6 → 0.36 → composição
 * fraca). Só no caminho de composição nativa; o caminho antigo usa NormalBlending.
 */
function setUiCompositeBlend(material: THREE.Material): void {
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.SrcAlphaFactor;
  material.blendDst = THREE.OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = THREE.OneFactor;
  material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
}

/**
 * Uniforms do material de caixa (rounded-rect SDF via TSL). Tipados como
 * `any` porque o d.ts do `uniform()` do three ainda devolve
 * `UniformNode<unknown>` (sem os operadores encadeáveis) — runtime correto.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
interface PanelUniforms {
  size: any;
  radius: any;
  borderWidth: any;
  colorTop: any;
  colorBottom: any;
  borderColor: any;
  fillOpacity: any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface WidgetVisual {
  background?: THREE.Mesh;
  panelUniforms?: PanelUniforms;
  text?: THREE.Mesh;
  texture?: THREE.DataTexture;
  lastText?: string;
  lastFontSize?: number;
  /** Imagem de fundo do Panel (quad texturizado, "cover"). */
  image?: THREE.Mesh;
  imageTexture?: THREE.Texture;
  lastImage?: string | null;
}

export class RendererUiBackend implements UiBackend {
  private readonly _target: UiRenderTarget;
  private readonly _scene = new THREE.Scene();
  private readonly _camera = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10);
  private readonly _visuals = new Map<number, WidgetVisual>();
  private readonly _quad = new THREE.PlaneGeometry(1, 1);
  private _viewport: UiViewport = { width: 0, height: 0 };
  /**
   * Compor em gama via host (ADR-0105)? Decidido uma vez: define o blend dos
   * materiais (premult) E o caminho do `render()` (RT + `__cortexUiLayer`).
   */
  private readonly _composite = hasUiCompositor();
  /**
   * Descarte ADIADO de texturas/materiais de texto: o frame em voo ainda
   * referencia os antigos — dispose imediato = "Texture has been destroyed"
   * no submit. Liberamos 2 frames depois da troca.
   */
  private _graveyard: Array<{ frames: number; dispose: () => void }> = [];

  constructor(target: UiRenderTarget) {
    this._target = target;
  }

  sync(widgets: ReadonlyArray<UiWidget>, viewport: UiViewport): void {
    const viewportChanged =
      viewport.width !== this._viewport.width || viewport.height !== this._viewport.height;
    if (viewportChanged) {
      this._viewport = viewport;
      this._camera.right = viewport.width;
      this._camera.bottom = -viewport.height;
      this._camera.updateProjectionMatrix();
    }

    const alive = new Set<number>();
    widgets.forEach((widget, order) => {
      alive.add(widget.id);
      if (widget.dirty || viewportChanged) this._apply(widget, order, viewport);
    });
    for (const [id, visual] of this._visuals) {
      if (!alive.has(id)) {
        this._destroy(visual);
        this._visuals.delete(id);
      }
    }
  }

  render(): void {
    if (this._viewport.width === 0) return;
    // Cor de UI (sRGB autorada) fica FORA do tone mapping do jogo pelos materiais
    // (`toneMapped=false` no box/texto/imagem) — sem esfriar/lavar no export.
    if (this._composite) {
      // Composição em gama (ADR-0105): UI numa RenderTarget própria (linear) e o
      // host compõe sobre o jogo em gama — blend translúcido igual ao DOM.
      const layer = (globalThis as Record<string, unknown>)['__cortexUiLayer'] as (t: unknown) => void;
      if (this._visuals.size === 0) {
        layer(null); // sem widgets → host pula a composição (desenha só o jogo)
      } else {
        const tex = this._target.renderUiLayer?.(
          this._scene,
          this._camera,
          this._viewport.width,
          this._viewport.height,
        );
        layer(tex ?? null);
      }
    } else {
      // Host antigo (sem compositor): desenha por cima do frame — blend linear.
      this._target.renderViewport(this._scene, this._camera, {
        x: 0,
        y: 0,
        width: this._viewport.width,
        height: this._viewport.height,
      });
    }
    this._graveyard = this._graveyard.filter((entry) => {
      if (--entry.frames > 0) return true;
      entry.dispose();
      return false;
    });
  }

  dispose(): void {
    for (const visual of this._visuals.values()) this._destroy(visual);
    this._visuals.clear();
    this._quad.dispose();
  }

  private _apply(widget: UiWidget, order: number, viewport: UiViewport): void {
    let visual = this._visuals.get(widget.id);
    if (!visual) {
      visual = {};
      this._visuals.set(widget.id, visual);
    }

    // ── texto (Label/Button): re-rasteriza só se text/fontSize mudou ──
    if (widget instanceof UiLabel) {
      if (visual.lastText !== widget.text || visual.lastFontSize !== widget.fontSize) {
        this._rasterInto(visual, widget);
      }
      widget.measuredWidth = widget.width || this._textWidth(visual, widget);
      widget.measuredHeight = widget.height || this._textHeight(visual, widget);
    }

    const width = widget.width || widget.measuredWidth;
    const height = widget.height || widget.measuredHeight;
    const rect = resolveRect(widget.anchor, widget.x, widget.y, width, height, viewport);

    // ── fundo (Panel/Button): rounded-rect SDF (gradiente/borda/canto) ──
    if (widget instanceof UiPanel || widget instanceof UiButton) {
      if (!visual.background) {
        const { material, uniforms } = this._makeBoxMaterial();
        visual.panelUniforms = uniforms;
        visual.background = new THREE.Mesh(this._quad, material);
        this._scene.add(visual.background);
      }
      this._updateBoxStyle(widget, visual.panelUniforms!, rect.width, rect.height);
      visual.background.visible = widget.visible;
      visual.background.renderOrder = order * 2;
      visual.background.scale.set(rect.width, rect.height, 1);
      visual.background.position.set(rect.x + rect.width / 2, -(rect.y + rect.height / 2), 0);
    }

    // ── imagem de fundo do Panel (quad texturizado, "cover") ──
    if (widget instanceof UiPanel && widget.backgroundImage) {
      if (visual.lastImage !== widget.backgroundImage) {
        visual.lastImage = widget.backgroundImage;
        this._loadImage(visual, widget, widget.backgroundImage);
      }
      if (visual.image) {
        visual.image.visible = widget.visible;
        visual.image.renderOrder = order * 2 + 1; // acima do fundo, abaixo do texto
        (visual.image.material as THREE.MeshBasicMaterial).opacity = widget.opacity;
        visual.image.scale.set(rect.width, rect.height, 1);
        visual.image.position.set(rect.x + rect.width / 2, -(rect.y + rect.height / 2), 0);
        this._coverTexture(visual.imageTexture, rect.width, rect.height);
      }
    } else if (visual.image) {
      visual.image.visible = false;
      visual.lastImage = null;
    }

    // ── malha do texto ──
    if (visual.text && widget instanceof UiLabel) {
      const material = visual.text.material as THREE.MeshBasicMaterial;
      material.color.set(widget.color);
      material.opacity = widget.opacity;
      visual.text.visible = widget.visible && widget.text.length > 0;
      visual.text.renderOrder = order * 2 + 1;
      const tw = visual.texture?.image.width ?? 0;
      const th = visual.texture?.image.height ?? 0;
      visual.text.scale.set(tw, th, 1);
      // texto centralizado dentro do rect (Button) ou colado na âncora (Label)
      visual.text.position.set(rect.x + rect.width / 2, -(rect.y + rect.height / 2), 0);
    }
    widget.dirty = false;
  }

  /**
   * Material de caixa: rounded-rect por SDF em TSL (WGSL nos dois mundos) —
   * gradiente vertical, canto arredondado e borda, tudo por UNIFORM (estilo
   * muda sem recompilar shader).
   */
  private _makeBoxMaterial(): { material: MeshBasicNodeMaterial; uniforms: PanelUniforms } {
    const uniforms: PanelUniforms = {
      size: uniform(new THREE.Vector2(100, 40)),
      radius: uniform(0),
      borderWidth: uniform(0),
      colorTop: uniform(new THREE.Color('#000000')),
      colorBottom: uniform(new THREE.Color('#000000')),
      borderColor: uniform(new THREE.Color('#ffffff')),
      fillOpacity: uniform(1),
    };

    // SDF de retângulo arredondado no espaço em px do widget.
    const p = uv().sub(vec2(0.5, 0.5)).mul(uniforms.size);
    const half = uniforms.size.mul(0.5);
    const b = half.sub(vec2(uniforms.radius, uniforms.radius));
    const q = abs(p).sub(b);
    const dist = length(max(q, vec2(0, 0)))
      .add(min(max(q.x, q.y), float(0)))
      .sub(uniforms.radius);

    const fill = mix(uniforms.colorTop, uniforms.colorBottom, uv().y.oneMinus());
    const borderMask = smoothstep(
      uniforms.borderWidth.negate().sub(0.75),
      uniforms.borderWidth.negate().add(0.75),
      dist,
    ).mul(min(uniforms.borderWidth, float(1))); // borderWidth 0 → sem borda
    const color = mix(fill, uniforms.borderColor, borderMask);
    const alpha = smoothstep(float(0.75), float(-0.75), dist).mul(uniforms.fillOpacity);

    const material = new MeshBasicNodeMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    // A UI é COR DE INTERFACE (sRGB autorada), não cena — NÃO pode passar pelo
    // tone mapping do renderer (ACESFilmic do jogo esfria/dessatura os tons, o
    // que deixava o menu "frio" no native vs "quente" no Studio/DOM).
    material.toneMapped = false;
    material.colorNode = vec4(color, alpha);
    if (this._composite) setUiCompositeBlend(material); // alpha correto na RT (ADR-0105)
    return { material, uniforms };
  }

  private _updateBoxStyle(
    widget: UiPanel | UiButton,
    uniforms: PanelUniforms,
    width: number,
    height: number,
  ): void {
    const isButton = widget instanceof UiButton;
    const background = isButton
      ? widget.focused
        ? widget.focusBackground
        : widget.background
      : widget.background;
    const backgroundTo = !isButton && (widget as UiPanel).backgroundTo
      ? ((widget as UiPanel).backgroundTo as string)
      : background;
    const radius = isButton ? widget.cornerRadius : (widget as UiPanel).cornerRadius;
    const borderWidth = isButton
      ? widget.focused
        ? widget.focusBorderWidth
        : 0
      : (widget as UiPanel).borderWidth;
    const borderColor = isButton ? widget.focusBorderColor : (widget as UiPanel).borderColor;

    (uniforms.size.value as THREE.Vector2).set(width, height);
    uniforms.radius.value = Math.min(radius, Math.min(width, height) / 2);
    uniforms.borderWidth.value = borderWidth;
    (uniforms.colorTop.value as THREE.Color).set(background);
    (uniforms.colorBottom.value as THREE.Color).set(backgroundTo);
    (uniforms.borderColor.value as THREE.Color).set(borderColor);
    // Opacidade = a do widget (igual ao DOM). Sem o antigo `*0.96` nos botões:
    // deixava 4% do fundo (claro) vazar e LAVAVA a cor sobre backdrops claros.
    uniforms.fillOpacity.value = widget.opacity;
  }

  private _rasterInto(visual: WidgetVisual, label: UiLabel): void {
    const raster = (globalThis as Record<string, unknown>)['__cortexRasterText'] as RasterTextFn;
    const bitmap = label.text.length > 0 ? raster(label.text, label.fontSize) : null;
    visual.lastText = label.text;
    visual.lastFontSize = label.fontSize;

    // Antigos vão pro descarte adiado (frame em voo ainda os usa).
    const oldTexture = visual.texture;
    const oldMaterial = visual.text?.material as THREE.Material | undefined;
    if (oldTexture || oldMaterial) {
      this._graveyard.push({
        frames: 2,
        dispose: () => {
          oldTexture?.dispose();
          oldMaterial?.dispose();
        },
      });
    }
    visual.texture = undefined;
    if (!bitmap) {
      if (visual.text) visual.text.visible = false;
      return;
    }

    // raster vem top-down; UV do plane espera bottom-up → inverte as linhas
    const rowBytes = bitmap.width * 4;
    const source = new Uint8Array(bitmap.rgba);
    const flipped = new Uint8Array(source.length);
    for (let row = 0; row < bitmap.height; row++) {
      flipped.set(
        source.subarray(rowBytes * row, rowBytes * (row + 1)),
        rowBytes * (bitmap.height - 1 - row),
      );
    }
    const texture = new THREE.DataTexture(flipped, bitmap.width, bitmap.height, THREE.RGBAFormat);
    texture.needsUpdate = true;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    visual.texture = texture;

    // Material NOVO a cada troca de textura: trocar só o `map` não força o
    // rebind no WebGPURenderer — material novo força.
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      map: texture,
      toneMapped: false, // cor de UI (sRGB), fora do tone mapping do jogo
    });
    if (this._composite) setUiCompositeBlend(material); // alpha correto na RT (ADR-0105)
    if (!visual.text) {
      visual.text = new THREE.Mesh(this._quad, material);
      this._scene.add(visual.text);
    } else {
      visual.text.material = material;
    }
  }

  private _textWidth(visual: WidgetVisual, label: UiLabel): number {
    const base = visual.texture?.image.width ?? 0;
    return label instanceof UiButton ? base + label.paddingX * 2 : base;
  }

  private _textHeight(visual: WidgetVisual, label: UiLabel): number {
    const base = visual.texture?.image.height ?? 0;
    return label instanceof UiButton ? base + label.paddingY * 2 : base;
  }

  /**
   * Carrega a imagem de fundo do Panel numa textura e cria/atualiza o quad.
   * `TextureLoader` funciona no host CortexNative: o `ImageLoader` do three usa
   * `<img>.src`, que o shim `FakeImage` (native/js) implementa via fetch + stb.
   */
  private _loadImage(visual: WidgetVisual, widget: UiWidget, url: string): void {
    new THREE.TextureLoader().load(url, (texture) => {
      if (visual.lastImage !== url) {
        // A URL mudou enquanto carregava (widget reusado) — descarta.
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      const old = visual.imageTexture;
      visual.imageTexture = texture;
      if (!visual.image) {
        const material = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, map: texture, toneMapped: false });
        if (this._composite) setUiCompositeBlend(material); // alpha correto na RT (ADR-0105)
        visual.image = new THREE.Mesh(this._quad, material);
        this._scene.add(visual.image);
      } else {
        (visual.image.material as THREE.MeshBasicMaterial).map = texture;
        (visual.image.material as THREE.MeshBasicMaterial).needsUpdate = true;
      }
      if (old) this._graveyard.push({ frames: 2, dispose: () => old.dispose() });
      // A carga é ASSÍNCRONA: o _apply que disparou o load já limpou o `dirty`,
      // então o posicionamento/escala do mesh (no _apply) não rodaria de novo e
      // a imagem ficaria 1×1 na origem (invisível). Marcar dirty faz o próximo
      // sync reaplicar (posiciona + escala + torna visível). Era ESTE o bug.
      widget.dirty = true;
    });
  }

  /** "cover": ajusta repeat/offset da textura pra preencher o rect sem distorcer. */
  private _coverTexture(texture: THREE.Texture | undefined, rectW: number, rectH: number): void {
    if (!texture || !texture.image || rectW <= 0 || rectH <= 0) return;
    const img = texture.image as { width?: number; height?: number };
    const imgW = img.width ?? 0;
    const imgH = img.height ?? 0;
    if (!imgW || !imgH) return;
    const rectAspect = rectW / rectH;
    const imgAspect = imgW / imgH;
    if (imgAspect > rectAspect) {
      // Imagem mais larga: encaixa na altura, corta as laterais.
      const r = rectAspect / imgAspect;
      texture.repeat.set(r, 1);
      texture.offset.set((1 - r) / 2, 0);
    } else {
      const r = imgAspect / rectAspect;
      texture.repeat.set(1, r);
      texture.offset.set(0, (1 - r) / 2);
    }
  }

  private _destroy(visual: WidgetVisual): void {
    if (visual.background) {
      this._scene.remove(visual.background);
      (visual.background.material as THREE.Material).dispose();
    }
    if (visual.text) {
      this._scene.remove(visual.text);
      (visual.text.material as THREE.Material).dispose();
    }
    if (visual.image) {
      this._scene.remove(visual.image);
      (visual.image.material as THREE.Material).dispose();
    }
    visual.texture?.dispose();
    visual.imageTexture?.dispose();
  }
}
