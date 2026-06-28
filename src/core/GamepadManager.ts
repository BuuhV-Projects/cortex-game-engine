/**
 * GamepadManager — rastreia estado de até 4 gamepads via Gamepad API
 * do browser, emitindo eventos customizados via EventTarget.
 *
 * Diferente do `InputManager` (event-driven), gamepad é **polled**: o
 * chamador deve invocar `poll()` uma vez por frame (tipicamente do
 * `GameLoop.onUpdate`). O polling lê `navigator.getGamepads()`, atualiza
 * o estado interno e emite eventos de transição (`button:down`, `button:up`,
 * `gamepad:connect`, `gamepad:disconnect`).
 *
 * Sem dependências de Three.js ou ECS. Em ambientes sem `navigator`
 * (Node.js), `poll()` é no-op silencioso.
 *
 * Referência: ADR-0023 (Split-screen e gamepad no engine).
 */

// ─── Tipos públicos ────────────────────────────────────────────────────────────

/**
 * Snapshot do estado de um gamepad em um determinado momento.
 * Retornado por `getGamepad()`. Os arrays são cópias — mutar não afeta o
 * estado interno.
 */
export interface GamepadState {
  /** Índice do slot (0..3). */
  index: number;
  /** Identificador do dispositivo (vendor/product). */
  id: string;
  /** `true` enquanto o dispositivo estiver conectado. */
  connected: boolean;
  /** Estado de cada botão (`true` = pressionado). */
  buttons: boolean[];
  /** Valor analógico de cada botão (0..1) — útil pros gatilhos LT/RT. */
  values: number[];
  /** Valor de cada eixo já com deadzone aplicada (-1.0 .. 1.0). */
  axes: number[];
}

/** Detalhe transportado por `gamepad:connect` e `gamepad:disconnect`. */
export interface GamepadConnectionEventDetail {
  /** Índice do slot (0..3). */
  index: number;
  /** Identificador do dispositivo. */
  id: string;
}

/** Detalhe transportado por `button:down` e `button:up`. */
export interface GamepadButtonEventDetail {
  /** Índice do gamepad (0..3). */
  gamepadIndex: number;
  /** Índice do botão. Layout padrão: 0=A/X, 1=B/O, 2=X/□, 3=Y/△, etc. */
  button: number;
}

export interface GamepadManagerOptions {
  /**
   * Magnitude mínima do eixo para que o valor seja reportado por
   * `getAxis()`. Valores abaixo do limiar viram 0.
   * @default 0.15
   */
  deadzone?: number;
}

// ─── Implementação ────────────────────────────────────────────────────────────

/** Máximo de slots considerados pelo polling. */
const MAX_GAMEPADS = 4;

export class GamepadManager extends EventTarget {
  private readonly _deadzone: number;
  private readonly _states: (GamepadState | null)[] = new Array(MAX_GAMEPADS).fill(null);
  /**
   * Re-sincroniza o estado na (re)conexão/desconexão do `window`. Ver o motivo no
   * construtor; a função é guardada pra poder ser removida em {@link dispose}.
   */
  private readonly _handleConnectionChange = (): void => {
    this.poll();
  };

  constructor(options: GamepadManagerOptions = {}) {
    super();
    this._deadzone = options.deadzone ?? 0.15;

    // Reconexão confiável (Chromium/Electron): depois de RELIGAR um gamepad, o
    // `navigator.getGamepads()` só volta a expor o dispositivo após o evento
    // `gamepadconnected` (disparado quando o usuário aperta um botão). Sem ouvir
    // esse evento, o polling sozinho pode nunca redetectar o pad reconectado — daí
    // a queixa de "liguei o controle de novo e não reconecta". Os listeners forçam
    // um `poll()` imediato na (re)conexão/desconexão; o poll por frame continua
    // sendo a fonte de verdade do estado. Ver ADR-0067. No-op fora do browser.
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('gamepadconnected', this._handleConnectionChange);
      window.addEventListener('gamepaddisconnected', this._handleConnectionChange);
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Remove os listeners de (re)conexão registrados no `window`. Chame ao descartar
   * o manager (hot-reload/teardown) pra não vazar listeners. No-op fora do browser.
   */
  dispose(): void {
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('gamepadconnected', this._handleConnectionChange);
      window.removeEventListener('gamepaddisconnected', this._handleConnectionChange);
    }
  }

  /**
   * Lê o estado atual de todos os gamepads do `navigator`, atualiza o
   * estado interno e emite eventos de transição.
   *
   * Deve ser chamado uma vez por frame. No-op em ambientes sem
   * `navigator.getGamepads` (Node.js).
   */
  poll(): void {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      return;
    }

