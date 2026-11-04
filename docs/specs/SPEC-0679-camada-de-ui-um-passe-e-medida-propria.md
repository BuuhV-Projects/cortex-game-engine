# SPEC-0679 — Camada de UI do host: um passe só e fatia de medida própria

**Data:** 2026-11-03
**Status:** implementado

## Contexto

DDD 00 no export nativo: a fatia `ui` do profiler mede 7–8 ms. A hipótese era espera de GPU no submit da camada
de UI (`_ui.render` → `renderUiLayer` → `__cortexUiLayer`).

### O que o host faz (lido em `native/src`)

- `queue.submit` (`webgpu/commands.cpp`) chama `wgpuQueueSubmit` e volta. Não tem `wgpuDevicePoll`, espera nem
  `ProcessEvents`.
- `onSubmittedWorkDone` resolve na hora (não bombeia).
- `__cortexUiLayer` (`webgpu/navigator.cpp`) só guarda o handle da textura e marca `uiPending`. A composição em
  gama roda no present, depois que o quadro JS termina.
- Com o compositor ligado, o jogo desenha no offscreen (`contextGetCurrentTexture` devolve o offscreen). O
  `wgpuSurfaceGetCurrentTexture`, onde mora a espera de vsync/latência de quadro, só roda no present
  (`acquireSurfaceTexture`), fora do quadro JS.
- `mapAsync` síncrono só existe no readback (`buffers.cpp`) e no `pass_timing`. Nenhum dos dois está no caminho
  da UI.

Conclusão: não há espera de GPU na fatia `ui`. Os 7–8 ms são CPU em JS:

1. `_ui.update` (navegação e sync dos widgets) e `_ui.render` caem na mesma fatia `ui` (`Game.ts`, nas duas
   pontas do quadro).
2. Sem `?nativeUi=1` (padrão), `renderUiLayer` passa a cena de UI pelo `WebGPURenderer` do `three` no Hermes sem
   JIT: projeção, RenderList, nós e uniformes por objeto.
3. O caminho do `three` faz **dois** passes e **dois** `queue.submit` por quadro: `renderer.clear()` sozinho
   (passe só de clear) e depois `renderer.render()`.

## Decisão

- O desenho da camada de UI sai do `Renderer.ts` (500 linhas) para `src/render/UiLayerRender.ts`.
- O clear entra no passe do render. O `autoClear` fica ligado só durante esse render (só cor: a RT da UI não
  tem depth nem stencil), com clear transparente. O passe e o submit avulsos do `clear()` somem. A cor de clear
  e o `autoClear*` globais são restaurados depois.
- A medida fica separada: `uiLayer` (o desenho da camada, os dois caminhos) entra como seção
  (`RenderSections`), aninhada na fatia `ui`. A diferença `ui − uiLayer` é o `_ui.update` mais o sync.
- O padrão do `?nativeUi` não muda: a R2.1 (SPEC-0616) ainda não teve aceite de paridade. A sessão principal
  mede o DDD 00 com `?nativeUi=1` para decidir. É ele que tira o `three` do laço da UI.

## Consequências

- Uma passada de render e um submit a menos por quadro no caminho do `three`. Estimativa: 0,2–0,5 ms de CPU
  (o `clear()` do `three` monta contexto de render, encoder, passe e submit em JS).
- O trace passa a mostrar quanto da `ui` é desenho da camada e quanto é update/sync.
- Teste: `tests/render/UiLayerRender.test.ts`.
