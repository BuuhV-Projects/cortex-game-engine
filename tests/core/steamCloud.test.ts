/**
 * Testes da fachada SteamCloud (src/core/steamCloud.ts) — SPEC-0743.
 * Sem a ponte nativa tudo é no-op; com ela, repassa nome e texto ao host.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SteamCloud } from '../../src/core/steamCloud.js';

afterEach(() => vi.unstubAllGlobals());

describe('SteamCloud', () => {
  it('sem a ponte nativa: indisponível e no-op', () => {
    expect(SteamCloud.isAvailable()).toBe(false);
    expect(SteamCloud.read('save.ini')).toBeNull();
    expect(SteamCloud.write('save.ini', 'a=1')).toBe(false);
    expect(SteamCloud.remove('save.ini')).toBe(false);
  });

  it('com a ponte: lê, grava e apaga pelo host', () => {
    const files = new Map<string, string>([['save.ini', 'a=1\n']]);
    vi.stubGlobal('__cortexSteamCloudAvailable', () => true);
    vi.stubGlobal('__cortexSteamCloudRead', (name: string) => files.get(name) ?? null);
    vi.stubGlobal('__cortexSteamCloudWrite', (name: string, text: string) => {
      files.set(name, text);
      return true;
    });
    vi.stubGlobal('__cortexSteamCloudDelete', (name: string) => files.delete(name));

    expect(SteamCloud.isAvailable()).toBe(true);
    expect(SteamCloud.read('save.ini')).toBe('a=1\n');
    expect(SteamCloud.read('config.ini')).toBeNull();
    expect(SteamCloud.write('config.ini', 'b=2\n')).toBe(true);
    expect(files.get('config.ini')).toBe('b=2\n');
    expect(SteamCloud.remove('save.ini')).toBe(true);
    expect(files.has('save.ini')).toBe(false);
  });

  it('resposta fora do tipo vira o valor neutro', () => {
    vi.stubGlobal('__cortexSteamCloudAvailable', () => 1);
    vi.stubGlobal('__cortexSteamCloudRead', () => 42);
    vi.stubGlobal('__cortexSteamCloudWrite', () => 'sim');
    expect(SteamCloud.isAvailable()).toBe(false);
    expect(SteamCloud.read('save.ini')).toBeNull();
    expect(SteamCloud.write('save.ini', '')).toBe(false);
  });
});
