[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / estimateGltfBytes

# Function: estimateGltfBytes()

> **estimateGltfBytes**(`gltf`): `number`

Defined in: [src/core/AssetResidency.ts:49](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L49)

Estimativa dos bytes de GPU/CPU de um GLTF (SPEC-0753): por textura distinta dos materiais (duas texturas
clonadas com a mesma imagem contam uma vez), largura × altura × 4 bytes (1 se comprimida), × 4/3 se tem mips;
mais o `array` de cada atributo e do índice de cada geometria distinta (o mesmo array conta uma vez).

Aproximada: serve para comparar e decidir o descarte, não como medida da memória do processo.

## Parameters

### gltf

`Pick`\<`GLTF`, `"scene"`\>

O GLTF carregado (só a `scene` é percorrida).

## Returns

`number`

Bytes estimados (inteiro, arredondado para cima).
