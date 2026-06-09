/**
 * InputManager — rastreia estado de teclado e mouse, emitindo eventos
 * customizados via EventTarget.
 *
 * - Sem dependências de Three.js ou ECS.
 * - `attach(domElement)` registra os listeners; `detach()` remove tudo e
 *   limpa o estado interno.
 * - Keyboard: escuta `keydown`/`keyup` no elemento fornecido. Para captura
 *   global, passe `document.body` (ou defina `tabIndex` no elemento e dê
 *   foco a ele).
 * - Mouse: posição relativa ao elemento via `getBoundingClientRect`; delta
 *   acumulado via `MouseEvent.movementX/Y`.
 *
 * Referência: ADR-0002 (Arquitetura ECS — módulos externos não importam
 * Three.js nem ECS diretamente).
 */

// ─── Tipos públicos ────────────────────────────────────────────────────────────

/** Coordenadas 2D do mouse. */
export interface MousePosition {
  x: number;
  y: number;
}

/** Delta de movimento do mouse entre frames. */
export interface MouseDelta {
  x: number;
  y: number;
}

/** Detalhe transportado pelo evento `key:down` e `key:up`. */
export interface KeyEventDetail {
  /** Valor de `KeyboardEvent.key` (ex.: `"ArrowLeft"`, `"a"`, `" "`). */
  key: string;
  /** Evento DOM original. */
  originalEvent: KeyboardEvent;
}

/** Detalhe transportado pelos eventos `mouse:down` e `mouse:up`. */
export interface MouseButtonEventDetail {
  /** Índice do botão: 0 = esquerdo, 1 = meio, 2 = direito. */
  button: number;
  /** Posição do mouse no momento do evento, relativa ao elemento. */
  position: MousePosition;
  /** Evento DOM original. */
  originalEvent: MouseEvent;
}

/** Detalhe transportado pelo evento `mouse:move`. */
export interface MouseMoveEventDetail {
  /** Posição atual do mouse relativa ao elemento. */
  position: MousePosition;
  /**
   * Delta de movimento **desta** ocorrência de `mousemove`
   * (equivale a `movementX/Y` do evento DOM).
   */
  delta: MouseDelta;
  /** Evento DOM original. */
  originalEvent: MouseEvent;
}

/**
 * Normaliza uma tecla pra registro/consulta: **letras (1 caractere) viram
 * minúsculas**. Sem isso, segurar Shift troca o `KeyboardEvent.key` de `"w"` pra
 * `"W"`, e o `keyup` (com Shift) não casa com o `keydown` (sem Shift) — a tecla
 * "trava" pressionada (ex.: câmera do editor andando pra sempre). Teclas nomeadas
 * (`"Shift"`, `"ArrowLeft"`, `" "`) passam intactas.
 */
function normKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

// ─── Classe InputManager ───────────────────────────────────────────────────────

export class InputManager extends EventTarget {
  private _domElement: HTMLElement | null = null;

  /** Teclas atualmente pressionadas (valor de `KeyboardEvent.key`). */
  private readonly _keysDown = new Set<string>();

  /** Botões do mouse atualmente pressionados (índice de `MouseEvent.button`). */
  private readonly _buttonsDown = new Set<number>();

  /** Posição atual do mouse relativa ao elemento anexado. */
  private _mousePosition: MousePosition = { x: 0, y: 0 };

  /**
   * Delta acumulado de movimento do mouse desde a última chamada a
   * `getMouseDelta()`. Resetado a zero após cada leitura.
   */
  private _mouseDelta: MouseDelta = { x: 0, y: 0 };

