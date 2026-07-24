# 0149 - Bloom nativo em HDR: cena numa RenderTarget própria entregue ao host

**Data:** 2026-07-24
**Status:** aceito

## Contexto

O bloom nativo (ADR-0147) rodava em **LDR** — sobre a imagem já tonemapeada pelo
JS. O usuário notou, comparando o jogo exportado com o Studio: **o brilho do
export era mais fraco**. É esperado e a causa é física:

- **Studio**: o `BloomNode` do three roda em **HDR**, antes do ACES. Um material
  `emissive [1,1,1]` com a exposição da cena passa de 1.0 → o bloom amostra
  valores altos → halo forte.
- **Export (LDR)**: o bloom rodava depois do ACES, que já comprimiu tudo pra
  [0,1]. O brilho máximo disponível pro bloom era 1.0 → halo fraco.

O ADR-0147 documentou isso como evolução, barrada por uma armadilha: trocar o
formato do offscreen do host pra `RGBA16Float` faz o wgpu panicar
(`pipeline targets are incompatible with render pass`), porque o three monta os
pipelines dos materiais com o formato que **ele** configurou na canvas.

## Decisão

O JS renderiza a cena numa **RenderTarget HDR própria** (`renderSceneHDR` no
`Renderer`: `HalfFloatType`, com depth buffer, `NoToneMapping`) e entrega o handle
da textura ao host por `__cortexSceneHdr` — **o mesmo mecanismo da UI** (ADR-0105).
O host faz, num passe só: bloom em HDR → soma → vinheta → **ACES + exposição** →
OETF → composição da UI.

Por que isto evita o panic: uma RenderTarget do three tem formato **próprio**
(HDR), independente da canvas. Os pipelines dos materiais que renderizam PRA ela
usam o formato dela — nunca há conflito com o formato da swapchain. É o mesmo
motivo de a UI conseguir ser HalfFloat sem quebrar nada.

Consequências da mudança de contrato quando o bloom está ligado:
- o JS **não** desenha no offscreen do host (renderiza na RT); o present passa a
  disparar por `sceneHdrPending`, não por `ssaaPending`;
- o SSAA continua: a RT tem o tamanho do drawing buffer (nativo × dpr) e o
  composite faz o downscale no sampler linear;
- o **tone mapping saiu do JS** de volta pro host (o composite aplica ACES), então
  o bloom morde os valores HDR de verdade;
- o bloom nativo é **sempre HDR** agora — o caminho LDR-com-bloom do ADR-0147 foi
  removido. Sem bloom, nada muda (o offscreen LDR normal + blit seguem iguais).

## Consequências

- **Paridade com o Studio**: o export brilha igual, porque os dois acendem o bloom
  em HDR com o mesmo ACES (a matriz do shader é a do three). A `native/shaders/
  bloom.wgsl` segue como fonte única da forma do bloom.
- **Sem custo de FPS**: space-1 continua a 75 fps (a RT HDR troca o offscreen, não
  soma passada; o bloom já era o mesmo número de passadas).
- **Depth buffer na RT** é obrigatório (cena 3D) — a RT da UI não tinha, e copiar
  aquela config cegamente daria z-fighting/sem profundidade.
- ⚠️ O bind group da passada 0 do bloom aponta pra textura da cena, que **pode
  trocar de frame a frame** (RT recriada no resize) — é reconstruído a cada frame.
- ⚠️ `renderSceneHDR` salva/restaura o `toneMapping` do renderer: sem isso o
  `NoToneMapping` vazaria pra UI e pras telas alternativas.
