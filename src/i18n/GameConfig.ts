import { debug } from '../core/debug.js';

/**
 * **Configurações do jogo em `config.ini`** — arquivo texto na raiz do jogo
 * (no export nativo, `dist-native/config.ini`, ao lado do exe), editável pelo
 * usuário. Guarda opções como modo janela, resolução, vsync e idioma.
 *
 * Formato INI clássico:
 * ```ini
 * [video]
 * fullscreen=true
 * width=1920
 * height=1080
 * vsync=true
 *
 * [game]
 * language=pt-BR
 * ```
 * As chaves são acessadas achatadas: `config.get('game.language')`,
 * `config.getBool('video.fullscreen', true)`.
 *
 * **Persistência do `save()`:**
 * - Host nativo: grava o arquivo de verdade via `__cortexWriteBaseFile`
 *   (`native/src/shims/files.cpp`) na pasta do jogo (`dist-native/`).
 * - Browser/Studio (dev): não há arquivo gravável — o texto INI vai pro
 *   `localStorage` (`cortex:config.ini`) e o `load()` aplica esse overlay por
 *   cima do arquivo. Mesmo código de jogo nos dois ambientes.
 *
 * @example
 * ```ts
 * const config = await GameConfig.load();
 * const language = config.get('game.language', 'en');
 * config.set('game.language', 'pt-BR');
 * await config.save();
 * ```
 */

/** Chaves achatadas (`secao.chave` ou `chave` fora de seção) → valor cru. */
export type IniValues = Record<string, string>;

/**
 * Parse de texto INI: seções `[nome]`, pares `chave=valor`, comentários com
 * `#` ou `;`. Chaves saem achatadas (`secao.chave`). Remove BOM se houver.
 */
export function parseIni(text: string): IniValues {
  const values: IniValues = {};
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  let section = '';
  for (const rawLine of clean.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1).trim();
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    values[section ? `${section}.${key}` : key] = value;
  }
  return values;
}

/**
 * Serializa chaves achatadas de volta em texto INI — chaves sem seção primeiro,
 * depois cada seção na ordem de inserção.
 */
export function serializeIni(values: IniValues): string {
  const bare: string[] = [];
  const sections = new Map<string, string[]>();
  for (const [key, value] of Object.entries(values)) {
    const dot = key.indexOf('.');
    if (dot <= 0) {
      bare.push(`${key}=${value}`);
      continue;
    }
    const section = key.slice(0, dot);
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section)!.push(`${key.slice(dot + 1)}=${value}`);
  }
  const parts: string[] = [];
  if (bare.length) parts.push(bare.join('\n'));
  for (const [section, lines] of sections) {
    parts.push(`[${section}]\n${lines.join('\n')}`);
  }
  return parts.join('\n\n') + (parts.length ? '\n' : '');
}

/** Assinatura do shim nativo de escrita na pasta do jogo (host nativo). */
type WriteBaseFile = (name: string, data: string) => boolean;

function nativeWriter(): WriteBaseFile | null {
  const fn = (globalThis as Record<string, unknown>)['__cortexWriteBaseFile'];
  return typeof fn === 'function' ? (fn as WriteBaseFile) : null;
}

/**
 * Config do jogo carregada do `config.ini` (+ overlay do `localStorage` em
 * dev). Ver o cabeçalho do módulo pro formato e a estratégia de persistência.
 */
export class GameConfig {
  private constructor(
    /** Nome/URL do arquivo (relativo à raiz do jogo). */
    readonly file: string,
    private readonly values: IniValues,
  ) {}

  /**
   * Carrega o `config.ini` da raiz do jogo. Arquivo ausente não é erro — volta
   * uma config vazia (os `get*` respondem com os fallbacks do jogo).
   */
  static async load(file = 'config.ini'): Promise<GameConfig> {
    let values: IniValues = {};
    try {
      const res = await fetch(file);
      if (res.ok) {
        const text = await res.text();
        // vite dev devolve o index.html (SPA fallback) pra arquivo ausente.
        if (text && !text.trimStart().startsWith('<')) values = parseIni(text);
      }
    } catch (err) {
      debug('config', 'config.ini não carregou:', err);
    }
    // Dev (sem escrita de arquivo): o save() anterior ficou no localStorage.
    if (!nativeWriter()) {
      try {
        const overlay = globalThis.localStorage?.getItem(`cortex:${file}`);
        if (overlay) Object.assign(values, parseIni(overlay));
      } catch {
        /* sem localStorage (ambiente de teste/worker) */
      }
    }
    return new GameConfig(file, values);
  }

  /** Valor cru da chave (`secao.chave`), ou `fallback` se ausente. */
  get(key: string, fallback = ''): string {
    return this.values[key] ?? fallback;
  }

  /** Valor booleano: aceita `true/false`, `1/0`, `on/off`, `yes/no`. */
  getBool(key: string, fallback = false): boolean {
    const raw = this.values[key]?.trim().toLowerCase();
    if (raw === undefined) return fallback;
    if (['true', '1', 'on', 'yes'].includes(raw)) return true;
    if (['false', '0', 'off', 'no'].includes(raw)) return false;
    return fallback;
  }

  /** Valor numérico; `fallback` se ausente ou não numérico. */
  getNumber(key: string, fallback = 0): number {
    const raw = this.values[key];
    if (raw === undefined) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }

  /** `true` se a chave existe no arquivo/overlay. */
  has(key: string): boolean {
    return this.values[key] !== undefined;
  }

  /** Define uma chave (persiste só depois do {@link save}). */
  set(key: string, value: string | number | boolean): void {
    this.values[key] = String(value);
  }

  /** Remove uma chave. */
  delete(key: string): void {
    delete this.values[key];
  }

  /**
   * Persiste: arquivo real no host nativo, `localStorage` em dev. Retorna
   * `false` se nenhum destino de escrita estiver disponível.
   */
  async save(): Promise<boolean> {
    const text = serializeIni(this.values);
    const writer = nativeWriter();
    if (writer) {
      const ok = writer(this.file, text);
      if (!ok) debug('config', 'escrita nativa falhou:', this.file);
      return ok;
    }
    try {
      globalThis.localStorage?.setItem(`cortex:${this.file}`, text);
      return globalThis.localStorage !== undefined;
    } catch {
      return false;
    }
  }
}
