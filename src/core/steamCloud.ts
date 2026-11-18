/**
 * **Steam Cloud** (SPEC-0743, ADR-0744) — arquivos pequenos do jogo na nuvem da
 * Steam pela API de Remote Storage.
 *
 * O arquivo fica no cache da Steam (`<Steam>/userdata/<conta>/<appid>/remote/`),
 * por conta Steam, e NÃO na pasta do jogo. A gravação é imediata nesse cache; a
 * Steam sobe o que mudou quando o jogo fecha e baixa antes de abrir (com a tela
 * de conflito quando duas máquinas divergem). Não há envio a cada gravação: é
 * assim que o SDK funciona.
 *
 * O `GameConfig` já usa isto sozinho; jogo comum não precisa chamar. Fora da
 * Steam (export PC puro, Studio, navegador) tudo é no-op: `false` e `null`.
 *
 * Pré-requisito no painel do Steamworks: **Steam Cloud ligado** no app, com cota
 * de bytes e de arquivos por usuário. Sem isso a gravação falha.
 */

type NativeFn = (...args: unknown[]) => unknown;

function native(name: string): NativeFn | null {
  const fn = (globalThis as Record<string, unknown>)[name];
  return typeof fn === 'function' ? (fn as NativeFn) : null;
}

/** Fachada do Remote Storage. Objeto único, como a {@link Steam}. */
export const SteamCloud = {
  /** `true` quando a Steam inicializou e o Remote Storage está vivo. */
  isAvailable(): boolean {
    return native('__cortexSteamCloudAvailable')?.() === true;
  },

  /** Conteúdo do arquivo, ou `null` se ausente ou sem Steam. */
  read(name: string): string | null {
    const value = native('__cortexSteamCloudRead')?.(name);
    return typeof value === 'string' ? value : null;
  },

  /** Grava (substitui) o arquivo. `false` sem Steam, sem cota ou nuvem desligada no app. */
  write(name: string, text: string): boolean {
    return native('__cortexSteamCloudWrite')?.(name, text) === true;
  },

  /** Apaga o arquivo local e na nuvem. */
  remove(name: string): boolean {
    return native('__cortexSteamCloudDelete')?.(name) === true;
  },
} as const;
