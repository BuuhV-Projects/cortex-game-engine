/**
 * **Profiler por-subsistema do frame** (SPEC-0134) — o "juiz" de performance do
 * engine. Mede o tempo de cada seção nomeada do loop (`render`, `world`, `ui`…)
 * com um ring buffer por seção, derivando **média** e **p99** numa janela de N
 * frames. O {@link FrameProfiler.commitFrame} fecha o frame e joga os
 * acumuladores nos rings; o {@link DebugHud} lê o {@link FrameProfiler.summary}.
 *
 * É a base de medição do roadmap open-world (PRD-0005): sem breakdown por
 * subsistema, os cortes de perf das fases seguintes não têm critério objetivo.
 *
 * **Custo quando desligado ≈ zero:** `begin`/`end`/`commitFrame` retornam no
 * primeiro `if`. Fica ligado só quando o HUD de debug está ativo
 * (`export --debug`, `?cortexHud=1` ou o toggle do Studio) — ver {@link Game}.
 *
 * @example
 * const p = new FrameProfiler({ enabled: true });
 * p.begin('world'); world.tick(dt); p.end('world');
 * p.begin('render'); renderer.render(scene, cam); p.end('render');
 * p.commitFrame();
 * p.summary(); // [{ name: 'world', lastMs, avgMs, p99Ms }, …]
 */

/** Resumo de uma seção na janela atual. */
export interface SectionSummary {
  /** Nome da seção (ex.: `render`, `world`, `ui`). */
  name: string;
  /** Duração do último frame commitado, em ms. */
  lastMs: number;
  /** Média na janela, em ms. */
  avgMs: number;
  /** p99 na janela (pior caso típico — o que importa pra hitching), em ms. */
  p99Ms: number;
}

/** Janela padrão (frames guardados por seção) — ~4 s a 60 fps. */
const DEFAULT_WINDOW_FRAMES = 240;
/** Menor janela válida (evita ring de tamanho 0). */
const MIN_WINDOW_FRAMES = 1;
/** Percentil usado no `summary` (pior caso típico, relevante pra hitching). */
const P99 = 0.99;

/** Opções do {@link FrameProfiler}. */
export interface FrameProfilerOptions {
  /** Tamanho da janela (frames guardados por seção). Default {@link DEFAULT_WINDOW_FRAMES}. */
  window?: number;
  /** Já começa ligado? Default `false`. */
  enabled?: boolean;
  /** Fonte de tempo em ms (injetável pra teste). Default `performance.now`/`Date.now`. */
  now?: () => number;
}

/** Ring buffer circular de durações (ms) de uma seção. */
interface Ring {
  buf: Float64Array;
  /** Nº de slots preenchidos (satura em `window`). */
  len: number;
  /** Próximo índice de escrita. */
  head: number;
  /** Última duração commitada. */
  last: number;
}

function defaultNow(): number {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  return typeof perf?.now === 'function' ? perf.now() : Date.now();
}

export class FrameProfiler {
  private readonly window: number;
  private readonly now: () => number;
  private enabled: boolean;

  /** Ordem de registro das seções (preserva a ordem de exibição no HUD). */
  private readonly order: string[] = [];
  private readonly rings = new Map<string, Ring>();
  /** Início da seção aberta (entre `begin` e `end`). */
  private readonly openAt = new Map<string, number>();
  /** Tempo acumulado por seção NO frame corrente (somado se chamada 2×). */
  private readonly frameAccum = new Map<string, number>();

  constructor(opts?: FrameProfilerOptions) {
    this.window = Math.max(MIN_WINDOW_FRAMES, Math.floor(opts?.window ?? DEFAULT_WINDOW_FRAMES));
    this.enabled = opts?.enabled ?? false;
    this.now = opts?.now ?? defaultNow;
  }

  /** Liga/desliga a medição (o {@link Game} amarra isso à visibilidade do HUD). */
  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  /** Está medindo? */
  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Abre a seção `name` (marca o início). No-op quando desligado. */
  begin(name: string): void {
    if (!this.enabled) return;
    if (!this.rings.has(name)) this.register(name);
    this.openAt.set(name, this.now());
  }

  /** Fecha a seção `name` e acumula a duração no frame corrente. No-op quando desligado. */
  end(name: string): void {
    if (!this.enabled) return;
    const start = this.openAt.get(name);
    if (start === undefined) return;
    const dt = this.now() - start;
    this.frameAccum.set(name, (this.frameAccum.get(name) ?? 0) + dt);
    this.openAt.delete(name);
  }

  /**
   * Fecha o frame: joga o tempo acumulado de cada seção conhecida no seu ring
   * (seções sem atividade neste frame entram como `0`, mantendo os rings em
   * sincronia) e zera os acumuladores. Chame **1×/frame**, no fim do tick.
   */
  commitFrame(): void {
    if (!this.enabled) return;
    for (const name of this.order) {
      const ring = this.rings.get(name)!;
      const value = this.frameAccum.get(name) ?? 0;
      ring.buf[ring.head] = value;
      ring.last = value;
      ring.head = (ring.head + 1) % this.window;
      if (ring.len < this.window) ring.len++;
    }
    this.frameAccum.clear();
  }

  /** Resumo por seção (na ordem de registro): último, média e p99 na janela. */
  summary(): SectionSummary[] {
    const out: SectionSummary[] = [];
    for (const name of this.order) {
      const ring = this.rings.get(name)!;
      out.push({ name, lastMs: ring.last, avgMs: this.avg(ring), p99Ms: this.percentile(ring, P99) });
    }
    return out;
  }

  /** Zera todos os rings e o estado do frame (ex.: ao esconder o HUD). */
  reset(): void {
    this.openAt.clear();
    this.frameAccum.clear();
    for (const ring of this.rings.values()) {
      ring.len = 0;
      ring.head = 0;
      ring.last = 0;
      ring.buf.fill(0);
    }
  }

  private register(name: string): void {
    this.order.push(name);
    this.rings.set(name, { buf: new Float64Array(this.window), len: 0, head: 0, last: 0 });
  }

  private avg(ring: Ring): number {
    if (ring.len === 0) return 0;
    let sum = 0;
    for (let i = 0; i < ring.len; i++) sum += ring.buf[i]!;
    return sum / ring.len;
  }

  private percentile(ring: Ring, q: number): number {
    if (ring.len === 0) return 0;
    const sorted = Array.from(ring.buf.subarray(0, ring.len)).sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
    return sorted[idx]!;
  }
}
