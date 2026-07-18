# 0124 - i18n do jogo (languages/*.txt) + config.ini na raiz do export

**Data:** 2026-07-18
**Status:** aceito

## Contexto

Os jogos exportados precisavam de duas coisas que não existiam no engine:

1. **Multi-idioma**: nenhum suporte a tradução — todo texto de UI/HUD era
   hardcoded no código do jogo.
2. **Configurações do jogador**: modo janela, resolução, vsync e idioma eram
   controlados só por variáveis de ambiente do host nativo (`CORTEX_WINDOWED`,
   `CORTEX_RENDER_SCALE`) — nada editável/persistível pelo usuário final.

Requisitos definidos com o usuário:

- Traduções em **arquivos de texto simples** (`languages/<código>.txt`), soltos
  em `dist-native/languages/` — qualquer pessoa traduz abrindo o `.txt`
  (inclusive colando no Google Tradutor), sem rebuild.
- Configs num **`config.ini`** na raiz do `dist-native/` (ao lado do exe),
  padrão clássico de PC, também editável na mão.
- **Primeira abertura** detecta o idioma do SO: se houver arquivo, seleciona;
  senão usa o default do jogo.

## Decisão

Novo módulo público **`src/i18n/`** com dois arquivos, exportado pelo
`index-runtime.ts` (e registrado em `VENDOR_TYPE_MODULES`):

### `I18n.ts` — traduções

- Formato do arquivo: `CHAVE="VALOR"` por linha (valor entre aspas duplas;
  o parser tolera sem aspas — tradução automática às vezes as remove),
  comentários com `#`/`;`, `{nome}` de placeholder, `\n` literal pra quebra de
  linha e `\"` pra aspas no texto (`parseLanguageFile`).
- `class I18n` + instância global `i18n` + atalho `t(key, params)`:
  - `load(code, { fallback, path })` — busca `languages/<code>.txt` via
    `fetch` (funciona igual no browser e no host nativo, onde fetch =
    `__cortexReadFile`). Resolução do `t()`: idioma atual → fallback → a
    própria chave (nunca quebra o jogo por falta de tradução).
  - `loadAuto({ default })` — primeira abertura: detecta o idioma do SO
    (`detectSystemLanguage()`: `__cortexLocale` no nativo /
    `navigator.language` no browser) e tenta do mais específico ao mais
    genérico: `pt-BR` → `pt` → default. A disponibilidade é sondada pelo
    próprio fetch (não há listagem de diretório no host) — dispensa manifesto.
  - `setLanguage(code)` + `onChange` — troca ao vivo num menu de opções; a UI
    re-aplica os textos no callback.
- Guarda anti-SPA: resposta HTML (vite dev devolve `index.html` pra arquivo
  ausente) conta como "idioma não existe".

### `GameConfig.ts` — config.ini

- INI clássico com seções (`[video]`, `[game]`); chaves achatadas na API
  (`config.get('game.language')`, `getBool`, `getNumber`).
- `GameConfig.load()` lê via fetch (arquivo ausente = config vazia, getters
  respondem com fallbacks). `save()` persiste:
  - **Host nativo**: shim novo **`__cortexWriteBaseFile(name, text)`**
    (`native/src/shims/files.cpp`) — escrita de texto na pasta do jogo
    (`dist-native/`), com sanitização de nome (sem `/ \ : ..`) pra não fugir da
    pasta. Complementa o `__cortexWriteUserFile` (ADR-0106): user file = save
    per-usuário; base file = config da instalação, ao lado do exe.
  - **Browser/Studio (dev)**: overlay no `localStorage`
    (`cortex:config.ini`) que o `load()` aplica por cima do arquivo — mesmo
    código de jogo nos dois ambientes.

### Host nativo e export

- `main.cpp` injeta **`__cortexLocale`** pré-boot (via
  `SDL_GetPreferredLocales`, formato `pt-BR`); o shim `webgpu-extras.js`
  espelha em `navigator.language` (API fiel ao browser).
- `export-game.mjs` copia `config.ini` (junto do `cortex.json`) e
  `languages/*.txt` → `dist-native/languages/` — **de propósito fora do
  `assets.pak`**, pra tradução/edição sem rebuild.

### Uso pelo jogo

```ts
const config = await GameConfig.load();
const saved = config.get('game.language');
if (saved) await i18n.load(saved, { fallback: 'en' });
else await i18n.loadAuto({ default: 'en' });

label.text = t('menu.play');
```

## Consequências

- Tradução é dado, não código: adicionar um idioma = criar um `.txt` na pasta
  `languages/` do projeto (ou direto no `dist-native/` de um jogo publicado).
- `config.ini` fica pronto pra crescer: as seções `[video]`
  (fullscreen/resolução/vsync) já têm formato definido, mas **hoje só o JS lê**
  — o host nativo ainda cria a janela por env/desktop. Aplicar `[video]` na
  criação da janela (leitura do INI em C++, antes de `createAppWindow`) é passo
  futuro.
- Escrita nativa pode falhar se a pasta do jogo for read-only (ex.: Program
  Files) — `save()` retorna `false` e o jogo decide como avisar. Instalações
  Steam são graváveis; se virar problema real, o fallback é mover o config pra
  pasta do usuário (mesma do ADR-0106).
- `loadAuto` sonda arquivos por tentativa (1–2 fetches extras na primeira
  abertura) — irrelevante em custo e evita manter manifesto de idiomas.
- Troca de idioma ao vivo depende do jogo re-aplicar textos via `onChange`
  (não há re-render automático de widgets — a UI de runtime guarda `text` como
  propriedade, ADR-0102/0123).
