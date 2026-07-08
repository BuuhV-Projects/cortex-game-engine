# 0105 - Blend de transparência da UI: linear (native) vs sRGB (DOM)

**Data:** 2026-07-07
**Status:** aceito — **IMPLEMENTADO e validado por medição** (tentativa 2: UI numa
RenderTarget própria + composição nativa em gama; tentativa 1 via `outputColorSpace`
falhou e foi revertida — ver histórico abaixo)
**Relacionado:** ADR-0102 (UI de runtime, dois backends), ADR-0103 (SSAA)

## Contexto

A UI de runtime tem dois backends (ADR-0102): **DomUiBackend** (DOM/CSS, usado no
Studio/browser) e **RendererUiBackend** (cena ortográfica no WebGPU, usado no export
nativo CortexNative). O objetivo é que os DOIS desenhem **igual**.

Reportado: os **menus** do export nativo saem "com pouco contraste e muito brilho"
vs o Studio ("cores mais quentes/ricas"). Mais visível na tela **"Fase Concluída"**
(resultados) e na **pausa**, que têm um *scrim* (overlay escuro semitransparente).

### Investigação (o que foi descartado, com medição)

- **NÃO é color management / HDR / wide-gamut.** Monitor do dev é sRGB
  (`dxdiag`: `DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709`, HDR *Not Supported*;
  perfil ICC ativo = `sRGB Color Space Profile.icm`). Chrome faz sRGB→sRGB =
  identidade. Não há o que "copiar" do DOM em termos de color management.
- **NÃO são cores opacas.** Medido lado a lado (Chrome × native, mesmo menu): botão
  focado `#ffe680`→(255,230,128) e `Sair` `#0d3a52`→(13,58,82) **bit-idênticos** nos
  dois e exatos ao autorado. A saída sRGB do native é fiel.
- **NÃO é MSAA nem SSAA.** `antialias:false` e `CORTEX_RENDER_SCALE` 1.0 vs 2.0 não
  mudam nada.

### Causa raiz (medida, dos dois lados)

O **blend de transparência** acontece em espaços diferentes. Medindo o scrim
(`#0a2a3c` @ opacity 0.6) sobre um fundo branco conhecido:

| Backend | Resultado do scrim/branco | Espaço de blend |
|---|---|---|
| DomUiBackend (Chrome/CSS) | **(108,127,138)** | **sRGB / gama** |
| RendererUiBackend (WebGPU) | **(170,172,175)** | **linear** |

O CSS compõe camadas em espaço **sRGB (gama)**; o `WebGPURenderer` do Three sempre
blenda num buffer de trabalho **linear** interno (independe de MSAA/SSAA) e só
codifica pra sRGB na saída. Um overlay escuro em linear quase não escurece
(170 ≈ quase branco) enquanto em sRGB escurece forte (108) — daí "muito brilho,
pouco contraste" no native. Só a **transparência** (opacity < 1, ex.: scrim, painel
translúcido, botão desabilitado) diverge; cor opaca é idêntica.

## Decisão

Fazer o **RendererUiBackend blendar em sRGB/gama**, casando com o DOM. Abordagem:
renderizar a UI do native em **"pass-through sRGB"** — as cores e texturas entram
como sRGB **cru** (sem linearizar) e o passe da UI **não** aplica o OETF de saída.
Assim o blend do Three (aritmético, "linear") acontece sobre valores sRGB = mesmo
resultado do CSS, e a saída passa direto (sem re-encode).

Mudanças previstas (todas em `src/ui/runtime/RendererUiBackend.ts`, + hook no
`Renderer` pra alternar o color space do passe):
1. **Cores** (colorTop/colorBottom/borderColor do painel, tint de texto, tint da
   imagem): setar como sRGB cru — `Color.setHex(hex, LinearSRGBColorSpace)` (guarda
   os bytes sem conversão) em vez de `.set('#hex')` (que lineariza).
2. **Texturas** (imagem de fundo, DataTexture do texto): `colorSpace = NoColorSpace`
   (sem conversão na amostragem). O texto é máscara branca → indiferente; a imagem
   precisa passar crua.
