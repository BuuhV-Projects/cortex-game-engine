/**
 * **Logging de debug com escopos** — desligado por padrão, ligado por flag de
 * runtime. Use no lugar de `console.log` cru: `debug('physics', 'setType', name)`
 * imprime `[cortex:physics] setType ...` SÓ quando o escopo `physics` está ligado.
 *
 * **Como ligar** (em ordem de precedência):
 * 1. `setDebug('physics,persist')` — programático (vence tudo).
 * 2. `globalThis.__CORTEX_DEBUG__` — injetado pelo host.
 * 3. URL `?cortexDebug=physics,persist` — a IDE injeta isso no iframe do Preview a
 *    partir de `VITE_CORTEX_DEBUG` do `.env` (só em `electron:dev`).
 * 4. `localStorage['cortex:debug']` — pra ligar na mão no devtools.
 *
 * Valores: vazio/`0`/`false`/`off` = desligado; `1`/`true`/`*`/`all` = todos os
 * escopos; `a,b,c` = só esses (case-insensitive). Sem flag = **silencioso** (prod).
 */

type Flag = '*' | Set<string> | null;

function parse(v: unknown): Flag {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (s === '' || s === '0' || s === 'false' || s === 'off') return null;
  if (s === '1' || s === 'true' || s === 'on' || s === '*' || s === 'all') return '*';
  return new Set(s.split(',').map((x) => x.trim()).filter(Boolean));
}

let override: Flag | undefined; // setDebug() — undefined = sem override (usa runtime)

function currentFlag(): Flag {
  if (override !== undefined) return override;
  try {
    const g = (globalThis as Record<string, unknown>)['__CORTEX_DEBUG__'];
    if (g !== undefined) return parse(g);
  } catch {
    /* ignore */
  }
  try {
    if (typeof location !== 'undefined') {
      const u = new URLSearchParams(location.search).get('cortexDebug');
      if (u !== null) return parse(u);
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const ls = localStorage.getItem('cortex:debug');
      if (ls !== null) return parse(ls);
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Liga/desliga escopos programaticamente (vence as fontes de runtime). */
export function setDebug(value: unknown): void {
  override = parse(value);
}

/** O escopo está ligado? */
export function isDebug(scope: string): boolean {
  const f = currentFlag();
  return f === '*' || (f instanceof Set && f.has(scope.toLowerCase()));
}

/** Loga `[cortex:scope] ...args` se o escopo estiver ligado (senão, nada). */
export function debug(scope: string, ...args: unknown[]): void {
  if (isDebug(scope)) console.log(`[cortex:${scope}]`, ...args);
}
