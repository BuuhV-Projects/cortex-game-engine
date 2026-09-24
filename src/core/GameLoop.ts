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
import { bootMark, bootDump } from './bootProfile.js';
import { debug } from './debug.js';

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
  /**
   * Teto de quadros por segundo (ADR-0257). `0` ou ausente = sem teto.
   * Pode ser trocado depois com {@link GameLoop.maxFps}.
   */
  maxFps?: number;
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

/**
 * Folga do teto de quadros (ms). O instante do vsync oscila um pouco; sem folga,
 * um frame que chega 0,1 ms antes do alvo seria pulado e o jogo cairia para a
 * METADE da taxa pedida (ex.: teto 75 num monitor de 75 Hz daria 37,5).
 */
const FRAME_CAP_TOLERANCE_MS = 1;
/** Intervalos de frame usados para estimar o refresh do monitor. */
const REFRESH_SAMPLES = 30;
/** Quão perto de inteiro `refresh / teto` precisa estar para contar como divisor. */
const DIVISOR_EPSILON = 0.05;
/** Quantos divisores lisos do refresh o aviso lista (refresh/1, /2, /3). */
const SMOOTH_DIVISORS = 3;
const MS_PER_SECOND = 1000;

/**
 * Teto de quadros com ALVO acumulado (ADR-0257) — separado do laço para ser
 * testável sem `requestAnimationFrame`.
 *
 * O orçamento avança por soma (`proximoAlvo += orcamento`), não por "tempo desde
 * o último frame". A diferença é o ponto inteiro deste código: com vsync a 75 Hz
 * e teto 60, a versão por delta pula todo frame de 13,3 ms e entrega 37,5 fps; a
 * versão por alvo entrega 4 de cada 5 vsyncs = 60 fps exatos.
 *
 * Também estima o refresh do monitor pela mediana dos primeiros intervalos, e
 * avisa (por `debug`) quando o teto não é divisor dele — caso em que haverá
 * judder periódico, que é informação que o dev não tem como obter sozinho.
 */
export class FrameCap {
  private _budgetMs = 0;
  private _maxFps = 0;
  private _nextMs = -1;
  private _lastSeenMs = -1;
  private readonly _intervals: number[] = [];
  private _refreshHz: number | null = null;
  private _warned = false;

  constructor(maxFps = 0) {
    this.maxFps = maxFps;
  }

  /** Teto atual; `0` = sem teto. */
  get maxFps(): number {
    return this._maxFps;
  }

  set maxFps(fps: number) {
    this._maxFps = fps > 0 ? fps : 0;
    this._budgetMs = this._maxFps > 0 ? MS_PER_SECOND / this._maxFps : 0;
    this._nextMs = -1; // ressincroniza no próximo frame
    this._warned = false;
    this._warnIfNotDivisor();
  }

  /** Refresh estimado do monitor (Hz), ou `null` enquanto não há amostras. */
  get refreshHz(): number | null {
    return this._refreshHz;
  }

  /**
   * Registra o frame candidato e diz se ele deve rodar. Chamado a CADA callback
   * de frame, inclusive os que serão pulados — a estimativa do refresh precisa
   * dos intervalos crus.
   */
  admit(nowMs: number): boolean {
    this._observe(nowMs);
    if (this._budgetMs === 0) return true;
    if (this._nextMs < 0) {
      this._nextMs = nowMs + this._budgetMs;
      return true;
    }
    if (nowMs < this._nextMs - FRAME_CAP_TOLERANCE_MS) return false;
    this._nextMs += this._budgetMs;
    // Atrasado mais de um orçamento inteiro (travada, aba em background):
    // ressincroniza em vez de liberar uma rajada de frames para "recuperar".
    if (this._nextMs <= nowMs) this._nextMs = nowMs + this._budgetMs;
    return true;
  }

  private _observe(nowMs: number): void {
    if (this._refreshHz !== null) return;
    if (this._lastSeenMs >= 0) this._intervals.push(nowMs - this._lastSeenMs);
    this._lastSeenMs = nowMs;
    if (this._intervals.length < REFRESH_SAMPLES) return;
    const sorted = [...this._intervals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    this._refreshHz = median > 0 ? MS_PER_SECOND / median : null;
    this._intervals.length = 0;
    this._warnIfNotDivisor();
  }

  private _warnIfNotDivisor(): void {
    if (this._warned || this._maxFps === 0 || this._refreshHz === null) return;
    const ratio = this._refreshHz / this._maxFps;
    if (ratio < 1 || Math.abs(ratio - Math.round(ratio)) <= DIVISOR_EPSILON) return;
    this._warned = true;
    const smooth: string[] = [];
    for (let d = 1; d <= SMOOTH_DIVISORS; d++) smooth.push((this._refreshHz / d).toFixed(1));
    debug(
      'loop',
      `maxFps=${this._maxFps} não divide o refresh (~${this._refreshHz.toFixed(1)} Hz): ` +
        `a média bate, mas haverá judder periódico. Tetos lisos: ${smooth.join(', ')}`,
    );
  }
}

export class GameLoop {
  private readonly _onUpdate: (dt: number) => void;
  private readonly _onFixedUpdate?: (fdt: number) => void;
  private readonly _fixedStep: number;

  private readonly _cap: FrameCap;

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
    this._cap = new FrameCap(options.maxFps ?? 0);
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

  /**
   * Teto de quadros por segundo escolhido pelo jogo (ADR-0257). `0` = sem teto.
   *
   * Com vsync, só divisores do refresh dão frames de duração igual (num monitor
   * de 75 Hz: 75, 37,5, 25). Outro valor acerta a média mas alterna durações —
   * ainda melhor que oscilar sem padrão. Veja {@link refreshHz}.
   */
  get maxFps(): number {
    return this._cap.maxFps;
  }

  set maxFps(fps: number) {
    this._cap.maxFps = fps;
  }

  /** Refresh do monitor estimado nos primeiros frames (Hz), ou `null` até lá. */
  get refreshHz(): number | null {
    return this._cap.refreshHz;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Inicia o mecanismo de agendamento adequado ao ambiente.
   * Browser → requestAnimationFrame  |  Node.js → setInterval
   */
  private _startLoop(): void {
    if (typeof requestAnimationFrame !== 'undefined') {
      // ── Browser: rAF auto-reagendado ────────────────────────────────────
      // O 1º frame é o marco que fecha o boot: no host nativo ele só é atendido
      // quando o JS devolve o controle, então a distância entre "rAF agendado" e
      // "1º frame" É o tempo de tela preta (SPEC-0217).
      let firstFrame = true;
      const frame = (): void => {
        if (!this._running || this._paused) return;
        // Frame pulado pelo teto só se reagenda: `_lastTime` fica intacto, então
        // o próximo deltaTime cobre o intervalo inteiro e o jogo não perde tempo.
        if (!this._cap.admit(this._now())) {
          this._rafId = requestAnimationFrame(frame);
          return;
        }
        this._step();
        if (firstFrame) {
          firstFrame = false;
          bootMark('GameLoop: 1º frame desenhado');
          bootDump('1º frame desenhado');
        }
        this._rafId = requestAnimationFrame(frame);
      };
      bootMark('GameLoop: rAF agendado');
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