3. **Saída sem OETF no passe da UI**: renderizar a cena da UI com
   `renderer.outputColorSpace = LinearSRGBColorSpace` (ou `NoColorSpace`), restaurando
   depois. Provavelmente via um parâmetro novo em `Renderer.renderViewport`
   (ex.: `{ srgbPassthrough: true }`) pra não vazar estado.

### Tentativa 1 (2026-07-07) — FALHOU, revertida. Aprendizado importante.

Implementei exatamente as 3 mudanças previstas (cores sRGB cruas, texturas
`NoColorSpace`, e o hook `Renderer.renderViewport(..., { srgbPassthrough })` que
trocava `renderer.outputColorSpace` pra `LinearSRGBColorSpace` só no passe da UI,
salvando/restaurando). Testado no export nativo: **o JOGO inteiro ficou escuro** e
**o menu NÃO mudou**. Tudo revertido (working tree limpo, jogo de volta ao bom).

Causa (mecanismo): o Three aplica o OETF de saída num passe/output governado por
`outputColorSpace`, e o WGSL gerado pelo node system **baqueia** essa conversão no
shader do material. Trocar `outputColorSpace` por frame:
- regenera o WGSL dos materiais do **jogo** (não só da UI) sem o OETF;
- o cache de pipeline do **host nativo** (`native/src/webgpu/pipeline.cpp`) não
  chaveia pela conversão de saída → serve o shader sem OETF de forma **persistente**
  (não reconstrói de volta) → jogo escuro pra sempre, não só no frame da UI.
- E como o encode de saída é do frame todo (buffer de trabalho linear + encode
  final), pular o OETF "só no passe da UI" não recompôs o scrim em gama → menu igual.

**Conclusão: NÃO mexer em estado GLOBAL do renderer (`outputColorSpace`,
`toneMapping`, etc.) por frame no host nativo.** Mesmo salvando/restaurando, vaza
pro jogo via os caches de shader/pipeline (Three-node × host). Já era a lição do
toggle de tone mapping (ADR anterior) — vale pra QUALQUER estado global do renderer.

### Medição de baseline (2026-07-07) — CONFIRMADA, com achado novo

Rodado o repro no export nativo (teste4, harness `?results` = scrim sobre painel
branco fullscreen). Medido (GetPixel em 4 pontos do scrim sobre branco):

| Config | Scrim/branco no native | Esperado |
|---|---|---|
| `CORTEX_RENDER_SCALE=1` (SSAA OFF, render DIRETO na swapchain) | **(170,172,175)** | linear |

O alvo DOM/CSS é **(108,127,138)** (aritmética: `#0a2a3c`×0.6 + `#fff`×0.4 em sRGB).

**Medição CROSS-CALL (o caso real, scrim sobre o FRAME DO JOGO):** o 1º teste media
o scrim sobre um painel branco de UI (intra-UI-call). Refiz medindo o scrim sobre um
**background 3D renderizado pelo jogo** (`scene.background = #fff`, render call do jogo)
com o scrim da UI por cima (render call da UI) — o caso real dos menus:

| Ponto | `?bg` (só background) | `?results` (background + scrim) |
|---|---|---|
| 4 pontos | **(255,255,255)** | **(170,172,175)** = LINEAR |

Confirma que o blend translúcido da UI **sobre o jogo** também é linear (lavado) — não
é artefato do harness. Mecanismo: com `autoClear=false`, o Three **lineariza o
conteúdo já no framebuffer** pro buffer de trabalho, blenda a UI em linear e re-encoda.

**Achado decisivo:** com `renderScale=1` o host NÃO usa o offscreen (ensureOffscreen
retorna null) — o Three desenha DIRETO na swapchain, cujo formato é **non-srgb**
(`stripSrgb`, ver navigator.cpp). Mesmo assim o blend deu **linear**. Ou seja: o
blend linear **não** vem do formato do alvo — o Three compõe o frame num **buffer de
trabalho linear interno** (RGBA16F/equiv.) e só codifica pra sRGB no COPY final pra
swapchain, governado por `outputColorSpace`. Isso:
- **explica a tentativa 1** (togglar `outputColorSpace` mexe no encode final do frame
  INTEIRO → jogo escuro), e
