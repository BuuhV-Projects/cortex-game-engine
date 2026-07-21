import type { UiLayer } from './runtime/UiLayer.js';
import { UiLabel, UiPanel } from './runtime/widgets.js';
import type { FrameProfiler } from '../core/FrameProfiler.js';

/**
 * **HUD de métricas do modo debug** — FPS, CPU, memória e GPU na tela, sobre a
 * UI de runtime (ADR-0102: DOM no browser, raster no host nativo). Pensado pro
 * **export em modo debug** (`export-game.mjs --debug`), mas liga em qualquer
 * ambiente com `?cortexHud=1` na query (Studio/browser inclusive).
 *
 * Fontes de dado:
 * - **FPS / frame ms** — medidos aqui (janela de ~500 ms; pior frame incluso).
 * - **CPU / MEM / GPU** — no host nativo, do shim `__cortexPerfStats()`
 *   (CPU % do processo, working set MB, VRAM MB via DXGI). No browser, MEM cai
 *   pro `performance.memory` (Chrome) e CPU/GPU ficam indisponíveis (—).
 * - **Draw calls / triângulos** — `renderer.info` do three quando exposto.
 * - **Breakdown por subsistema** (SPEC-0134) — `render`/`world`/`ui` p99 (ms)
 *   do {@link FrameProfiler}, quando injetado.
 * - **Chamadas NAPI/frame** — no host nativo, do shim `__cortexNapiStats()`
 *   (draw, bind group, pipeline, writeBuffer): o teto de CPU do render (PRD-0005).
 *
 * O {@link Game} cria e alimenta o HUD sozinho quando o modo debug está ativo —
 * jogos não precisam de código. Ver {@link debugHudRequested}.
 */

/** Stats do processo vindas do host nativo (shim `__cortexPerfStats`). */
interface HostPerfStats {
  cpuPercent: number;
  memMB: number;
  gpuMemMB: number;
}

/**
 * Contadores de chamadas ao shim WebGPU no ÚLTIMO frame (host nativo, shim
 * `__cortexNapiStats`) — cada travessia JS→C++ tem custo fixo de marshalling;
 * é o gargalo de render diagnosticado no PRD-0005 (M-perf-2).
 */
interface NapiFrameStats {
  setPipeline: number;
  setBindGroup: number;
  setVertexBuffer: number;
  setIndexBuffer: number;
  draw: number;
  drawIndexed: number;
  writeBuffer: number;
  submit: number;
}

/** `renderer.info` do three (subset que o HUD mostra). */
interface RendererInfoLike {
  render?: { drawCalls?: number; triangles?: number };
}

/**
 * O modo debug foi pedido? `true` quando o export foi feito com `--debug`
 * (o bundle define `globalThis.__cortexDebugHud`) ou a página/host roda com
 * `cortexHud=1` na query string.
 */
export function debugHudRequested(): boolean {
  const g = globalThis as { __cortexDebugHud?: unknown };
  if (g.__cortexDebugHud === true) return true;
  try {
    if (typeof location !== 'undefined' && (location.search ?? '').includes('cortexHud=1')) return true;
  } catch {
    /* sem location (host sem query) */
  }
  return false;
}

/** Intervalo de atualização do texto do HUD (ms). */
const UPDATE_MS = 500;

/**
 * Layout do painel do HUD (canto inferior esquerdo). Todos os literais de
 * posição/tamanho ficam aqui — nada de número mágico inline. As linhas são
 * empilhadas de baixo pra cima a partir de {@link HUD.firstLineY} com passo
 * {@link HUD.lineH}; a altura do painel deriva da contagem de linhas.
 */
const HUD_LINES = 6;
const HUD = {
  /** Margens/posição do painel (relativas ao anchor `bottom-left`). */
  panelX: 10,
  panelY: -10,
  panelW: 268,
  /** Altura = linhas × passo + folga. */
  lineH: 20,
  padY: 12,
  panelOpacity: 0.55,
  cornerRadius: 6,
  bgColor: '#000000',
  /** Texto das labels. */
  labelX: 18,
  fontSize: 13,
  textColor: '#8ef58a',
  /** Y da 1ª linha (a de baixo); as demais sobem de `lineH` em `lineH`. */
  firstLineY: -22,
} as const;

/** Altura total do painel derivada da contagem de linhas. */
const HUD_PANEL_H = HUD_LINES * HUD.lineH + HUD.padY;

export class DebugHud {
  private readonly panel: UiPanel;
  private readonly fps: UiLabel;
  private readonly cpu: UiLabel;
  private readonly mem: UiLabel;
  private readonly gpu: UiLabel;
  private readonly prof: UiLabel;
  private readonly napi: UiLabel;

  private frames = 0;
  private elapsed = 0;
  private worst = 0;
  private _visible = true;

