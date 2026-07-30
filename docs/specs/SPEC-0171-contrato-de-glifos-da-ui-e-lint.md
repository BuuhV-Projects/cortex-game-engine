# SPEC-0171 - Contrato de glifos da UI (`ui-font-glyphs.json`) e lint

**Data:** 2026-07-30
**Status:** aceito

Implementa o ADR-0170: o vocabulário de glifos da UI de runtime é o subset da
fonte embarcada, o contrato é **derivado da fonte** e publicado pra quem consome
a engine, e a violação **quebra teste** em vez de virar caixinha no export.

## Contexto

O rasterizador nativo (`text_raster.cpp`) tem uma fonte só e nenhum fallback:
codepoint fora da `cmap` da `Roboto-Medium.ttf` vira `.notdef` (caixa). O DOM do
Studio esconde isso com o fallback do Chromium, então o preview não serve de
prova. Precisamos de um artefato consultável em teste — sem obrigar cada jogo a
carregar 511KB de fonte nem a implementar um parser de TrueType.

## Decisão

### 1. Módulo `native/scripts/font-glyphs.mjs`

Fica no toolchain de export (não no runtime do jogo), junto dos outros scripts de
export. Sem dependências — lê a `cmap` direto dos bytes.

```js
readFontGlyphCoverage(bytes)          // Uint8Array → Coverage
coverageFromRanges(ranges)            // [[ini,fim],…] → Coverage
findUncoveredGlyphs(text, coverage)   // → [{ codepoint, char, count }] (agrupado, ordenado)
formatCodepoint(codepoint)            // → "U+2726 (✦)" pra mensagem de erro
collectSourceStrings(source)          // TS/JS: literais de string, SEM comentários
buildCoverageFile(bytes, fontName)    // → objeto do JSON
emitCoverageFile(ttfPath, outPath)    // regenera o contrato a partir do .ttf
readCoverageFile(jsonPath)            // lê VALIDANDO o shape → { data, coverage }
publishCoverageFile(jsonPath, out)    // leva o contrato pro dist-engine
```

`Coverage` = `{ size, ranges, has(codepoint) }`.

- **`cmap` suportada:** formatos **4** (BMP) e **12** (full range). São os que a
  Roboto usa; formato desconhecido é ignorado (as outras subtabelas cobrem).
- Um codepoint só conta como coberto quando o `glyphId` resolvido é **≠ 0** —
  glyphId 0 É o `.notdef`, exatamente o que queremos proibir.
- `collectSourceStrings` remove comentários `//` e `/* */` **antes** de colher as
  strings. Sem isso o lint acusaria os `←`/`→`/`─` que a gente usa em comentário
  e diagrama ASCII — que não vão pra tela.

CLI (o que o build chama):

```
node native/scripts/font-glyphs.mjs <fonte.ttf> <saida.json>
```

### 2. Artefato `ui-font-glyphs.json`

Derivado da `native/third_party/fonts/Roboto-Medium.ttf` — a **mesma** fonte que o
`export-game.mjs` copia pro dist.

```json
{
  "font": "Roboto-Medium.ttf",
  "note": "Codepoints com glifo na fonte da UI de runtime (ADR-0170)...",
  "glyphCount": 2772,
  "ranges": [[13, 13], [32, 126], ...]
}
```

`ranges` são pares inclusivos `[inicio, fim]`, ordenados e sem sobreposição —
compacta os 2772 codepoints em 88 ranges (~3,4KB). **Sem data/timestamp** no
arquivo: o conteúdo só muda quando a fonte muda, então o diff no git é sinal de
verdade, não de rebuild.

**O contrato é VERSIONADO, não gerado no build.** `native/third_party/` é
gitignored (a fonte é baixada pelo `fetch-deps.ps1`), então um build que gerasse o
JSON da fonte falharia em clone limpo. Vale a mesma regra da doc TypeDoc: gera com
um comando e **commita o resultado**.

- **`src/ui/runtime/ui-font-glyphs.json`** — o contrato versionado, ao lado do
  `uiFont.ts` (a outra ponta da mesma fonte).
