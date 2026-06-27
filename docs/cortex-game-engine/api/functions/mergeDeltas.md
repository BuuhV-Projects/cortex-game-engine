[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / mergeDeltas

# Function: mergeDeltas()

> **mergeDeltas**(`deltas`): `Float32Array`\<`ArrayBufferLike`\> \| `null`

Defined in: [src/road/RoadGrade.ts:205](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/RoadGrade.ts#L205)

Combina deltas de **várias estradas** num só (mesma grade). Em sobreposição, vence o
de **maior magnitude** (a estrada que mais mexe no terreno manda — evita que um
talude suave de uma cancele o corte profundo de outra).

## Parameters

### deltas

`Float32Array`\<`ArrayBufferLike`\>[]

## Returns

`Float32Array`\<`ArrayBufferLike`\> \| `null`
