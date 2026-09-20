/**
 * Profiler de boot (SPEC-0217): silencioso por padrão e passagem direta quando
 * desligado — instrumentar o caminho de carga não pode custar nada em produção.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { setDebug } from '../../src/core/debug.js';
import { bootMark, bootAcc, bootSync, bootDump, isBootProfiling } from '../../src/core/bootProfile.js';

afterEach(() => {
  setDebug(undefined);
  vi.restoreAllMocks();
});

describe('bootProfile', () => {
  it('fica silencioso sem o escopo "boot" ligado', () => {
    setDebug('scene'); // outro escopo não liga o profiler
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    bootMark('nada disso aparece');
    bootDump('nem isso');
    expect(isBootProfiling()).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  it('executa e devolve o valor mesmo desligado', async () => {
    setDebug(undefined);
    expect(bootSync('k', () => 40 + 2)).toBe(42);
    await expect(bootAcc('k', async () => 'ok')).resolves.toBe('ok');
  });

  it('carimba instantes e acumula por chave quando ligado', async () => {
    setDebug('boot');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    bootMark('montando a cena');
    bootSync('trabalho', () => 1);
    await bootAcc('trabalho', async () => 2);
    bootDump('fim');

    const linhas = log.mock.calls.map((c) => String(c[0]));
    expect(linhas.some((l) => l.includes('[cortex:boot]') && l.includes('montando a cena'))).toBe(true);
    expect(linhas.some((l) => l.includes('acumulados (fim)'))).toBe(true);
    // duas chamadas da mesma chave somam num acumulado só
    expect(linhas.some((l) => /trabalho: \d+ms em 2x/.test(l))).toBe(true);
  });

  it('propaga a exceção e ainda contabiliza a etapa', async () => {
    setDebug('boot');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(() => bootSync('falha', () => { throw new Error('quebrou'); })).toThrow('quebrou');
    await expect(bootAcc('falha', async () => { throw new Error('quebrou async'); })).rejects.toThrow('quebrou async');
  });
});
