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
import { designViewport, resolveRect, uiScale, type UiRect } from './layout.js';
import { UiButton, UiPanel, UiWidget } from './widgets.js';

/** Evento de ponteiro que nos interessa (browser `PointerEvent` ou o sintético
 *  do host nativo, que só traz `clientX`/`clientY`/`type`). */
interface UiPointerEvent {
  clientX?: number;
  clientY?: number;
}

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
  /** Botão pressionado no `pointerdown` (só ativa se soltar SOBRE ele). */
  private _pointerDown: UiButton | null = null;
  private readonly _onKeyDown = (e: { key?: string }): void => {
    if (e.key) this._pendingKeys.push(e.key);
  };

  // ── Mouse/toque (ADR-0133): funciona nos DOIS backends. No browser o
  // `PointerEvent` chega direto; no host nativo (RendererUiBackend) o SDL
  // dispara `pointerdown`/`pointerup` via `__cortexDispatchInput`. Como o
  // layout é o MESMO em ambos (design ÷ escala), o hit-test é um só aqui.
  private readonly _onPointerDown = (e: UiPointerEvent): void => {
    const btn = this._buttonAtEvent(e, false);
    this._pointerDown = btn;
    // Foco acompanha o clique (feedback visual) — só em botões navegáveis.
    if (btn && btn.focusable) this._syncFocus(btn);
  };
  private readonly _onPointerUp = (e: UiPointerEvent): void => {
    const btn = this._buttonAtEvent(e, false);
    // Clique = press + release SOBRE o mesmo botão (igual ao browser).
    if (btn && btn === this._pointerDown) btn.onPress?.();
    this._pointerDown = null;
  };
  private readonly _onPointerMove = (e: UiPointerEvent): void => {
    // Hover move o foco (só botões navegáveis). O host nativo não manda
    // `pointermove` hoje, então isto é efetivo só no browser — sem regressão.
    const btn = this._buttonAtEvent(e, true);
    if (btn) this._syncFocus(btn);
  };

  constructor(backend: UiBackend, viewportOf: () => UiViewport) {
    this._backend = backend;
    this._viewportOf = viewportOf;
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', this._onKeyDown as EventListener);
    }
    // O host nativo redistribui os eventos de ponteiro pra `window` (input-bridge);
    // no browser eles borbulham até lá. Um único ponto de escuta cobre os dois.
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', this._onPointerDown as EventListener);
      window.addEventListener('pointerup', this._onPointerUp as EventListener);
      window.addEventListener('pointermove', this._onPointerMove as EventListener);
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
    this._syncBackend();
  }

  /**
   * Viewport de DESIGN da UI (px lógicos, espaço onde os widgets são posicionados)
   * — usado por layouts de template. É o viewport real dividido pela {@link uiScale},
   * então o layout é o MESMO em qualquer resolução; o backend estica pro real
   * (ADR-0129).
   */
  viewport(): UiViewport {
    const real = this._viewportOf();
    return designViewport(real, uiScale(real));
  }

  /** Viewport de design + fator de escala pra tela real (ADR-0129). */
  private _layout(): { view: UiViewport; scale: number } {
    const real = this._viewportOf();
    const scale = uiScale(real);
    return { view: designViewport(real, scale), scale };
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
    this._syncBackend();
  }

  /**
   * Redimensiona os painéis `fill` pro viewport ATUAL e sincroniza o backend.
   * Feito a cada sync pra o fundo acompanhar resize/fullscreen (sem isto o
   * painel fica no tamanho de quando o template foi criado).
   */
  private _syncBackend(): void {
    // Layout no espaço de DESIGN (px lógicos): o backend estica pro real pelo
    // `scale`, então a UI cresce com a tela (não fica minúscula num 4K). ADR-0129.
    const { view, scale } = this._layout();
    for (const widget of this._widgets) {
      if (widget instanceof UiPanel && widget.fill) {
        if (widget.width !== view.width || widget.height !== view.height) {
          widget.width = view.width;
          widget.height = view.height;
          widget.dirty = true;
        }
      }
    }
    this._backend.sync(this._widgets, view, scale);
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
    const viewport = this._layout().view;
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
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this._onPointerDown as EventListener);
      window.removeEventListener('pointerup', this._onPointerUp as EventListener);
      window.removeEventListener('pointermove', this._onPointerMove as EventListener);
    }
    this._backend.dispose();
  }

  /**
   * Botão (visível) sob o ponto de um evento de ponteiro, ou `null`. Converte
   * as coordenadas de tela pro espaço de DESIGN (÷ escala — o mesmo em que os
   * dois backends posicionam a UI, ADR-0129) e testa de cima pra baixo
   * (último adicionado = mais na frente). `focusableOnly` restringe ao conceito
   * de foco (hover); o clique aceita qualquer botão (inclusive `focusable:false`,
   * o padrão "só-clique").
   */
  private _buttonAtEvent(e: UiPointerEvent, focusableOnly: boolean): UiButton | null {
    const { view, scale } = this._layout();
    const x = (e.clientX ?? 0) / scale;
    const y = (e.clientY ?? 0) / scale;
    for (let i = this._widgets.length - 1; i >= 0; i--) {
      const widget = this._widgets[i]!;
      if (!(widget instanceof UiButton) || !widget.visible) continue;
      if (focusableOnly && !widget.focusable) continue;
      if (this._pointInWidget(x, y, widget, view)) return widget;
    }
    return null;
  }

  /** O ponto (espaço de design) cai dentro do rect resolvido do botão? */
  private _pointInWidget(x: number, y: number, button: UiButton, view: UiViewport): boolean {
    const w = button.width || button.measuredWidth;
    const h = button.height || button.measuredHeight;
    const r: UiRect = resolveRect(button.anchor, button.x, button.y, w, h, view);
    return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
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
