import { describe, expect, it } from 'vitest';
import { createLoadingScreen, runWithLoadingScreen } from '../../src/core/LoadingScreen.js';
import type { UiLayer } from '../../src/ui/runtime/UiLayer.js';
import type { UiWidget } from '../../src/ui/runtime/widgets.js';

/** UiLayer fake: só o que o LoadingScreen usa (add/remove/update/render). */
function fakeUi(): UiLayer & { _widgets: UiWidget[] } {
  const widgets: UiWidget[] = [];
  let renders = 0;
  return {
    _widgets: widgets,
    add: <T extends UiWidget>(w: T): T => {
      widgets.push(w);
      return w;
    },
    remove: (w: UiWidget): void => {
      const i = widgets.indexOf(w);
      if (i >= 0) widgets.splice(i, 1);
    },
    update: (): void => {},
    render: (): void => {
      renders++;
    },
    get renders(): number {
      return renders;
    },
  } as unknown as UiLayer & { _widgets: UiWidget[] };
}

describe('LoadingScreen', () => {
  it('createLoadingScreen: destroy remove todos os widgets do UiLayer', () => {
    const ui = fakeUi();
    const ls = createLoadingScreen(ui);
    expect(ui._widgets.length).toBe(4); // bg + label + track + fill
    ls.destroy();
    expect(ui._widgets.length).toBe(0);
  });

  it('runWithLoadingScreen: roda a task com progresso e limpa a tela no fim', async () => {
    const ui = fakeUi();
    const orig = globalThis.requestAnimationFrame;
    let rafCalls = 0;
    // Dispara o frame algumas vezes via microtask; para após um teto (o loop
    // re-registra rAF a cada quadro — sem o teto rodaria pra sempre).
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number => {
      if (rafCalls++ < 50) queueMicrotask(() => cb(0));
      return rafCalls;
    }) as typeof globalThis.requestAnimationFrame;

    try {
      const seen: number[] = [];
      const result = await runWithLoadingScreen(ui, async (progress) => {
        progress('Carregando…', 0.3);
        seen.push(0.3);
        await Promise.resolve();
        progress('Quase…', 0.8);
        seen.push(0.8);
        return 42;
      });

      expect(result).toBe(42);
      expect(seen).toEqual([0.3, 0.8]);
      // widgets do loading removidos no fim (destroy no finally)
      expect(ui._widgets.length).toBe(0);
      // desenhou ao menos uma vez (na abertura)
      expect((ui as unknown as { renders: number }).renders).toBeGreaterThan(0);
    } finally {
      globalThis.requestAnimationFrame = orig;
    }
  });

  it('runWithLoadingScreen: pré-pinta 2 quadros ANTES da task (SPEC-0154)', async () => {
    const ui = fakeUi();
    const orig = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number => {
      queueMicrotask(() => cb(0));
      return 1;
    }) as typeof globalThis.requestAnimationFrame;
    try {
      let rendersAoEntrar = -1;
      let fillXAoEntrar = 0;
      await runWithLoadingScreen(ui, async () => {
        // No host nativo a carga roda numa única virada de JS: o que estiver
        // na tela ao ENTRAR aqui é o que o jogador vê a carga inteira.
        rendersAoEntrar = (ui as unknown as { renders: number }).renders;
        fillXAoEntrar = (ui._widgets[3] as unknown as { x: number }).x; // fill
        return 1;
      });
      expect(rendersAoEntrar).toBeGreaterThanOrEqual(2);
      // Barra inicializada em 0% (fill encostado à esquerda), não no template cru.
      expect(fillXAoEntrar).toBeLessThan(0);
    } finally {
      globalThis.requestAnimationFrame = orig;
    }
  });

  it('runWithLoadingScreen: `await progress` pinta e apresenta a etapa (SPEC-0154)', async () => {
    const ui = fakeUi();
    const orig = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number => {
      queueMicrotask(() => cb(0));
      return 1;
    }) as typeof globalThis.requestAnimationFrame;
    try {
      await runWithLoadingScreen(ui, async (progress) => {
        const antes = (ui as unknown as { renders: number }).renders;
        await progress('Meio…', 0.5); // resolve no rAF seguinte (present do quadro)
        const depois = (ui as unknown as { renders: number }).renders;
        expect(depois).toBeGreaterThan(antes); // pintou a etapa na hora
        return 1;
      });
    } finally {
      globalThis.requestAnimationFrame = orig;
    }
  });

  it('runWithLoadingScreen: enabled=false roda a task SEM criar a tela (editor)', async () => {
    const ui = fakeUi();
    const orig = globalThis.requestAnimationFrame;
    let rafCalls = 0;
    globalThis.requestAnimationFrame = ((): number => {
      rafCalls++;
      return rafCalls;
    }) as typeof globalThis.requestAnimationFrame;
    try {
      const seen: string[] = [];
      const result = await runWithLoadingScreen(
        ui,
        async (progress) => {
          progress('Carregando…', 0.5); // no-op quando desligada
          seen.push('rodou');
          return 7;
        },
        { enabled: false },
      );
      expect(result).toBe(7);
      expect(seen).toEqual(['rodou']); // a task rodou normalmente
      expect(ui._widgets.length).toBe(0); // nenhum widget de loading criado
      expect(rafCalls).toBe(0); // sem loop de render
    } finally {
      globalThis.requestAnimationFrame = orig;
    }
  });

  it('runWithLoadingScreen: propaga erro da task e ainda limpa a tela', async () => {
    const ui = fakeUi();
    const orig = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number => {
      queueMicrotask(() => cb(0));
      return 1;
    }) as typeof globalThis.requestAnimationFrame;
    try {
      await expect(
        runWithLoadingScreen(ui, async () => {
          throw new Error('falha na carga');
        }),
      ).rejects.toThrow('falha na carga');
      expect(ui._widgets.length).toBe(0); // limpou mesmo com erro
    } finally {
      globalThis.requestAnimationFrame = orig;
    }
  });
});
