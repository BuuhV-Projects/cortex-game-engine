/**
 * Sonda de fases do render (SPEC-0227).
 *
 * A SPEC-0225 mediu que 83% do render são trabalho do `three` em JS — 73 us por
 * draw — mas como um bloco só. Esta sonda divide esse bloco nas fases que o
 * renderer executa por objeto, para que a escolha do que migrar para C++ seja
 * feita com número e não por palpite.
 *
 * É instrumento de diagnóstico: desligada por default, não embrulha nada.
 */
import { Object3D } from 'three';
import { debug } from './debug.js';

/** Leituras do relógio usadas na calibração (custo médio e resolução). */
const CLOCK_CALIBRATION_SAMPLES = 512;
const NS_PER_MS = 1_000_000;

/** Níveis da sonda, pedidos por `?renderPhases=<nivel>`. */
export const PROBE_OFF = 0;
/** Fases do frame: custo de três pares de leitura por passe. */
export const PROBE_PHASES = 1;
/** Inclui o balde POR OBJETO — dois pares por draw, intrusivo por natureza. */
export const PROBE_PER_OBJECT = 2;
/**
 * Abre o `renderObject` por dentro (cache, nodes, geometria, bindings,
 * pipeline, submissão). É o nível que responde se existe uma fatia isolável
 * para migrar, e custa ~8 pares de leitura por draw.
 */
export const PROBE_INTERNALS = 3;

const QUERY_KEY = 'renderPhases=';
const FREEZE_KEY = 'matrixFreeze=';

/**
 * Fases medidas. `each` só existe do nível {@link PROBE_PER_OBJECT} para cima;
 * de `objGet` a `draw`, só no nível {@link PROBE_INTERNALS} (são o `each`
 * aberto por dentro, então o próprio `each` fica com o que sobrar).
 */
export type RenderPhase =
  | 'matrix'
  | 'project'
  | 'objects'
  | 'each'
  | 'objGet'
  | 'nodes'
  | 'geom'
  | 'bind'
  | 'pipe'
  | 'draw';

const PHASES: readonly RenderPhase[] = [
  'matrix',
  'project',
  'objects',
  'each',
  'objGet',
  'nodes',
  'geom',
  'bind',
  'pipe',
  'draw',
];

interface PhaseAccumulator {
  /**
   * Tempo **próprio** somado no frame, em ms: o que rodou nesta fase sem contar
   * o que ela delegou a outra fase medida. As fases se aninham — o renderer
   * chama `updateMatrixWorld` dentro dos passes —, e medir tempo total daria
   * baldes que se sobrepõem e somam mais que o `render`.
   */
  ms: number;
  /** Chamadas de TOPO contadas no frame (a recursão não conta de novo). */
  calls: number;
}

/** Uma fase aberta na pilha de execução. */
interface OpenPhase {
  phase: RenderPhase;
  /** Instante em que o tempo próprio desta fase voltou a correr. */
  resumedMs: number;
}

/** Custo e resolução do relógio, medidos — não presumidos (SPEC-0227). */
export interface ClockCalibration {
  /** Custo médio de uma leitura de `performance.now()`, em nanossegundos. */
  costNs: number;
  /** Menor delta não-zero entre leituras consecutivas, em nanossegundos. */
  resolutionNs: number;
}

/** Renderer do three visto pela sonda — só o que ela precisa embrulhar. */
type RendererLike = object;

type AnyMethod = (...args: never[]) => unknown;

/**
 * Acha na cadeia de protótipos quem de fato define o método — `_projectObject`
 * mora na superclasse `Renderer`, não no `WebGPURenderer` que a instância
 * aponta.
 */
function methodOwner(target: object, name: string): object | null {
  for (let proto: object | null = target; proto; proto = Object.getPrototypeOf(proto) as object | null) {
    if (Object.prototype.hasOwnProperty.call(proto, name)) return proto;
  }
  return null;
}

