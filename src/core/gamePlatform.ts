/**
 * **Plataforma do export** (ADR-0164) — de que alvo é este build: `pc`,
 * `steam` ou `xbox`. Serve pra ligar/desligar recursos que só fazem sentido no
 * PC, como a **tela de Controles** (remapeamento, SPEC-0165): no console o
 * layout do controle é fixo e certificado.
 *
 * A fonte é o campo `platform` do `cortex.json` ao lado do exe, gravado pelo
 * `export-game.mjs` (`--steam` → `steam`, `--xbox` → `xbox`, senão `pc`). Lido
 * por `fetch`, que no host nativo é leitura de arquivo — sem shim novo. Campo
 * ausente (Studio, browser, projeto antigo) = `pc`, então dá pra testar a tela
 * em dev.
 *
 * @example
 * if (canRebindInput(await gamePlatform())) menu.add(botaoControles);
 */
import { debug } from './debug.js';

/** Alvos de export reconhecidos. */
export type GamePlatform = 'pc' | 'steam' | 'xbox';

const PLATFORMS: readonly GamePlatform[] = ['pc', 'steam', 'xbox'];

/** Alvo usado quando o `cortex.json` não declara (dev/Studio/browser). */
export const DEFAULT_PLATFORM: GamePlatform = 'pc';

/** Resultado memorizado — o arquivo não muda em runtime. */
let cached: GamePlatform | null = null;

/**
 * Lê a plataforma do `cortex.json` (uma vez por sessão; o resultado é
 * memorizado). Arquivo ausente, JSON inválido ou valor desconhecido caem em
 * {@link DEFAULT_PLATFORM} — nunca lança.
 */
export async function gamePlatform(file = 'cortex.json'): Promise<GamePlatform> {
  if (cached !== null) return cached;
  cached = DEFAULT_PLATFORM;
  try {
    const res = await fetch(file);
    if (res.ok) {
      const text = await res.text();
      // vite dev devolve o index.html (SPA fallback) pra arquivo ausente.
      if (text && !text.trimStart().startsWith('<')) {
        const value = (JSON.parse(text) as { platform?: unknown }).platform;
        if (typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value)) {
          cached = value as GamePlatform;
        }
      }
    }
  } catch (err) {
    debug('config', 'cortex.json não carregou:', err);
  }
  return cached;
}

/**
 * `true` onde a tela de remapeamento de controles deve existir — hoje `pc` e
 * `steam`. No `xbox` a entrada some do menu (SPEC-0165).
 */
export function canRebindInput(platform: GamePlatform): boolean {
  return platform !== 'xbox';
}

/** Esquece o valor memorizado (usado nos testes e no hot-reload do Studio). */
export function resetGamePlatformCache(): void {
  cached = null;
}
