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
  /**
   * Chamado a cada frame com o tempo decorrido em ms desde o frame anterior,
   * **limitado a 100 ms** (frames mais lentos desaceleram o jogo em vez de
   * entregar um passo gigante que tunela a física — ver `MAX_DELTA_MS`).
   */
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

/**
 * Teto do `deltaTime` repassado ao `onUpdate` (ms). Um frame pode demorar
 * QUALQUER tempo (hitch de GC, aba em background, máquina lenta, load de shader):
 * repassar o dt cru faz a física integrar um passo gigante — com gravidade,
 * `y += v*dt` atravessa o chão num único tick (o raycast de pouso, que parte de
 * `pés + stepHeight`, nasce ABAIXO da superfície e não a vê) e o personagem cai
 * no vazio ("respawn infinito" no export nativo a <9 fps). Com o clamp, abaixo
 * de ~10 fps o JOGO desacelera (time dilation) em vez de teleportar/tunelar —
 * o comportamento padrão de engines (Unity `maximumDeltaTime`).
 */
const MAX_DELTA_MS = 100;

export class GameLoop {
  private readonly _onUpdate: (dt: number) => void;
  private readonly _onFixedUpdate?: (fdt: number) => void;
  private readonly _fixedStep: number;

  private _running: boolean = false;
  private _paused: boolean = false;

  private _lastTime: number = 0;
  private _accumulator: number = 0;

  /** ID retornado por requestAnimationFrame (ambiente browser). */
  private _rafId: number | null = null;
  /** Handle retornado por setInterval (ambiente Node.js). */
  private _intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(options: GameLoopOptions) {
    this._onUpdate = options.onUpdate;
    this._onFixedUpdate = options.onFixedUpdate;
    this._fixedStep = options.fixedStep ?? (1000 / 60); // ~16.67 ms
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Inicia o loop. Sem efeito se já estiver rodando.
   */
  start(): void {
    if (this._running) return;
    this._running = true;
    this._paused = false;
    this._lastTime = this._now();
    this._accumulator = 0;
    this._startLoop();
  }

  /**
   * Para o loop completamente e reseta o estado interno.
   */
  stop(): void {
    this._running = false;
    this._paused = false;
    this._stopLoop();
  }

  /**
   * Pausa o loop sem resetar o estado. Use `resume()` para continuar.
   * Sem efeito se não estiver rodando ou já estiver pausado.
   */
  pause(): void {
    if (!this._running || this._paused) return;
    this._paused = true;
    this._stopLoop();
  }

  /**
   * Retoma o loop após `pause()`. Reinicializa `lastTime` para evitar um
   * spike de deltaTime acumulado durante a pausa.
   * Sem efeito se não estiver rodando ou não estiver pausado.
   */
  resume(): void {
    if (!this._running || !this._paused) return;
    this._paused = false;
    this._lastTime = this._now();
    this._accumulator = 0; // descarta acúmulo anterior para evitar burst de fixedUpdate
    this._startLoop();
  }

  /** Indica se o loop está ativo (inclui estado pausado). */
  get isRunning(): boolean {
    return this._running;
  }

  /** Indica se o loop está pausado. */
  get isPaused(): boolean {
    return this._paused;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Inicia o mecanismo de agendamento adequado ao ambiente.
   * Browser → requestAnimationFrame  |  Node.js → setInterval
   */
  private _startLoop(): void {
    if (typeof requestAnimationFrame !== 'undefined') {
      // ── Browser: rAF auto-reagendado ────────────────────────────────────
      const frame = (): void => {
        if (!this._running || this._paused) return;
        this._step();
        this._rafId = requestAnimationFrame(frame);
      };
      this._rafId = requestAnimationFrame(frame);
    } else {
      // ── Node.js: setInterval com passo fixo ──────────────────────────────
      this._intervalId = setInterval(() => {
        if (!this._running || this._paused) return;
        this._step();
      }, this._fixedStep);
    }
  }

  /** Cancela o agendamento ativo (rAF ou setInterval). */
  private _stopLoop(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  /**
   * Executa um passo do loop:
   * 1. Calcula `deltaTime` desde o último frame.
   * 2. Chama `onUpdate(deltaTime)` (passo variável).
   * 3. Acumula tempo e chama `onFixedUpdate` quantas vezes forem necessárias
   *    para cumprir o passo fixo configurado.
   */
  private _step(): void {
    const now = this._now();
    // Clamp anti-tunneling: ver MAX_DELTA_MS. O relógio do jogo desacelera num
    // frame lento; nunca entrega um passo que atravessa geometria.
    const deltaTime = Math.min(now - this._lastTime, MAX_DELTA_MS);
    this._lastTime = now;

    // Passo variável
    this._onUpdate(deltaTime);

    // Passo fixo (acumulador)
    if (this._onFixedUpdate) {
      this._accumulator += deltaTime;
      while (this._accumulator >= this._fixedStep) {
        this._onFixedUpdate(this._fixedStep);
        this._accumulator -= this._fixedStep;
      }
    }
  }

  /**
   * Retorna o timestamp atual em ms com alta precisão quando disponível
   * (`performance.now()`), ou via `Date.now()` como fallback.
   */
  private _now(): number {
    if (typeof performance !== 'undefined') {
      return performance.now();
    }
    return Date.now();
  }
}
