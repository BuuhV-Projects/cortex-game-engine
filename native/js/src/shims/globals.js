// Globals básicos de browser: self, console (→ print nativo), performance.

export function installGlobals() {
  globalThis.self = globalThis;

  // Erros viram message+stack; objetos comuns viram JSON curto — sem isso o
  // console imprime "[object Object]" e esconde a causa real.
  const fmt = (value) => {
    if (value instanceof Error || (value && value.stack && value.message)) {
      return value.message + '\n' + value.stack;
    }
    if (typeof value === 'object' && value !== null) {
      try {
        const json = JSON.stringify(value);
        return json.length > 300 ? json.slice(0, 300) + '…' : json;
      } catch (_e) {
        return String(value);
      }
    }
    return value;
  };
  globalThis.console = {
    log: (...a) => print('[log]', ...a.map(fmt)),
    info: (...a) => print('[info]', ...a.map(fmt)),
    debug: (...a) => print('[debug]', ...a.map(fmt)),
    warn: (...a) => print('[warn]', ...a.map(fmt)),
    error: (...a) => print('[error]', ...a.map(fmt)),
    trace: (...a) => print('[trace]', ...a.map(fmt)),
  };

  globalThis.performance = globalThis.performance || { now: () => Date.now() };

  // crypto (Entity usa randomUUID; sem hardware RNG — jogo, não segurança)
  globalThis.crypto = globalThis.crypto || {
    randomUUID() {
      let uuid = '';
      for (let i = 0; i < 36; i++) {
        if (i === 8 || i === 13 || i === 18 || i === 23) uuid += '-';
        else if (i === 14) uuid += '4';
        else {
          const r = (Math.random() * 16) | 0;
          uuid += (i === 19 ? (r & 3) | 8 : r).toString(16);
        }
      }
      return uuid;
    },
    getRandomValues(array) {
      for (let i = 0; i < array.length; i++) array[i] = (Math.random() * 256) | 0;
      return array;
    },
  };

  // location + URLSearchParams (o suficiente pra `?level=`/`?overview`).
  // `search` vem do host (env CORTEX_LAUNCH_QUERY → __cortexSearch): permite
  // deep-link de fase no export/atalho (ex.: "?level=fase-1") e a validação
  // headless. Vazio = fluxo normal (menu).
  const search = globalThis.__cortexSearch || '';
  globalThis.location = {
    href: 'app://cortex/' + search,
    origin: 'app://cortex',
    pathname: '/',
    search,
    hash: '',
  };
  globalThis.URLSearchParams = function URLSearchParams(init) {
    const map = {};
    const query = String(init || '').replace(/^\?/, '');
    for (const pair of query.split('&')) {
      if (!pair) continue;
      const eq = pair.indexOf('=');
      const key = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq));
      map[key] = eq < 0 ? '' : decodeURIComponent(pair.slice(eq + 1));
    }
    this.get = function (key) { return key in map ? map[key] : null; };
    this.has = function (key) { return key in map; };
    this.set = function (key, value) { map[key] = String(value); };
  };
}
