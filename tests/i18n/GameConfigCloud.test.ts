/**
 * GameConfig pela Steam (SPEC-0743, ADR-0744): com o Remote Storage disponível
 * os .ini vão à nuvem e não à pasta do jogo; ausentes na nuvem, o arquivo de
 * antes é a semente; gravação recusada pela nuvem cai no arquivo de antes.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GameConfig } from '../../src/i18n/GameConfig.js';

afterEach(() => vi.unstubAllGlobals());

function mockFetch(files: Record<string, string>) {
  const fetchFn = vi.fn(async (url: string) => {
    const text = files[url];
    if (text === undefined) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => text };
  });
  vi.stubGlobal('fetch', fetchFn);
  return fetchFn;
}

/** Ponte nativa falsa: a nuvem e o __cortexWriteBaseFile (pasta do jogo). */
function fakeHost(cloud: Record<string, string> = {}, cloudWrites = true) {
  const remote = new Map(Object.entries(cloud));
  const baseFiles = new Map<string, string>();
  vi.stubGlobal('__cortexSteamCloudAvailable', () => true);
  vi.stubGlobal('__cortexSteamCloudRead', (name: string) => remote.get(name) ?? null);
  vi.stubGlobal('__cortexSteamCloudWrite', (name: string, text: string) => {
    if (!cloudWrites) return false;
    remote.set(name, text);
    return true;
  });
  vi.stubGlobal('__cortexSteamCloudDelete', (name: string) => remote.delete(name));
  vi.stubGlobal('__cortexWriteBaseFile', (name: string, text: string) => {
    baseFiles.set(name, text);
    return true;
  });
  return { remote, baseFiles };
}

describe('GameConfig no Steam Cloud', () => {
  it('lê da nuvem sem buscar o arquivo da pasta do jogo', async () => {
    const fetchFn = mockFetch({ 'save.ini': '[game]\nstarted=false\n' });
    fakeHost({ 'save.ini': '[game]\nstarted=true\n' });
    const save = await GameConfig.load('save.ini');
    expect(save.getBool('game.started')).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('ausente na nuvem: o arquivo local é a semente', async () => {
    mockFetch({ 'config.ini': '[game]\nlanguage=en\n' });
    fakeHost();
    const config = await GameConfig.load();
    expect(config.get('game.language')).toBe('en');
  });

  it('save() grava na nuvem e não cria o arquivo na pasta do jogo', async () => {
    mockFetch({});
    const { remote, baseFiles } = fakeHost();
    const save = await GameConfig.load('save.ini');
    save.set('game.started', true);
    expect(await save.save()).toBe(true);
    expect(remote.get('save.ini')).toBe('[game]\nstarted=true\n');
    expect(baseFiles.size).toBe(0);
  });

  it('nuvem recusa a gravação: cai no arquivo local e o próximo load lê ele, não a cópia velha', async () => {
    mockFetch({});
    const { remote, baseFiles } = fakeHost({ 'config.ini': '[game]\nlanguage=en\n' }, false);
    const config = await GameConfig.load();
    config.set('game.language', 'pt-BR');
    expect(await config.save()).toBe(true);
    expect(remote.has('config.ini')).toBe(false);
    expect(baseFiles.get('config.ini')).toBe('[game]\nlanguage=pt-BR\n');

    mockFetch({ 'config.ini': baseFiles.get('config.ini')! });
    expect((await GameConfig.load()).get('game.language')).toBe('pt-BR');
  });

  it('o overlay de dev do localStorage não entra pela Steam', async () => {
    mockFetch({});
    fakeHost({ 'config.ini': '[game]\nlanguage=en\n' });
    vi.stubGlobal('localStorage', { getItem: () => '[game]\nlanguage=fr\n', setItem: () => undefined });
    const config = await GameConfig.load();
    expect(config.get('game.language')).toBe('en');
  });
});
