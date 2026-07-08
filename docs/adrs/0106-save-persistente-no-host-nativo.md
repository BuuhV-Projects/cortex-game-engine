# 0106 - Save persistente no host nativo (localStorage sobre user_storage)

**Data:** 2026-07-08
**Status:** aceito

## Contexto

A spec 0003 do teste4 (`docs/specs/0003-mundos-save-menu-pausa.md`) adicionou
progressão persistente via `utils/SaveGame.ts`, que grava em `localStorage`
(`{ version, completed[] }`). No browser/Studio isso funciona; no **host nativo**
(CortexNative) o `localStorage` **não existia** — o [globals.js](../../native/js/src/shims/globals.js)
instala `location`/`crypto`/etc. mas nunca `localStorage`. Como o `SaveGame`
guarda o acesso com `typeof localStorage !== 'undefined'`, o jogo **não quebrava**,
mas caía no fallback de memória: a progressão **zerava a cada launch** do `.exe`.

Além disso o host só expunha **leitura** de arquivos (`__cortexReadFile`, para
assets, read-only via `files.cpp`/pak) — **nenhum** primitivo de escrita. Sem um
caminho de escrita não havia como persistir nada.

## Decisão

Dois passos, mantendo a API **fiel ao browser** (PRD-0004, ADR-0100) e o jogo
**sem alterações**:

1. **Escrita do usuário no host** — novo módulo `native/src/shims/user_storage.*`
   expõe:
   - `__cortexReadUserFile(name) → string | null`
   - `__cortexWriteUserFile(name, text) → boolean`

   Ambos operam numa pasta **gravável por-usuário**: `SDL_GetPrefPath(<jogo>, "saves")`
   → `<appdata>/<jogo>/saves/` (o SDL cria e resolve por plataforma). O nome do
   jogo vem do `deriveGameName` no `main.cpp` (basename do dir em dev / do `.exe`
   no export → "teste4" nos dois). O nome do arquivo é sanitizado (sem separador,
   `:`, `..`) — a chave vem do JS e a pasta é gravável, então barra-se fuga de
   diretório. É o **único** caminho de escrita exposto ao JS; distinto do
   `files.cpp` (assets, só leitura).

2. **Shim de `localStorage`** — novo `native/js/src/shims/storage.js`
   (`installStorageShims`, no `prelude.js`, padrão do `net.js`): espelha o subset
   que engine/jogo usam (`getItem/setItem/removeItem/clear/key/length` — forma de
   **método**, que é como `SaveGame` e `debug.ts` acessam). Um único JSON
   (`localStorage.json`) guarda o mapa: lido UMA vez no boot, regravado a cada
   mudança. **Só instala se as funções nativas existirem** — no browser/Studio o
   `localStorage` real é preservado.

## Consequências

- O `SaveGame` do teste4 (e qualquer uso de `localStorage.getItem/setItem`)
  **persiste entre sessões** no `.exe`, sem tocar no código do jogo.
- **Porta para o console:** a persistência do Xbox (XGameSave) troca **só o
  backend C++** de `user_storage.*`; o shim JS e o jogo não mudam.
- **Limitações conscientes:** (a) acesso por propriedade/colchete
  (`localStorage['x']`) **não** é coberto (só a forma de método — nenhum
  consumidor de runtime usa colchete; o `debug.ts` lê via `getItem`); um `Proxy`
  cobriria, mas não vale a complexidade agora. (b) Um JSON único carregado em
  memória — ok para saves pequenos; não é para volumes grandes.
- Cobertura: teste do shim em `tests/native/storage.test.ts` (fakes das funções
  nativas: persistência, nova sessão, remove/clear, JSON corrompido, e o
  não-instalar sem backend). O C++ segue os padrões provados do `files.cpp`.