/** Mede custo médio e resolução efetiva do `performance.now()` deste host. */
export function calibrateClock(): ClockCalibration {
  const startedMs = performance.now();
  let previousMs = startedMs;
  let smallestStepMs = Number.POSITIVE_INFINITY;
  for (let i = 0; i < CLOCK_CALIBRATION_SAMPLES; i++) {
    const nowMs = performance.now();
    const stepMs = nowMs - previousMs;
    if (stepMs > 0 && stepMs < smallestStepMs) smallestStepMs = stepMs;
    previousMs = nowMs;
  }
  const totalMs = performance.now() - startedMs;
  return {
    costNs: (totalMs * NS_PER_MS) / CLOCK_CALIBRATION_SAMPLES,
    resolutionNs: Number.isFinite(smallestStepMs) ? smallestStepMs * NS_PER_MS : 0,
  };
}

/**
 * Frames após os quais o experimento de teto congela a atualização de matriz
 * (`?matrixFreeze=<frames>`), ou 0 para não congelar.
 *
 * Mede o **teto** da poda de travessia: no cenário `?bench&hold` nada se move,
 * então com as matrizes já calculadas a imagem sai idêntica e a diferença de
 * `cpu.render` é exatamente o que a fase de matriz custava. É experimento de
 * diagnóstico — congelar matriz num jogo de verdade prega objeto no lugar.
 */
export function matrixFreezeRequested(): number {
  try {
    if (typeof location === 'undefined') return 0;
    const search = location.search ?? '';
    const at = search.indexOf(FREEZE_KEY);
    if (at < 0) return 0;
    const frames = Number.parseInt(search.slice(at + FREEZE_KEY.length), 10);
    return Number.isFinite(frames) && frames > 0 ? frames : 0;
  } catch {
    return 0;
  }
}

/** Nível pedido pela query (`?renderPhases=1`), no padrão do `?cortexHud=1`. */
export function renderPhasesRequested(): number {
  try {
    if (typeof location === 'undefined') return PROBE_OFF;
    const search = location.search ?? '';
    const at = search.indexOf(QUERY_KEY);
    if (at < 0) return PROBE_OFF;
    const level = Number.parseInt(search.slice(at + QUERY_KEY.length), 10);
    return Number.isFinite(level) ? level : PROBE_OFF;
  } catch {
    return PROBE_OFF; // sem location (host sem query)
  }
}

/**
 * Embrulha as fases do renderer e acumula o tempo de cada uma por frame.
 *
 * Duas guardas mantêm a medição honesta: a **recursão** só é cronometrada na
 * chamada de topo (senão a mesma árvore contaria uma vez por nó), e o tempo só
 * é acumulado **dentro do `render()`** (senão o `updateMatrixWorld` que os
 * sistemas do jogo chamam — o `?bench&hold&jitter`, por exemplo — entraria no
 * balde da fase).
 */
export class RenderPhaseProbe {
  private readonly _level: number;
  private readonly _live = new Map<RenderPhase, PhaseAccumulator>();
  private readonly _last = new Map<RenderPhase, PhaseAccumulator>();
  private readonly _undo: (() => void)[] = [];
  private readonly _depth = new Map<RenderPhase, number>();
  private readonly _stack: OpenPhase[] = [];
  private _inRender = false;
  private _installed = false;
  private _clock: ClockCalibration | null = null;
  private _renderer: RendererLike | null = null;
  /** `null` = nível 3 ainda não tentou; depois vira o resultado da tentativa. */
  private _internalsOk: boolean | null = null;

  constructor(level: number) {
    this._level = level;
    for (const phase of PHASES) {
      this._live.set(phase, { ms: 0, calls: 0 });
      this._last.set(phase, { ms: 0, calls: 0 });
      this._depth.set(phase, 0);
    }
  }

  get enabled(): boolean {
    return this._installed;
  }

