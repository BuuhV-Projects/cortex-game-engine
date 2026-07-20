# SPEC-0133 - Mouse/toque na UI de runtime (hit-test único no UiLayer)

**Data:** 2026-07-20
**Status:** aceito

## Contexto

A UI de runtime (`UiLayer`, ADR-0102) nasceu 100% navegável por gamepad/teclado
(REGRA do projeto: 100% jogável no controle). Faltava o **mouse** — apontar e
clicar nos menus.

O clique já funcionava **por acidente** só no browser: o `DomUiBackend` ligava um
`node.onclick = () => widget.onPress?.()` em cada botão. No **export nativo**
(`RendererUiBackend`, Steam PC/console) a UI é desenhada num canvas — **não há DOM
nem `onclick`**, então os menus do teste4 eram inclicáveis no build nativo.

Dois fatos habilitam uma solução única:
- O host nativo **já** dispara `pointerdown`/`pointerup` (SDL → `dispatchPointerEvent`
  em `native/src/shims/input.cpp`) com `clientX`/`clientY`, e o `input-bridge.js`
  os **redistribui pra `window`/`document`/`body`** — igual ao browser.
- O layout dos dois backends é o **mesmo** (espaço de design = viewport real ÷
  escala, SPEC-0129) e o `resolveRect` é compartilhado — logo o hit-test pode ser
  **um só**, no `UiLayer`, e valer para ambos.

## Decisão

Centralizar o mouse no **`UiLayer`** (a mesma casa da navegação por gamepad/teclado),
com um hit-test único que roda nos dois backends:

- Listeners de `pointerdown`/`pointerup`/`pointermove` em `window` (browser borbulha
  até lá; o host nativo despacha pra lá) — anexados no construtor, removidos no `dispose`.
- **Coordenada → design:** `design = client ÷ escala` (a mesma escala do SPEC-0129).
  Como os dois backends posicionam a UI a partir da origem (0,0), a conversão é
  idêntica em ambos.
- **Hit-test:** varre os botões visíveis **de cima pra baixo** (último adicionado =
  mais na frente) e devolve o primeiro cujo `resolveRect` contém o ponto.
- **Clique** = `pointerdown` + `pointerup` **sobre o mesmo botão** (igual ao browser);
  aceita **qualquer** botão visível — inclusive `focusable:false` (o padrão "só-clique",
  ex.: o botão "Fases" durante o gameplay).
- **Hover** (`pointermove`) move o **foco** — só em botões `focusable` (o foco é
  conceito de navegação). O host nativo não manda `pointermove` hoje, então o hover
  é efetivo só no browser (sem regressão; clique nativo não depende dele).
- O `DomUiBackend` **não liga mais `onclick`** (senão o `onPress` dispararia em
  DOBRO). Mantém só `cursor:pointer` + `pointer-events:auto` pro cursor de mãozinha.

## Consequências

- Menus clicáveis no **export nativo** (Steam PC) sem recompilar o host — os
  eventos de ponteiro já existiam. Um caminho de clique só, testado
  (`tests/ui/UiLayerPointer.test.ts`), vale pros dois backends e pra todos os
  jogos/editor que usam `UiLayer`.
- **Correção de comportamento:** o clique agora respeita `visible`/`focusable` do
  jeito esperado. Antes, o `onclick` do DOM disparava em botões `visible:false`
  removidos só por CSS? Não — mas disparava em botões marcados como desabilitados
  que mantinham `onPress` (ex.: "Continuar" sem save). Como o hit-test só considera
  botões **visíveis**, esconder/`opacity` não basta pra desabilitar: um botão
  desabilitado deve remover `onPress` (ou virar não-visível), não só mudar a cor.
- **Hover nativo** fica de fora até o host despachar `pointermove`
  (`SDL_EVENT_MOUSE_MOTION` → `pointermove`) — mudança pequena em `input.cpp`,
  adiada por não ser necessária pro clique.
- Os jogos que vendoram o engine precisam **re-vendorizar** o bundle pra herdar o
  mouse (teste4 já re-vendorizado nesta mudança).
