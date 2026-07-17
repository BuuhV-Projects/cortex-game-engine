/**
 * window.close() no shim de DOM do host nativo (ADR-0120): tem que chamar a
 * bridge __cortexQuit do host (que empurra SDL_EVENT_QUIT e encerra o app) e
 * virar no-op silencioso quando a bridge não existe — mesmo comportamento de
 * uma aba normal de browser. Regressão do bug "Sair do menu não fecha o exe"
 * (antes nem existia window.close: TypeError engolido matava o loop do menu).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installDomLite } from '../../native/js/src/shims/dom-lite.js';

const MUTATED_GLOBALS = [
  'document',
  'window',
  'close',
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
  'innerWidth',
  'innerHeight',
  'devicePixelRatio',
  '__cortexResize',
  '__cortexQuit',
];

function clearGlobals(): void {
  const g = globalThis as Record<string, unknown>;
  for (const name of MUTATED_GLOBALS) delete g[name];
}

describe('dom-lite: window.close()', () => {
  beforeEach(() => clearGlobals());
  afterEach(() => clearGlobals());

  it('chama __cortexQuit quando a bridge do host existe', () => {
    const g = globalThis as Record<string, unknown>;
    let quits = 0;
    g['__cortexQuit'] = (): void => {
      quits++;
    };
    installDomLite();
    (g['window'] as { close(): void }).close();
    expect(quits).toBe(1);
  });

  it('é no-op (sem lançar) quando a bridge não existe', () => {
    installDomLite();
    const g = globalThis as Record<string, unknown>;
    expect(() => (g['window'] as { close(): void }).close()).not.toThrow();
  });
});
