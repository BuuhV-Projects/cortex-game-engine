/**
 * Testes unitários para GamepadManager (src/core/GamepadManager.ts)
 *
 * Substitui `navigator.getGamepads` por um stub controlável que entrega
 * snapshots fabricados a cada chamada de `poll()`. Verifica detecção de
 * conexão/desconexão, transições de botão, deadzone nos axes e estado
 * resetado entre slots.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GamepadManager } from '../../src/core/GamepadManager.js';

// ─── Stub controlável de navigator.getGamepads ────────────────────────────────

/** Fabrica um objeto compatível com a interface `Gamepad` do browser. */
function makeBrowserGamepad(opts: {
  index: number;
  id?: string;
  connected?: boolean;
  buttons?: boolean[];
  values?: number[];
  axes?: number[];
}): Gamepad {
  return {
    index: opts.index,
    id: opts.id ?? `pad-${opts.index}`,
    connected: opts.connected ?? true,
    buttons: (opts.buttons ?? []).map((pressed, i) => ({
      pressed,
      touched: pressed,
      value: opts.values?.[i] ?? (pressed ? 1 : 0),
    })) as readonly GamepadButton[],
    axes: opts.axes ?? [],
    timestamp: 0,
    mapping: 'standard',
    hapticActuators: [],
    vibrationActuator: null,
  } as unknown as Gamepad;
}

/** Array atual retornado por `navigator.getGamepads()`. Mutável por teste. */
let currentGamepads: (Gamepad | null)[] = [null, null, null, null];