  // Referências aos handlers para permitir a remoção exata no detach()
  private _onKeyDownHandler: ((e: KeyboardEvent) => void) | null = null;
  private _onKeyUpHandler: ((e: KeyboardEvent) => void) | null = null;
  private _onMouseDownHandler: ((e: MouseEvent) => void) | null = null;
  private _onMouseUpHandler: ((e: MouseEvent) => void) | null = null;
  private _onMouseMoveHandler: ((e: MouseEvent) => void) | null = null;

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Registra os listeners de teclado e mouse no `domElement` fornecido.
   * Se já houver um elemento anexado, `detach()` é chamado antes.
   *
   * @param domElement Elemento HTML alvo (ex.: `canvas`, `document.body`).
   */
  attach(domElement: HTMLElement): void {
    if (this._domElement !== null) {
      this.detach();
    }

    this._domElement = domElement;

    // ── handlers ───────────────────────────────────────────────────────────

    this._onKeyDownHandler = (e: KeyboardEvent): void => {
      this._keysDown.add(normKey(e.key));
      this.dispatchEvent(
        new CustomEvent<KeyEventDetail>('key:down', {
          detail: { key: e.key, originalEvent: e },
        })
      );
    };

    this._onKeyUpHandler = (e: KeyboardEvent): void => {
      this._keysDown.delete(normKey(e.key));
      this.dispatchEvent(
        new CustomEvent<KeyEventDetail>('key:up', {
          detail: { key: e.key, originalEvent: e },
        })
      );
    };

    this._onMouseDownHandler = (e: MouseEvent): void => {
      this._buttonsDown.add(e.button);
      this.dispatchEvent(
        new CustomEvent<MouseButtonEventDetail>('mouse:down', {
          detail: {
            button: e.button,
            position: { ...this._mousePosition },
            originalEvent: e,
          },
        })
      );
    };

    this._onMouseUpHandler = (e: MouseEvent): void => {
      this._buttonsDown.delete(e.button);
      this.dispatchEvent(
        new CustomEvent<MouseButtonEventDetail>('mouse:up', {
          detail: {
            button: e.button,
            position: { ...this._mousePosition },
            originalEvent: e,
          },
        })
      );
    };

    this._onMouseMoveHandler = (e: MouseEvent): void => {
      // Posição relativa ao elemento (usa getBoundingClientRect quando disponível)
      if (typeof domElement.getBoundingClientRect === 'function') {
        const rect = domElement.getBoundingClientRect();
        this._mousePosition = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
      } else {
        this._mousePosition = { x: e.clientX, y: e.clientY };
      }

      // Acumula o delta de movimento para ser consumido por getMouseDelta()
      const dx = e.movementX ?? 0;
      const dy = e.movementY ?? 0;
      this._mouseDelta.x += dx;
      this._mouseDelta.y += dy;

      this.dispatchEvent(
        new CustomEvent<MouseMoveEventDetail>('mouse:move', {
          detail: {
            position: { ...this._mousePosition },
            delta: { x: dx, y: dy },
            originalEvent: e,
          },
        })
      );
    };

    // ── registro ───────────────────────────────────────────────────────────

    domElement.addEventListener('keydown', this._onKeyDownHandler as EventListener);
    domElement.addEventListener('keyup', this._onKeyUpHandler as EventListener);
    domElement.addEventListener('mousedown', this._onMouseDownHandler as EventListener);
    domElement.addEventListener('mouseup', this._onMouseUpHandler as EventListener);
    domElement.addEventListener('mousemove', this._onMouseMoveHandler as EventListener);
  }

  /**
   * Remove todos os listeners do elemento e limpa o estado interno.
   * Sem efeito se nenhum elemento estiver anexado.
   */
  detach(): void {
    if (this._domElement === null) return;

    this._domElement.removeEventListener(
      'keydown',
      this._onKeyDownHandler as EventListener
    );
    this._domElement.removeEventListener(
      'keyup',
      this._onKeyUpHandler as EventListener
    );
    this._domElement.removeEventListener(
      'mousedown',
      this._onMouseDownHandler as EventListener
    );
    this._domElement.removeEventListener(
      'mouseup',
      this._onMouseUpHandler as EventListener
    );
    this._domElement.removeEventListener(
      'mousemove',
      this._onMouseMoveHandler as EventListener
    );

    // Limpa referências aos handlers
    this._onKeyDownHandler = null;
    this._onKeyUpHandler = null;
    this._onMouseDownHandler = null;
    this._onMouseUpHandler = null;
    this._onMouseMoveHandler = null;

    // Reseta estado
    this._domElement = null;
    this._keysDown.clear();
    this._buttonsDown.clear();
    this._mousePosition = { x: 0, y: 0 };
    this._mouseDelta = { x: 0, y: 0 };
  }

  // ─── Consulta de estado ──────────────────────────────────────────────────────

  /**
   * Retorna `true` se a tecla identificada por `key` estiver pressionada.
   *
   * @param key Valor de `KeyboardEvent.key` (ex.: `"ArrowLeft"`, `"a"`, `" "`).
   *
   * @example
   * if (input.isKeyDown('ArrowLeft')) player.moveLeft();
   */
  isKeyDown(key: string): boolean {
    return this._keysDown.has(normKey(key));
  }

  /**
   * Retorna `true` se o botão do mouse identificado por `button` estiver
   * pressionado.
   *
   * @param button Índice do botão: 0 = esquerdo, 1 = meio, 2 = direito.
   *
   * @example
   * if (input.isButtonDown(0)) shoot();
   */
  isButtonDown(button: number): boolean {
    return this._buttonsDown.has(button);
  }

  /**
   * Retorna a posição atual do mouse em coordenadas relativas ao elemento
   * anexado.
   *
   * Retorna `{ x: 0, y: 0 }` se nenhum elemento estiver anexado ou se o
   * mouse ainda não tiver se movido.
   */
  getMousePosition(): MousePosition {
    return { ...this._mousePosition };
  }

  /**
   * Retorna o delta acumulado de movimento do mouse desde a última chamada
   * a este método e **reseta** o acumulador interno.
   *
   * Ideal para uso no loop de jogo: chame uma vez por frame para obter o
   * deslocamento total do frame atual.
   *
   * @example
   * // no onUpdate do GameLoop:
   * const { x, y } = input.getMouseDelta();
   * camera.rotateY(-x * sensitivity);
   */
  getMouseDelta(): MouseDelta {
    const delta = { ...this._mouseDelta };
    this._mouseDelta = { x: 0, y: 0 };
    return delta;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────────

  /**
   * O elemento HTML atualmente anexado, ou `null` se `detach()` foi chamado
   * ou `attach()` ainda não foi invocado.
   */
  get domElement(): HTMLElement | null {
    return this._domElement;
  }
}
