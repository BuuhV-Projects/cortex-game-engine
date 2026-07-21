/**
 * Testes do FrameProfiler (src/core/FrameProfiler.ts) — o profiler por-subsistema
 * do frame (SPEC-0134). Usa um relógio INJETADO (`now`) pra medir durações
 * determinísticas, sem depender do `performance.now` real.
 */

import { describe, it, expect } from 'vitest';
import { FrameProfiler } from '../../src/core/FrameProfiler.js';

/** Relógio controlável: `clock.t` é o "agora" em ms; avança na mão. */
function makeClock(): { t: number; now: () => number } {
  const clock = { t: 0, now: (): number => clock.t };
  return clock;
}

describe('FrameProfiler', () => {
  it('desligado é no-op: begin/end/commitFrame não medem nada', () => {
    const clock = makeClock();
    const p = new FrameProfiler({ enabled: false, now: clock.now });
    p.begin('world');
    clock.t += 5;
    p.end('world');
    p.commitFrame();
    expect(p.summary()).toEqual([]);
  });

  it('mede a duração de uma seção com o relógio injetado', () => {
    const clock = makeClock();
    const p = new FrameProfiler({ enabled: true, now: clock.now });
    p.begin('render');
    clock.t += 16; // 16 ms de render
    p.end('render');
    p.commitFrame();

    const [render] = p.summary();
    expect(render.name).toBe('render');
    expect(render.lastMs).toBe(16);
    expect(render.avgMs).toBe(16);
    expect(render.p99Ms).toBe(16);
  });

  it('preserva a ordem de registro das seções', () => {
    const clock = makeClock();
    const p = new FrameProfiler({ enabled: true, now: clock.now });
    for (const name of ['input', 'world', 'ui', 'render']) {
      p.begin(name);
      clock.t += 1;
      p.end(name);
    }
    p.commitFrame();
    expect(p.summary().map((s) => s.name)).toEqual(['input', 'world', 'ui', 'render']);
  });

  it('acumula quando a mesma seção é medida 2× no mesmo frame', () => {
    const clock = makeClock();
    const p = new FrameProfiler({ enabled: true, now: clock.now });
    p.begin('ui');
    clock.t += 3; // ui.update
    p.end('ui');
    clock.t += 10; // render no meio (não conta pra ui)
    p.begin('ui');
    clock.t += 2; // ui.render
    p.end('ui');
    p.commitFrame();

    const [ui] = p.summary();
    expect(ui.lastMs).toBe(5); // 3 + 2 no mesmo frame
  });

  it('seções aninhadas somam de forma independente', () => {
    const clock = makeClock();
    const p = new FrameProfiler({ enabled: true, now: clock.now });
    p.begin('world'); // externa
    clock.t += 2;
    p.begin('physics'); // interna
    clock.t += 8;
    p.end('physics');
    clock.t += 1;
    p.end('world');
    p.commitFrame();

    const byName = Object.fromEntries(p.summary().map((s) => [s.name, s.lastMs]));
    expect(byName.physics).toBe(8);
    expect(byName.world).toBe(11); // 2 + 8 + 1 (a interna está dentro da externa)
  });

  it('média e p99 refletem a janela de vários frames', () => {
    const clock = makeClock();
    const p = new FrameProfiler({ enabled: true, now: clock.now });
    // 100 frames de duração 1..100 ms (distintas). Nearest-rank:
    // p99 = índice ceil(0.99*100)-1 = 98 → o 99º menor = 99 ms.
    for (let d = 1; d <= 100; d++) {
      p.begin('render');
      clock.t += d;
      p.end('render');
      p.commitFrame();
    }
    const [render] = p.summary();
    expect(render.lastMs).toBe(100); // último frame
    expect(render.p99Ms).toBe(99); // pior ~1% (não o máximo, que é o p100)
    expect(render.avgMs).toBeCloseTo(50.5, 5); // média de 1..100
  });

  it('respeita o tamanho da janela (frames antigos saem do ring)', () => {
    const clock = makeClock();
    const p = new FrameProfiler({ enabled: true, window: 3, now: clock.now });
    for (const d of [100, 10, 10, 10]) {
      // o 1º frame (100 ms) deve sair da janela de 3
      p.begin('render');
      clock.t += d;
      p.end('render');
      p.commitFrame();
    }
    const [render] = p.summary();
    expect(render.avgMs).toBe(10); // só os 3 últimos (todos 10)
    expect(render.p99Ms).toBe(10); // o outlier de 100 já saiu
  });

  it('seção não tocada num frame entra como 0 (rings em sincronia)', () => {
    const clock = makeClock();
    const p = new FrameProfiler({ enabled: true, window: 4, now: clock.now });
    // frame 1: mede 'render' e 'world'
    p.begin('render'); clock.t += 10; p.end('render');
    p.begin('world'); clock.t += 4; p.end('world');
    p.commitFrame();
    // frame 2: só 'render' (world não roda neste frame)
    p.begin('render'); clock.t += 10; p.end('render');
    p.commitFrame();

    const byName = Object.fromEntries(p.summary().map((s) => [s.name, s]));
    expect(byName.world.lastMs).toBe(0); // não tocada no último frame
    expect(byName.world.avgMs).toBe(2); // (4 + 0) / 2
  });

  it('reset zera todos os rings e o estado do frame', () => {
    const clock = makeClock();
    const p = new FrameProfiler({ enabled: true, now: clock.now });
    p.begin('render'); clock.t += 16; p.end('render');
    p.commitFrame();
    p.reset();
    const [render] = p.summary();
    expect(render.lastMs).toBe(0);
    expect(render.avgMs).toBe(0);
    expect(render.p99Ms).toBe(0);
  });

  it('setEnabled(false) para de acumular novos frames', () => {
    const clock = makeClock();
    const p = new FrameProfiler({ enabled: true, now: clock.now });
    p.begin('render'); clock.t += 16; p.end('render');
    p.commitFrame();
    p.setEnabled(false);
    // com o profiler desligado, este frame não deve mudar nada
    p.begin('render'); clock.t += 999; p.end('render');
    p.commitFrame();
    const [render] = p.summary();
    expect(render.lastMs).toBe(16); // ainda o frame de quando estava ligado
    expect(p.isEnabled).toBe(false);
  });
});
