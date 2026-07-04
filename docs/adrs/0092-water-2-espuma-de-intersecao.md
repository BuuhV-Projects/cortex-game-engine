# 0092 - Water 2.0 — espuma de interseção (experimento adiado; aprendizados)

**Data:** 2026-07-04
**Status:** adiado — experimento revertido a pedido; Water 1.0 segue em produção

## Contexto

A Water 1.0 (plano `MeshStandardMaterial` + cáusticas por offset) não tem a
**espuma de interseção** (borda branca ao redor do que fura a água — o look de
diorama da referência do teste4). Foi implementada uma Water 2.0 com material
TSL (`MeshStandardNodeMaterial` + depth-test); a iteração visual no teste4
revelou uma sequência de armadilhas e um problema de DESIGN (abaixo). O código
foi revertido pra 1.0 preservando estes aprendizados pra retomada.

## Aprendizados (pagos com iteração — NÃO redescobrir)

1. **`viewportDepthTexture` + `antialias: true` no WebGPU não funciona**: copiar
   depth multisampled é inválido; a cópia falha em silêncio → textura zerada →
   `diff = 0` em todo pixel → espuma na água inteira. Solução: **prepass
   próprio** — renderizar a cena (sem a água) num `RenderTarget` de meia
   resolução com `depthTexture` e amostrar esse depth.
2. **`smoothstep` exige `edge0 < edge1`** — bordas invertidas são comportamento
   indefinido em WGSL (satura em 1). Usar bordas ascendentes + `.oneMinus()`.
3. **Nunca trocar a `image` de uma `DataTexture` por bitmap**: o caminho de
   upload WebGPU espera typed array → `writeTexture` crasha (tela preta). Pra
   trocar textura em nó TSL, atribuir **`textureNode.value = novaTextura`**.
4. **TextureNode auto-flipa DepthTexture** (linha ~853 do TextureNode.js, pra
   cópias de viewport). Depth de RenderTarget próprio precisa de **contra-flip**
   (`screenUV.flipY()`) — sem isso as silhuetas ficam espelhadas verticalmente.
5. **Prepass deve usar a câmera ATIVA do frame** (a do editor no F2!) — com a
   câmera do jogo, as silhuetas descolam ao orbitar no editor. O `Renderer`
   pode expor `lastCamera` (setado em `render()`).
6. **RenderTarget tem viewport PRÓPRIO no three** — o viewport do canvas não se
   aplica; não é preciso (nem adianta) `setViewport` ao redor do prepass.
7. **Problema de DESIGN, não de código**: com o depth-test funcionando, o shader
   lê os **corpos submersos das ilhas decorativas** (`land_*`, enormes, logo
   abaixo da superfície) como "raso" → manchas largas de espuma/clareamento pelo
   mar, que parecem bug ("iluminação cortada que anda com a câmera"). Retomada
   exige: `foamWidth` estreito (~0.4m), faixa de raso curta, e/ou level design
   que afunde os corpos decorativos (>2m da superfície), e um **debug view**
   (R=cena, G=máscara, B=superfície) desde o dia 1 — foi o que destravou o
   diagnóstico.
8. Gate de segurança vale a pena: uniform `foamOn` que só liga após o 1º
   prepass válido — o modo de falha vira "sem espuma", nunca "espuma em tudo".

## Decisão

Reverter ao Water 1.0 (estável) e retomar o 2.0 depois, começando do prepass +
gate + debug view, com calibração fina e cena de teste SEM geometria submersa
antes de ligar no teste4.
