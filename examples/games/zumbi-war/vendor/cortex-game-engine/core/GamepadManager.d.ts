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
export declare class GamepadManager extends EventTarget {
    private readonly _deadzone;
    private readonly _states;
    constructor(options?: GamepadManagerOptions);
    /**
     * Lê o estado atual de todos os gamepads do `navigator`, atualiza o
     * estado interno e emite eventos de transição.
     *
     * Deve ser chamado uma vez por frame. No-op em ambientes sem
     * `navigator.getGamepads` (Node.js).
     */
    poll(): void;
    /**
     * Retorna uma cópia do estado do gamepad no slot `index`, ou `null` se
     * nenhum gamepad estiver conectado nesse slot.
     *
     * @param index Slot do gamepad (0..3).
     */
    getGamepad(index: number): GamepadState | null;
    /**
     * Retorna `true` se o botão `button` do gamepad `gamepadIndex` estiver
     * pressionado. Retorna `false` se o gamepad não estiver conectado.
     */
    isButtonDown(gamepadIndex: number, button: number): boolean;
    /**
     * Retorna o valor do eixo `axis` do gamepad `gamepadIndex` com deadzone
     * aplicada (valores no intervalo (-deadzone, +deadzone) viram 0).
     * Retorna 0 se o gamepad não estiver conectado ou o eixo não existir.
     */
    getAxis(gamepadIndex: number, axis: number): number;
    /** Limiar de deadzone configurado no construtor. */
    get deadzone(): number;
    private _applyDeadzone;
}
//# sourceMappingURL=GamepadManager.d.ts.map