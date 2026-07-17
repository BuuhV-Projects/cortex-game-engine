import type { UiLayer } from './runtime/UiLayer.js';
import { UiLabel, UiPanel } from './runtime/widgets.js';

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

const UPDATE_MS = 500;

export class DebugHud {
  private readonly panel: UiPanel;
  private readonly fps: UiLabel;
  private readonly cpu: UiLabel;
  private readonly mem: UiLabel;
  private readonly gpu: UiLabel;

  private frames = 0;
  private elapsed = 0;
  private worst = 0;
  private _visible = true;

  /** @param ui Camada de UI de runtime (`game.ui`).
   *  @param rendererInfo Acessor opcional do `renderer.info` do three. */
  constructor(
    ui: UiLayer,
    private readonly rendererInfo?: () => RendererInfoLike | null,
  ) {
    // Painel discreto no canto inferior esquerdo (o HUD dos jogos usa o topo).
    this.panel = ui.add(new UiPanel({ anchor: 'bottom-left', x: 10, y: -10, width: 236, height: 92, background: '#000000', opacity: 0.55, cornerRadius: 6 }));
    const mk = (dy: number): UiLabel =>
      ui.add(new UiLabel({ anchor: 'bottom-left', x: 18, y: dy, text: '…', fontSize: 13, color: '#8ef58a' }));
    this.fps = mk(-82);
    this.cpu = mk(-62);
    this.mem = mk(-42);
    this.gpu = mk(-22);
  }

  /** Visível? O toggle do Studio (menu View) liga/desliga em runtime. */
  get visible(): boolean {
    return this._visible;
  }

  /** Mostra/esconde o HUD (some da tela e para de medir/rasterizar). */
  setVisible(visible: boolean): void {
    if (this._visible === visible) return;
    this._visible = visible;
    for (const w of [this.panel, this.fps, this.cpu, this.mem, this.gpu]) w.set({ visible });
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

    this.frames = 0;
    this.elapsed = 0;
    this.worst = 0;
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
