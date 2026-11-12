# ADR-0727 - Efeito de tela embaixo d'água como estado do Renderer, aplicado no composite

**Data:** 2026-11-12
**Status:** aceito
**Contexto da SPEC:** SPEC-0726

## Contexto

Um jogo com mar (Port Hollow) precisa de um efeito de tela quando a câmera fica abaixo da lâmina d'água: a imagem
tingida pela cor da água, mais escura com a profundidade e ondulando em faixas horizontais. A intensidade vai de 0 a 1
para entrar e sair suave. O efeito precisa rodar nos dois alvos, o navegador (WebGPU, three TSL) e o export nativo
(host C++ WebGPU).

Hoje:

- o `PostFX` (`src/core/PostFX.ts`) só tem bloom, vinheta, FXAA e tone mapping;
- o Port Hollow não usa `PostFX` no navegador, renderiza direto (`Renderer.render`);
- no nativo, o composite final é do host: `blitToSwapchain` em `native/src/webgpu/supersample.cpp`, nos caminhos LDR
  (offscreen já tonemapeado) e HDR (`HdrParams` + `kHdrBlitShader`, com bloom e ACES do host, ADR-0147/0149). O
  mesmo passe compõe a UI em gama (ADR-0105), então a ondulação tem de distorcer só a cena, nunca a UI;
- o `Game.ts` tem 1.080 linhas: qualquer mudança nele obriga a dividi-lo na mesma mudança (SPEC-0668).

## Alternativas

1. **Campo novo no `PostFX` (`underwater`) e o jogo passa a usar `PostFX`.** O efeito fica junto dos outros
   pós-efeitos. Mas o `PostFX` do navegador sempre desenha por `RenderPipeline` (cena numa RT + passe de tela),
   então um jogo que hoje renderiza direto pagaria esse passe em todo quadro, mesmo fora d'água. No nativo, criar um
   `PostFX` liga o bloom do host (`configureNativePostFX`) e muda a cor do jogo. Não dá custo zero com `amount = 0`.
2. **`game.setUnderwater(...)` no `Game`.** É a API mais curta para o jogo, mas obriga a refatorar o `Game.ts`
   (1.080 linhas) na mesma mudança, e o `Game` não desenha nada: ele só escolhe entre o `PostFX` e o `Renderer`. O
   estado teria de descer ao `Renderer` de qualquer jeito.
3. **Quad preso à câmera com material próprio (o padrão do mar).** Não mexe na engine, mas não lê a cor da cena:
   dá tinta e escurecimento, não a ondulação.
4. **Estado do `Renderer` (`renderer.setUnderwater(state | null)`), aplicado onde a cena já é composta.** No
   navegador, o `Renderer.render` desvia para um `RenderPipeline` próprio só enquanto `amount > 0`. Com 0, segue
   o render direto de sempre. Um `PostFX` (opção `underwater`, ligada por padrão) lê os mesmos uniforms dentro do grafo dele. No
   nativo, o estado vai ao host por `__cortexUnderwater` e é aplicado no `blitToSwapchain`, nos dois caminhos (LDR e
   HDR), com a UI amostrada na UV sem distorção.

## Decisão

Alternativa 4.

- O estado mora no `Renderer`: é ele que desenha nos dois alvos, e quem já tem `PostFX` ou só o render direto recebe
  o efeito pelo mesmo método.
- O **navegador** usa um `RenderPipeline` só enquanto o efeito está ligado: `pass(cena, câmera)` → amostra com a UV
  deslocada → `renderOutput` (tone mapping e espaço de cor do renderer) → tinta e escurecimento em espaço de tela
  (sRGB). Com `amount = 0`, o `Renderer.render` nem olha o pipeline.
- O **nativo** aplica o efeito no blit final que já roda. Ele ganha um uniform de 48 B com um ramo uniforme: com
  `amount = 0`, o shader devolve a cor e a UV sem tocar nelas. É um pipeline só, aquecido no primeiro quadro como hoje,
  sem variante nova. O JS só chama o host quando o estado muda (o `brightness` é quantizado em 1/256, então descer
  devagar não muda o estado todo quadro; a rampa do `amount` muda, só pelos quadros dela). A fase da onda é contada
  pelo relógio do host. A primeira chamada e o `dispose` sempre mandam o estado, porque o do C++ é global.
- A **cor e a mistura** são aplicadas em espaço de tela (depois do tone mapping), nos dois alvos e nos dois caminhos
  do nativo. A cor da água é a cor que se vê (como `rgb(90,170,170)` do GTA San Andreas), e o resultado é igual no
  LDR e no HDR do host.
- A **UV** é top-down (y = 0 no topo) nos dois alvos. No navegador é o `screenUV` do WebGPU; no nativo é a UV do blit.

## Consequências

- O `PostFX` do navegador traz os nós do efeito por padrão (`underwater: false` tira): no nativo o blit aplica o
  efeito com ou sem `PostFX`, e o Studio tem de mostrar o mesmo que o export. Com `amount = 0` a saída é idêntica, ao
  custo de um `sin` e um `mix` por pixel num passe que já é de tela cheia.
- O jogo liga o efeito com uma chamada por quadro (`game.renderer.setUnderwater({ amount, depth, ... })`). Chamadas
  com o mesmo estado não custam nada no nativo e mudam só uniforms no navegador.
- **Aquecimento (AGENTS §7.4 dos jogos):** no navegador, o caminho embaixo d'água desenha a cena numa RT HDR, com
  chaves de pipeline diferentes das do canvas. O jogo força o caminho no carregamento: `setUnderwater({ amount: 1 })`,
  `await game.precompile()`, `setUnderwater(null)`. No nativo não há caminho novo.
- O efeito vale para tudo que o `Renderer.render` desenha (inclusive a câmera do inspect F2). O `renderViewport`
  (split-screen) não é coberto.
- No navegador, o efeito com `amount > 0` custa um passe de tela e uma RT de cena (o mesmo custo de um `PostFX`
  simples). No nativo, é matemática dentro de um passe que já roda. Com `amount = 0`, o custo é zero nos dois alvos.
- No nativo, o efeito vive no blit final, que só existe com o compositor de UI (ADR-0105), SSAA (`renderScale > 1`)
  ou o composite HDR (ADR-0149). Um jogo com `renderScale = 1`, sem UI de runtime e sem tone mapping do host desenha
  direto na swapchain e não recebe o efeito. Forçar o offscreen só enquanto o efeito está ligado deixaria um
  offscreen velho ao desligar, e o present (`surface.cpp`) pararia de apresentar o quadro direto.
- O `supersample.cpp` passava de 500 linhas: os shaders do blit saem para `blit_shaders.cpp`.
