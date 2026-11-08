/**
 * Conquistas multiplataforma (src/core/achievements.ts) — SPEC-0713 / ADR-0714.
 * A Steam é uma falsa: o que importa é QUANTAS vezes o Steamworks é chamado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NullAchievements,
  SteamAchievements,
  createAchievements,
  loadAchievements,
  resetAchievementsCache,
  type AchievementSteamPort,
} from '../../src/core/achievements.js';
import { resetGamePlatformCache, type GamePlatform } from '../../src/core/gamePlatform.js';

const ID = 'intro_completed';

/** Steam falsa: conhece `known`, guarda o que foi marcado e conta as chamadas. */
class FakeSteam implements AchievementSteamPort {
  readonly marked = new Set<string>();
  calls = { unlock: 0, has: 0, store: 0 };
  /** O que o próximo `storeStats` devolve (falha de rede/servidor da Steam). */
  storeOk = true;
  constructor(
    private readonly available = true,
    private readonly known: readonly string[] = [ID],
  ) {}
  isAvailable(): boolean {
    return this.available;
  }
  unlockAchievement(id: string): boolean {
    this.calls.unlock++;
    if (!this.known.includes(id)) return false;
    this.marked.add(id);
    return true;
  }
  hasAchievement(id: string): boolean {
    this.calls.has++;
    return this.marked.has(id);
  }
  storeStats(): boolean {
    this.calls.store++;
    return this.storeOk;
  }
}

function mockPlatform(platform: string): void {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ platform }) })));
}

beforeEach(() => {
  resetGamePlatformCache();
  resetAchievementsCache();
});
afterEach(() => vi.unstubAllGlobals());

describe('createAchievements', () => {
  it('usa a Steam só no export da Steam com o cliente aberto', () => {
    expect(createAchievements('steam', new FakeSteam(true)).backend).toBe('steam');
    expect(createAchievements('steam', new FakeSteam(false)).backend).toBe('null');
    expect(createAchievements('pc', new FakeSteam(true)).backend).toBe('null');
    expect(createAchievements('xbox', new FakeSteam(true)).backend).toBe('null');
  });

  it('o padrão é a nula: valor desconhecido e ponte da Steam que lança não derrubam', () => {
    expect(createAchievements('switch' as GamePlatform, new FakeSteam(true)).backend).toBe('null');
    const broken = new FakeSteam(true);
    broken.isAvailable = () => {
      throw new Error('ponte quebrada');
    };
    expect(createAchievements('steam', broken).backend).toBe('null');
  });
});

describe('SteamAchievements', () => {
  it('desbloqueia e envia uma vez; o segundo unlock não chama o Steamworks', () => {
    const steam = new FakeSteam();
    const achievements = new SteamAchievements(steam);
    expect(achievements.unlock(ID)).toBe(true);
    expect([steam.calls.unlock, steam.calls.store]).toEqual([1, 1]);
    const before = { ...steam.calls };
    expect(achievements.unlock(ID)).toBe(true);
    expect(achievements.has(ID)).toBe(true);
    expect(steam.calls).toEqual(before);
  });

  it('storeStats que falha fica pendente e é refeito no próximo unlock, sem marcar de novo', () => {
    const steam = new FakeSteam();
    steam.storeOk = false;
    const achievements = new SteamAchievements(steam);
    expect(achievements.unlock(ID)).toBe(true);
    expect(achievements.unlock(ID)).toBe(true);
    expect([steam.calls.unlock, steam.calls.store]).toEqual([1, 2]);
    steam.storeOk = true;
    expect(achievements.unlock(ID)).toBe(true);
    expect([steam.calls.unlock, steam.calls.store]).toEqual([1, 3]);
    expect(achievements.unlock(ID)).toBe(true);
    expect(achievements.has(ID)).toBe(true);
    expect([steam.calls.unlock, steam.calls.store]).toEqual([1, 3]);
  });

  it('conquista que o jogador já tinha não é reenviada', () => {
    const steam = new FakeSteam();
    steam.marked.add(ID);
    const achievements = new SteamAchievements(steam);
    expect(achievements.unlock(ID)).toBe(true);
    expect([steam.calls.unlock, steam.calls.store]).toEqual([0, 0]);
  });

  it('id recusado pela Steam não envia e pode ser tentado de novo', () => {
    const steam = new FakeSteam(true, []);
    const achievements = new SteamAchievements(steam);
    expect(achievements.unlock(ID)).toBe(false);
    expect(achievements.unlock(ID)).toBe(false);
    expect([steam.calls.unlock, steam.calls.store]).toEqual([2, 0]);
    expect(achievements.has(ID)).toBe(false);
  });
});

describe('NullAchievements', () => {
  it('desbloqueia só na sessão', () => {
    const achievements = new NullAchievements();
    expect(achievements.has(ID)).toBe(false);
    expect(achievements.unlock(ID)).toBe(true);
    expect(achievements.unlock(ID)).toBe(true);
    expect(achievements.has(ID)).toBe(true);
  });
});

describe('loadAchievements', () => {
  it('lê a plataforma do cortex.json e devolve a mesma instância na sessão', async () => {
    mockPlatform('pc');
    const first = await loadAchievements();
    expect(first.backend).toBe('null');
    expect(await loadAchievements()).toBe(first);
  });

  it('no export da Steam sem a ponte nativa cai na nula, sem lançar', async () => {
    mockPlatform('steam');
    expect((await loadAchievements()).backend).toBe('null');
  });

  it('falha ao ler a plataforma (fetch que lança ou valor desconhecido) cai na nula', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('sem cortex.json');
    }));
    expect((await loadAchievements()).backend).toBe('null');
    resetGamePlatformCache();
    resetAchievementsCache();
    mockPlatform('playstation');
    expect((await loadAchievements()).backend).toBe('null');
  });
});
