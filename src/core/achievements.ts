/**
 * **Conquistas multiplataforma** (SPEC-0713, ADR-0714) — o jogo chama
 * `unlock(id)` quando o jogador ganha a conquista; a engine escolhe a
 * plataforma pelo {@link gamePlatform} e garante que cada conquista seja
 * enviada **uma vez só**.
 *
 * - `steam` com o cliente aberto → {@link SteamAchievements} (fachada
 *   {@link Steam}, SPEC-0175).
 * - `pc`, navegador, Studio, `steam` sem cliente e `xbox` (ainda sem
 *   implementação) → {@link NullAchievements}: só na sessão e no `debug`.
 *
 * Nada aqui lança: sem plataforma, o jogo segue normalmente.
 *
 * @example
 * ```ts
 * const achievements = await loadAchievements();
 * // no momento em que o jogador ganha (pode repetir: não reenvia)
 * achievements.unlock('intro_completed');
 * ```
 */
import { debug } from './debug.js';
import { gamePlatform, type GamePlatform } from './gamePlatform.js';
import { Steam } from './steamworks.js';

/** Qual implementação está ligada. */
export type AchievementBackend = 'steam' | 'null';

/** Conquistas do jogo, independentes da plataforma. */
export interface Achievements {
  /** Implementação ligada (log, testes, UI que só faz sentido com plataforma). */
  readonly backend: AchievementBackend;
  /**
   * Desbloqueia a conquista. Idempotente: se ela já foi desbloqueada, não chama
   * a plataforma de novo.
   * @param id o *API Name* cadastrado na plataforma (Steamworks: Stats & Achievements).
   * @returns `true` quando a conquista ficou (ou já estava) desbloqueada.
   */
  unlock(id: string): boolean;
  /** `true` se a conquista já está desbloqueada. */
  has(id: string): boolean;
}

/** Recorte da fachada {@link Steam} que as conquistas usam (injetável nos testes). */
export interface AchievementSteamPort {
  isAvailable(): boolean;
  unlockAchievement(id: string): boolean;
  hasAchievement(id: string): boolean;
  storeStats(): boolean;
}

/**
 * Conquistas na Steam. Guarda na sessão o que já está desbloqueado: o segundo
 * `unlock` do mesmo id não chama o Steamworks.
 */
export class SteamAchievements implements Achievements {
  readonly backend = 'steam';
  private readonly unlocked = new Set<string>();

  constructor(private readonly steam: AchievementSteamPort = Steam) {}

  unlock(id: string): boolean {
    if (this.has(id)) return true;
    if (!this.steam.unlockAchievement(id)) {
      debug('achievements', `a Steam recusou "${id}" (API Name fora do app?)`);
      return false;
    }
    this.unlocked.add(id);
    if (!this.steam.storeStats()) debug('achievements', `storeStats falhou; a Steam envia "${id}" no próximo envio`);
    debug('achievements', `conquista desbloqueada na Steam: ${id}`);
    return true;
  }

  has(id: string): boolean {
    if (this.unlocked.has(id)) return true;
    if (!this.steam.hasAchievement(id)) return false;
    this.unlocked.add(id);
    return true;
  }
}

/** Sem plataforma: guarda na sessão e registra no `debug`. Não persiste. */
export class NullAchievements implements Achievements {
  readonly backend = 'null';
  private readonly unlocked = new Set<string>();

  unlock(id: string): boolean {
    if (this.unlocked.has(id)) return true;
    this.unlocked.add(id);
    debug('achievements', `conquista sem plataforma (só na sessão): ${id}`);
    return true;
  }

  has(id: string): boolean {
    return this.unlocked.has(id);
  }
}

/**
 * Escolhe a implementação pela plataforma do export. O ramo `xbox` existe para
 * a implementação do GDK entrar só aqui.
 */
export function createAchievements(platform: GamePlatform, steam: AchievementSteamPort = Steam): Achievements {
  switch (platform) {
    case 'steam':
      if (steam.isAvailable()) return new SteamAchievements(steam);
      debug('achievements', 'export da Steam sem Steam (cliente fechado?): conquistas só na sessão');
      return new NullAchievements();
    case 'xbox':
      debug('achievements', 'Xbox ainda sem implementação de conquistas: só na sessão');
      return new NullAchievements();
    case 'pc':
      return new NullAchievements();
  }
}

/** Resultado memorizado: a plataforma não muda em runtime. */
let cached: Promise<Achievements> | null = null;

/**
 * Conquistas desta sessão: lê a plataforma do `cortex.json` e cria uma vez
 * (chamadas seguintes devolvem a mesma instância).
 */
export function loadAchievements(file?: string): Promise<Achievements> {
  cached ??= gamePlatform(file).then((platform) => {
    const achievements = createAchievements(platform);
    debug('achievements', `plataforma ${platform} → ${achievements.backend}`);
    return achievements;
  });
  return cached;
}

/** Esquece a instância memorizada (testes e hot-reload do Studio). */
export function resetAchievementsCache(): void {
  cached = null;
}
