# 0123 - UI de runtime "DOM-lite": nomes do HTML5/CSS (sem reinventar)

**Data:** 2026-07-18
**Status:** aceito

## Contexto

Os menus reais dos jogos (referência: menu v4 do Cute Obstacle Rush, gerado
como HTML/CSS) precisam de coisas que a UI de runtime (ADR-0102) não tinha:
cor translúcida (`rgba`), gradiente horizontal, botão com gradiente + borda
constante + sombra dura "cartoon" (`box-shadow: 0 11px 0 cor`), texto
alinhado à esquerda e imagem clipada por canto arredondado (hero de mundo).
Sem isso, os jogos empilhavam faixas de opacidade e painéis decorativos pra
fingir cada efeito.

Na primeira tentativa, as props novas ganharam nomes inventados
(`gradientDirection`, `shadowHeight`). O usuário definiu a diretriz do
produto: **o DOM-lite usa os MESMOS nomes e tags do HTML5/CSS** — quem sabe
CSS não deve aprender vocabulário novo. Prop nova só quando o HTML5 não tem
equivalente (conceitos de jogo: `anchor`, `focusable`, `fill`, `onpress`).

## Decisão

### Widgets (nomes = API `style` do DOM)

- `background` (Panel/Button) aceita **CSS de verdade**: cor (`#rrggbb`,
  `#rrggbbaa`, `rgba(...)`) ou `linear-gradient(180deg|90deg, c1, c2)`
  (também `to bottom`/`to right`). O widget guarda a string; o **backend**
  decompõe (`parseUiBackground`).
- `boxShadow` (Panel/Button): subset sombra DURA `"0 Npx 0 <cor>"` ou
  `"none"` — desenhada como cópia da caixa deslocada (segunda malha no
  console, `box-shadow` real no DOM). Blur/spread ficam fora do subset.
- `borderRadius` (Panel/Button): alias primário CSS de `cornerRadius`
  (legado, mantido).
- `borderWidth`/`borderColor` em **Button** = borda constante (moldura); a
  borda de foco (`focusBorderWidth/Color`) vence quando focado.
- `textAlign` (Button): `left|center|right`, respeitando `paddingX`.
- Toda cor aceita alpha: no DOM passa direto pro CSS; no console
  `parseUiColor` separa `#rrggbb` + alpha em uniforms (THREE.Color não tem
  alpha) — **fim das faixas empilhadas** pra simular scrim/degradê.
- Imagem de fundo do Panel é **clipada pelo `cornerRadius`** também no
  console (SDF no shader do quad; no DOM `overflow: hidden` + border-radius).

`backgroundTo` segue funcionando como legado (deprecated) — os jogos
vendorizados antigos não quebram.

### Template e CSS (`UiTemplate`/`UiStylesheet`)

- Tags **HTML5**: `<div>`/`<span>`/`<img src>` (aliases legados `<panel>`/
  `<label>` mantidos). `<img>` = Panel com `backgroundImage`.
- CSS novo no subset: `background` com gradiente 90deg/180deg, `border` em
  botão (constante), `box-shadow` duro, `text-align`. Valor fora do subset =
  **erro na compilação** (filosofia de sempre: falhar no build, não no
  console).

### Console (RendererUiBackend)

Ordem de pintura por widget virou `order*4` (sombra < caixa < imagem <
texto). Sombra e imagem são malhas próprias com o MESMO SDF de
retângulo arredondado; parsers em `src/ui/runtime/uiColor.ts`.

## Consequências

- Menus cartoon (v4) saem direto do CSS de referência, sem painéis-hack.
- O que o Studio (DOM) mostra continua sendo o que o console desenha — as
  novas props têm caminho nos DOIS backends e testes em `tests/ui/`
  (`uiColor.test.ts`, `UiRuntimeV2.test.ts`).
- `cornerRadius`/`backgroundTo`/`<panel>`/`<label>` são legados: docs e
  exemplos novos usam os nomes CSS; remoção fica pra uma major futura.
- O subset continua PEQUENO de propósito: radial-gradient, blur, transition
  e SVG ficam fora (aproximar no código do jogo — ex.: trilha de fases com
  bolinhas em vez de path tracejado).
