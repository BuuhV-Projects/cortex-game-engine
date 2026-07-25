/**
 * TDR-0004 — event bus do host (`createEventBus`): é o "DOM" que os jogos usam
 * como barramento (`rush:*`). Regressões aqui viram vazamento (listener que não
 * sai) ou gameplay morto (dispatch que não chega) — ver SPEC-0152.
 */
import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error — shim JS do host, sem d.ts (roda no bundle nativo)
import { createEventBus } from '../../native/js/src/shims/event-target.js';

interface Bus {
  __listeners: Map<string, unknown[]>;
  addEventListener(type: string, cb: (e: unknown) => void): void;
  removeEventListener(type: string, cb: (e: unknown) => void): void;
  dispatchEvent(e: { type: string }): boolean;
}

describe('event bus do host (TDR-0004)', () => {
  it('add → dispatch chama; remove → para de chamar e some do mapa', () => {
    const bus = createEventBus() as Bus;
    const cb = vi.fn();
    bus.addEventListener('rush:coin', cb);
    bus.dispatchEvent({ type: 'rush:coin' });
    expect(cb).toHaveBeenCalledTimes(1);

    bus.removeEventListener('rush:coin', cb);
    bus.dispatchEvent({ type: 'rush:coin' });
    expect(cb).toHaveBeenCalledTimes(1); // não cresceu
    expect(bus.__listeners.get('rush:coin')).toHaveLength(0); // sem retenção
  });

  it('listener que lança não derruba os demais', () => {
    const bus = createEventBus() as Bus;
    const ok = vi.fn();
    bus.addEventListener('x', () => {
      throw new Error('boom');
    });
    bus.addEventListener('x', ok);
    // O shim usa print() pro log do erro — existe no host; aqui, stub.
    vi.stubGlobal('print', vi.fn());
    expect(() => bus.dispatchEvent({ type: 'x' })).not.toThrow();
    expect(ok).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('remover callback não registrado é no-op', () => {
    const bus = createEventBus() as Bus;
    expect(() => bus.removeEventListener('nada', () => {})).not.toThrow();
  });
});
