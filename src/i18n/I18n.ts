import { debug } from '../core/debug.js';

/**
 * **i18n do jogo** — traduções em arquivos de texto simples, um por idioma,
 * em `languages/<código>.txt` (ex.: `languages/pt-BR.txt`, `languages/en.txt`).
 * No export nativo a pasta vai solta pra `dist-native/languages/` — qualquer um
 * pode abrir o `.txt`, traduzir (inclusive colando no Google Tradutor) e salvar.
 *
 * **Formato do arquivo** (uma entrada por linha, valor entre aspas):
 * ```
 * # comentário (linhas com # ou ; são ignoradas)
 * menu.play="Jogar"
 * menu.quit="Sair"
 * hud.coins="Moedas: {count}"
 * dialog.intro="Primeira linha\nSegunda linha"
 * ```
 * - `CHAVE="VALOR"` — a chave fica à esquerda do primeiro `=`; o valor vem
 *   entre aspas duplas (pode conter `=` e espaços nas pontas). O parser tolera
 *   valor sem aspas — tradução automática às vezes as remove.
 * - `{nome}` no texto vira parâmetro de {@link I18n.t}.
 * - `\n` literal vira quebra de linha; `\"` vira aspas dentro do texto.
 *
 * @example
 * ```ts
 * import { i18n, t, GameConfig } from 'cortex-game-engine';
 *
 * const config = await GameConfig.load();
 * const saved = config.get('game.language');
 * if (saved) await i18n.load(saved, { fallback: 'en' });
 * // 1ª abertura (sem idioma salvo): detecta o do SO, cai pro default se faltar
 * else await i18n.loadAuto({ default: 'en' });
 *
 * label.text = t('menu.play');
 * hud.text = t('hud.coins', { count: 12 });
 *
 * // menu de opções: trocar idioma ao vivo
 * await i18n.setLanguage('pt-BR');
 * ```
 */

/**
 * Faz o parse de um arquivo de idioma (`CHAVE="VALOR"` por linha) num
 * dicionário. Ignora linhas vazias e comentários (`#` ou `;`). Tira as aspas
 * externas do valor (tolerando valor sem aspas), converte `\n` literal em
 * quebra de linha e `\"` em aspas. Remove BOM se houver.
 */
export function parseLanguageFile(text: string): Record<string, string> {
  const dict: Record<string, string> = {};
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (const rawLine of clean.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    dict[key] = value.replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }
  return dict;
}

/** Parâmetros de interpolação de {@link I18n.t}: `{nome}` no texto → valor. */
export type I18nParams = Record<string, string | number>;

/**
 * Idioma do SO do usuário: `__cortexLocale` (host nativo, via
 * `SDL_GetPreferredLocales`) ou `navigator.language` (browser/Studio).
 * Normalizado no formato dos arquivos (`pt-BR`, `en`); vazio se indisponível.
 */
export function detectSystemLanguage(): string {
  const g = globalThis as Record<string, unknown>;
  const raw =
    (typeof g['__cortexLocale'] === 'string' ? (g['__cortexLocale'] as string) : '') ||
    (typeof navigator !== 'undefined' ? navigator.language : '') ||
    '';
  const [lang, region] = raw.trim().replace('_', '-').split('-');
  if (!lang) return '';
  return region ? `${lang.toLowerCase()}-${region.toUpperCase()}` : lang.toLowerCase();
}

/** Candidatos a tentar, do mais específico ao mais genérico: `pt-BR`, `pt`. */
function systemLanguageCandidates(): string[] {
  const detected = detectSystemLanguage();
  if (!detected) return [];
  const base = detected.split('-')[0];
  return base !== detected ? [detected, base] : [detected];
}

/**
 * Carrega e consulta traduções. Use a instância global {@link i18n} (e o atalho
 * {@link t}) — ou crie a sua se precisar de dois conjuntos independentes.
 *
 * Resolução de `t(chave)`: idioma atual → idioma de fallback → a própria chave
 * (e loga em `debug('i18n', ...)` quando falta).
 */
export class I18n {
  /** Pasta dos arquivos de idioma, relativa à raiz do jogo. */
  path = 'languages';

