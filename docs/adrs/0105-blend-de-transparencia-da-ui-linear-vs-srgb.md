# 0105 - Blend de transparência da UI: linear (native) vs sRGB (DOM)

**Data:** 2026-07-07
**Status:** aceito — **a implementar** (decisão registrada; implementação numa sessão dedicada)
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

### Riscos a validar na implementação

- **Regressão nas cores opacas** (hoje bit-exatas) — não podem mudar.
- **Imagem de fundo** (menu-bg) não pode escurecer/clarear.
- **FPS**: alternar `outputColorSpace` por frame pode recompilar shader (foi a lição
  do toggle de tone mapping, ver architecture.md do native). Medir; se recompilar,
  buscar alternativa (ex.: material/target dedicado da UI sem OETF).
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
