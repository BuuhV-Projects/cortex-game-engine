/**
 * Backend DOM da UI de runtime (ADR-0102) — Studio/browser/preview: cada
 * widget vira uma div absoluta. Usa a MESMA matemática de layout do backend
 * renderer ({@link resolveRect}), então o que você vê no Studio é o que sai
 * no console.
 */
import type { UiBackend } from './UiBackend.js';
import type { UiViewport } from './layout.js';
import { resolveRect } from './layout.js';
import { installUiFont, UI_FONT_FAMILY } from './uiFont.js';
import { UiButton, UiLabel, UiPanel, type UiWidget } from './widgets.js';

/**
 * Fonte da UI = Roboto Medium (`UI_FONT_FAMILY`, embutida via {@link installUiFont}),
 * a MESMA do export nativo — o `system-ui`/Segoe é só fallback até o woff2 carregar.
 * Peso 500 pra casar com o Roboto-Medium.ttf que o renderer nativo rasteriza.
 */
const uiFont = (px: number): string =>
  `500 ${px}px '${UI_FONT_FAMILY}', system-ui, 'Segoe UI', sans-serif`;

export class DomUiBackend implements UiBackend {
  private readonly _root: HTMLElement;
  private readonly _nodes = new Map<number, HTMLElement>();
  private _lastViewport: UiViewport = { width: 0, height: 0 };
  private _lastScale = 1;

  constructor(container?: HTMLElement) {
    installUiFont();
    this._root = document.createElement('div');
    this._root.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:40;transform-origin:0 0;font:' +
      uiFont(16);
    (container ?? document.body).appendChild(this._root);
  }

  sync(widgets: ReadonlyArray<UiWidget>, viewport: UiViewport, scale = 1): void {
    // A UI é posicionada no espaço de DESIGN (`viewport`) e a raiz inteira é
    // esticada pro real por uma `transform: scale` — posições, tamanhos, fontes,
    // bordas e sombras crescem juntos (vetorial, nítido em 4K). ADR-0129.
    if (scale !== this._lastScale) {
      this._lastScale = scale;
      this._root.style.transform = scale === 1 ? '' : `scale(${scale})`;
    }
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
    node.style.opacity = String(widget.opacity);

    if (widget instanceof UiButton) {
      node.style.display = widget.visible ? 'flex' : 'none';
      node.textContent = widget.text;
      node.style.font = uiFont(widget.fontSize);
      node.style.color = widget.color;
      // Alinhamento IGUAL ao backend renderer do export (WYSIWYG): centro por
      // default; `left` encosta no paddingX (botões com ícone à esquerda).
      node.style.alignItems = 'center';
      node.style.justifyContent =
        widget.textAlign === 'left'
          ? 'flex-start'
          : widget.textAlign === 'right'
            ? 'flex-end'
            : 'center';
      node.style.textAlign = widget.textAlign;
      node.style.whiteSpace = 'nowrap';
      // Cor ou `linear-gradient(...)` — o CSS entende os dois direto.
      node.style.background = widget.focused ? widget.focusBackground : widget.background;
      node.style.padding = `${widget.paddingY}px ${widget.paddingX}px`;
      node.style.borderRadius = `${widget.cornerRadius}px`;
      // Borda de foco vence a constante; sem nenhuma, reserva a folga da borda
      // de foco (senão o botão "pula" ao focar).
      node.style.border =
        widget.focused && widget.focusBorderWidth > 0
          ? `${widget.focusBorderWidth}px solid ${widget.focusBorderColor}`
          : widget.borderWidth > 0
            ? `${widget.borderWidth}px solid ${widget.borderColor}`
            : `${widget.focusBorderWidth > 0 ? widget.focusBorderWidth : 0}px solid transparent`;
      node.style.boxShadow = widget.boxShadow;
      node.style.boxSizing = 'border-box';
      node.style.pointerEvents = 'auto';
      node.style.cursor = 'pointer';
      node.onclick = () => widget.onPress?.();
    } else if (widget instanceof UiLabel) {
      node.style.display = widget.visible ? 'block' : 'none';
      node.textContent = widget.text;
      node.style.font = uiFont(widget.fontSize);
      node.style.color = widget.color;
      node.style.background = 'transparent';
      node.style.whiteSpace = 'nowrap';
    } else if (widget instanceof UiPanel) {
      node.style.display = widget.visible ? 'block' : 'none';
      // `background` já é CSS (cor ou linear-gradient); `backgroundTo` legado
      // vira gradiente vertical aqui.
      const fill =
        !widget.background.startsWith('linear-gradient(') && widget.backgroundTo
          ? `linear-gradient(180deg, ${widget.background}, ${widget.backgroundTo})`
          : widget.background;
      // Imagem "cover" por cima da cor/gradiente (fallback enquanto carrega).
      node.style.background = widget.backgroundImage
        ? `url("${widget.backgroundImage}") center / cover no-repeat, ${fill}`
        : fill;
      node.style.borderRadius = `${widget.cornerRadius}px`;
      node.style.border =
        widget.borderWidth > 0 ? `${widget.borderWidth}px solid ${widget.borderColor}` : 'none';
      node.style.boxShadow = widget.boxShadow;
      node.style.boxSizing = 'border-box';
      // Imagem clipada pelo raio (mesmo comportamento do backend renderer).
      node.style.overflow = 'hidden';
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
