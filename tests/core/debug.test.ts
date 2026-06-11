/**
 * Logger de debug por escopo (src/core/debug.ts): desligado por padrão, ligado por
 * flag de runtime (globalThis / setDebug), case-insensitive, e `debug()` só imprime
 * quando o escopo está ligado.
 */
import { describe, it, expect, vi } from 'vitest';
import { setDebug, isDebug, debug } from '../../src/core/debug.js';

describe('debug logger', () => {
  // ESTE PRIMEIRO: precisa de override indefinido (nenhum setDebug chamado ainda).
  it('lê globalThis.__CORTEX_DEBUG__ quando não há override', () => {
    (globalThis as Record<string, unknown>)['__CORTEX_DEBUG__'] = 'scene';
    expect(isDebug('scene')).toBe(true);
    expect(isDebug('physics')).toBe(false);
    delete (globalThis as Record<string, unknown>)['__CORTEX_DEBUG__'];
  });

  it('setDebug controla os escopos (case-insensitive; on/off)', () => {
    setDebug('');
    expect(isDebug('physics')).toBe(false);
    setDebug('*');
    expect(isDebug('qualquer')).toBe(true);
    setDebug('physics,persist');
    expect(isDebug('physics')).toBe(true);
    expect(isDebug('persist')).toBe(true);
    expect(isDebug('scene')).toBe(false);
    setDebug('Physics'); // case-insensitive
    expect(isDebug('physics')).toBe(true);
    setDebug('0');
    expect(isDebug('physics')).toBe(false);
  });

  it('debug() só imprime quando o escopo está ligado', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setDebug('');
    debug('physics', 'oi');
    expect(spy).not.toHaveBeenCalled();
    setDebug('physics');
    debug('physics', 'setType', 'x');
    expect(spy).toHaveBeenCalledWith('[cortex:physics]', 'setType', 'x');
    spy.mockRestore();
  });
});
