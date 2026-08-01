/**
 * Fachada `Steam` do engine (SPEC-0175).
 *
 * O ponto central: SEM as globais `__cortexSteam*` (Studio, browser, export PC
 * puro) nada pode lançar — todo método vira no-op e devolve o valor neutro. É o
 * que permite autorar conquistas no Studio e só vê-las disparar sob a Steam.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Steam, resetSteamWarning } from '../../src/core/steamworks.js';

const GLOBALS = [
  '__cortexSteamAvailable',
  '__cortexSteamAppId',
  '__cortexSteamSetAchievement',
  '__cortexSteamClearAchievement',
  '__cortexSteamGetAchievement',
  '__cortexSteamSetIntStat',
  '__cortexSteamSetFloatStat',
  '__cortexSteamGetIntStat',
  '__cortexSteamGetFloatStat',
  '__cortexSteamStoreStats',
  '__cortexSteamPlayerName',
  '__cortexSteamPlayerId',
  '__cortexSteamLanguage',
  '__cortexSteamOverlayActive',
  '__cortexSteamOpenOverlay',
] as const;

const g = globalThis as Record<string, unknown>;

/** Instala uma ponte nativa falsa e devolve os espiões por nome. */
function fakeBridge(overrides: Record<string, unknown> = {}): Record<string, ReturnType<typeof vi.fn>> {
  const spies: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const name of GLOBALS) {
    const fn = vi.fn(() => overrides[name]);
    spies[name] = fn;
    g[name] = fn;
  }
  return spies;
}

beforeEach(() => {
  resetSteamWarning();
});
afterEach(() => {
  for (const name of GLOBALS) delete g[name];
});

describe('sem ponte nativa (Studio/browser/export PC)', () => {
  it('nenhum método lança', () => {
    expect(() => {
      Steam.isAvailable();
      Steam.appId();
      Steam.unlockAchievement('X');
      Steam.clearAchievement('X');
      Steam.hasAchievement('X');
      Steam.setIntStat('s', 1);
      Steam.setFloatStat('s', 1.5);
      Steam.getIntStat('s');
      Steam.getFloatStat('s');
      Steam.storeStats();
      Steam.player();
      Steam.language();
      Steam.isOverlayActive();
      Steam.openOverlay();
    }).not.toThrow();
  });

  it('devolve os valores neutros', () => {
    expect(Steam.isAvailable()).toBe(false);
    expect(Steam.appId()).toBe(0);
    expect(Steam.unlockAchievement('X')).toBe(false);
    expect(Steam.getIntStat('s')).toBe(0);
    expect(Steam.language()).toBe('');
    expect(Steam.player()).toBeNull();
  });
});

describe('com ponte nativa', () => {
  it('isAvailable/appId espelham o host', () => {
    fakeBridge({ __cortexSteamAvailable: true, __cortexSteamAppId: 480 });
    expect(Steam.isAvailable()).toBe(true);
    expect(Steam.appId()).toBe(480);
  });

  it('unlockAchievement repassa o id e NÃO envia sozinha', () => {
    const spies = fakeBridge({ __cortexSteamSetAchievement: true });
    expect(Steam.unlockAchievement('WORLD_1_CLEAR')).toBe(true);
    expect(spies.__cortexSteamSetAchievement).toHaveBeenCalledWith('WORLD_1_CLEAR');
    // storeStats é chamada separada — desbloquear várias deve custar UM envio.
    expect(spies.__cortexSteamStoreStats).not.toHaveBeenCalled();
  });

  it('stats int e float vão por caminhos distintos', () => {
    const spies = fakeBridge({ __cortexSteamSetIntStat: true, __cortexSteamSetFloatStat: true });
    Steam.setIntStat('coins', 12);
    Steam.setFloatStat('time', 3.5);
    expect(spies.__cortexSteamSetIntStat).toHaveBeenCalledWith('coins', 12);
    expect(spies.__cortexSteamSetFloatStat).toHaveBeenCalledWith('time', 3.5);
  });

  it('player() devolve nome e SteamID64 como STRING (não cabe em number)', () => {
    fakeBridge({
      __cortexSteamPlayerName: 'Buuh',
      __cortexSteamPlayerId: '76561198000000000',
    });
    expect(Steam.player()).toEqual({ name: 'Buuh', id: '76561198000000000' });
  });

  it('player() é null quando o host devolve tudo vazio', () => {
    fakeBridge({ __cortexSteamPlayerName: '', __cortexSteamPlayerId: '' });
    expect(Steam.player()).toBeNull();
  });

  it('openOverlay traduz a página pro nome do SDK (case-sensitive)', () => {
    const spies = fakeBridge({ __cortexSteamOpenOverlay: true });
    Steam.openOverlay('achievements');
    expect(spies.__cortexSteamOpenOverlay).toHaveBeenCalledWith('Achievements');
  });

  it('openOverlay sem argumento cai em Friends', () => {
    const spies = fakeBridge({ __cortexSteamOpenOverlay: true });
    Steam.openOverlay();
    expect(spies.__cortexSteamOpenOverlay).toHaveBeenCalledWith('Friends');
  });

  it('retorno de tipo inesperado do host não vaza pro jogo', () => {
    fakeBridge({
      __cortexSteamAvailable: 'sim',
      __cortexSteamAppId: 'muitos',
      __cortexSteamLanguage: 42,
    });
    expect(Steam.isAvailable()).toBe(false);
    expect(Steam.appId()).toBe(0);
    expect(Steam.language()).toBe('');
  });
});
