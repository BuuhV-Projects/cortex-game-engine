# 0202 - Editor no runtime nativo (M3a do PRD-0007)

**Data:** 2026-09-19
**Status:** aceito — **primeira fatia** do M3 (ver "O que falta")

## Contexto

O M2 (SPEC-0201) colocou o jogo dentro do Studio, mas rodando como **jogo**: sem
F2, sem seleção, sem gizmo. O editor (`src/editor/`) é excluído do bundle nativo
de propósito (ADR-0042: `index-runtime.ts` não exporta o editor, para ele não
pesar no jogo publicado), e o host não tinha o input que a edição exige.

## Decisão

### 1. O editor entra no bundle, sob flag

`CORTEX_WITH_EDITOR=1` faz o `bundle.mjs` resolver `cortex-game-engine` para
`src/index-dev.ts` (runtime + editor + attacher) em vez de `index-runtime.ts`.
No export: `--editor`. **O export de produção nunca passa a flag** — o editor
continua fora do jogo publicado.

### 2. O input que faltava no host

O host despachava só `pointerdown`/`pointerup`, e apenas em window/document/body.
Faltavam três coisas para o editor funcionar, todas em `native/src/shims/input.cpp`
e `native/js/src/shims/`:

- **`pointermove`** (de `SDL_EVENT_MOUSE_MOTION`, com `buttons` na máscara do
  W3C): sem ele dá para clicar, mas não para **arrastar** — o gizmo do
  `TransformControls` fica inerte.
- **`wheel`** (de `SDL_EVENT_MOUSE_WHEEL`, delta em pixels como o DOM; o sinal
  do SDL é invertido em relação ao browser).
- **Entrega no CANVAS**: o `TransformControls` recebe o canvas como
  `domElement` e o `ObjectEditSystem` escuta `pointerdown` nele. O input-bridge
  só entregava em window/document/body.

O canvas do `dom-lite` também ganhou `getBoundingClientRect` **real** (o
`TransformControls` normaliza o ponteiro por esse retângulo; devolver 0×0 fazia
todo clique virar o mesmo ponto) e `setPointerCapture`/`releasePointerCapture`
como no-op — o mouse do SDL já é global, mas os métodos precisam existir.

### 3. Dois bugs que o editor revelou no host

**(a) Import dinâmico no bundle.** `TauriSceneFileWriter` usa
`await import()`, que o Hermes não compila (`Invalid expression encountered` no
`hermesc`). No bundle de produção ele some por tree-shaking; com o editor
dentro, o `autoDetectSceneFileWriter` o retém. O `bundle.mjs` passou a
substituí-lo por um stub — o host nunca é Tauri.

**(b) Use-after-free de bind group — panic fatal.** Ao ligar o F2 o processo
morria com:

```
panicked at wgpu-core/src/storage.rs:137:
assertion `left == right` failed: BindGroup[Id(176,2)] is no longer alive
```

Causa: buffers e texturas já tinham **destruição adiada** (ADR-0153), mas o
bind group era liberado direto no finalizer do GC. O editor cria e descarta
material a cada troca de gizmo, então o GC roda no meio de um frame cujo pass já
referencia o bind group — e o wgpu-native trata isso como panic, não como erro.

Correção: bind group entra na mesma fila dos buffers/texturas
(`deferReleaseBindGroup`), liberado `kDeferredDestroyFrames` depois. **Isto não
é um bug do editor** — é um caminho que o jogo comum não exercitava, e a
correção vale para qualquer cena que descarte material sob pressão de GC.

## Validação

Export do `teste4` com `--debug --editor`, host em janela, F2 enviado por
`SendKeys`: o processo **sobrevive** (antes morria na hora) e o screenshot
(`.cortex/editor-no-host.png`) mostra a câmera livre do editor e os wireframes
de colisor/helper por cima da cena — o editor está de pé no runtime nativo.

## Consequências e o que falta

- **Performance do editor no host é ruim**: o HUD marcou `wld 121 ms` (10 fps)
  com o editor ligado, contra ~13 ms sem ele. O editor faz muito trabalho por
  frame (publish de estado, raycast, helpers) e nada disso foi otimizado para o
  Hermes. Usável para provar o caminho, não para autorar.
- **Falta a ponte editor ↔ IDE pelo canal** (M3b): hoje o editor está no host,
  mas quem consome o estado dele continua sendo a ponte `postMessage`, que não
  existe ali. Sem isso o Inspector do Studio não reflete a seleção feita no
  preview nativo — que é o aceite completo do M3.
- **Falta validar o arrasto com mouse de verdade** no preview embutido: o input
  está no lugar, mas a validação foi por teclado (F2) e screenshot.
- O editor no host tenta falar com o dev server (`/__list-assets`, salvar cena)
  e recebe 404 — inofensivo hoje, mas o salvamento precisará ir pelo canal.
