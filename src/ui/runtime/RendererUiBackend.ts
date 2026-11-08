/**
 * Backend RENDERER da UI de runtime (ADR-0102) — CortexNative/console: cena
 * ortográfica desenhada POR CIMA do jogo no mesmo WebGPURenderer. Texto é
 * rasterizado NATIVAMENTE pelo host (`__cortexRasterText`, stb_truetype) em
 * branco e tingido pelo material (uma textura por Label, re-rasteriza só
 * quando o texto/tamanho muda).
 */
import * as THREE from 'three';
import type { UiBackend } from './UiBackend.js';
import type { UiViewport } from './layout.js';
import { resolveRect } from './layout.js';
import { parseUiBoxShadow, parseUiColor } from './uiColor.js';
import { UiButton, UiCanvas, UiLabel, UiPanel, type UiWidget } from './widgets.js';
import {
  bitmapResized, canvasVersion, coverTexture, destroyVisual, flipRowsInto, makeBoxMaterial, makeImageMaterial,
  setUiCompositeBlend, updateBoxStyle, type WidgetVisual,
} from './uiBackendMaterials.js';
import { traceUiUpload } from '../../core/perfTrace/traceCounters.js';

/** Assinatura do raster nativo (host). */
type RasterTextFn = (
  text: string,
  fontSizePx: number,
  /** Só telemetria do host (SPEC-0321): de onde veio o raster. */
  origin?: 'ui' | 'canvas',
  /** Família registrada por `__cortexLoadFont` (vazia = Roboto; ADR-0715). */
  fontFamily?: string,
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

export class RendererUiBackend implements UiBackend {
  private readonly _target: UiRenderTarget;
  private readonly _scene = new THREE.Scene();
  private readonly _camera = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10);
  private readonly _visuals = new Map<number, WidgetVisual>();
  /**
   * Geração do `sync` atual: visual sem este carimbo perdeu o widget. Carimbo +
   * `Map.forEach` com callback fixo em vez de um `Set` novo e iteração por
   * entrada a cada quadro — no Hermes cada um deles é alocação por widget (SPEC-0357).
   */
  private _syncStamp = 0;
  private readonly _sweepDead = (visual: WidgetVisual, id: number): void => {
    if (visual.syncStamp === this._syncStamp) return;
    destroyVisual(this._scene, visual);
    this._visuals.delete(id);
  };
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

    const stamp = ++this._syncStamp;
    for (let order = 0; order < widgets.length; order++) {
      const widget = widgets[order]!;
      const canvasResized =
        widget instanceof UiCanvas &&
        ((!widget.width && widget.measuredWidth !== widget.canvas.width) ||
          (!widget.height && widget.measuredHeight !== widget.canvas.height));
      if (widget.dirty || viewportChanged || canvasResized) this._apply(widget, order, viewport);
      if (widget instanceof UiCanvas && widget.visible) this._refreshCanvas(widget);
      const visual = this._visuals.get(widget.id);
      if (visual) visual.syncStamp = stamp;
    }
    this._visuals.forEach(this._sweepDead);
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
    if (this._graveyard.length === 0) return; // quadro comum: sem array nem closure novos (SPEC-0357)
    this._graveyard = this._graveyard.filter((entry) => {
      if (--entry.frames > 0) return true;
      entry.dispose();
      return false;
    });
  }

  dispose(): void {
    for (const visual of this._visuals.values()) destroyVisual(this._scene, visual);
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
      if (visual.lastText !== widget.text || visual.lastFontSize !== widget.fontSize
          || visual.lastFontFamily !== widget.fontFamily) {
        this._rasterInto(visual, widget);
      }
      widget.measuredWidth = widget.width || this._textWidth(visual, widget);
      widget.measuredHeight = widget.height || this._textHeight(visual, widget);
    }

    if (widget instanceof UiCanvas) {
      // Sem tamanho exibido = o do bitmap (HTML5).
      widget.measuredWidth = widget.width || widget.canvas.width;
      widget.measuredHeight = widget.height || widget.canvas.height;
    }
    const width = widget.width || widget.measuredWidth;
    const height = widget.height || widget.measuredHeight;
    const rect = resolveRect(widget.anchor, widget.x, widget.y, width, height, viewport);

    // Ordem de pintura por widget: sombra < fundo < imagem < texto.
    const layer = order * 4;

    // ── fundo (Panel/Button): rounded-rect SDF (gradiente/borda/canto) ──
    if (widget instanceof UiPanel || widget instanceof UiButton) {
      if (!visual.background) {
        const { material, uniforms } = makeBoxMaterial(this._composite);
        visual.panelUniforms = uniforms;
        visual.background = new THREE.Mesh(this._quad, material);
        this._scene.add(visual.background);
      }
      updateBoxStyle(widget, visual.panelUniforms!, rect.width, rect.height);
      visual.background.visible = widget.visible;
      visual.background.renderOrder = layer + 1;
      visual.background.scale.set(rect.width, rect.height, 1);
      visual.background.position.set(rect.x + rect.width / 2, -(rect.y + rect.height / 2), 0);

      // ── sombra dura (`box-shadow: 0 Npx 0 cor` — cópia da caixa, sem borda) ──
      const boxShadow = parseUiBoxShadow(widget.boxShadow);
      if (boxShadow) {
        if (!visual.shadow) {
          const { material, uniforms } = makeBoxMaterial(this._composite);
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
        coverTexture(visual, rect.width, rect.height);
      }
    } else if (visual.image) {
      visual.image.visible = false;
      visual.lastImage = null;
    }

    // ── `<canvas>`: bitmap esticado no rect de CONTEÚDO (border-box) ──
    if (widget instanceof UiCanvas) {
      this._ensureCanvasMesh(visual, widget);
      const mesh = visual.canvas!;
      const inset = widget.borderWidth;
      const w = Math.max(0, rect.width - inset * 2);
      const h = Math.max(0, rect.height - inset * 2);
      (mesh.material as THREE.MeshBasicMaterial).opacity = widget.opacity;
      mesh.visible = widget.visible && w > 0 && h > 0;
      mesh.renderOrder = layer + 2; // acima do fundo/borda
      mesh.scale.set(w, h, 1);
      mesh.position.set(rect.x + rect.width / 2, -(rect.y + rect.height / 2), 0);
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

  private _rasterInto(visual: WidgetVisual, label: UiLabel): void {
    const raster = (globalThis as Record<string, unknown>)['__cortexRasterText'] as RasterTextFn;
    const bitmap = label.text.length > 0 ? raster(label.text, label.fontSize, 'ui', label.fontFamily ?? '') : null;
    visual.lastText = label.text;
    visual.lastFontSize = label.fontSize;
    visual.lastFontFamily = label.fontFamily;

    // Mesmas dimensões: reescreve os pixels no lugar (SPEC-0248). É o caso
    // DOMINANTE num HUD — cronômetro e velocímetro mudam de valor, não de
    // forma, porque os dígitos da fonte são tabulares. Some daqui a cópia
    // intermediária, a DataTexture nova, o MeshBasicMaterial novo (que seria
    // chave de cache nova no `Pipelines` do `three`) e as duas entradas no
    // graveyard — sobra o upload, que é inevitável: os pixels mudaram mesmo.
    const current = visual.texture;
    if (bitmap && current && visual.text
        && current.image.width === bitmap.width && current.image.height === bitmap.height) {
      flipRowsInto(current.image.data as Uint8Array, new Uint8Array(bitmap.rgba), bitmap.width, bitmap.height);
      current.needsUpdate = true;
      traceUiUpload('label', label.id, label.text); // SPEC-0688
      visual.text.visible = true;
      return;
    }

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

    const source = new Uint8Array(bitmap.rgba);
    const flipped = new Uint8Array(source.length);
    flipRowsInto(flipped, source, bitmap.width, bitmap.height);
    const texture = new THREE.DataTexture(flipped, bitmap.width, bitmap.height, THREE.RGBAFormat);
    texture.needsUpdate = true;
    traceUiUpload('label', label.id, label.text);
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
      traceUiUpload('image', widget.id);
      // Material NOVO a cada textura (mesma razão do texto: trocar só o node
      // não força o rebind no WebGPURenderer).
      const { material, uniforms } = makeImageMaterial(tex, this._composite);
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

  /**
   * Quad do `<canvas>`: CanvasTexture do elemento (o upload lê `canvas.rgba` no
   * host — contrato do ImageBitmap, ADR-0312). Bitmap com outro tamanho →
   * textura e material NOVOS (a textura da GPU tem tamanho fixo); os antigos
   * vão pro descarte adiado.
   */
  private _ensureCanvasMesh(visual: WidgetVisual, widget: UiCanvas): void {
    const { canvas } = widget;
    const current = visual.canvasTexture;
    if (current && visual.canvas && !bitmapResized(current, canvas)) return;
    if (current || visual.canvas) {
      const oldMaterial = visual.canvas?.material as THREE.Material | undefined;
      this._graveyard.push({
        frames: 2,
        dispose: () => {
          current?.dispose();
          oldMaterial?.dispose();
        },
      });
    }
    const tex = new THREE.CanvasTexture(canvas);
    traceUiUpload('canvas', widget.id);
    tex.userData['w'] = canvas.width;
    tex.userData['h'] = canvas.height;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      map: tex,
      toneMapped: false, // cor de UI (sRGB), fora do tone mapping do jogo
    });
    if (this._composite) setUiCompositeBlend(material); // alpha correto na RT (ADR-0105)
    if (!visual.canvas) {
      visual.canvas = new THREE.Mesh(this._quad, material);
      this._scene.add(visual.canvas);
    } else {
      visual.canvas.material = material;
    }
    visual.canvasTexture = tex;
    visual.canvasVersion = canvasVersion(canvas); // a CanvasTexture nova já sobe
  }

  /**
   * Re-sobe os pixels se o canvas mudou desde o último upload (SPEC-0317):
   * compara `__cortexVersion` do host; sem ele, re-sobe todo quadro visível.
   */
  private _refreshCanvas(widget: UiCanvas): void {
    const visual = this._visuals.get(widget.id);
    const tex = visual?.canvasTexture;
    if (!visual || !tex) return;
    if (bitmapResized(tex, widget.canvas)) {
      this._ensureCanvasMesh(visual, widget); // textura nova já sobe o conteúdo
      return;
    }
    const version = canvasVersion(widget.canvas);
    if (version !== undefined && version === visual.canvasVersion) return;
    visual.canvasVersion = version;
    tex.needsUpdate = true;
    traceUiUpload('canvas', widget.id);
  }

}
