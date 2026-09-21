// Spike do passo 1 da SPEC-0238: `override` constants sobrevivem ao naga/D3D12?
//
// Existe por causa de um precedente concreto: o naga **miscompilou `COLOR_0`**
// em `MeshStandardMaterial` — compilou sem erro e renderizou **branco**. Neste
// backend, "compilou" não é prova.
//
// Nenhum shader do host usa `override` hoje (splash, bloom e supersample não
// usam). Antes de montar o cache de pipeline em cima de constantes de
// especialização, esta sonda escreve um valor escolhido por `override` num alvo
// de 1x1 e **lê o pixel de volta**.
#pragma once

namespace webgpu {

/**
 * Compila um WGSL com `override` e confere o pixel resultante.
 *
 * Imprime o resultado e devolve `true` se o valor lido bateu com o que a
 * constante pedia — que é a diferença entre "compilou" e "funciona".
 */
bool runOverrideProbe();

}  // namespace webgpu
