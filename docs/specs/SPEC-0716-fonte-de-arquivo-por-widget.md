# SPEC-0716 - Fonte de arquivo por widget de texto (DOM e nativo)

**Data:** 2026-11-08
**Status:** aceito
**ADR:** ADR-0715

## Contexto

A UI de runtime só tinha a Roboto Medium. O HUD do Port Hollow precisa de uma TTF do próprio jogo
(`assets/ui/fonts/`) nos labels, botões e no `<canvas>`. A decisão está na ADR-0715; aqui fica o formato e o fluxo.

## Decisão

### Declarar a fonte (jogo)

Em código, antes de montar a UI:

```ts
import { loadUiFont } from 'cortex-game-engine';
await loadUiFont('Barlow', 'assets/ui/fonts/BarlowSemiCondensed-SemiBold.ttf');
new UiLabel({ text: 'OBJETIVO', fontFamily: 'Barlow', fontSize: 22 });
```

Ou no `<style>` do template (o `loadUiTemplate` espera todas as `@font-face` carregarem antes de devolver):

```html
<style>
  @font-face { font-family: 'Barlow'; src: url('assets/ui/fonts/BarlowSemiCondensed-SemiBold.ttf'); }
  .objetivo { font-family: 'Barlow'; font-size: 22px; color: #ffffff; }
</style>
```

No `<canvas>`: `g.font = "22px 'Barlow'"` (família registrada; as outras caem na Roboto).

### Regras

- `fontFamily: string | null` em `UiLabel` (o `UiButton` herda). `null` = Roboto (`Cortex UI`), como antes.
- `font-family` no subset de CSS: usa a **primeira** família da lista, sem aspas.
- `@font-face` aceita só `font-family` e `src: url(...)`; outra propriedade ou bloco sem os dois = erro na compilação
  do CSS, como o resto do subset.
- Registrar a mesma família de novo com a mesma URL não recarrega. URL diferente para a mesma família = erro.
- `loadUiFont` rejeita a promessa se o arquivo não carrega (DOM: `FontFace.load` falha; nativo: arquivo ausente ou
  TTF inválida). O jogo vê o erro na carga, não um texto em Roboto sem aviso.

### DOM (`src/ui/runtime/uiFont.ts`)

- `new FontFace(família, url("<url>"), { weight: '100 900' })`, `await face.load()`, `document.fonts.add(face)`. O
  intervalo de peso evita que o browser sintetize negrito sobre o peso 500 que o backend pede.
- A `font` do nó vira `500 Npx '<família>', 'Cortex UI', system-ui, sans-serif`; a Roboto fica de reserva só enquanto
  carrega.

### Nativo (`native/src/shims/text_raster.cpp`)

- `__cortexLoadFont(família, url) → boolean`: bytes por `readAssetBytes` (pak no export, arquivo solto em dev),
  `stbtt_InitFont`, guardado num mapa família → fonte. Idempotente por família.
- `__cortexRasterText(texto, px, origem?, família?)`: família vazia ou desconhecida = Roboto.
- `__cortexFontMetrics(família?) → { ascent, descent }` em EM (`hhea` × escala por EM), para o canvas 2D posicionar a
  linha de base de qualquer fonte.
- Canvas 2D (`native/js/src/shims/canvas2d/`): `ctx.font` guarda a família; cache de máscara e medida com chave
  `família|px|texto`.
- `RendererUiBackend`: re-rasteriza quando a família muda, como já fazia com texto e tamanho.

### Contrato de glifos

`font-glyphs.mjs emit <fonte.ttf> <saida.json>` gera o contrato de qualquer fonte. O lint do jogo usa o contrato da
fonte que cada texto usa.

### Exemplo e testes

- `native/fixtures/ui-font/`: jogo mínimo com label, botão e canvas na Bebas Neue (OFL) de arquivo, declarada por
  `@font-face` no template. Roda no DOM (`yarn dev:ui-font`) e exporta pro host nativo
  (`node native/scripts/export-game.mjs native/fixtures/ui-font --out <dir>`, fonte lida do `assets.pak`). A mesma TTF
  é a do teste nativo.
- `tests/ui/UiFont.test.ts`: registro, `fontFamily` no DOM, `font-family`/`@font-face` no CSS e template, e
  `RendererUiBackend` passando a família pro raster.
- `tests/native/canvas2dFont.test.ts`: família do `ctx.font` chegando ao raster e métrica por fonte.
- `native/tests/font_registry_test.cpp`: TTF de arquivo registrada, largura diferente da Roboto, família desconhecida
  caindo na Roboto.

## Consequências

Ver ADR-0715. O que fica fora: peso/estilo sintético (cada arquivo é uma família), fallback por glifo entre fontes
(ADR-0170) e quebra de linha (a UI de runtime segue com texto de uma linha).
