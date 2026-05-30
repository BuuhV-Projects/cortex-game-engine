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
export declare class InputManager extends EventTarget {
    private _domElement;
    /** Teclas atualmente pressionadas (valor de `KeyboardEvent.key`). */
    private readonly _keysDown;
    /** Botões do mouse atualmente pressionados (índice de `MouseEvent.button`). */
    private readonly _buttonsDown;
    /** Posição atual do mouse relativa ao elemento anexado. */
    private _mousePosition;
    /**
     * Delta acumulado de movimento do mouse desde a última chamada a
     * `getMouseDelta()`. Resetado a zero após cada leitura.
     */
    private _mouseDelta;
    private _onKeyDownHandler;
    private _onKeyUpHandler;
    private _onMouseDownHandler;
    private _onMouseUpHandler;
    private _onMouseMoveHandler;
    /**
     * Registra os listeners de teclado e mouse no `domElement` fornecido.
     * Se já houver um elemento anexado, `detach()` é chamado antes.
     *
     * @param domElement Elemento HTML alvo (ex.: `canvas`, `document.body`).
     */
    attach(domElement: HTMLElement): void;
    /**
     * Remove todos os listeners do elemento e limpa o estado interno.
     * Sem efeito se nenhum elemento estiver anexado.
     */
    detach(): void;
    /**
     * Retorna `true` se a tecla identificada por `key` estiver pressionada.
     *
     * @param key Valor de `KeyboardEvent.key` (ex.: `"ArrowLeft"`, `"a"`, `" "`).
     *
     * @example
     * if (input.isKeyDown('ArrowLeft')) player.moveLeft();
     */
    isKeyDown(key: string): boolean;
    /**
     * Retorna `true` se o botão do mouse identificado por `button` estiver
     * pressionado.
     *
     * @param button Índice do botão: 0 = esquerdo, 1 = meio, 2 = direito.
     *
     * @example
     * if (input.isButtonDown(0)) shoot();
     */
    isButtonDown(button: number): boolean;
    /**
     * Retorna a posição atual do mouse em coordenadas relativas ao elemento
     * anexado.
     *
     * Retorna `{ x: 0, y: 0 }` se nenhum elemento estiver anexado ou se o
     * mouse ainda não tiver se movido.
     */
    getMousePosition(): MousePosition;
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
    getMouseDelta(): MouseDelta;
    /**
     * O elemento HTML atualmente anexado, ou `null` se `detach()` foi chamado
     * ou `attach()` ainda não foi invocado.
     */
    get domElement(): HTMLElement | null;
}
//# sourceMappingURL=InputManager.d.ts.map