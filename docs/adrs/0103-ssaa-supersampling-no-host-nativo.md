# 0103 - SSAA (supersampling) no host nativo

**Data:** 2026-07-06
**Status:** aceito

## Contexto

O export nativo (ADR-0101) renderiza direto na swapchain, no tamanho da janela
(fullscreen = resolução do desktop). Com `antialias: true`, o Three usa MSAA 4×,
que suaviza bordas de geometria — mas o MSAA **não** resolve o serrilhado de
linhas finas de alto contraste geradas dentro do fragment/pela própria malha.

O caso concreto: o shader "unlit + contorno" do jogo usa **inverted hull**
(uma casca preta levemente expandida atrás do objeto) pra desenhar o contorno
cartoon. Essa borda preta é uma aresta fina e de altíssimo contraste; o MSAA 4×
amostra poucas posições por pixel e deixa o contorno **tracejado/serrilhado**,
muito visível nas **moedas** (contorno circular pequeno) e, em menor grau, em
tudo com contorno.

Reconfigurar a surface pra um tamanho maior NÃO é opção: o wgpu-native/D3D12
crasha com "Invalid surface" em qualquer re-config (ver architecture.md,
"Reconfigurar a surface = CRASH"). Precisávamos de mais amostras por pixel sem
tocar na configuração da surface.

## Decisão

**Supersampling (SSAA) por alvo offscreen + downscale no present.** O engine
renderiza numa textura **offscreen** maior (nativo × `renderScale`, padrão 2.0);
no fim do frame o host faz um blit com filtro **linear** (box filter) reduzindo
pra swapchain nativa. Cada pixel final vira a média de `renderScale²` amostras —
inclui o contorno inverted-hull, que deixa de serrilhar.

Implementação (novo `native/src/webgpu/supersample.{h,cpp}`, ~SRP):
- `ensureOffscreen(gpu)`: cria/rebuild a textura SS (`RENDER_ATTACHMENT |
  TEXTURE_BINDING`, formato = `requestedFormat`) no tamanho `gpu.width ×
  renderScale`. Devolve a view onde o JS desenha. `renderScale ≤ 1.0` → nullptr
  (SSAA desligado, caminho antigo direto na swapchain).
- `blitToSwapchain(gpu, swapView)`: pipeline lazy (fullscreen-triangle WGSL +
  sampler linear + bind group layout), 1 draw de 3 vértices.
- `surface.cpp`: `getCurrentTexture` devolve a offscreen (SS) quando ligada;
  `presentIfAcquired` adquire a swapchain real, faz o blit downscale e apresenta.
- `main.cpp`: lê `CORTEX_RENDER_SCALE` (clamp 1.0–4.0, padrão 2.0) e injeta o
  tamanho **lógico** (nativo) em `__cortexWidth/Height` + `devicePixelRatio =
  renderScale` em `__cortexPixelRatio`. **Modelo fiel ao browser:** o engine faz
  layout em px LÓGICOS (`innerWidth` = nativo) e o three multiplica por
  `devicePixelRatio` pro backing (o offscreen SS = nativo × renderScale). O
  resize (`__cortexResize`) passa o tamanho lógico (nativo); o dpr leva pro SS.
- **UI em px lógicos:** o viewport do `UiLayer` (`Game.ts`) passou a usar o
  tamanho LÓGICO do renderer (`renderer.width/height`, via `getSize()`) em vez de
  `canvas.width` (backing = lógico × dpr). Sem isso, a UI encolheria pela metade
  no export (canvas.width = SS): a fonte 16px virava 8px depois do downscale. É
  também uma correção de HiDPI válida no browser (dpr > 1 no Studio).

Efeito colateral aproveitado: o dpr também dá **nitidez em monitor com escala**
(a pendência de high-DPI de ADR-0100/surface), sem re-config de surface.

Também nasceu daqui o **deep-link de fase** (`CORTEX_LAUNCH_QUERY` →
`location.search`), usado na validação headless e útil pro atalho/export abrir
direto numa fase.

**Fonte da UI unificada (WYSIWYG Studio ↔ export ↔ Xbox).** O backend DOM do
Studio usava `600 system-ui` (= Segoe UI no Windows), enquanto o export
rasterizava **Roboto** — fontes diferentes no preview e no jogo. Segoe é
proprietária e não existe fora do Windows (nem via `stb_truetype`, que lê um
`.ttf` bundled), então a escolha cross-platform é **Roboto Medium** nos dois:
- Native: `text_raster` carrega `Roboto-Medium.ttf` (fetch-deps pinado v2.138).
- Studio/DOM: `src/ui/runtime/uiFont.ts` embute a Roboto Medium (woff2 subset
  Latin, ~16KB, data-URI) via `@font-face` e o `DomUiBackend` usa
  `font-family: 'Cortex UI'` peso 500. O Latin cobre os acentos do PT.

## Consequências

- **Contorno das moedas (e tudo) suave**: validado com a Fase 1 do teste4 —
  o contorno preto passa de tracejado (scale 1.0) a linha contínua (scale 2.0).
- **Custo de fill-rate/VRAM**: em 1080p, scale 2.0 = alvo interno de 3840×2160
  com MSAA 4×. Barato pra cena low-poly; regulável por `CORTEX_RENDER_SCALE`
  (1.0 desliga; 1.5 é meio-termo; teto 4.0). No console, ajustar por perfil.
- **Acoplamento render↔host**: o host força `getCurrentTexture` a devolver a
  offscreen, então o tamanho que o three renderiza PRECISA casar com a
  offscreen. Isso vale pra injeção inicial E pro resize — as duas usam
  `× renderScale`. Regressão fácil se um caminho novo injetar tamanho nativo.
- **Não mexe na surface**: mantém a invariante de tamanho fixo de config (sem
  risco do crash "Invalid surface"). O blit é o único passo extra por frame.
