[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / roadRibbon

# Function: roadRibbon()

> **roadRibbon**(`samples`, `width`, `uvScale?`): [`RoadRibbon`](../interfaces/RoadRibbon.md)

Defined in: src/road/RoadMesh.ts:36

Gera a faixa da pista. `width` em metros; `uvScale` = quantas unidades de mundo
equivalem a 1 tile da textura ao longo do comprimento (default 8 m → asfalto tila
a cada 8 m). A largura inteira = 1 tile em U.

## Parameters

### samples

[`RoadSample`](../interfaces/RoadSample.md)[]

### width

`number`

### uvScale?

`number` = `8`

## Returns

[`RoadRibbon`](../interfaces/RoadRibbon.md)
