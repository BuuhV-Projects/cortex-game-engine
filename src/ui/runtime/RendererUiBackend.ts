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
}

/** O host expõe o raster? (é assim que o backend renderer é selecionado.) */
export function hasNativeTextRaster(): boolean {
  return typeof (globalThis as Record<string, unknown>)['__cortexRasterText'] === 'function';
}

interface WidgetVisual {
  background?: THREE.Mesh;
  text?: THREE.Mesh;
  texture?: THREE.DataTexture;
  lastText?: string;
  lastFontSize?: number;
}

export class RendererUiBackend implements UiBackend {
  private readonly _target: UiRenderTarget;
  private readonly _scene = new THREE.Scene();
  private readonly _camera = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10);
  private readonly _visuals = new Map<number, WidgetVisual>();
  private readonly _quad = new THREE.PlaneGeometry(1, 1);
  private _viewport: UiViewport = { width: 0, height: 0 };
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
    this._target.renderViewport(this._scene, this._camera, {
      x: 0,
      y: 0,
      width: this._viewport.width,
      height: this._viewport.height,
    });
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

    // ── fundo (Panel/Button) ──
    if (widget instanceof UiPanel || widget instanceof UiButton) {
      if (!visual.background) {
        visual.background = new THREE.Mesh(
          this._quad,
          new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }),
        );
        this._scene.add(visual.background);
      }
      const material = visual.background.material as THREE.MeshBasicMaterial;
      const color =
        widget instanceof UiButton
          ? widget.focused
            ? widget.focusBackground
            : widget.background
          : (widget as UiPanel).background;
      material.color.set(color);
      material.opacity = widget.opacity * (widget instanceof UiButton ? 0.92 : 1);
      visual.background.visible = widget.visible;
      visual.background.renderOrder = order * 2;
      visual.background.scale.set(rect.width, rect.height, 1);
      visual.background.position.set(rect.x + rect.width / 2, -(rect.y + rect.height / 2), 0);
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
    });
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

  private _destroy(visual: WidgetVisual): void {
    if (visual.background) {
      this._scene.remove(visual.background);
      (visual.background.material as THREE.Material).dispose();
    }
    if (visual.text) {
      this._scene.remove(visual.text);
      (visual.text.material as THREE.Material).dispose();
    }
    visual.texture?.dispose();
  }
}