- **define o fix:** a composição da UI em gama tem que acontecer **depois** do OETF do
  Three, sobre os bytes sRGB já codificados — fora do compositing linear do Three.
  Isso é território do **host nativo** (um passe de blend próprio, como o blit do SSAA).

### Decisão da tentativa 2 — composição nativa da UI em gama (evidência do three)

Investigado o `three.webgpu.js` (código): o frame é composto num **render target
linear interno** (`frameBufferTarget`, rgba16float, `workingColorSpace`) e o OETF é um
**passe de quad final** (`_renderOutput`), DEPOIS do blend. Overlay com `autoClear=false`
blenda nesse buffer linear → linear. MAS: **renderizar numa RenderTarget PRÓPRIA
(`setRenderTarget`) escreve LINEAR sem OETF e sem tocar estado global** (`isOutputTarget=
false` → `needsFrameBufferTarget=false`; `texture.colorSpace` é só metadado de leitura).

**Design (sem estado global do renderer → não pode escurecer o jogo):**
1. **Engine** — `RendererUiBackend` renderiza a UI numa `THREE.RenderTarget` própria
   (`setRenderTarget(uiRT)` + clear transparente + render + `setRenderTarget(null)`).
   O uiRT guarda a UI em **linear premultiplicado** (`rgb = cor_linear·a`, `a`). Cores
   e texturas da UI ficam **normais** (não precisa mexer — ver fórmula).
2. **Ponte** — o engine pega o objeto GPUTexture que o three criou pro `uiRT.texture`
   (via `renderer.backend`) e passa pro host num binding novo (ex.: `__cortexUiLayer`).
   O host faz `unwrapValue` → `WGPUTexture` (o `deviceCreateTexture` do host já embrulha
   com `wrapHandle`, então o mesmo objeto desembrulha).
3. **Host** — no present, ANTES do blit SSAA, um passe compõe o uiRT sobre o offscreen
   do jogo **em gama**:

   ```
   out_rgb = game_srgb·(1 − a) + OETF(ui_rgb / a)·a        (a>0; a==0 → game)
   ```

   Isso dá **exatamente** o blend sRGB do CSS: `OETF(ui_rgb/a)` = `OETF(cor_linear)` =
   cor sRGB autorada; unpremult recupera a cor; blend nos bytes sRGB do jogo = gama.
   Opaco (a=1) → `OETF(cor_linear)` = cor exata (bit-idêntico, sem regressão). Vazio
   (a=0) → jogo intacto.

**Por que não a tentativa 1:** togglar `outputColorSpace` mexe no caminho de saída
GLOBAL (liga/desliga o `frameBufferTarget` + `_renderOutput` do frame inteiro) — foi o
que escureceu o jogo. O design 2 nunca toca estado global; a UI vai pra um alvo à parte
e a composição é um passe nativo isolado.

**Custo/risco:** mexe em engine (RT) + host C++ (binding + passe + shader) + **rebuild
do host** (vcvars64/CMake). Fragilidade: pegar o handle da textura do three
(`renderer.backend`) é API interna do three — validar empiricamente. Precisa spec do
native (regra `native/`). Validação: o loop de medição já montado (`?bg`/`?results`).

### Implementação (2026-07-07) — feita e VALIDADA

Arquivos:
- **Engine** — `src/core/Renderer.ts`: `renderUiLayer(scene, camera, w, h)` desenha a UI
  numa `RenderTarget` própria (HalfFloat, linear, sem OETF, sem estado global) e devolve
  o GPUTexture do backend (`renderer.backend.get(rt.texture).texture` — funcionou de 1ª).
  `src/ui/runtime/RendererUiBackend.ts`: se o host expõe `__cortexUiLayer`, usa o caminho
  RT + entrega a textura ao host (blend dos materiais = `CustomBlending` premult: rgb
  `SrcAlpha`/`OneMinusSrcAlpha`, alpha `One`/`OneMinusSrcAlpha`, senão o alpha sairia ao
  quadrado); senão, fallback pro `renderViewport` antigo (host velho).
