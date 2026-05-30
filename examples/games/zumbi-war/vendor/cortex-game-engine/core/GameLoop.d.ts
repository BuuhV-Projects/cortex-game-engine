/**
 * GameLoop — loop principal do motor de jogo.
 *
 * - Browser: usa `requestAnimationFrame` para sincronizar com o vsync da tela.
 * - Node.js (ou qualquer ambiente sem rAF): usa `setInterval` como fallback.
 *
 * Referência: ADR-0002 (ECS) — `GameLoop` é responsável por chamar
 * `World.tick(deltaTime)` (onUpdate) e `World.tick(fixedStep)` (onFixedUpdate)
 * a cada passo fixo de física.
 */
export interface GameLoopOptions {
    /** Chamado a cada frame com o tempo decorrido em ms desde o frame anterior. */
    onUpdate: (deltaTime: number) => void;
    /**
     * Chamado em passo fixo com `fixedDeltaTime` constante.
     * Ideal para física e lógica determinística (ex: `World.tick` do ECS).
     */
    onFixedUpdate?: (fixedDeltaTime: number) => void;
    /**
     * Intervalo do passo fixo em ms.
     * @default 16.67  (~60 FPS)
     */
    fixedStep?: number;
}
export declare class GameLoop {
    private readonly _onUpdate;
    private readonly _onFixedUpdate?;
    private readonly _fixedStep;
    private _running;
    private _paused;
    private _lastTime;
    private _accumulator;
    /** ID retornado por requestAnimationFrame (ambiente browser). */
    private _rafId;
    /** Handle retornado por setInterval (ambiente Node.js). */
    private _intervalId;
    constructor(options: GameLoopOptions);
    /**
     * Inicia o loop. Sem efeito se já estiver rodando.
     */
    start(): void;
    /**
     * Para o loop completamente e reseta o estado interno.
     */
    stop(): void;
    /**
     * Pausa o loop sem resetar o estado. Use `resume()` para continuar.
     * Sem efeito se não estiver rodando ou já estiver pausado.
     */
    pause(): void;
    /**
     * Retoma o loop após `pause()`. Reinicializa `lastTime` para evitar um
     * spike de deltaTime acumulado durante a pausa.
     * Sem efeito se não estiver rodando ou não estiver pausado.
     */
    resume(): void;
    /** Indica se o loop está ativo (inclui estado pausado). */
    get isRunning(): boolean;
    /** Indica se o loop está pausado. */
    get isPaused(): boolean;
    /**
     * Inicia o mecanismo de agendamento adequado ao ambiente.
     * Browser → requestAnimationFrame  |  Node.js → setInterval
     */
    private _startLoop;
    /** Cancela o agendamento ativo (rAF ou setInterval). */
    private _stopLoop;
    /**
     * Executa um passo do loop:
     * 1. Calcula `deltaTime` desde o último frame.
     * 2. Chama `onUpdate(deltaTime)` (passo variável).
     * 3. Acumula tempo e chama `onFixedUpdate` quantas vezes forem necessárias
     *    para cumprir o passo fixo configurado.
     */
    private _step;
    /**
     * Retorna o timestamp atual em ms com alta precisão quando disponível
     * (`performance.now()`), ou via `Date.now()` como fallback.
     */
    private _now;
}
//# sourceMappingURL=GameLoop.d.ts.map