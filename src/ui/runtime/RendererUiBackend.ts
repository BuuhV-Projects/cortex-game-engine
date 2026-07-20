/**
 * Backend RENDERER da UI de runtime (ADR-0102) — CortexNative/console: cena
 * ortográfica desenhada POR CIMA do jogo no mesmo WebGPURenderer. Texto é
 * rasterizado NATIVAMENTE pelo host (`__cortexRasterText`, stb_truetype) em
 * branco e tingido pelo material (uma textura por Label, re-rasteriza só
 * quando o texto/tamanho muda).
 */
import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { abs, float, length, max, min, mix, smoothstep, texture, uniform, uv, vec2, vec4 } from 'three/tsl';
import type { UiBackend } from './UiBackend.js';
import type { UiViewport } from './layout.js';
import { resolveRect } from './layout.js';
import { parseUiBackground, parseUiBoxShadow, parseUiColor } from './uiColor.js';
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
  /** Alpha embutido nas cores (`#rrggbbaa`): topo, base e borda. */
  alphaTop: any;
  alphaBottom: any;
  alphaBorder: any;
  /** Eixo do gradiente: 0 = vertical (topo→base), 1 = horizontal (esq→dir). */
  gradientAxis: any;
  fillOpacity: any;
}

/** Uniforms do quad de imagem (cover + clip arredondado). */
interface ImageUniforms {
  size: any;
  radius: any;
  repeat: any;
  offset: any;
  opacity: any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface WidgetVisual {
  background?: THREE.Mesh;
  panelUniforms?: PanelUniforms;
  /** Sombra dura (cópia da caixa deslocada pra baixo, `shadowHeight`). */
  shadow?: THREE.Mesh;
  shadowUniforms?: PanelUniforms;
  text?: THREE.Mesh;
  texture?: THREE.DataTexture;
  lastText?: string;
  lastFontSize?: number;
  /** Imagem de fundo do Panel (quad texturizado, "cover", clipada no raio). */
  image?: THREE.Mesh;
  imageUniforms?: ImageUniforms;
  imageTexture?: THREE.Texture;
  lastImage?: string | null;
}

export class RendererUiBackend implements UiBackend {
  private readonly _target: UiRenderTarget;
  private readonly _scene = new THREE.Scene();
  private readonly _camera = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10);
  private readonly _visuals = new Map<number, WidgetVisual>();
  private readonly _quad = new THREE.PlaneGeometry(1, 1);
  /** Viewport de DESIGN (frustum da câmera ortográfica). Ver SPEC-0129. */
  private _viewport: UiViewport = { width: 0, height: 0 };
  /** Escala do espaço de design pra tela real (região/RT = design × escala). */
  private _scale = 1;
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