  private dict: Record<string, string> = {};
  private fallbackDict: Record<string, string> = {};
  private currentLanguage = '';
  private fallbackLanguage = '';
  private listeners = new Set<(language: string) => void>();

  /** Código do idioma carregado (ex.: `pt-BR`); vazio antes de `load()`. */
  get language(): string {
    return this.currentLanguage;
  }

  /**
   * Carrega `<path>/<código>.txt` (e o idioma de fallback, se informado e
   * diferente). Retorna `false` se o arquivo do idioma não existir — o jogo
   * continua com o fallback/chaves cruas em vez de quebrar.
   */
  async load(
    code: string,
    options?: { fallback?: string; path?: string },
  ): Promise<boolean> {
    if (options?.path) this.path = options.path;
    const fallback = options?.fallback ?? this.fallbackLanguage;
    const dict = await this.fetchLanguage(code);
    await this.apply(code, dict ?? {}, fallback);
    return dict !== null;
  }

  /**
   * Primeira abertura (sem idioma salvo): detecta o idioma do SO e carrega o
   * primeiro disponível — tenta o código exato (`pt-BR`), depois só a língua
   * (`pt`) e por fim o `default`. As chaves que faltarem caem pro `default`
   * (ou pro `fallback`, se informado). Retorna o código escolhido — persista
   * no `config.ini` se quiser fixar a escolha.
   */
  async loadAuto(options: {
    default: string;
    fallback?: string;
    path?: string;
  }): Promise<string> {
    if (options.path) this.path = options.path;
    const fallback = options.fallback ?? options.default;
    for (const code of systemLanguageCandidates()) {
      if (code === options.default) break; // daqui pra baixo o default cobre
      const dict = await this.fetchLanguage(code);
      if (dict) {
        await this.apply(code, dict, fallback);
        return code;
      }
    }
    await this.load(options.default, { fallback });
    return this.language;
  }

  /** Troca o idioma ao vivo (recarrega o arquivo e notifica `onChange`). */
  async setLanguage(code: string): Promise<boolean> {
    return this.load(code);
  }

  /**
   * Traduz `key`. `params` preenche `{nome}` no texto. Sem tradução no idioma
   * atual, cai pro fallback; sem fallback, devolve a própria chave.
   */
  t(key: string, params?: I18nParams): string {
    let text = this.dict[key] ?? this.fallbackDict[key];
    if (text === undefined) {
      debug('i18n', 'chave sem tradução:', key, `(${this.currentLanguage || 'sem idioma'})`);
      text = key;
    }
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (match, name: string) =>
      params[name] !== undefined ? String(params[name]) : match,
    );
  }

  /** `true` se a chave existe no idioma atual ou no fallback. */
  has(key: string): boolean {
    return this.dict[key] !== undefined || this.fallbackDict[key] !== undefined;
  }

  /**
   * Registra callback pra troca de idioma (re-aplicar textos na UI). Retorna a
   * função que remove o listener.
   */
  onChange(listener: (language: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async apply(
    code: string,
    dict: Record<string, string>,
    fallback: string,
  ): Promise<void> {
    this.fallbackLanguage = fallback;
    this.fallbackDict =
      fallback && fallback !== code ? ((await this.fetchLanguage(fallback)) ?? {}) : {};
    this.dict = dict;
    this.currentLanguage = code;
    for (const listener of this.listeners) listener(code);
  }

  private async fetchLanguage(code: string): Promise<Record<string, string> | null> {
    const url = `${this.path}/${code}.txt`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      // No `vite dev`, arquivo ausente pode voltar 200 com o index.html (SPA
      // fallback) — HTML no lugar de traduções é "não existe".
      if (!text || text.trimStart().startsWith('<')) throw new Error('não é arquivo de idioma');
      return parseLanguageFile(text);
    } catch (err) {
      debug('i18n', 'idioma não carregou:', url, err);
      return null;
    }
  }
}

/** Instância global — a que os jogos normalmente usam (com o atalho {@link t}). */
export const i18n = new I18n();

/** Atalho pra `i18n.t(...)` da instância global {@link i18n}. */
export function t(key: string, params?: I18nParams): string {
  return i18n.t(key, params);
}