  /** @param ui Camada de UI de runtime (`game.ui`).
   *  @param rendererInfo Acessor opcional do `renderer.info` do three.
   *  @param profiler Profiler por-subsistema opcional (breakdown por seção). */
  constructor(
    ui: UiLayer,
    private readonly rendererInfo?: () => RendererInfoLike | null,
    private readonly profiler?: FrameProfiler,
  ) {
    // Painel discreto no canto inferior esquerdo (o HUD dos jogos usa o topo).
    this.panel = ui.add(new UiPanel({ anchor: 'bottom-left', x: HUD.panelX, y: HUD.panelY, width: HUD.panelW, height: HUD_PANEL_H, background: HUD.bgColor, opacity: HUD.panelOpacity, cornerRadius: HUD.cornerRadius }));
    // `mk(line)` posiciona a label pela linha (0 = base) SEM depender da ordem
    // de criação. Criadas de cima pra baixo (fps→napi) pra ficar legível.
    const mk = (lineFromBottom: number): UiLabel =>
      ui.add(new UiLabel({ anchor: 'bottom-left', x: HUD.labelX, y: HUD.firstLineY - lineFromBottom * HUD.lineH, text: '…', fontSize: HUD.fontSize, color: HUD.textColor }));
    this.fps = mk(5);
    this.cpu = mk(4);
    this.mem = mk(3);
    this.gpu = mk(2);
    this.prof = mk(1);
    this.napi = mk(0);
  }

  /** Widgets do HUD (pra ligar/desligar visibilidade de uma vez). */
  private get widgets(): Array<UiPanel | UiLabel> {
    return [this.panel, this.fps, this.cpu, this.mem, this.gpu, this.prof, this.napi];
  }

  /** Visível? O toggle do Studio (menu View) liga/desliga em runtime. */
  get visible(): boolean {
    return this._visible;
  }

  /** Mostra/esconde o HUD (some da tela e para de medir/rasterizar). */
  setVisible(visible: boolean): void {
    if (this._visible === visible) return;
    this._visible = visible;
    for (const w of this.widgets) w.set({ visible });
    this.frames = 0;
    this.elapsed = 0;
    this.worst = 0;
  }

  /** Alimente 1×/frame com o delta em ms (o {@link Game} faz isso). */
  frame(deltaMs: number): void {
    if (!this._visible) return;
    this.frames++;
    this.elapsed += deltaMs;
    if (deltaMs > this.worst) this.worst = deltaMs;
    if (this.elapsed < UPDATE_MS || this.frames === 0) return;

    const avg = this.elapsed / this.frames;
    const fps = 1000 / avg;
    this.fps.set({ text: `FPS ${fps.toFixed(0)}  ·  ${avg.toFixed(1)}ms (pior ${this.worst.toFixed(0)}ms)` });

    const stats = this.hostStats();
    this.cpu.set({ text: stats ? `CPU ${stats.cpuPercent.toFixed(0)}% do processo` : 'CPU —' });

    if (stats) {
      this.mem.set({ text: `MEM ${stats.memMB.toFixed(0)} MB` });
    } else {
      const heap = this.browserHeapMB();
      this.mem.set({ text: heap !== null ? `MEM ${heap.toFixed(0)} MB (JS heap)` : 'MEM —' });
    }

    const info = this.rendererInfo?.()?.render;
    const draws = info?.drawCalls !== undefined ? `${info.drawCalls} draws` : '';
    const tris = info?.triangles !== undefined ? ` ${(info.triangles / 1000).toFixed(0)}k tris` : '';
    const vram = stats && stats.gpuMemMB > 0 ? `GPU ${stats.gpuMemMB.toFixed(0)} MB` : 'GPU —';
    this.gpu.set({ text: `${vram}${draws || tris ? `  ·  ${draws}${tris}` : ''}` });

    this.prof.set({ text: this.profilerLine() });
    this.napi.set({ text: this.napiLine() });

    this.frames = 0;
    this.elapsed = 0;
    this.worst = 0;
  }

  /** Breakdown p99 (ms) das seções principais do frame (render/world/ui). */
  private profilerLine(): string {
    if (!this.profiler) return 'prof —';
    const wanted = ['render', 'world', 'ui'];
    const short: Record<string, string> = { render: 'rnd', world: 'wld', ui: 'ui' };
    const parts = this.profiler
      .summary()
      .filter((s) => wanted.includes(s.name))
      .map((s) => `${short[s.name] ?? s.name} ${s.p99Ms.toFixed(1)}`);
    return parts.length ? parts.join('  ') : 'prof —';
  }

  /** Linha de chamadas NAPI/frame (host nativo); '—' no browser. */
  private napiLine(): string {
    const stats = this.napiStats();
    if (!stats) return 'NAPI —';
    const drawTotal = stats.draw + stats.drawIndexed;
    return `NAPI draw ${drawTotal}  bind ${stats.setBindGroup}  pipe ${stats.setPipeline}  wb ${stats.writeBuffer}`;
  }

  private napiStats(): NapiFrameStats | null {
    const fn = (globalThis as { __cortexNapiStats?: () => NapiFrameStats }).__cortexNapiStats;
    if (typeof fn !== 'function') return null;
    try {
      return fn();
    } catch {
      return null;
    }
  }

  private hostStats(): HostPerfStats | null {
    const fn = (globalThis as { __cortexPerfStats?: () => HostPerfStats }).__cortexPerfStats;
    if (typeof fn !== 'function') return null;
    try {
      return fn();
    } catch {
      return null;
    }
  }

  private browserHeapMB(): number | null {
    const mem = (globalThis as { performance?: { memory?: { usedJSHeapSize?: number } } }).performance?.memory;
    return typeof mem?.usedJSHeapSize === 'number' ? mem.usedJSHeapSize / (1024 * 1024) : null;
  }
}
