/**
 * HUD de métricas do modo debug (export --debug): FPS/frame ms medidos por
 * janela, CPU/MEM/GPU vindos do shim nativo (`__cortexPerfStats`) quando
 * existe, fallback de heap do browser, e gate de ativação (define do bundle ou
 * `?cortexHud=1`).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { DebugHud, debugHudRequested } from '../../src/ui/DebugHud.js';
import type { UiLayer } from '../../src/ui/runtime/UiLayer.js';
import type { UiLabel } from '../../src/ui/runtime/widgets.js';

// UiLayer mínimo: os widgets são só dados; o backend não é necessário no teste.
function fakeUi(): { ui: UiLayer; labels: UiLabel[] } {
  const labels: UiLabel[] = [];
  const ui = {
    add<T>(w: T): T {
      if ((w as { text?: unknown }).text !== undefined) labels.push(w as unknown as UiLabel);
      return w;
    },
  } as unknown as UiLayer;
  return { ui, labels };
}

const G = globalThis as { __cortexDebugHud?: unknown; __cortexPerfStats?: unknown };

afterEach(() => {
  delete G.__cortexDebugHud;
  delete G.__cortexPerfStats;
});

describe('debugHudRequested', () => {
  it('desligado por default; liga com o global do bundle --debug', () => {
    expect(debugHudRequested()).toBe(false);
    G.__cortexDebugHud = true;
    expect(debugHudRequested()).toBe(true);
  });
});

describe('DebugHud', () => {
  it('acumula uma janela de ~500ms e publica FPS + pior frame', () => {
    const { ui, labels } = fakeUi();
    const hud = new DebugHud(ui);
    expect(labels).toHaveLength(4); // fps, cpu, mem, gpu
    for (let i = 0; i < 29; i++) hud.frame(16.7);
    expect(labels[0]!.text).toBe('…'); // janela ainda aberta (484 ms)
    hud.frame(33.4); // fecha a janela com um frame pior
    expect(labels[0]!.text).toContain('FPS 58'); // 517ms/30 frames ≈ 17.2ms
    expect(labels[0]!.text).toContain('pior 33ms');
  });

  it('usa o shim nativo __cortexPerfStats quando existe (CPU/MEM/GPU)', () => {
    G.__cortexPerfStats = () => ({ cpuPercent: 42.4, memMB: 512.6, gpuMemMB: 300.2 });
    const { ui, labels } = fakeUi();
    const hud = new DebugHud(ui, () => ({ render: { drawCalls: 15, triangles: 120_000 } }));
    for (let i = 0; i < 40; i++) hud.frame(16.7);
    expect(labels[1]!.text).toContain('CPU 42%');
    expect(labels[2]!.text).toContain('MEM 513 MB');
    expect(labels[3]!.text).toContain('GPU 300 MB');
    expect(labels[3]!.text).toContain('15 draws');
    expect(labels[3]!.text).toContain('120k tris');
  });

  it('sem shim: CPU indisponível e GPU só com draws (não quebra)', () => {
    const { ui, labels } = fakeUi();
    const hud = new DebugHud(ui);
    for (let i = 0; i < 40; i++) hud.frame(16.7);
    expect(labels[1]!.text).toBe('CPU —');
    expect(labels[3]!.text).toContain('GPU —');
  });
});