    const browserGamepads = navigator.getGamepads();

    for (let i = 0; i < MAX_GAMEPADS; i++) {
      const browserPad = browserGamepads[i] ?? null;
      const previous = this._states[i];

      // ── Desconexão ────────────────────────────────────────────────────────
      if (browserPad === null || browserPad.connected === false) {
        if (previous !== null) {
          this._states[i] = null;
          this.dispatchEvent(
            new CustomEvent<GamepadConnectionEventDetail>('gamepad:disconnect', {
              detail: { index: i, id: previous.id },
            })
          );
        }
        continue;
      }

      // ── Conexão (primeira vez vendo este slot) ────────────────────────────
      if (previous === null) {
        const fresh: GamepadState = {
          index: i,
          id: browserPad.id,
          connected: true,
          buttons: browserPad.buttons.map((b) => b.pressed),
          values: browserPad.buttons.map((b) => b.value),
          axes: browserPad.axes.map((a) => this._applyDeadzone(a)),
        };
        this._states[i] = fresh;
        this.dispatchEvent(
          new CustomEvent<GamepadConnectionEventDetail>('gamepad:connect', {
            detail: { index: i, id: browserPad.id },
          })
        );
        // Emite button:down para qualquer botão já pressionado no momento da conexão.
        for (let b = 0; b < fresh.buttons.length; b++) {
          if (fresh.buttons[b] === true) {
            this.dispatchEvent(
              new CustomEvent<GamepadButtonEventDetail>('button:down', {
                detail: { gamepadIndex: i, button: b },
              })
            );
          }
        }
        continue;
      }

      // ── Atualização ──────────────────────────────────────────────────────
      // Detecta transições de botão e emite eventos antes de substituir o estado.
      const newButtons = browserPad.buttons.map((b) => b.pressed);
      const length = Math.max(previous.buttons.length, newButtons.length);
      for (let b = 0; b < length; b++) {
        const was = previous.buttons[b] ?? false;
        const now = newButtons[b] ?? false;
        if (was === false && now === true) {
          this.dispatchEvent(
            new CustomEvent<GamepadButtonEventDetail>('button:down', {
              detail: { gamepadIndex: i, button: b },
            })
          );
        } else if (was === true && now === false) {
          this.dispatchEvent(
            new CustomEvent<GamepadButtonEventDetail>('button:up', {
              detail: { gamepadIndex: i, button: b },
            })
          );
        }
      }

      this._states[i] = {
        index: i,
        id: browserPad.id,
        connected: true,
        buttons: newButtons,
        values: browserPad.buttons.map((b) => b.value),
        axes: browserPad.axes.map((a) => this._applyDeadzone(a)),
      };
    }
  }

  /**
   * Retorna uma cópia do estado do gamepad no slot `index`, ou `null` se
   * nenhum gamepad estiver conectado nesse slot.
   *
   * @param index Slot do gamepad (0..3).
   */
  getGamepad(index: number): GamepadState | null {
    const state = this._states[index];
    if (!state) return null;
    return {
      index: state.index,
      id: state.id,
      connected: state.connected,
      buttons: [...state.buttons],
      values: [...state.values],
      axes: [...state.axes],
    };
  }

  /**
   * Retorna `true` se o botão `button` do gamepad `gamepadIndex` estiver
   * pressionado. Retorna `false` se o gamepad não estiver conectado.
   */
  isButtonDown(gamepadIndex: number, button: number): boolean {
    const state = this._states[gamepadIndex];
    if (!state) return false;
    return state.buttons[button] === true;
  }

  /**
   * Retorna o valor **analógico** do botão `button` (0..1). Útil pros gatilhos
   * LT (6) / RT (7), que no Xbox são analógicos. Retorna 0 se desconectado ou
   * o botão não existir. (`isButtonDown` continua dando o booleano `pressed`.)
   */
  getButtonValue(gamepadIndex: number, button: number): number {
    const state = this._states[gamepadIndex];
    if (!state) return 0;
    return state.values[button] ?? 0;
  }

  /**
   * Retorna o valor do eixo `axis` do gamepad `gamepadIndex` com deadzone
   * aplicada (valores no intervalo (-deadzone, +deadzone) viram 0).
   * Retorna 0 se o gamepad não estiver conectado ou o eixo não existir.
   */
  getAxis(gamepadIndex: number, axis: number): number {
    const state = this._states[gamepadIndex];
    if (!state) return 0;
    return state.axes[axis] ?? 0;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────────

  /** Limiar de deadzone configurado no construtor. */
  get deadzone(): number {
    return this._deadzone;
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private _applyDeadzone(value: number): number {
    return Math.abs(value) < this._deadzone ? 0 : value;
  }
}
