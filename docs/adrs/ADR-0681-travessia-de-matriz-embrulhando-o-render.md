# ADR-0681 — Travessia única de matriz: embrulhar o `render` da instância, não o quadro do `Game`

**Data:** 2026-11-04
**Status:** aceito

## Contexto

O `Renderer.render` do three percorre a cena inteira (`scene.updateMatrixWorld()`) a cada chamada com
`scene.matrixWorldAutoUpdate === true`, e o quadro do Studio chama esse `render` ~4,4× para a mesma cena (passe
principal + cascatas de sombra aninhadas). Queremos UMA travessia por quadro (SPEC-0680).

## Alternativas

1. **No quadro do `Game`**: antes do bloco de render do `_tick`, `scene.updateMatrixWorld()` e auto-update desligado
   até o fim do quadro. Cobre exatamente "um por quadro", mas mexe no `Game.ts` (1.080 linhas → dividir o arquivo
   na mesma mudança, SPEC-0668), tem de conhecer cada ramo (pós, editor, inspeção, carregamento, aquecimento) e
   deixa o auto-update desligado também na UI e no `PerfTrace` que rodam depois, dentro do quadro.
2. **Patch no three** (`patch-package`/fork do `Renderer.js`): muda a semântica do three para todos e entra no
   vendoring; cada atualização do three vira conflito.
3. **Embrulhar o `render` da instância do `WebGPURenderer`** (escolhida): uma travessia por render "de fora" de
   cada cena; os renders aninhados da mesma cena acham o auto-update desligado. Vale para qualquer ramo que chega ao
   `render` (pós, editor, inspeção, split-screen) sem conhecê-los, e a cena volta ao normal no fim de cada render.

## Decisão

Alternativa 3, em `src/render/SingleMatrixUpdate.ts`, instalada no construtor do `Renderer` da engine e desviada
quando o espelho nativo está instalado. O `CameraFollowingCSM` atualiza a matriz das luzes das cascatas que ele
mesmo move no meio do render.

## Consequências

- "Uma por render de fora" e não "uma por quadro": dois renders de fora da mesma cena no quadro (split-screen)
  fazem duas travessias — o que é o certo, porque o jogo pode mover objetos entre eles.
- Quem move pose no meio do render (callback, `updateBefore`) passa a ser responsável pela matriz do que moveu.
- Um wrapper a mais na pilha do `render` (a `RenderPhaseProbe` e a `NativeMainProjection` embrulham por cima).