- **Native** — `webgpu/navigator.cpp`: binding `__cortexUiLayer(textureOrNull)` (seta
  `uiTexture`+`uiPending`). `core/host_gpu.h`: `uiCompositor`/`uiTexture`/`uiPending`.
  `webgpu/supersample.cpp`: o blit do SSAA passou a compor a UI EM GAMA
  (`out = game·(1−a) + OETF(ui/a)·a`), com textura 1×1 transparente de fallback;
  `ensureOffscreen` força o offscreen quando há compositor (pra rodar mesmo em
  `renderScale=1`); `clearOffscreen` (base limpa quando o jogo não desenhou).
  `webgpu/surface.cpp` (`presentIfAcquired`): apresenta quando o jogo renderizou OU a UI
  foi submetida (`uiPending`), compondo a UI sobre o offscreen.

**ARMADILHA (gotcha do present nos menus):** as telas de MENU rodam um loop **só-UI**
(`ui.render()` sem render do jogo — ver teste4 `MainMenu.runScreen`). Nesse caso: (a) a
UI vai só pra RT → `getCurrentTexture` da canvas NUNCA é chamado → o present precisa
disparar por `uiPending`, não só por `ssaaPending` (senão tela preta); e (b) o three
nunca chama `context.configure` (só renderiza na RT) → **gate o present por `gpu->device`,
NÃO por `gpu->configured`** (que fica false no menu) — o `acquireSurfaceTexture`
auto-configura a surface na 1ª aquisição. Sem esses dois, os menus ficam PRETOS. Resetar
`uiPending` após o present preserva o anti-vsync (não apresenta em loads pesados que não
renderizam UI — ver `ssaaPending`).

Medição (export teste4, harness `?bg`/`?results`, SSAA 2.0 = default):

| | Antes (linear) | Depois | Alvo DOM |
|---|---|---|---|
| Scrim `#0a2a3c`@0.6 sobre branco do jogo | (170,172,175) | **(108,127,138)** ✓ | (108,127,138) |
| Background do jogo (`?bg`) | — | **(255,255,255)** intacto ✓ | — |
| Botão opaco `#5aa0c0` | — | **(90,160,192)** bit-exato ✓ | (90,160,192) |
| Botão foco `#ffd94d` | — | **(255,217,77)** bit-exato ✓ | (255,217,77) |

Critério de aceite batido: scrim virou gama = DOM, opacos bit-exatos, jogo NÃO escureceu.
Travado em `tests/ui/RendererUiBackend.test.ts` (caminho RT + handle + blend premult).

### Riscos a validar na implementação (mantidos)

- **Regressão nas cores opacas** (hoje bit-exatas) — não podem mudar.
- **Imagem de fundo** (menu-bg) não pode escurecer/clarear.
- **JOGO intocado** — a tentativa 1 falhou exatamente aqui. Estado global do
  renderer é proibido.
- **DomUiBackend intocado** (Studio já está correto).

### Como validar (repro exato)

1. Hook temporário no jogo: `?results` mostra a tela de resultados sobre um `UiPanel`
   branco (`background:'#ffffff'`, `fill`).
2. **Native**: `export-game.mjs` + rodar com `CORTEX_LAUNCH_QUERY="?results"`,
   `CORTEX_WINDOWED=1`; `CopyFromScreen`/`GetPixel` no scrim sobre o branco.
3. **Browser**: `yarn dev --port <livre>` + Chrome `--app=…/?results`; mesma medição.
4. **Critério de aceite**: scrim/branco do native passa de **(170,172,175)** pra
   **~(108,127,138)** (igual ao Chrome), e os botões opacos seguem exatos
   (`#ffe680`→255,230,128; `#0d3a52`→13,58,82). Travar por teste unitário no
   `RendererUiBackend` (cor/colorSpace do material translúcido).

## Consequências

- Quando implementado: os menus do native (resultados, pausa, qualquer translúcido)
  batem com o Studio — fim da divergência de "brilho/contraste".
- A UI do native passa a operar conceitualmente em espaço sRGB (como o CSS), o que é
  o modelo mental certo pra interface (cor de UI é sRGB autorada, não cena).
- Enquanto não implementado: cores **opacas** já estão corretas; só translúcidos
  (scrim/overlays) ficam mais claros no native. Nenhuma gambiarra de compensação foi
  deixada no código (tentativas de tint/exposição/present-mode foram revertidas).
