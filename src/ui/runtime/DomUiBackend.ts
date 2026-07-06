/**
 * Backend DOM da UI de runtime (ADR-0102) — Studio/browser/preview: cada
 * widget vira uma div absoluta. Usa a MESMA matemática de layout do backend
 * renderer ({@link resolveRect}), então o que você vê no Studio é o que sai
 * no console.
 */
import type { UiBackend } from './UiBackend.js';
import type { UiViewport } from './layout.js';
import { resolveRect } from './layout.js';
import { UiButton, UiLabel, UiPanel, type UiWidget } from './widgets.js';

const FONT = "600 16px system-ui, 'Segoe UI', sans-serif";

export class DomUiBackend implements UiBackend {
  private readonly _root: HTMLElement;
  private readonly _nodes = new Map<number, HTMLElement>();
  private _lastViewport: UiViewport = { width: 0, height: 0 };

  constructor(container?: HTMLElement) {
    this._root = document.createElement('div');
    this._root.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:40;font:' + FONT;
    (container ?? document.body).appendChild(this._root);
  }

  sync(widgets: ReadonlyArray<UiWidget>, viewport: UiViewport): void {
    const viewportChanged =
      viewport.width !== this._lastViewport.width ||
      viewport.height !== this._lastViewport.height;
    this._lastViewport = viewport;

    const alive = new Set<number>();
    for (const widget of widgets) {
      alive.add(widget.id);
      let node = this._nodes.get(widget.id);
      if (!node) {
        node = document.createElement('div');
        node.style.position = 'absolute';
        node.style.whiteSpace = 'nowrap';
        this._root.appendChild(node);
        this._nodes.set(widget.id, node);
        widget.dirty = true;
      }
      if (widget.dirty || viewportChanged) this._apply(widget, node, viewport);
    }
    for (const [id, node] of this._nodes) {
      if (!alive.has(id)) {
        node.remove();
        this._nodes.delete(id);
      }
    }
  }

  render(): void {
    // DOM: o browser pinta sozinho.
  }

  dispose(): void {
    this._root.remove();
    this._nodes.clear();
  }

  private _apply(widget: UiWidget, node: HTMLElement, viewport: UiViewport): void {
    node.style.display = widget.visible ? 'block' : 'none';
    node.style.opacity = String(widget.opacity);

    if (widget instanceof UiButton) {
      node.textContent = widget.text;
      node.style.font = `600 ${widget.fontSize}px system-ui, 'Segoe UI', sans-serif`;
      node.style.color = widget.color;
      node.style.background = widget.focused ? widget.focusBackground : widget.background;
      node.style.padding = `${widget.paddingY}px ${widget.paddingX}px`;
      node.style.borderRadius = `${widget.cornerRadius}px`;
      node.style.border =
        widget.focused && widget.focusBorderWidth > 0
          ? `${widget.focusBorderWidth}px solid ${widget.focusBorderColor}`
          : `${widget.focusBorderWidth > 0 ? widget.focusBorderWidth : 0}px solid transparent`;
      node.style.boxSizing = 'border-box';
      node.style.pointerEvents = 'auto';
      node.style.cursor = 'pointer';
      node.onclick = () => widget.onPress?.();
    } else if (widget instanceof UiLabel) {
      node.textContent = widget.text;
      node.style.font = `600 ${widget.fontSize}px system-ui, 'Segoe UI', sans-serif`;
      node.style.color = widget.color;
      node.style.background = 'transparent';
    } else if (widget instanceof UiPanel) {
      node.style.background = widget.backgroundTo
        ? `linear-gradient(180deg, ${widget.background}, ${widget.backgroundTo})`
        : widget.background;
      node.style.borderRadius = `${widget.cornerRadius}px`;
      node.style.border =
        widget.borderWidth > 0 ? `${widget.borderWidth}px solid ${widget.borderColor}` : 'none';
      node.style.boxSizing = 'border-box';
    }

    // Mede (DOM sabe o tamanho do texto) e posiciona com a MESMA matemática
    // do backend renderer.
    const width = widget.width || node.offsetWidth;
    const height = widget.height || node.offsetHeight;
    widget.measuredWidth = width;
    widget.measuredHeight = height;
    if (widget.width) node.style.width = `${widget.width}px`;
    if (widget.height) node.style.height = `${widget.height}px`;
    const rect = resolveRect(widget.anchor, widget.x, widget.y, width, height, viewport);
    node.style.left = `${rect.x}px`;
    node.style.top = `${rect.y}px`;
    widget.dirty = false;
  }
}
