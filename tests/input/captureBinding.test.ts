/**
 * Testes da captura de binding (src/input/captureBinding.ts) — SPEC-0165.
 * Cobre as duas famílias (teclado/mouse por evento; gamepad por tick), o
 * baseline que impede capturar o botão que ABRIU a captura, e o cancelamento.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createBindingCapture } from '../../src/input/captureBinding.js';
import type { GamepadManager } from '../../src/core/GamepadManager.js';

/** `window` mínimo com dispatch manual (o ambiente de teste é node). */
function fakeWindow(): { dispatch(type: string, event: Record<string, unknown>): void } {
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  const win = {
    addEventListener(type: string, fn: (e: unknown) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: (e: unknown) => void) {
      listeners.get(type)?.delete(fn);
    },
  };
  vi.stubGlobal('window', win);
  return {
    dispatch(type, event) {
      for (const fn of listeners.get(type) ?? []) fn(event);
    },
  };
}

class FakePad {
  readonly buttons = new Map<number, boolean>();
  readonly axes = new Map<number, number>();
  polls = 0;
  /**
   * Como o GamepadManager de verdade: o snapshot só existe depois de `poll()`.
   * No menu o `Game` está parado, então quem tem que polar é a captura.
   */
  private live = false;
  poll(): void {
    this.polls++;
    this.live = true;
  }
  isConnected(index: number): boolean {
    return this.live && index === 0;
  }
  firstConnectedIndex(): number {
    return 0;
  }
  isButtonDown(_slot: number, index: number): boolean {
    return this.buttons.get(index) ?? false;
  }
  getAxis(_slot: number, index: number): number {
    return this.axes.get(index) ?? 0;
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('família teclado/mouse', () => {
  it('captura a próxima tecla (normalizada)', async () => {
    const win = fakeWindow();
    const capture = createBindingCapture({ family: 'keyboard' });
    win.dispatch('keydown', { key: 'K' });
    expect(await capture.promise).toEqual({ source: 'key', key: 'k' });
  });

  it('Escape cancela sem alterar', async () => {
    const win = fakeWindow();
    const capture = createBindingCapture({ family: 'keyboard' });
    win.dispatch('keydown', { key: 'Escape' });
    expect(await capture.promise).toBeNull();
  });

  it('auto-repeat não conta (Enter segurado ao confirmar a célula)', async () => {
    const win = fakeWindow();
    const capture = createBindingCapture({ family: 'keyboard' });
    win.dispatch('keydown', { key: 'Enter', repeat: true });
    win.dispatch('keydown', { key: 'f' });
    expect(await capture.promise).toEqual({ source: 'key', key: 'f' });
  });

  it('botão do mouse também vira binding', async () => {
    const win = fakeWindow();
    const capture = createBindingCapture({ family: 'keyboard' });
    win.dispatch('pointerdown', { button: 2 });
    expect(await capture.promise).toEqual({ source: 'mouse', index: 2 });
  });

  it('cancel() resolve null', async () => {
    fakeWindow();
    const capture = createBindingCapture({ family: 'keyboard' });
    capture.cancel();
    expect(await capture.promise).toBeNull();
  });
});

describe('família gamepad', () => {
  it('não captura o botão que já estava pressionado (o A que abriu a captura)', async () => {
    fakeWindow();
    const pad = new FakePad();
    pad.buttons.set(0, true); // A segurado desde antes
    const capture = createBindingCapture({
      family: 'gamepad',
      gamepad: pad as unknown as GamepadManager,
    });
    capture.tick(); // baseline
    capture.tick();
    capture.tick();
    let settled = false;
    void capture.promise.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    pad.buttons.set(3, true); // agora o jogador aperta Y
    capture.tick();
    expect(await capture.promise).toEqual({ source: 'pad', index: 3 });
  });

  it('pola o gamepad no tick — no menu ninguém pola por ela (ficava em "Pressione...")', async () => {
    fakeWindow();
    const pad = new FakePad();
    const capture = createBindingCapture({
      family: 'gamepad',
      gamepad: pad as unknown as GamepadManager,
    });
    capture.tick(); // baseline: só existe se a própria captura polar
    expect(pad.polls).toBeGreaterThan(0);

    pad.buttons.set(2, true);
    capture.tick();
    expect(await capture.promise).toEqual({ source: 'pad', index: 2 });
  });

  it('captura deflexão de eixo com o sentido (conserta stick nos eixos errados)', async () => {
    fakeWindow();
    const pad = new FakePad();
    const capture = createBindingCapture({
      family: 'gamepad',
      gamepad: pad as unknown as GamepadManager,
    });
    capture.tick(); // baseline
    pad.axes.set(3, -0.95);
    capture.tick();
    expect(await capture.promise).toEqual({ source: 'axis', index: 3, sign: -1 });
  });

  it('encostar no stick (abaixo do limiar) não captura', async () => {
    fakeWindow();
    const pad = new FakePad();
    const capture = createBindingCapture({
      family: 'gamepad',
      gamepad: pad as unknown as GamepadManager,
    });
    capture.tick();
    pad.axes.set(0, 0.4);
    capture.tick();
    let settled = false;
    void capture.promise.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
  });

  it('tecla não vaza pra captura de controle (o listener nem é registrado)', async () => {
    const win = fakeWindow();
    const pad = new FakePad();
    const capture = createBindingCapture({
      family: 'gamepad',
      gamepad: pad as unknown as GamepadManager,
    });
    win.dispatch('keydown', { key: 'k' });
    let settled = false;
    void capture.promise.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    capture.cancel();
  });
});
