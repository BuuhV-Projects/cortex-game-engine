/**
 * **Steam** (SPEC-0175) — conquistas, estatísticas, overlay e dados do jogador
 * no export nativo com Steam.
 *
 * A ponte são globais `__cortexSteam*` que o host publica quando foi buildado
 * com `CORTEX_STEAM` **e** o jogo declara `steamAppId` no `cortex.json`
 * (ADR-0174 — configurável nas *Configurações do jogo* do Studio). Fora daí — no
 * Studio, no browser, no export PC puro — **nada quebra**: cada método vira
 * no-op e devolve o valor neutro (`false`, `0`, `''`, `null`).
 *
 * Isso é deliberado: você autora as conquistas no Studio normalmente, e elas
 * simplesmente não disparam até o jogo rodar pela Steam.
 *
 * @example Desbloquear no fim da fase
 * ```ts
 * // Um envio só, mesmo desbloqueando várias — `storeStats` é o que persiste.
 * Steam.unlockAchievement('WORLD_1_CLEAR');
 * Steam.setIntStat('coins_total', save.coins);
 * Steam.storeStats();
 * ```
 *
 * @example Pausar quando o jogador abre o overlay
 * ```ts
 * if (Steam.isOverlayActive() && !game.paused) game.pause();
 * ```
 */
import { debug } from './debug.js';

/** Página do overlay da Steam aceita por {@link Steam.openOverlay}. */
export type SteamOverlayPage =
  | 'friends'
  | 'community'
  | 'players'
  | 'settings'
  | 'achievements'
  | 'stats';

/** Jogador logado na Steam. */
export interface SteamPlayer {
  /** Nome de exibição (persona) — o mesmo que aparece pros amigos. */
  name: string;
  /**
   * SteamID64 **como texto**: 64 bits não cabem no `number` do JS sem perda de
   * precisão, então nunca converta com `Number()`.
   */
  id: string;
}

/** Nomes que o SDK aceita em `ActivateGameOverlay` (case-sensitive). */
const OVERLAY_PAGES: Record<SteamOverlayPage, string> = {
  friends: 'Friends',
  community: 'Community',
  players: 'Players',
  settings: 'Settings',
  achievements: 'Achievements',
  stats: 'Stats',
};

type NativeFn = (...args: unknown[]) => unknown;

/** Só avisa UMA vez que não há Steam — senão poluiria o log a cada frame. */
let warned = false;

function native(name: string): NativeFn | null {
  const fn = (globalThis as Record<string, unknown>)[name];
  if (typeof fn === 'function') return fn as NativeFn;
  if (!warned) {
    warned = true;
    debug('steam', `sem ponte nativa (${name}) — Steam inativa, chamadas viram no-op`);
  }
  return null;
}

function callBool(name: string, ...args: unknown[]): boolean {
  return native(name)?.(...args) === true;
}

function callNumber(name: string, ...args: unknown[]): number {
  const value = native(name)?.(...args);
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function callString(name: string, ...args: unknown[]): string {
  const value = native(name)?.(...args);
  return typeof value === 'string' ? value : '';
}

/**
 * Fachada da Steam. Objeto único (não há sessão por instância — a Steam é
 * global ao processo).
 */
export const Steam = {
  /**
   * `true` quando o `SteamAPI_Init` deu certo: host com Steam, cliente aberto e
   * jogador logado. Use pra esconder UI que só faz sentido com Steam.
   */
  isAvailable(): boolean {
    return callBool('__cortexSteamAvailable');
  },

  /** App id desta sessão; `0` sem Steam. */
  appId(): number {
    return callNumber('__cortexSteamAppId');
  },

  /**
   * Marca uma conquista como obtida. **Não persiste sozinha** — chame
   * {@link Steam.storeStats} depois (uma vez, mesmo desbloqueando várias).
   * @param id o *API Name* cadastrado no painel do Steamworks.
   * @returns `false` se não há Steam ou o id não existe no app.
   */
  unlockAchievement(id: string): boolean {
    return callBool('__cortexSteamSetAchievement', id);
  },

  /** Desmarca a conquista (reset de progresso/dev). Também exige `storeStats()`. */
  clearAchievement(id: string): boolean {
    return callBool('__cortexSteamClearAchievement', id);
  },

  /** `true` se o jogador já desbloqueou a conquista. */
  hasAchievement(id: string): boolean {
    return callBool('__cortexSteamGetAchievement', id);
  },

  /**
   * Stat **inteiro**. Int e float são chamadas separadas porque o tipo é
   * definido no painel do Steamworks — adivinhar pelo valor erraria num stat
   * float que calha de estar inteiro.
   */
  setIntStat(name: string, value: number): boolean {
    return callBool('__cortexSteamSetIntStat', name, value);
  },

  /** Stat de ponto flutuante. Ver {@link Steam.setIntStat}. */
  setFloatStat(name: string, value: number): boolean {
    return callBool('__cortexSteamSetFloatStat', name, value);
  },

  /** Valor atual de um stat inteiro; `0` sem Steam ou stat desconhecido. */
  getIntStat(name: string): number {
    return callNumber('__cortexSteamGetIntStat', name);
  },

  /** Valor atual de um stat float; `0` sem Steam ou stat desconhecido. */
  getFloatStat(name: string): number {
    return callNumber('__cortexSteamGetFloatStat', name);
  },

  /**
   * Envia conquistas e stats pendentes ao servidor da Steam — é o que faz o
   * *toast* de conquista aparecer. Chame uma vez por marco (fim de fase, save),
   * não a cada `unlockAchievement`.
   */
  storeStats(): boolean {
    return callBool('__cortexSteamStoreStats');
  },

  /** Jogador logado, ou `null` sem Steam. */
  player(): SteamPlayer | null {
    const name = callString('__cortexSteamPlayerName');
    const id = callString('__cortexSteamPlayerId');
    return name || id ? { name, id } : null;
  },

  /**
   * Idioma que o jogador escolheu para ESTE jogo na Steam (ex.: `brazilian`) —
   * útil pra pré-selecionar o idioma (SPEC-0124). `''` sem Steam.
   */
  language(): string {
    return callString('__cortexSteamLanguage');
  },

  /**
   * Overlay da Steam aberto AGORA. Consulte no update pra pausar o jogo — o
   * jogador que abre o overlay não está mais olhando a partida.
   */
  isOverlayActive(): boolean {
    return callBool('__cortexSteamOverlayActive');
  },

  /**
   * Abre o overlay na página pedida (padrão: amigos). O `true` significa
   * "pedido enviado" — o overlay pode estar desligado nas opções da Steam, e
   * quem quiser confirmar lê {@link Steam.isOverlayActive}.
   */
  openOverlay(page: SteamOverlayPage = 'friends'): boolean {
    return callBool('__cortexSteamOpenOverlay', OVERLAY_PAGES[page] ?? OVERLAY_PAGES.friends);
  },
} as const;

/** Esquece o aviso de "sem Steam" (usado nos testes). */
export function resetSteamWarning(): void {
  warned = false;
}
