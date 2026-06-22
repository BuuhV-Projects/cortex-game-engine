[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / roadRibbon

# Function: roadRibbon()

> **roadRibbon**(`samples`, `width`, `uvScale?`, `widthSegments?`): [`RoadRibbon`](../interfaces/RoadRibbon.md)

Defined in: [src/road/RoadMesh.ts:38](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/RoadMesh.ts#L38)

Gera a faixa da pista como uma **grade** (subdividida ao longo do comprimento E
**através da largura**, estilo Road Architect — pra a pista conformar bem ao terreno
com relevo, não só inclinar). `width` em metros; `uvScale` = unidades de mundo por
tile no comprimento (default 8 m); `widthSegments` = colunas ao longo da largura
(default 1 = só bordas esquerda/direita). UV: U atravessa 0..1, V por distância.

## Parameters

### samples

[`RoadSample`](../interfaces/RoadSample.md)[]

### width

`number`

### uvScale?

`number` = `8`

### widthSegments?

`number` = `1`

## Returns

[`RoadRibbon`](../interfaces/RoadRibbon.md)
