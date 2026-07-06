/**
 * **UiLayer** — raiz da UI de runtime (ADR-0102): HUD, menus e diálogos de
 * jogo que funcionam IDÊNTICOS no Studio (backend DOM), no export PC e no
 * console (backend renderer), com navegação por gamepad/teclado embutida
 * (REGRA do projeto: 100% jogável no controle).
 *
 * @example
 * const ui = game.ui;
 * const coins = ui.add(new UiLabel({ anchor: 'top-left', x: 16, y: 12, text: 'x0' }));
 * coins.set({ text: 'x7' }); // atualização (re-sincroniza só este widget)
 * const btn = ui.add(new UiButton({ anchor: 'center', text: 'Jogar', onPress: () => start() }));
 */
import type { UiBackend } from './UiBackend.js';
import type { UiViewport } from './layout.js';
import { resolveRect } from './layout.js';
import { UiButton, UiWidget } from './widgets.js';

/** Botões do mapeamento standard usados na navegação. */
const GP_A = 0;
const GP_DPAD_UP = 12;
const GP_DPAD_DOWN = 13;
const GP_DPAD_LEFT = 14;
const GP_DPAD_RIGHT = 15;

export class UiLayer {
  private readonly _widgets: UiWidget[] = [];
  private readonly _backend: UiBackend;
  private readonly _viewportOf: () => UiViewport;
  private _focusIndex = -1;
  private _gamepadHeld = new Set<number>();
  private _pendingKeys: string[] = [];
  private readonly _onKeyDown = (e: { key?: string }): void => {
    if (e.key) this._pendingKeys.push(e.key);
  };

  constructor(backend: UiBackend, viewportOf: () => UiViewport) {
    this._backend = backend;
    this._viewportOf = viewportOf;
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', this._onKeyDown as EventListener);
    }
  }

  /** Adiciona um widget (devolve ele mesmo, pra guardar a referência). */
  add<T extends UiWidget>(widget: T): T {
    this._widgets.push(widget);
    if (this._focusIndex < 0 && widget instanceof UiButton) this._syncFocus(this._buttons()[0] ?? null);
    return widget;
  }

  /** Remove um widget. */
  remove(widget: UiWidget): void {
    const index = this._widgets.indexOf(widget);
    if (index >= 0) this._widgets.splice(index, 1);
    widget.dirty = true;
  }

  /** Remove todos os widgets (troca de tela). */
  clear(): void {
    this._widgets.length = 0;
    this._focusIndex = -1;
    this._backend.sync(this._widgets, this._viewportOf());
  }

  /** Viewport atual da UI (px do canvas) — usado por layouts de template. */
  viewport(): UiViewport {
    return this._viewportOf();
  }

  /** Widget focado no momento (ou null). */
  get focused(): UiButton | null {
    const buttons = this._buttons();
    return buttons.find((b) => b.focused) ?? null;
  }

  /** Foca um botão específico (ex.: primeiro item do menu). */
  focus(button: UiButton | null): void {
    this._syncFocus(button);
  }

  /**
   * Por frame: consome teclado (setas/Enter) e gamepad (d-pad/A) pra navegar
   * e ativar; depois sincroniza o backend. Chamado pelo `Game`.
   */
  update(_dt: number): void {
    for (const key of this._pendingKeys) this._handleKey(key);
    this._pendingKeys.length = 0;
    this._pollGamepad();
    this._backend.sync(this._widgets, this._viewportOf());
  }

  /** Desenha (backend renderer; no DOM é no-op). Chamado pelo `Game`. */
  render(): void {
    this._backend.render();
  }

  /** Move o foco na direção dada (navegação espacial). */
  navigate(dx: number, dy: number): void {
    const buttons = this._buttons();
    if (buttons.length === 0) return;
    const current = this.focused ?? buttons[0]!;
    if (!this.focused) {
      this._syncFocus(current);
      return;
    }
    const viewport = this._viewportOf();
    const from = this._centerOf(current, viewport);
    let best: UiButton | null = null;
    let bestScore = Infinity;
    for (const candidate of buttons) {
      if (candidate === current) continue;
      const to = this._centerOf(candidate, viewport);
      const vx = to.x - from.x;
      const vy = to.y - from.y;
      const along = vx * dx + vy * dy; // projeção na direção pedida
      if (along <= 0) continue; // atrás/em cima — não é "naquela direção"
      const ortho = Math.abs(vx * dy) + Math.abs(vy * dx); // desvio lateral
      const score = along + ortho * 2;
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    if (best) this._syncFocus(best);
  }

  /** Ativa o botão focado (Enter/A). */
  activate(): void {
    this.focused?.onPress?.();
  }

  /** Desmonta a camada (listeners + visuais). */
  dispose(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', this._onKeyDown as EventListener);
    }
    this._backend.dispose();
  }

  private _buttons(): UiButton[] {
    return this._widgets.filter(
      (w): w is UiButton => w instanceof UiButton && w.visible && w.focusable,
    );
  }

  private _syncFocus(target: UiButton | null): void {
    for (const button of this._buttons()) {
      const focused = button === target;
      if (button.focused !== focused) button.set({ focused } as Partial<UiButton>);
    }
    this._focusIndex = target ? this._buttons().indexOf(target) : -1;
  }

  private _centerOf(button: UiButton, viewport: UiViewport): { x: number; y: number } {
    const w = button.width || button.measuredWidth;
    const h = button.height || button.measuredHeight;
    const rect = resolveRect(button.anchor, button.x, button.y, w, h, viewport);
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }

  private _handleKey(key: string): void {
    if (key === 'ArrowUp') this.navigate(0, -1);
    else if (key === 'ArrowDown') this.navigate(0, 1);
    else if (key === 'ArrowLeft') this.navigate(-1, 0);
    else if (key === 'ArrowRight') this.navigate(1, 0);
    else if (key === 'Enter' || key === ' ') this.activate();
  }

  private _pollGamepad(): void {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      this._gamepadButton(pad, GP_DPAD_UP, () => this.navigate(0, -1));
      this._gamepadButton(pad, GP_DPAD_DOWN, () => this.navigate(0, 1));
      this._gamepadButton(pad, GP_DPAD_LEFT, () => this.navigate(-1, 0));
      this._gamepadButton(pad, GP_DPAD_RIGHT, () => this.navigate(1, 0));
      this._gamepadButton(pad, GP_A, () => this.activate());
      break; // player 1 navega a UI
    }
  }

  /** Dispara a ação só na BORDA de descida do botão (sem repeat). */
  private _gamepadButton(pad: Gamepad, index: number, action: () => void): void {
    const pressed = !!pad.buttons[index]?.pressed;
    const key = index;
    if (pressed && !this._gamepadHeld.has(key)) {
      this._gamepadHeld.add(key);
      action();
    } else if (!pressed) {
      this._gamepadHeld.delete(key);
    }
  }
}
