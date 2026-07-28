/**
 * Testes do gate de plataforma (src/core/gamePlatform.ts) — ADR-0164.
 * A tela de remapeamento só existe no export PC/Steam; no Xbox some.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  canRebindInput,
  gamePlatform,
  resetGamePlatformCache,
} from '../../src/core/gamePlatform.js';

function mockFetch(files: Record<string, string>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const text = files[url];
      if (text === undefined) return { ok: false, status: 404, text: async () => '' };
      return { ok: true, status: 200, text: async () => text };
    }),
  );
}

beforeEach(() => resetGamePlatformCache());
afterEach(() => vi.unstubAllGlobals());

describe('gamePlatform', () => {
  it('lê o alvo gravado pelo export', async () => {
    mockFetch({ 'cortex.json': '{ "id": "x", "platform": "steam" }' });
    expect(await gamePlatform()).toBe('steam');
  });

  it('sem o campo (projeto antigo/Studio) assume pc — dá pra testar a tela em dev', async () => {
    mockFetch({ 'cortex.json': '{ "id": "x" }' });
    expect(await gamePlatform()).toBe('pc');
  });

  it('arquivo ausente, JSON inválido ou valor desconhecido caem em pc', async () => {
    mockFetch({});
    expect(await gamePlatform()).toBe('pc');

    resetGamePlatformCache();
    mockFetch({ 'cortex.json': '{ isso não é json' });
    expect(await gamePlatform()).toBe('pc');

    resetGamePlatformCache();
    mockFetch({ 'cortex.json': '{ "platform": "playstation" }' });
    expect(await gamePlatform()).toBe('pc');
  });

  it('resposta HTML (SPA fallback do vite dev) conta como ausente', async () => {
    mockFetch({ 'cortex.json': '<!doctype html>' });
    expect(await gamePlatform()).toBe('pc');
  });

  it('memoriza — o arquivo não muda em runtime', async () => {
    mockFetch({ 'cortex.json': '{ "platform": "xbox" }' });
    expect(await gamePlatform()).toBe('xbox');
    const fetchMock = globalThis.fetch as unknown as { mock: { calls: unknown[] } };
    await gamePlatform();
    expect(fetchMock.mock.calls.length).toBe(1);
  });
});

describe('canRebindInput', () => {
  it('libera no PC e na Steam, bloqueia no Xbox', () => {
    expect(canRebindInput('pc')).toBe(true);
    expect(canRebindInput('steam')).toBe(true);
    expect(canRebindInput('xbox')).toBe(false);
  });
});