  /** Calibração do relógio, disponível depois do {@link RenderPhaseProbe.install}. */
  get clock(): ClockCalibration | null {
    return this._clock;
  }

  /**
   * Estado do nível 3: `null` enquanto o primeiro `render()` não aconteceu,
   * depois `true`/`false`. Vai para o trace porque baldes internos zerados
   * significam coisas opostas — "fase barata" ou "sonda não instalou" — e essa
   * confusão é justamente o que este instrumento existe para evitar.
   */
  get internalsOk(): boolean | null {
    return this._internalsOk;
  }

  /**
   * Embrulha os métodos do renderer. Devolve `false` e desfaz tudo se algum
   * método esperado não existir — um bump do `three` pode renomear os privados,
   * e gravar zero seria indistinguível de "fase barata", que é exatamente a
   * conclusão errada que esta sonda existe para evitar.
   */
  install(renderer: RendererLike): boolean {
    if (this._level < PROBE_PHASES || this._installed) return false;
    this._clock = calibrateClock();
    const wrapped =
      this._wrapWindow(renderer, 'render') &&
      this._wrapPhase(Object3D.prototype, 'updateMatrixWorld', 'matrix') &&
      this._wrapPhase(renderer, '_projectObject', 'project') &&
      this._wrapPhase(renderer, '_renderObjects', 'objects') &&
      (this._level < PROBE_PER_OBJECT || this._wrapPhase(renderer, 'renderObject', 'each'));
    // Os colaboradores internos (`_objects`, `_nodes`, `backend`…) só nascem no
    // `init()` ASSÍNCRONO do renderer — no construtor do Game ainda são nulos.
    // Por isso o nível 3 embrulha no primeiro `render()`, não aqui.
    this._renderer = renderer;
    if (!wrapped) {
      this.uninstall();
      return false;
    }
    this._installed = true;
    debug('perf', `[renderPhases] nivel ${this._level}, relogio ${this._clock.resolutionNs.toFixed(0)} ns`);
    return true;
  }

  /** Desfaz os wrappers na ordem inversa. */
  uninstall(): void {
    while (this._undo.length > 0) this._undo.pop()?.();
    this._installed = false;
  }

  /**
   * Fecha o frame: move os acumuladores para "último frame" e zera os vivos.
   * Chamado junto do `commitFrame()` do profiler.
   */
  commitFrame(): void {
    // O frame fecha fora do render; se sobrou fase aberta, foi exceção no meio
    // do caminho — descartar evita carregar o tempo para o frame seguinte.
    this._stack.length = 0;
    for (const phase of PHASES) {
      const live = this._live.get(phase);
      const last = this._last.get(phase);
      if (!live || !last) continue;
      last.ms = live.ms;
      last.calls = live.calls;
      live.ms = 0;
      live.calls = 0;
    }
  }

