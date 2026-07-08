// localStorage sobre a persistência do usuário do host (__cortexReadUserFile /
// __cortexWriteUserFile → <appdata>/<jogo>/saves/). Espelha o subset que o
// engine/jogo usam: getItem/setItem/removeItem/clear/key/length (forma de
// método — é como SaveGame e debug.ts leem/escrevem). Um único JSON guarda o
// mapa: carregado UMA vez no boot, regravado a cada mudança.
//
// Fora do host (browser/Studio) as funções nativas não existem → NÃO instala,
// deixando o localStorage REAL no lugar. No console, troca-se o backend nativo
// (XGameSave) mantendo esta mesma API.

export function installStorageShims() {
  if (
    typeof globalThis.__cortexWriteUserFile !== 'function' ||
    typeof globalThis.__cortexReadUserFile !== 'function'
  ) {
    return; // sem backend nativo: mantém o localStorage do ambiente (browser/Studio)
  }

  const FILE = 'localStorage.json';
  let map = {};
  try {
    const raw = globalThis.__cortexReadUserFile(FILE);
    if (raw) map = JSON.parse(raw) || {};
  } catch (_e) {
    map = {}; // ausente/corrompido → começa limpo
  }

  const flush = () => {
    try {
      globalThis.__cortexWriteUserFile(FILE, JSON.stringify(map));
    } catch (_e) {
      /* falha de escrita: mantém só em memória nesta sessão */
    }
  };
  const has = (k) => Object.prototype.hasOwnProperty.call(map, k);

  globalThis.localStorage = {
    getItem(key) {
      const k = String(key);
      return has(k) ? map[k] : null;
    },
    setItem(key, value) {
      map[String(key)] = String(value);
      flush();
    },
    removeItem(key) {
      const k = String(key);
      if (has(k)) {
        delete map[k];
        flush();
      }
    },
    clear() {
      map = {};
      flush();
    },
    key(index) {
      const keys = Object.keys(map);
      return index >= 0 && index < keys.length ? keys[index] : null;
    },
    get length() {
      return Object.keys(map).length;
    },
  };
}
