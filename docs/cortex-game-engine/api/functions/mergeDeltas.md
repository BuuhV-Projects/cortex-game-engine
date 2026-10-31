[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / mergeDeltas

# Function: mergeDeltas()

> **mergeDeltas**(`deltas`): `Float32Array`\<`ArrayBufferLike`\> \| `null`

Defined in: [src/road/RoadGrade.ts:199](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/RoadGrade.ts#L199)

Combina deltas de **várias estradas** na mesma grade: vence o de **maior módulo** em
cada vértice (o corte fundo de uma não é apagado pelo talude suave de outra).

## Parameters

### deltas

readonly `Float32Array`\<`ArrayBufferLike`\>[]

## Returns

`Float32Array`\<`ArrayBufferLike`\> \| `null`

`null` se a lista está vazia.
