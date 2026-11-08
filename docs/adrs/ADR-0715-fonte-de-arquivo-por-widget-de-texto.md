# ADR-0715 - Fonte de arquivo por widget de texto, registrada por família

**Data:** 2026-11-08
**Status:** aceito
**Spec:** SPEC-0716

## Contexto

A UI de runtime tem uma fonte só: a Roboto Medium (ADR-0103). No DOM ela vem embutida em base64 com a família fixa
`Cortex UI` (`src/ui/runtime/uiFont.ts`); no host nativo o `text_raster.cpp` carrega um `Roboto-Medium.ttf` global com
`fopen`, fora do `assets.pak`, e o `__cortexRasterText(texto, px, origem)` não recebe fonte. O canvas 2D do host usa o
mesmo raster e ignora a família de `ctx.font`.

O HUD de missão do Port Hollow (SPEC-0219 do jogo) foi aprovado com a Barlow Semi Condensed SemiBold (OFL), um
arquivo em `assets/ui/fonts/` do jogo. Sem fonte por widget, o jogo não consegue usá-la nos dois backends.

## Alternativas

1. **Caminho do arquivo direto no widget** (`font: 'assets/ui/fonts/X.ttf'`). Simples para um label, mas não serve
   para o `ctx.font` do `<canvas>` (o CSS nomeia família, não arquivo), repete o caminho em todo widget e foge dos
   nomes do HTML5 (ADR-0123). Descartada.
2. **Cadeia de fallback multi-fonte no host** (escolher por codepoint). Já descartada na ADR-0170 pelo mesmo motivo:
   não restaura o WYSIWYG e põe muito código no caminho do texto. Continua descartada.
3. **Família registrada a partir de um arquivo + `fontFamily` no widget** (escolhida). É o modelo do HTML5: a fonte é
   declarada uma vez (`@font-face` / `FontFace`) e o texto a nomeia por família (`font-family`, `ctx.font`).

## Decisão

- **Registro:** `loadUiFont(família, url)` (equivalente ao `new FontFace(...).load()`), ou `@font-face { font-family;
  src: url(...) }` no `<style>` de um template, que o `loadUiTemplate` espera carregar.
- **Uso:** `fontFamily` em `UiLabel`/`UiButton`, `font-family` no subset de CSS e a família em `ctx.font` do
  `UiCanvas`. Sem família (ou família não registrada), segue a Roboto de hoje: compatível.
- **DOM:** `FontFace` + `document.fonts.add`, com `await face.load()` antes de resolver, para o `measuredWidth` já sair
  com a fonte certa.
- **Nativo:** `__cortexLoadFont(família, url)` lê os bytes pelo mesmo leitor de assets do host (`readAssetBytes`: pak
  ou arquivo solto) e guarda um `stbtt_fontinfo` por família; `__cortexRasterText` ganha o 4º argumento `família`.
  Cache de máscara e métricas verticais do canvas 2D passam a ser por família (`__cortexFontMetrics`).
- **Sem fallback entre fontes**, como na ADR-0170: glifo fora da fonte do jogo vira `.notdef` no export. O contrato de
  glifos passa a valer **por fonte**: o jogo gera o dele com `font-glyphs.mjs emit <fonte.ttf> <saida.json>`.

## Consequências

- Um jogo troca a tipografia do HUD declarando a fonte uma vez, sem mexer na engine, e o Studio mostra o mesmo que o
  export (as duas pontas leem o mesmo arquivo de `assets/`).
- A fonte do jogo vai no `assets.pak` como qualquer asset; a Roboto continua fora dele, ao lado do exe.
- Widget criado antes da carga terminar mede com a fonte padrão. O jogo deve esperar o `loadUiFont` (ou usar o
  `@font-face` do template, que o loader já espera) antes de montar o HUD.
- O peso é o do arquivo: cada arquivo é uma família. Dois pesos da mesma fonte = duas famílias registradas.
- O lint de glifos do jogo precisa apontar para o contrato da fonte que ele usa, não só para o `ui-font-glyphs.json`
  da Roboto.

Referências: ADR-0102 (dois backends), ADR-0103 (Roboto), ADR-0123 (DOM-lite), ADR-0170 (vocabulário de glifos),
ADR-0104 (`assets.pak`), SPEC-0313 (canvas 2D do host).
