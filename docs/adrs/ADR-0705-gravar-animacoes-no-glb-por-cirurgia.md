# 0705 - Gravar animações no GLB do jogo trocando só o bloco de animação

**Data:** 2026-11-06
**Status:** aceito

## Contexto

A F2 do ADR-0702 grava, pelo Studio, as correções de pose e as variantes `clipe@ARMA` no GLB do
personagem que o jogo já usa (`LUC-01-skinned.glb`). Medido no GLB do Port Hollow (exportado pelo
Blender 5.1): 28 nós, 1 malha com `COLOR_0` normalizado (o índice de região que o jogo vira `slot`),
JPEG 2048² embutido, `KHR_materials_specular`, 35 animações × 78 canais. Os acessores 0–7 e os
bufferViews 0–8 (malha, índices, imagem, IBM) ocupam `BIN[0, 1227132)`; tudo de animação vem depois,
contíguo, sem bufferView compartilhado.

## Decisão

Reescrever **só o bloco de animação** do GLB: o JSON mantém `asset`, `nodes`, `meshes`, `skins`,
`materials`, `textures`, `images`, `samplers` e os acessores/bufferViews que não são de animação; o
BIN mantém byte a byte o prefixo até o primeiro bufferView de animação (calculado, não constante). As
animações (as que já existiam, copiadas, e as corrigidas/novas, com os floats do Studio) são
remontadas no fim do BIN, alinhadas a 4 bytes, com um acessor de tempo por contagem de chaves no clipe
(como o Blender). Se algum acessor fora de animação apontar além do corte, ou um canal citar um nó
que não existe, a gravação falha sem escrever nada.

Alternativas rejeitadas:

- **`GLTFExporter` do three**: recomprime o JPEG a cada gravação (canvas `toBlob`), acrescenta um nó
  raiz, `extras.name` e `skin.skeleton`, troca o nome da malha, exporta o que estiver visível na cena do
  Studio (arma, gizmo) e transforma os 38 acessores de tempo em 2730.
- **`@gltf-transform/core`** (já instalado no toolchain nativo): preserva imagem e atributos, mas
  reorganiza os bufferViews (diff ilegível) e traz a dependência para o renderer do Studio.

## Consequências

- O que o jogo lê da malha e do material fica idêntico; o teste confere o hash do prefixo do BIN e o
  JSON fora de `animations`/acessores/bufferViews de animação.
- O módulo só entende o layout "animação no fim" (o do exportador do Blender). Um GLB com animação
  intercalada é recusado com mensagem, não reescrito.
- GLB e JSON do skin (`<code>-skinned.json`) são gravados juntos, com backup do par anterior.
