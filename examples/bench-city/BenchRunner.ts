/**
 * **Harness de medição do benchmark** (M-perf-1 / ADR-0135) — dirige a câmera
 * num trilho circular sobre a cidade, descarta um warmup, mede N frames e emite
 * um relatório `[bench]{…}` no stdout que o `native/scripts/bench.mjs` parseia.
 *
 * Junta as três fontes de verdade do PRD-0005: FPS de relógio de parede (avg +
 * pior 1%), breakdown por subsistema do {@link FrameProfiler} (p99 de
 * render/world/ui) e os contadores de chamadas NAPI do host (`__cortexNapiStats`).
 * O `[bench]` é uma linha JSON única, estável entre execuções (≤5% de variação).
 */
import type { PerspectiveCamera, OrthographicCamera } from 'three';
import type { FrameProfiler } from '../../src/core/FrameProfiler.js';
import type { BenchCityParams } from './generate.js';

/** Câmera do jogo (perspectiva ou ortográfica) — ambas têm `position`/`lookAt`. */
type BenchCamera = PerspectiveCamera | OrthographicCamera;

/** Contadores de chamadas NAPI de um frame (host nativo). */
export interface NapiCounts {
  setPipeline: number;
  setBindGroup: number;
  setVertexBuffer: number;
  setIndexBuffer: number;
  draw: number;
  drawIndexed: number;
  writeBuffer: number;
  submit: number;
}

/** Relatório final do benchmark (serializado na linha `[bench]`). */
export interface BenchReport {
  params: BenchCityParams;
  /** Frames efetivamente medidos (fora do warmup). */
  frames: number;
  /** FPS médio (1000 / média do frame-ms). */
  fpsAvg: number;
  /** FPS do pior 1% (1000 / p99 do frame-ms) — o que denuncia hitching. */
  fpsP1: number;
  /** p99 (ms) por seção do profiler: `render`, `world`, `ui`, … */
  ms: Record<string, number>;
  /** Contadores NAPI do último frame, ou `null` no browser (sem o shim). */
  napi: NapiCounts | null;
}

/** Trilho de câmera. `orbit` = sobrevoo circular; `traverse` = anda pela cidade. */
export interface BenchRail {
  /** `orbit` (sobrevoo, default) ou `traverse` (atravessa a cidade — exercita o streaming). */
  mode?: 'orbit' | 'traverse';
  /** Raio do círculo (orbit) OU meia-extensão do percurso (traverse), em m. */
  radius: number;
  /** Altura da câmera (m). */
  height: number;
  /** Velocidade angular (rad/s) no orbit. */
  angularSpeed: number;
  /** Velocidade linear (m/s) no traverse. Default `40`. */
  speed?: number;
  /** Altura do ponto pra onde a câmera olha (m). */
  lookAtHeight: number;
}

const DEFAULT_TRAVERSE_SPEED = 40;
const TRAVERSE_LOOK_AHEAD = 60;

/** Opções do {@link BenchRunner}. */
export interface BenchOptions {
  params: BenchCityParams;
  /** Frames descartados antes de medir (deixa pipelines/GC assentarem). */
  warmupFrames: number;
  /** Frames medidos. */
  measureFrames: number;
  rail: BenchRail;
  /** Chamado 1× com o relatório pronto (imprime `[bench]` e encerra). */
  onReport: (report: BenchReport) => void;
  /** Fonte de tempo em ms (injetável pra teste). Default `performance.now`. */
  now?: () => number;
}

/** Percentil (nearest-rank) de uma amostra já coletada. */
function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx]!;
}

function defaultNow(): number {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  return typeof perf?.now === 'function' ? perf.now() : Date.now();
}

/** Seções do profiler reportadas (as que importam pro corte de render). */
const REPORTED_SECTIONS = ['render', 'world', 'ui', 'update', 'input'];
const P99 = 0.99;
const MS_PER_SEC = 1000;

export class BenchRunner {
  private readonly now: () => number;
  private elapsed = 0;
  private totalFrames = 0;
  private readonly frameMs: number[] = [];
  private lastNow: number | null = null;
  private done = false;

  constructor(
    private readonly camera: BenchCamera,
    private readonly profiler: FrameProfiler,
    private readonly opts: BenchOptions,
  ) {
    this.now = opts.now ?? defaultNow;
    this.profiler.setEnabled(true); // o bench é o consumidor do breakdown
  }

  /** Chame 1×/frame (em `game.onUpdate`), com o delta em segundos. */
  tick(dtSeconds: number): void {
    if (this.done) return;
    this.advanceCamera(dtSeconds);

    const now = this.now();
    this.totalFrames++;

    // Warmup: mexe a câmera mas não mede (deixa shaders/GC assentarem).
    if (this.totalFrames <= this.opts.warmupFrames) {
      this.lastNow = now;
      return;
    }
    if (this.lastNow !== null) this.frameMs.push(now - this.lastNow);
    this.lastNow = now;

    if (this.frameMs.length >= this.opts.measureFrames) this.finish();
  }

  private advanceCamera(dtSeconds: number): void {
    this.elapsed += dtSeconds;
    const { mode, radius, height, angularSpeed, lookAtHeight } = this.opts.rail;
    if (mode === 'traverse') {
      // Anda em vaivém pelo eixo X através da cidade (câmera baixa, olhando à
      // frente) — as células entram/saem do raio: o streaming trabalha de verdade.
      const speed = this.opts.rail.speed ?? DEFAULT_TRAVERSE_SPEED;
      const period = (radius * 2) / speed; // tempo pra cruzar de -radius a +radius
      const phase = (this.elapsed % (period * 2)) / period; // 0..2 (ida e volta)
      const x = phase < 1 ? -radius + phase * 2 * radius : radius - (phase - 1) * 2 * radius;
      const dir = phase < 1 ? 1 : -1;
      this.camera.position.set(x, height, 0);
      this.camera.lookAt(x + dir * TRAVERSE_LOOK_AHEAD, lookAtHeight, 0);
      return;
    }
    const angle = this.elapsed * angularSpeed;
    this.camera.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
    this.camera.lookAt(0, lookAtHeight, 0);
  }

  private finish(): void {
    this.done = true;
    const avgMs = this.frameMs.reduce((a, b) => a + b, 0) / this.frameMs.length;
    const p99Ms = percentile(this.frameMs, P99);

    const ms: Record<string, number> = {};
    for (const s of this.profiler.summary()) {
      if (REPORTED_SECTIONS.includes(s.name)) ms[s.name] = round2(s.p99Ms);
    }

    const report: BenchReport = {
      params: this.opts.params,
      frames: this.frameMs.length,
      fpsAvg: round2(MS_PER_SEC / avgMs),
      fpsP1: round2(MS_PER_SEC / p99Ms),
      ms,
      napi: readNapiStats(),
    };
    this.opts.onReport(report);
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function readNapiStats(): NapiCounts | null {
  const fn = (globalThis as { __cortexNapiStats?: () => NapiCounts }).__cortexNapiStats;
  if (typeof fn !== 'function') return null;
  try {
    return fn();
  } catch {
    return null;
  }
}