  /** Tempo por fase do último frame fechado, em ms. */
  lastFrameMs(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const phase of PHASES) out[phase] = this._last.get(phase)?.ms ?? 0;
    return out;
  }

  /** Chamadas de topo por fase no último frame fechado. */
  lastFrameCalls(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const phase of PHASES) out[phase] = this._last.get(phase)?.calls ?? 0;
    return out;
  }

  /**
   * Abre o `renderObject` por dentro. Os alvos são os colaboradores que o
   * `_renderObjectDirect` do three chama por objeto: cache de RenderObject,
   * sistema de nodes, geometria, bindings (os uniform buffers), pipeline e a
   * submissão. É a lista que diz quanto de `each` é trabalho isolável — os
   * bindings, por exemplo — e quanto está preso ao sistema de materiais.
   */
  private _wrapInternals(renderer: RendererLike): boolean {
    const r = renderer as Record<string, object | undefined>;
    const targets: [holder: object | undefined, method: string, phase: RenderPhase][] = [
      [r['_objects'], 'get', 'objGet'],
      [r['_nodes'], 'needsRefresh', 'nodes'],
      [r['_nodes'], 'updateBefore', 'nodes'],
      [r['_nodes'], 'updateForRender', 'nodes'],
      [r['_nodes'], 'updateAfter', 'nodes'],
      [r['_geometries'], 'updateForRender', 'geom'],
      [r['_bindings'], 'updateForRender', 'bind'],
      [r['_pipelines'], 'updateForRender', 'pipe'],
      [r['_pipelines'], 'isReady', 'pipe'],
      [r['backend'], 'draw', 'draw'],
    ];
    for (const [holder, method, phase] of targets) {
      if (!holder || !this._wrapPhase(holder, method, phase)) {
        debug('perf', `[renderPhases] alvo interno ausente: ${method}`);
        return false;
      }
    }
    return true;
  }

  /**
   * Abre uma fase: pausa o tempo próprio de quem a chamou e começa o dela.
   * É o modelo de "self time" de um profiler de pilha — sem ele, uma fase
   * aninhada seria contada duas vezes e a soma dos baldes passaria do `render`.
   */
  private _enter(phase: RenderPhase): void {
    const nowMs = performance.now();
    const parent = this._stack[this._stack.length - 1];
    if (parent) {
      const acc = this._live.get(parent.phase);
      if (acc) acc.ms += nowMs - parent.resumedMs;
    }
    this._stack.push({ phase, resumedMs: nowMs });
  }

  /** Fecha a fase do topo e retoma o relógio de quem a chamou. */
  private _exit(): void {
    const nowMs = performance.now();
    const open = this._stack.pop();
    if (!open) return;
    const acc = this._live.get(open.phase);
    if (acc) acc.ms += nowMs - open.resumedMs;
    const parent = this._stack[this._stack.length - 1];
    if (parent) parent.resumedMs = nowMs;
  }

  /** Abre/fecha a janela em que as fases contam (o `render()` do three). */
  private _wrapWindow(target: object, name: string): boolean {
    const owner = methodOwner(target, name);
    if (!owner) {
      debug('perf', `[renderPhases] metodo ausente: ${name}`);
      return false;
    }
    const table = owner as Record<string, AnyMethod>;
    const original = table[name];
    const probe = this;
    table[name] = function wrapped(this: unknown, ...args: never[]): unknown {
      const outer = probe._inRender;
      probe._inRender = true;
      // Primeira passagem pelo render: o renderer já inicializou, então agora
      // dá para alcançar os colaboradores internos (nível 3).
      if (probe._level >= PROBE_INTERNALS && probe._internalsOk === null && probe._renderer) {
        probe._internalsOk = probe._wrapInternals(probe._renderer);
      }
      try {
        return original.apply(this, args);
      } finally {
        probe._inRender = outer;
      }
    };
    this._undo.push(() => {
      table[name] = original;
    });
    return true;
  }

  /** Cronometra a chamada de TOPO do método na fase indicada. */
  private _wrapPhase(target: object, name: string, phase: RenderPhase): boolean {
    const owner = methodOwner(target, name);
    if (!owner) {
      debug('perf', `[renderPhases] metodo ausente: ${name}`);
      return false;
    }
    const table = owner as Record<string, AnyMethod>;
    const original = table[name];
    const probe = this;
    const accumulator = this._live.get(phase);
    if (!accumulator) return false;
    table[name] = function wrapped(this: unknown, ...args: never[]): unknown {
      // Fora do render, ou já dentro da subárvore de uma chamada cronometrada:
      // executa sem tocar no relógio.
      if (!probe._inRender || (probe._depth.get(phase) ?? 0) > 0) return original.apply(this, args);
      probe._depth.set(phase, 1);
      probe._enter(phase);
      try {
        return original.apply(this, args);
      } finally {
        probe._exit();
        accumulator.calls++;
        probe._depth.set(phase, 0);
      }
    };
    this._undo.push(() => {
      table[name] = original;
    });
    return true;
  }
}