- **`yarn glyphs:ui`** regenera o contrato da fonte. Rode (e commite o diff)
  quando trocar a fonte embarcada.
- **`yarn glyphs:publish`** copia o contrato pro `dist-engine/`, validando o shape
  de passagem. É o **último passo do `build:engine`**, de propósito: os configs do
  vite usam `emptyOutDir: true`, então qualquer passo do vite depois disso
  apagaria o arquivo (mesma armadilha que já derrubou o `rapier.js`).
- `vendorEngine()` (`electron/main.ts`) copia de `dist-engine/` pro
  `vendor/cortex-game-engine/ui-font-glyphs.json` de cada projeto — junto do
  `index.js`/`rapier.js`/`.d.ts`. `vendor/` é versionado nos jogos, então o teste
  do jogo tem o contrato em disco sem depender de export prévio (`dist-native/`
  é gitignored).

### 3. Lint na engine — `tests/native/font-glyphs.test.ts`

1. **Contrato**: `readCoverageFile` valida o shape, e `A`, `ç`, `õ`, `›`, `×`,
   `↑` estão cobertos enquanto `✦`, `←`, `→`, `★`, `✓`, `⚙` não — trava a
   expectativa do ADR-0170 no contrato versionado.
2. **Round-trip** `ranges` → `coverageFromRanges` → mesma resposta de `has`, e
   `glyphCount` = soma dos ranges.
3. **Contrato em sincronia com a fonte**: quando a `Roboto-Medium.ttf` existe
   (deps nativas baixadas), o parser roda sobre ela e o resultado tem de ser
   **idêntico** ao JSON versionado — é o teste que pega "trocou a fonte e esqueceu
   o `yarn glyphs:ui`". Sem a fonte em disco (CI/clone limpo), esse caso é
   **pulado**, e os outros continuam valendo.
4. **Textos de UI da engine**: varre os literais de string (sem comentários) de
   `src/ui/**`, `src/input/ControlsScreen.ts`, `src/input/padLayout.ts` e
   `src/core/LoadingScreen.ts` e falha listando `arquivo → codepoint` de qualquer
   glifo fora do contrato.

### 4. Lint no jogo — `tests/uiGlyphs.test.ts` (teste4)

Lê `vendor/cortex-game-engine/ui-font-glyphs.json` e varre:

- `assets/ui/*.html` — **conteúdo de texto e atributos de texto**, ignorando
  `<style>`, nomes de tag/atributo e comentários HTML;
- `languages/*.txt` — só o **valor entre aspas** de cada `CHAVE="VALOR"` (as
  linhas `#` são comentário pro tradutor e nunca vão pra tela).

Falha com a lista `arquivo:linha → U+XXXX (char)`. Se o vendor não tiver o JSON
(engine antiga), o teste **falha pedindo re-vendorização** em vez de passar em
silêncio — um lint que se desliga sozinho não é lint.

O jogo **não** recebe o `font-glyphs.mjs`: consultar ranges é uma busca de ~10
linhas, e o que não podia ficar duplicado (o parser de `cmap`) mora só na engine.

## Consequências

- Glifo novo fora da fonte **quebra o teste** no `yarn test` do jogo e da engine,
  com o arquivo e o codepoint na mensagem — antes de virar caixinha no export.
- Trocar a fonte embarcada exige rodar `yarn build:engine` (regenera o JSON) e
  re-vendorizar os jogos; o diff do `ui-font-glyphs.json` mostra o que mudou de
  cobertura.
- O lint do jogo é **por texto de UI**, não por código: string montada em runtime
  a partir de dado externo (nome digitado pelo jogador, por exemplo) continua
  fora do alcance — vale a mesma regra do ADR-0170, e o `.notdef` seria o
  sintoma.
- O parser de `cmap` cobre formatos 4 e 12. Fonte que só tenha formato 0/6 (raro,
  legado) leria cobertura vazia — o teste 1 pegaria isso na hora, já que ele
  exige `A` coberto.
