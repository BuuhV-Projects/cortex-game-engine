# SPEC-0129 - UI de runtime com escala responsiva por resolução

**Data:** 2026-07-19
**Status:** aceito

## Contexto

A UI de runtime (ADR-0102 / DOM-lite ADR-0123) posiciona cada widget em **pixels
lógicos absolutos** ancorados (`resolveRect(anchor, x, y, w, h, viewport)`). As
telas dos jogos — menus (título, seleção de mundo, mapa de fases), tela de
resultados, créditos, encerramento e HUD — são autoradas em HTML5 contra a
resolução default do engine (**1920×1080**, ver `GameConfig.ts`).

O `viewport` é o tamanho LÓGICO do canvas (`renderer.width/height`, sem o
`devicePixelRatio`). O problema: esse número **cresce com a resolução da tela**.
Num monitor 4K a 100% de escala do Windows, o viewport lógico é 3840×2160, mas um
botão de 400px continua com 400px — ou seja, ocupa **metade** da fração de tela
que ocuparia em 1080p. Resultado reportado pelo usuário: **em 4K o menu inteiro
fica minúsculo** (botões pequenos, fontes pequenas) — e o mesmo vale pra tela de
resultados e a de créditos. Não havia nenhum fator de escala: a UI era
"pixel-perfect" numa resolução só.

## Decisão

Um **fator de escala global da UI**, derivado da altura do viewport, aplicado num
único ponto (`UiLayer`) — some pra qualquer jogo e qualquer tela de uma vez, sem
tocar em nenhum widget/template.

Modelo de "resolução de referência" (igual ao *CanvasScaler → Scale With Screen
Size* da Unity), medindo pela ALTURA (os menus são compostos na vertical):

- **`UI_REFERENCE_HEIGHT = 1080`** (a default do engine).
- **`uiScale(viewport) = clamp(viewport.height / 1080, 0.5, 4)`** — 1080p → 1
  (idêntico ao design, **zero regressão**); 4K (2160) → 2; 720p → ~0.67.
- **`designViewport(viewport, scale) = { w/scale, h/scale }`** — o *espaço de
  design*. O layout roda SEMPRE neste espaço (altura sempre ~1080), então é o
  MESMO em qualquer resolução.

O `UiLayer` posiciona tudo no espaço de design e o **backend PRESENTA esse espaço
esticado pro viewport real** pela escala:

- **`DomUiBackend`** — uma `transform: scale(s)` (origin `0 0`) na `div` raiz.
  Como é `transform` de CSS, posições, tamanhos, fontes, bordas e sombras crescem
  juntos e **vetoriais** (nítido em 4K). Quando `s === 1`, o transform é vazio
  (idêntico ao comportamento anterior).
- **`RendererUiBackend`** (CortexNative/console) — a câmera ortográfica fica no
  espaço de design (frustum = design viewport) e a **região de render / a
  RenderTarget de UI** passam a ser `design × escala` (= o viewport real). O
  espaço de design estica pra tela toda, escalando tudo, inclusive o texto
  rasterizado.

A interface `UiBackend.sync` ganhou um 3º parâmetro `scale?` (default 1) — testes
e chamadas antigas seguem válidos.

Como escala pela ALTURA e o `designViewport` acompanha a PROPORÇÃO real, telas
mais largas (ultrawide) ficam com o conteúdo do centro centrado e o das bordas
encostado nas bordas — sem distorção.

## Consequências

- **Todas** as telas de UI (menus, resultados, créditos, encerramento, HUD, e as
  do engine — diálogo/loading/velocímetro) passam a crescer com a resolução. Some
  o "menu minúsculo em 4K".
- **Zero regressão em 1080p**: escala 1 ⇒ espaço de design == real e transform
  vazio. Bit-a-bit igual ao anterior nessa resolução.
- Autoria continua **contra 1080p** — nada muda pra quem escreve HTML/monta HUD.
  Basta pensar "a tela é 1920×1080" que o engine cuida do resto.
- No DOM a escala é vetorial (nítida). No **backend renderer** (nativo) o texto é
  rasterizado no espaço de design e **upscalado** pela escala no present — em 4K
  fica levemente suavizado (bitmap ampliado). Aceitável pra TV/console à distância
  de visão; se precisar de nitidez total no nativo em 4K, rasterizar o texto já em
  `fontSize × escala` é a evolução natural (fora do escopo aqui).
- `UiLayer.viewport()` (usado pelos templates no `build`) agora devolve o espaço
  de DESIGN, não o real — templates posicionam no mesmo espaço do layout, como
  antes (só que agora estável entre resoluções).
- Painéis `fill` passam a ter o tamanho do espaço de design (não mais o real) —
  cobrem a tela via a escala do present. Sem efeito visível.

## Relacionados

- ADR-0102 (UI de runtime, dois backends) — este ADR estende o `sync`/present.
- ADR-0105 (composição de UI em gama no nativo) — a RT de UI agora é dimensionada
  em `design × escala`.
- ADR-0123 (DOM-lite, nomes HTML5) — a autoria em HTML5 não muda.