beforeEach(() => {
  currentGamepads = [null, null, null, null];
  // `navigator` é getter-only em Node moderno — usar vi.stubGlobal em
  // vez de atribuição direta a globalThis.
  vi.stubGlobal('navigator', {
    getGamepads: () => currentGamepads,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Testes ──────────────────────────────────────────────────────────────────

describe('GamepadManager', () => {
  // ── Estado inicial ──────────────────────────────────────────────────────────

  it('getGamepad retorna null antes do primeiro poll', () => {
    const gm = new GamepadManager();
    expect(gm.getGamepad(0)).toBeNull();
  });

  it('isButtonDown retorna false antes do primeiro poll', () => {
    const gm = new GamepadManager();
    expect(gm.isButtonDown(0, 0)).toBe(false);
  });

  it('getAxis retorna 0 antes do primeiro poll', () => {
    const gm = new GamepadManager();
    expect(gm.getAxis(0, 0)).toBe(0);
  });

  // ── poll() sem navigator ────────────────────────────────────────────────────

  it('poll() é no-op silencioso quando navigator.getGamepads não existe', () => {
    vi.stubGlobal('navigator', {}); // sem getGamepads
    const gm = new GamepadManager();
    expect(() => gm.poll()).not.toThrow();
    expect(gm.getGamepad(0)).toBeNull();
  });

  // ── Conexão ────────────────────────────────────────────────────────────────

  it('getButtonValue retorna o valor analógico do botão (gatilhos LT/RT)', () => {
    const gm = new GamepadManager();
    currentGamepads[0] = makeBrowserGamepad({
      index: 0,
      buttons: [false, false, false, false, false, false, true, true],
      values: [0, 0, 0, 0, 0, 0, 0.4, 0.85], // LT=6 a 40%, RT=7 a 85%
      axes: [],
    });
    gm.poll();
    expect(gm.getButtonValue(0, 7)).toBeCloseTo(0.85);
    expect(gm.getButtonValue(0, 6)).toBeCloseTo(0.4);
    expect(gm.getButtonValue(0, 0)).toBe(0);
    expect(gm.getButtonValue(1, 7)).toBe(0); // slot desconectado
  });

  it('emite gamepad:connect na primeira vez que detecta um pad', () => {
    const gm = new GamepadManager();
    const handler = vi.fn();
    gm.addEventListener('gamepad:connect', handler);

    currentGamepads[0] = makeBrowserGamepad({ index: 0, id: 'xbox-360', buttons: [false], axes: [0] });
    gm.poll();

    expect(handler).toHaveBeenCalledOnce();
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ index: 0, id: 'xbox-360' });
  });

  it('não emite gamepad:connect repetidamente em polls seguidos', () => {
    const gm = new GamepadManager();
    const handler = vi.fn();
    gm.addEventListener('gamepad:connect', handler);

    currentGamepads[0] = makeBrowserGamepad({ index: 0, buttons: [false], axes: [0] });
    gm.poll();
    gm.poll();
    gm.poll();

    expect(handler).toHaveBeenCalledOnce();
  });

  it('emite button:down para botões já pressionados no momento da conexão', () => {
    const gm = new GamepadManager();
    const handler = vi.fn();
    gm.addEventListener('button:down', handler);

    currentGamepads[0] = makeBrowserGamepad({
      index: 0,
      buttons: [true, false, true], // A e X já pressionados ao conectar
      axes: [0, 0],
    });
    gm.poll();

    expect(handler).toHaveBeenCalledTimes(2);
    const buttons = handler.mock.calls.map((c) => (c[0] as CustomEvent).detail.button);
    expect(buttons).toEqual([0, 2]);
  });

  // ── Desconexão ─────────────────────────────────────────────────────────────

  it('emite gamepad:disconnect quando o pad some entre polls', () => {
    const gm = new GamepadManager();
    const handler = vi.fn();
    gm.addEventListener('gamepad:disconnect', handler);

    currentGamepads[0] = makeBrowserGamepad({ index: 0, id: 'p1', buttons: [false], axes: [0] });
    gm.poll();
    currentGamepads[0] = null;
    gm.poll();

    expect(handler).toHaveBeenCalledOnce();
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ index: 0, id: 'p1' });
    expect(gm.getGamepad(0)).toBeNull();
  });

  it('trata connected=false como desconexão', () => {
    const gm = new GamepadManager();
    const handler = vi.fn();
    gm.addEventListener('gamepad:disconnect', handler);

    currentGamepads[0] = makeBrowserGamepad({ index: 0, buttons: [false], axes: [0] });
    gm.poll();
    currentGamepads[0] = makeBrowserGamepad({ index: 0, connected: false, buttons: [false], axes: [0] });
    gm.poll();

    expect(handler).toHaveBeenCalledOnce();
  });

  // ── Transições de botão ────────────────────────────────────────────────────

  it('emite button:down quando botão passa de solto para pressionado', () => {
    const gm = new GamepadManager();
    currentGamepads[0] = makeBrowserGamepad({ index: 0, buttons: [false, false], axes: [0] });
    gm.poll(); // conexão inicial — sem botões pressionados

    const handler = vi.fn();
    gm.addEventListener('button:down', handler);

    currentGamepads[0] = makeBrowserGamepad({ index: 0, buttons: [true, false], axes: [0] });
    gm.poll();

    expect(handler).toHaveBeenCalledOnce();
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ gamepadIndex: 0, button: 0 });
  });

  it('emite button:up quando botão passa de pressionado para solto', () => {
    const gm = new GamepadManager();
    currentGamepads[0] = makeBrowserGamepad({ index: 0, buttons: [true], axes: [0] });
    gm.poll();

    const handler = vi.fn();
    gm.addEventListener('button:up', handler);

    currentGamepads[0] = makeBrowserGamepad({ index: 0, buttons: [false], axes: [0] });
    gm.poll();

    expect(handler).toHaveBeenCalledOnce();
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ gamepadIndex: 0, button: 0 });
  });

  it('não emite button:down enquanto botão permanecer pressionado', () => {
    const gm = new GamepadManager();
    currentGamepads[0] = makeBrowserGamepad({ index: 0, buttons: [false], axes: [0] });
    gm.poll();

    const handler = vi.fn();
    gm.addEventListener('button:down', handler);

    currentGamepads[0] = makeBrowserGamepad({ index: 0, buttons: [true], axes: [0] });
    gm.poll(); // transição → emite
    gm.poll(); // mantido → não emite
    gm.poll(); // mantido → não emite

    expect(handler).toHaveBeenCalledOnce();
  });

  // ── isButtonDown ───────────────────────────────────────────────────────────

  it('isButtonDown reflete estado atual após poll', () => {
    const gm = new GamepadManager();
    currentGamepads[0] = makeBrowserGamepad({ index: 0, buttons: [true, false], axes: [0] });
    gm.poll();

    expect(gm.isButtonDown(0, 0)).toBe(true);
    expect(gm.isButtonDown(0, 1)).toBe(false);
  });

  it('isButtonDown retorna false para slot vazio', () => {
    const gm = new GamepadManager();
    gm.poll();
    expect(gm.isButtonDown(2, 0)).toBe(false);
  });

  // ── getAxis e deadzone ─────────────────────────────────────────────────────

  it('getAxis retorna o valor lido (acima da deadzone)', () => {
    const gm = new GamepadManager({ deadzone: 0.1 });
    currentGamepads[0] = makeBrowserGamepad({ index: 0, buttons: [], axes: [0.8, -0.5] });
    gm.poll();

    expect(gm.getAxis(0, 0)).toBeCloseTo(0.8);
    expect(gm.getAxis(0, 1)).toBeCloseTo(-0.5);
  });

  it('getAxis zera valores dentro da deadzone', () => {
    const gm = new GamepadManager({ deadzone: 0.2 });
    currentGamepads[0] = makeBrowserGamepad({ index: 0, buttons: [], axes: [0.1, -0.15, 0.05] });
    gm.poll();

    expect(gm.getAxis(0, 0)).toBe(0);
    expect(gm.getAxis(0, 1)).toBe(0);
    expect(gm.getAxis(0, 2)).toBe(0);
  });

  it('deadzone padrão é 0.15', () => {
    const gm = new GamepadManager();
    expect(gm.deadzone).toBe(0.15);
  });

  it('getAxis retorna 0 para slot vazio', () => {
    const gm = new GamepadManager();
    expect(gm.getAxis(0, 0)).toBe(0);
  });

  // ── getGamepad: cópia imutável ─────────────────────────────────────────────

  it('getGamepad retorna cópia — mutar não afeta estado interno', () => {
    const gm = new GamepadManager();
    currentGamepads[0] = makeBrowserGamepad({ index: 0, buttons: [true], axes: [0.5] });
    gm.poll();

    const snapshot = gm.getGamepad(0);
    expect(snapshot).not.toBeNull();
    snapshot!.buttons[0] = false;
    snapshot!.axes[0] = 0;

    const fresh = gm.getGamepad(0);
    expect(fresh!.buttons[0]).toBe(true);
    expect(fresh!.axes[0]).toBeCloseTo(0.5);
  });

  // ── Múltiplos slots independentes ──────────────────────────────────────────

  it('rastreia múltiplos gamepads independentemente', () => {
    const gm = new GamepadManager();
    currentGamepads[0] = makeBrowserGamepad({ index: 0, id: 'p1', buttons: [true], axes: [0] });
    currentGamepads[2] = makeBrowserGamepad({ index: 2, id: 'p3', buttons: [false], axes: [0] });
    gm.poll();

    expect(gm.getGamepad(0)?.id).toBe('p1');
    expect(gm.getGamepad(1)).toBeNull();
    expect(gm.getGamepad(2)?.id).toBe('p3');
    expect(gm.getGamepad(3)).toBeNull();
    expect(gm.isButtonDown(0, 0)).toBe(true);
    expect(gm.isButtonDown(2, 0)).toBe(false);
  });

  // ── Reconexão ──────────────────────────────────────────────────────────────

  it('reconexão emite gamepad:connect novamente', () => {
    const gm = new GamepadManager();
    const connectHandler = vi.fn();
    gm.addEventListener('gamepad:connect', connectHandler);

    currentGamepads[0] = makeBrowserGamepad({ index: 0, buttons: [false], axes: [0] });
    gm.poll();
    currentGamepads[0] = null;
    gm.poll();
    currentGamepads[0] = makeBrowserGamepad({ index: 0, buttons: [false], axes: [0] });
    gm.poll();

    expect(connectHandler).toHaveBeenCalledTimes(2);
  });

  // ── Reconexão via eventos do window (Chromium/Electron) ────────────────────
  // O Chromium só re-expõe o pad em getGamepads() após `gamepadconnected`; o
  // manager ouve esse evento e re-sincroniza na hora (ADR-0067).

  it('redetecta o pad ao receber `gamepadconnected` do window', () => {
    const win = new EventTarget();
    vi.stubGlobal('window', win);

    const gm = new GamepadManager();
    const connectHandler = vi.fn();
    gm.addEventListener('gamepad:connect', connectHandler);

    // O pad religado já aparece em getGamepads(); o evento do window dispara o sync.
    currentGamepads[0] = makeBrowserGamepad({ index: 0, id: 'xbox', buttons: [false], axes: [0] });
    win.dispatchEvent(new Event('gamepadconnected'));

    expect(connectHandler).toHaveBeenCalledOnce();
    expect(gm.getGamepad(0)?.id).toBe('xbox');
    gm.dispose();
  });

  it('limpa o slot ao receber `gamepaddisconnected` do window', () => {
    const win = new EventTarget();
    vi.stubGlobal('window', win);

    const gm = new GamepadManager();
    currentGamepads[0] = makeBrowserGamepad({ index: 0, buttons: [false], axes: [0] });
    gm.poll();
    expect(gm.getGamepad(0)).not.toBeNull();

    const disconnectHandler = vi.fn();
    gm.addEventListener('gamepad:disconnect', disconnectHandler);
    currentGamepads[0] = null;
    win.dispatchEvent(new Event('gamepaddisconnected'));

    expect(disconnectHandler).toHaveBeenCalledOnce();
    expect(gm.getGamepad(0)).toBeNull();
    gm.dispose();
  });

  it('dispose remove os listeners (não re-sincroniza depois)', () => {
    const win = new EventTarget();
    vi.stubGlobal('window', win);

    const gm = new GamepadManager();
    gm.dispose();

    const connectHandler = vi.fn();
    gm.addEventListener('gamepad:connect', connectHandler);
    currentGamepads[0] = makeBrowserGamepad({ index: 0, buttons: [false], axes: [0] });
    win.dispatchEvent(new Event('gamepadconnected'));

    expect(connectHandler).not.toHaveBeenCalled();
  });

  // ── Extende EventTarget ────────────────────────────────────────────────────

  it('GamepadManager é instância de EventTarget', () => {
    const gm = new GamepadManager();
    expect(gm).toBeInstanceOf(EventTarget);
  });
});
