/**
 * Testes unitários do GameConfig (src/i18n/GameConfig.ts) — ADR-0124.
 * Cobre: parse/serialize INI, load do config.ini (com overlay de dev no
 * localStorage), getters tipados e save (shim nativo vs localStorage).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { GameConfig, parseIni, serializeIni } from '../../src/i18n/GameConfig.js';

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

function fakeLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const fake = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal('localStorage', fake);
  return store;
}

afterEach(() => vi.unstubAllGlobals());

const INI = `# config do jogo
[video]
fullscreen = true
width=1920
vsync=off

[game]
language=pt-BR
`;

describe('parseIni / serializeIni', () => {
  it('parseia seções, comentários e espaços; chaves saem achatadas', () => {
    expect(parseIni(INI)).toEqual({
      'video.fullscreen': 'true',
      'video.width': '1920',
      'video.vsync': 'off',
      'game.language': 'pt-BR',
    });
  });

  it('chave fora de seção fica sem prefixo; remove BOM', () => {
    expect(parseIni('﻿version=2\n[a]\nb=c')).toEqual({ version: '2', 'a.b': 'c' });
  });

  it('serializa agrupando por seção (chaves soltas primeiro) e faz roundtrip', () => {
    const values = { version: '2', 'video.fullscreen': 'true', 'game.language': 'en' };
    const text = serializeIni(values);
    expect(text).toBe('version=2\n\n[video]\nfullscreen=true\n\n[game]\nlanguage=en\n');
    expect(parseIni(text)).toEqual(values);
  });

  it('objeto vazio serializa vazio', () => {
    expect(serializeIni({})).toBe('');
  });
});

describe('GameConfig.load + getters', () => {
  it('carrega o config.ini e responde com tipos', async () => {
    mockFetch({ 'config.ini': INI });
    const config = await GameConfig.load();
    expect(config.get('game.language')).toBe('pt-BR');
    expect(config.getBool('video.fullscreen')).toBe(true);
    expect(config.getBool('video.vsync', true)).toBe(false); // "off"
    expect(config.getNumber('video.width')).toBe(1920);
    expect(config.has('video.width')).toBe(true);
  });

  it('arquivo ausente não é erro — getters devolvem os fallbacks', async () => {
    mockFetch({});
    const config = await GameConfig.load();
    expect(config.get('game.language', 'en')).toBe('en');
    expect(config.getBool('video.fullscreen', true)).toBe(true);
    expect(config.getNumber('video.width', 1280)).toBe(1280);
    expect(config.has('game.language')).toBe(false);
  });

  it('valor não numérico/booleano inválido cai pro fallback', async () => {
    mockFetch({ 'config.ini': '[video]\nwidth=grande\nvsync=talvez' });
    const config = await GameConfig.load();
    expect(config.getNumber('video.width', 800)).toBe(800);
    expect(config.getBool('video.vsync', true)).toBe(true);
  });

  it('resposta HTML (SPA fallback do vite dev) conta como ausente', async () => {
    mockFetch({ 'config.ini': '<!doctype html>' });
    const config = await GameConfig.load();
    expect(config.has('game.language')).toBe(false);
  });

  it('dev: overlay do localStorage vence o arquivo', async () => {
    mockFetch({ 'config.ini': '[game]\nlanguage=en' });
    fakeLocalStorage({ 'cortex:config.ini': '[game]\nlanguage=pt-BR' });
    const config = await GameConfig.load();
    expect(config.get('game.language')).toBe('pt-BR');
  });
});

describe('GameConfig.save', () => {
  it('host nativo: grava o arquivo via __cortexWriteBaseFile', async () => {
    mockFetch({ 'config.ini': '[game]\nlanguage=en' });
    const write = vi.fn(() => true);
    vi.stubGlobal('__cortexWriteBaseFile', write);
    const config = await GameConfig.load();
    config.set('game.language', 'pt-BR');
    config.set('video.vsync', true);
    expect(await config.save()).toBe(true);
    expect(write).toHaveBeenCalledWith(
      'config.ini',
      '[game]\nlanguage=pt-BR\n\n[video]\nvsync=true\n',
    );
  });

  it('nativo: escrita recusada (pasta read-only) retorna false', async () => {
    mockFetch({});
    vi.stubGlobal('__cortexWriteBaseFile', vi.fn(() => false));
    const config = await GameConfig.load();
    expect(await config.save()).toBe(false);
  });

  it('dev: save vai pro localStorage e o próximo load lê o overlay', async () => {
    mockFetch({ 'config.ini': '[game]\nlanguage=en' });
    fakeLocalStorage();
    const config = await GameConfig.load();
    config.set('game.language', 'pt-BR');
    expect(await config.save()).toBe(true);
    const reloaded = await GameConfig.load();
    expect(reloaded.get('game.language')).toBe('pt-BR');
  });

  it('delete remove a chave do save', async () => {
    mockFetch({ 'config.ini': '[game]\nlanguage=en\ncheats=on' });
    const write = vi.fn(() => true);
    vi.stubGlobal('__cortexWriteBaseFile', write);
    const config = await GameConfig.load();
    config.delete('game.cheats');
    await config.save();
    expect(write).toHaveBeenCalledWith('config.ini', '[game]\nlanguage=en\n');
  });
});