  sync(widgets: ReadonlyArray<UiWidget>, viewport: UiViewport, scale = 1): void {
    this._scale = scale;
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
    // Câmera no espaço de DESIGN; região/RT no espaço REAL (design × escala) — o
    // design estica pra tela toda, então a UI cresce junto (4K/TV). SPEC-0129.
    const realW = this._viewport.width * this._scale;
    const realH = this._viewport.height * this._scale;
    // Cor de UI (sRGB autorada) fica FORA do tone mapping do jogo pelos materiais
    // (`toneMapped=false` no box/texto/imagem) — sem esfriar/lavar no export.
    if (this._composite) {
      // Composição em gama (ADR-0105): UI numa RenderTarget própria (linear) e o
      // host compõe sobre o jogo em gama — blend translúcido igual ao DOM.
      const layer = (globalThis as Record<string, unknown>)['__cortexUiLayer'] as (t: unknown) => void;
      if (this._visuals.size === 0) {
        layer(null); // sem widgets → host pula a composição (desenha só o jogo)
      } else {
        const tex = this._target.renderUiLayer?.(this._scene, this._camera, realW, realH);
        layer(tex ?? null);
      }
    } else {
      // Host antigo (sem compositor): desenha por cima do frame — blend linear.
      this._target.renderViewport(this._scene, this._camera, {
        x: 0,
        y: 0,
        width: realW,
        height: realH,
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

    // Ordem de pintura por widget: sombra < fundo < imagem < texto.
    const layer = order * 4;

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
      visual.background.renderOrder = layer + 1;
      visual.background.scale.set(rect.width, rect.height, 1);
      visual.background.position.set(rect.x + rect.width / 2, -(rect.y + rect.height / 2), 0);

      // ── sombra dura (`box-shadow: 0 Npx 0 cor` — cópia da caixa, sem borda) ──
      const boxShadow = parseUiBoxShadow(widget.boxShadow);
      if (boxShadow) {
        if (!visual.shadow) {
          const { material, uniforms } = this._makeBoxMaterial();
          visual.shadowUniforms = uniforms;
          visual.shadow = new THREE.Mesh(this._quad, material);
          this._scene.add(visual.shadow);
        }
        const u = visual.shadowUniforms!;
        const shadow = parseUiColor(boxShadow.color);
        (u.size.value as THREE.Vector2).set(rect.width, rect.height);
        u.radius.value = Math.min(widget.cornerRadius, Math.min(rect.width, rect.height) / 2);
        u.borderWidth.value = 0;
        (u.colorTop.value as THREE.Color).set(shadow.rgb);
        (u.colorBottom.value as THREE.Color).set(shadow.rgb);
        u.alphaTop.value = shadow.alpha;
        u.alphaBottom.value = shadow.alpha;
        u.fillOpacity.value = widget.opacity;
        visual.shadow.visible = widget.visible;
        visual.shadow.renderOrder = layer;
        visual.shadow.scale.set(rect.width, rect.height, 1);
        visual.shadow.position.set(
          rect.x + rect.width / 2,
          -(rect.y + boxShadow.offsetY + rect.height / 2),
          0,
        );
      } else if (visual.shadow) {
        visual.shadow.visible = false;
      }
    }

    // ── imagem de fundo do Panel (quad texturizado, "cover", clip no raio) ──
    if (widget instanceof UiPanel && widget.backgroundImage) {
      if (visual.lastImage !== widget.backgroundImage) {
        visual.lastImage = widget.backgroundImage;
        this._loadImage(visual, widget, widget.backgroundImage);
      }
      if (visual.image && visual.imageUniforms) {
        const u = visual.imageUniforms;
        visual.image.visible = widget.visible;
        visual.image.renderOrder = layer + 2; // acima do fundo, abaixo do texto
        u.opacity.value = widget.opacity;
        (u.size.value as THREE.Vector2).set(rect.width, rect.height);
        u.radius.value = Math.min(widget.cornerRadius, Math.min(rect.width, rect.height) / 2);
        visual.image.scale.set(rect.width, rect.height, 1);
        visual.image.position.set(rect.x + rect.width / 2, -(rect.y + rect.height / 2), 0);
        this._coverTexture(visual, rect.width, rect.height);
      }
    } else if (visual.image) {
      visual.image.visible = false;
      visual.lastImage = null;
    }

    // ── malha do texto ──
    if (visual.text && widget instanceof UiLabel) {
      const material = visual.text.material as THREE.MeshBasicMaterial;
      const text = parseUiColor(widget.color);
      material.color.set(text.rgb);
      material.opacity = widget.opacity * text.alpha;
      visual.text.visible = widget.visible && widget.text.length > 0;
      visual.text.renderOrder = layer + 3;
      const tw = visual.texture?.image.width ?? 0;
      const th = visual.texture?.image.height ?? 0;
      visual.text.scale.set(tw, th, 1);
      // `text-align`: centro (default) ou encostado no padding (Button com
      // ícone usa 'left'; contadores usam 'right').
      const align = widget instanceof UiButton ? widget.textAlign : 'center';
      const pad = widget instanceof UiButton ? widget.paddingX : 0;
      const cx =
        align === 'left'
          ? rect.x + pad + tw / 2
          : align === 'right'
            ? rect.x + rect.width - pad - tw / 2
            : rect.x + rect.width / 2;
      visual.text.position.set(cx, -(rect.y + rect.height / 2), 0);
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
      alphaTop: uniform(1),
      alphaBottom: uniform(1),
      alphaBorder: uniform(1),
      gradientAxis: uniform(0),
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

    // Fator do gradiente: vertical (uv.y invertido) ou horizontal (uv.x).
    const factor = mix(uv().y.oneMinus(), uv().x, uniforms.gradientAxis);
    const fill = mix(uniforms.colorTop, uniforms.colorBottom, factor);
    const fillAlpha = mix(uniforms.alphaTop, uniforms.alphaBottom, factor);
    const borderMask = smoothstep(
      uniforms.borderWidth.negate().sub(0.75),
      uniforms.borderWidth.negate().add(0.75),
      dist,
    ).mul(min(uniforms.borderWidth, float(1))); // borderWidth 0 → sem borda
    const color = mix(fill, uniforms.borderColor, borderMask);
    const alpha = smoothstep(float(0.75), float(-0.75), dist)
      .mul(mix(fillAlpha, uniforms.alphaBorder, borderMask))
      .mul(uniforms.fillOpacity);

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
    // `background` é CSS: cor ou `linear-gradient(...)` — decompõe aqui.
    const bg = parseUiBackground(
      isButton
        ? widget.focused
          ? widget.focusBackground
          : widget.background
        : widget.background,
      isButton ? null : (widget as UiPanel).backgroundTo,
    );
    const radius = widget.cornerRadius;
    // Borda de foco vence a constante (Button); Panel usa a sua direto.
    const borderWidth = isButton
      ? widget.focused && widget.focusBorderWidth > 0
        ? widget.focusBorderWidth
        : widget.borderWidth
      : (widget as UiPanel).borderWidth;
    const borderColor = isButton
      ? widget.focused && widget.focusBorderWidth > 0
        ? widget.focusBorderColor
        : widget.borderColor
      : (widget as UiPanel).borderColor;

    const top = parseUiColor(bg.from);
    const bottom = parseUiColor(bg.to ?? bg.from);
    const border = parseUiColor(borderColor);

    (uniforms.size.value as THREE.Vector2).set(width, height);
    uniforms.radius.value = Math.min(radius, Math.min(width, height) / 2);
    uniforms.borderWidth.value = borderWidth;
    (uniforms.colorTop.value as THREE.Color).set(top.rgb);
    (uniforms.colorBottom.value as THREE.Color).set(bottom.rgb);
    (uniforms.borderColor.value as THREE.Color).set(border.rgb);
    uniforms.alphaTop.value = top.alpha;
    uniforms.alphaBottom.value = bottom.alpha;
    uniforms.alphaBorder.value = border.alpha;
    uniforms.gradientAxis.value = bg.axis;
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
   * Material do quad de imagem: sample com "cover" (repeat/offset por uniform)
   * e **clip arredondado** pelo mesmo SDF da caixa — a imagem respeita o
   * `cornerRadius` do Panel (no DOM o `border-radius` já clipa; aqui é o
   * shader que corta).
   */
  private _makeImageMaterial(tex: THREE.Texture): {
    material: MeshBasicNodeMaterial;
    uniforms: ImageUniforms;
  } {
    const uniforms: ImageUniforms = {
      size: uniform(new THREE.Vector2(100, 100)),
      radius: uniform(0),
      repeat: uniform(new THREE.Vector2(1, 1)),
      offset: uniform(new THREE.Vector2(0, 0)),
      opacity: uniform(1),
    };
    const p = uv().sub(vec2(0.5, 0.5)).mul(uniforms.size);
    const half = uniforms.size.mul(0.5);
    const b = half.sub(vec2(uniforms.radius, uniforms.radius));
    const q = abs(p).sub(b);
    const dist = length(max(q, vec2(0, 0)))
      .add(min(max(q.x, q.y), float(0)))
      .sub(uniforms.radius);
    const mask = smoothstep(float(0.75), float(-0.75), dist);
    // `any` como nos uniforms: o d.ts do TSL ainda não tipa swizzle de texture().
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sample = texture(tex, uv().mul(uniforms.repeat).add(uniforms.offset)) as any;
    const material = new MeshBasicNodeMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    material.toneMapped = false; // cor de UI (sRGB), fora do tone mapping do jogo
    material.colorNode = vec4(sample.r, sample.g, sample.b, sample.a.mul(mask).mul(uniforms.opacity));
    if (this._composite) setUiCompositeBlend(material); // alpha correto na RT (ADR-0105)
    return { material, uniforms };
  }

  /**
   * Carrega a imagem de fundo do Panel numa textura e cria/atualiza o quad.
   * `TextureLoader` funciona no host CortexNative: o `ImageLoader` do three usa
   * `<img>.src`, que o shim `FakeImage` (native/js) implementa via fetch + stb.
   */
  private _loadImage(visual: WidgetVisual, widget: UiWidget, url: string): void {
    new THREE.TextureLoader().load(url, (tex) => {
      if (visual.lastImage !== url) {
        // A URL mudou enquanto carregava (widget reusado) — descarta.
        tex.dispose();
        return;
      }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      const oldTexture = visual.imageTexture;
      const oldMaterial = visual.image?.material as THREE.Material | undefined;
      visual.imageTexture = tex;
      // Material NOVO a cada textura (mesma razão do texto: trocar só o node
      // não força o rebind no WebGPURenderer).
      const { material, uniforms } = this._makeImageMaterial(tex);
      visual.imageUniforms = uniforms;
      if (!visual.image) {
        visual.image = new THREE.Mesh(this._quad, material);
        this._scene.add(visual.image);
      } else {
        visual.image.material = material;
      }
      if (oldTexture || oldMaterial) {
        this._graveyard.push({
          frames: 2,
          dispose: () => {
            oldTexture?.dispose();
            oldMaterial?.dispose();
          },
        });
      }
      // A carga é ASSÍNCRONA: o _apply que disparou o load já limpou o `dirty`,
      // então o posicionamento/escala do mesh (no _apply) não rodaria de novo e
      // a imagem ficaria 1×1 na origem (invisível). Marcar dirty faz o próximo
      // sync reaplicar (posiciona + escala + torna visível). Era ESTE o bug.
      widget.dirty = true;
    });
  }

  /** "cover": ajusta repeat/offset (uniforms) pra preencher o rect sem distorcer. */
  private _coverTexture(visual: WidgetVisual, rectW: number, rectH: number): void {
    const tex = visual.imageTexture;
    const u = visual.imageUniforms;
    if (!tex || !tex.image || !u || rectW <= 0 || rectH <= 0) return;
    const img = tex.image as { width?: number; height?: number };
    const imgW = img.width ?? 0;
    const imgH = img.height ?? 0;
    if (!imgW || !imgH) return;
    const rectAspect = rectW / rectH;
    const imgAspect = imgW / imgH;
    if (imgAspect > rectAspect) {
      // Imagem mais larga: encaixa na altura, corta as laterais.
      const r = rectAspect / imgAspect;
      (u.repeat.value as THREE.Vector2).set(r, 1);
      (u.offset.value as THREE.Vector2).set((1 - r) / 2, 0);
    } else {
      const r = imgAspect / rectAspect;
      (u.repeat.value as THREE.Vector2).set(1, r);
      (u.offset.value as THREE.Vector2).set(0, (1 - r) / 2);
    }
  }

  private _destroy(visual: WidgetVisual): void {
    if (visual.background) {
      this._scene.remove(visual.background);
      (visual.background.material as THREE.Material).dispose();
    }
    if (visual.shadow) {
      this._scene.remove(visual.shadow);
      (visual.shadow.material as THREE.Material).dispose();
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
